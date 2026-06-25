from urllib.parse import urlparse

from app.core.crawler import crawl_site_sync

START_URL = "https://fastapi.tiangolo.com"


def test_crawl_site_returns_pages_with_text():
    pages = crawl_site_sync(START_URL, max_pages=5)

    assert len(pages) == 5
    for page in pages:
        assert page["url"]
        assert page["title"]
        assert len(page["text"].strip()) > 0


def test_crawl_site_stays_on_same_domain():
    pages = crawl_site_sync(START_URL, max_pages=5)

    assert len(pages) > 0
    base_domain = urlparse(START_URL).netloc
    for page in pages:
        assert urlparse(page["url"]).netloc == base_domain


def test_crawl_site_respects_max_pages():
    pages = crawl_site_sync(START_URL, max_pages=2)

    assert 0 < len(pages) <= 2


def test_crawl_site_unreachable_url_returns_empty_list():
    pages = crawl_site_sync("https://this-does-not-exist-xyz.invalid")

    assert pages == []
