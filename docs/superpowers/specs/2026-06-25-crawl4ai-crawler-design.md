# crawl4ai Async Web Crawler Design (CAN-37)

## Context

CAN-37 (M2-D2, parent: CAN-23 "M2: URL Crawl Ingestion") asks for an async web
crawler that takes a starting URL, discovers linked pages on the same domain,
fetches and cleans each page's text via a headless browser, and returns
structured `{url, title, text}` results ready for chunking. crawl4ai (built on
Playwright) is used instead of `requests`/BeautifulSoup because many
documentation sites (GitBook, Docusaurus, ReadTheDocs) are JS-rendered — a
plain HTTP fetch only gets an empty skeleton.

Scope is deliberately narrow: this ticket builds only the crawler module
itself. Chunking/dedup/embedding/Supabase writes are CAN-38 (Celery task), the
`/ingest/url` endpoint is CAN-39, and a real-site testing pass is CAN-40 — all
separate backlog tickets under the same parent. `crawl_site_sync` exists here
specifically so CAN-38 has a sync entry point to call from a Celery task.

The ticket's sample code has the same class of issue earlier tickets' sample
code had (CAN-28's wrong embedding dimension, CAN-29's wrong import style):
it reads `result.markdown_v2.fit_markdown`, but `markdown_v2` does not exist
in the current crawl4ai API. Confirmed via crawl4ai's docs
(`/unclecode/crawl4ai`) that `result.markdown` is itself a
`MarkdownGenerationResult` object with `.raw_markdown` and `.fit_markdown`
attributes — when a `content_filter` is configured on the markdown generator,
`result.markdown.fit_markdown` is the correct access path. The post-install
step is also `crawl4ai-setup` (which itself runs the Playwright browser
install), not directly `playwright install chromium` as the ticket implies —
the latter is only a documented fallback if `crawl4ai-setup` fails.

## Decisions

- **Module: `app/core/crawler.py`**, alongside `extractors.py`/`chunker.py`/
  `embedder.py`, relative imports throughout, matching existing `app/core/`
  convention.
- **Dependency: plain `crawl4ai`** via `uv add crawl4ai`, not the `[all]`
  extra — that extra pulls in local model downloads for LLM-based extraction
  strategies, which this ticket doesn't use (markdown + pruning filter only).
  Post-install: `uv run crawl4ai-setup`.
- **Fix the `markdown_v2` bug**: use `result.markdown.fit_markdown if
  result.markdown else ""` instead of the ticket's broken
  `result.markdown_v2.fit_markdown` access.
- **Sequential BFS crawl, not concurrent.** One page fetched at a time via a
  single reused `AsyncWebCrawler` instance, matching the ticket's loop
  structure. Simpler to reason about and test, and avoids hammering small
  target sites with parallel requests. `max_pages` caps the worst case for
  large sites; crawling speed isn't a stated requirement for this ticket.
- **`MAX_PAGES = 50` stays a module-level constant**, not moved into
  `Settings` — it's a default for an optional function parameter, not
  deployment config (unlike `DEFAULT_COLLECTION_NAME`, which is genuinely a
  per-deployment value). CAN-38/39 callers can override it per-request.
- **Same-domain enforcement via explicit `urlparse` check against the
  original `start_url`'s netloc**, not by trusting crawl4ai's
  `internal`/`external` link classification alone — that classification is
  computed per-page, and the ticket's done-criteria require staying on the
  domain of the *original* start URL specifically.
- **Logging via `logger.warning(...)`, not `print(...)`** — per-page crawl
  failures are logged through the standard `logging` module (this repo's
  established convention, see `app/core/logging.py`), not printed to stdout.
- **Testing: pytest against real sites, no manual script** — consistent with
  this repo's established pattern (CAN-28, CAN-29) of testing core modules
  against live infra rather than mocks. No `backend/scripts/test_crawler.py`;
  pytest covers the same verification the ticket's script would.

## File layout

```
backend/
├── app/
│   └── core/
│       └── crawler.py        # crawl_site, crawl_site_sync
└── tests/
    └── core/
        └── test_crawler.py
```

## Components

**`app/core/crawler.py`**
```python
import asyncio
import logging
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

logger = logging.getLogger(__name__)

MAX_PAGES = 50  # Hard cap — protects against enormous sites


async def crawl_site(start_url: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """
    Crawl a website starting from start_url, staying on the same domain.
    Returns a list of dicts: [{url, title, text}, ...]
    """
    base_domain = urlparse(start_url).netloc
    visited: set[str] = set()
    to_visit = [start_url]
    results = []

    content_filter = PruningContentFilter(
        threshold=0.48,
        threshold_type="fixed",
        min_word_threshold=50,
    )
    md_generator = DefaultMarkdownGenerator(content_filter=content_filter)

    browser_config = BrowserConfig(headless=True, verbose=False)
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        markdown_generator=md_generator,
        wait_until="networkidle",
        page_timeout=30000,
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

                text = result.markdown.fit_markdown if result.markdown else ""
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
                    ):
                        to_visit.append(full_url)

            except Exception as e:
                logger.warning("Failed to crawl %s: %s", url, e)
                continue

    return results


def crawl_site_sync(start_url: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """Synchronous wrapper for use inside Celery tasks (CAN-38), which run sync."""
    return asyncio.run(crawl_site(start_url, max_pages))
```

## Data flow

1. Caller (a future Celery task in CAN-38) calls `crawl_site_sync(start_url,
   max_pages=N)`.
2. `crawl_site` BFS-walks same-domain pages: fetch → extract filtered
   markdown → record result → discover same-domain links → enqueue unvisited
   ones.
3. Returns a flat list of `{url, title, text}` dicts once `max_pages` is hit
   or the link queue is exhausted.
4. Downstream (CAN-38, not this ticket): each `text` gets chunked, deduped,
   embedded, and upserted to Zilliz, with `sources` rows updated in Supabase.

## Error handling

- **Per-page failures** (timeout, non-200, JS error, etc.) are caught inside
  the loop, logged via `logger.warning`, and skipped — one bad page doesn't
  abort the crawl.
- **Unreachable start URL** is handled by the same per-page `try/except`,
  since the first URL goes through the identical code path as any other page
  — no special-casing needed. Returns `[]`.
- **Near-empty pages** (after filtering, `< 100` chars) are silently skipped,
  not treated as errors.

## Testing & verification

**`tests/core/test_crawler.py`** (pytest, against real sites — no mocking,
consistent with this repo's existing pattern for `vector_store`/`embedder`):

- `test_crawl_site_returns_pages_with_text` — `crawl_site_sync("https://
  fastapi.tiangolo.com", max_pages=5)` returns 5 dicts, each with non-empty
  `url`/`title`/`text`.
- `test_crawl_site_stays_on_same_domain` — every result's `url` netloc
  matches the start URL's netloc.
- `test_crawl_site_respects_max_pages` — `max_pages=2` returns at most 2
  results.
- `test_crawl_site_unreachable_url_returns_empty_list` — a non-resolving
  domain returns `[]` without raising.

**Manual verification checklist:**
- `uv add crawl4ai && uv run crawl4ai-setup` completes without error.
- `uv run pytest tests/core/test_crawler.py` passes (expect it to be slow —
  real headless browser + real network, likely 10-30s+ total).
- Spot-check one result's `text` by eye to confirm it's real documentation
  content, not a JS-loading placeholder or raw nav/footer boilerplate.
- `ruff check` / `ruff format --check` clean.

## Out of scope (deferred to later tickets)

- Celery task wiring, chunking, deduplication, embedding, Zilliz upsert, and
  Supabase `sources` row updates — CAN-38.
- `/ingest/url` endpoint and status-polling endpoints — CAN-39.
- Broader real-site adversarial testing pass — CAN-40.
- Concurrent/parallel page fetching — not required by this ticket's
  done-criteria; can be revisited if CAN-40's testing surfaces a real need.
- robots.txt compliance — crawl4ai exposes this as a one-line
  `CrawlerRunConfig(check_robots_txt=True)` flag, so it's cheap to add later,
  but it's not in this ticket's done-criteria and isn't mentioned by the
  ticket, so it's left off for now rather than added unprompted.
