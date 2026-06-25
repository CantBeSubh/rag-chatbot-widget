import asyncio
import logging
import re
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

logger = logging.getLogger(__name__)

MAX_PAGES = 50  # Hard cap — protects against enormous sites

_LOCALE_RE = re.compile(r"^/([a-z]{2}(?:-[a-zA-Z]{2,4})?)(/|$)")


def _locale_prefix(path: str) -> str | None:
    """Return the locale segment of a path (e.g. 'de', 'zh-tw'), or None."""
    m = _LOCALE_RE.match(path)
    return m.group(1) if m else None


async def crawl_site(start_url: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """
    Crawl a website starting from start_url, staying on the same domain.
    Returns a list of dicts: [{url, title, text}, ...]
    """
    base_domain = urlparse(start_url).netloc
    start_locale = _locale_prefix(urlparse(start_url).path)
    visited: set[str] = set()
    to_visit = [start_url]
    results = []

    md_generator = DefaultMarkdownGenerator()

    browser_config = BrowserConfig(headless=True, verbose=False)
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        markdown_generator=md_generator,
        # "networkidle" never fires on sites with continuous background
        # requests (telemetry/heartbeats) — confirmed against
        # fastapi.tiangolo.com, which times out at networkidle even at 60s
        # but succeeds in ~2s with domcontentloaded.
        wait_until="domcontentloaded",
        page_timeout=30000,
        excluded_tags=["nav", "header", "footer", "aside", "script", "style"],
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        while to_visit and len(results) < max_pages:
            url = to_visit.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                result = await crawler.arun(url=url, config=run_config)
                if not result.success:
                    continue

                text = result.markdown.raw_markdown if result.markdown else ""
                if not text or len(text.strip()) < 100:
                    continue

                results.append(
                    {
                        "url": url,
                        "title": result.metadata.get("title", url),
                        "text": text.strip(),
                    }
                )

                for link in result.links.get("internal", []):
                    href = link.get("href", "")
                    if not href:
                        continue
                    full_url = urljoin(url, href)
                    parsed_link = urlparse(full_url)
                    if (
                        parsed_link.netloc == base_domain
                        and "#" not in full_url
                        and full_url not in visited
                        and full_url not in to_visit
                        and _locale_prefix(parsed_link.path) == start_locale
                    ):
                        to_visit.append(full_url)

            except Exception as e:
                logger.warning("Failed to crawl %s: %s", url, e)
                continue

    return results


def crawl_site_sync(start_url: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """Synchronous wrapper for use inside Celery tasks which run sync."""
    return asyncio.run(crawl_site(start_url, max_pages))
