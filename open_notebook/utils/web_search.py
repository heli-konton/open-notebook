"""Thin keyless web-search helper (DuckDuckGo via ``ddgs``).

Everything returned here is UNTRUSTED data from the open web: titles, snippets
and URLs must never be placed in system instructions or fetched directly by
this process (URLs are handed to the normal source pipeline, which applies the
SSRF guard).
"""

import asyncio
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Sequence
from urllib.parse import urlsplit, urlunsplit

from loguru import logger

# Hosts that are social/video/login-walled or otherwise hostile to text
# extraction. Matched against the host and any parent domain.
BLOCKED_DOMAINS = frozenset(
    {
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "x.com",
        "tiktok.com",
        "youtube.com",
        "youtu.be",
        "vimeo.com",
        "linkedin.com",
        "pinterest.com",
        "quora.com",
        "reddit.com",
        "threads.net",
        "t.me",
        "wsj.com",
        "ft.com",
        "bloomberg.com",
        "nytimes.com",
    }
)

_BLOCKED_EXTENSIONS = (".pdf", ".zip", ".mp3", ".mp4", ".jpg", ".jpeg", ".png", ".gif")

# (query, max_results, timeout) -> list of {"title","href","body"} dicts
Searcher = Callable[[str, int, int], List[Dict[str, str]]]


@dataclass
class SearchResult:
    url: str
    title: str
    snippet: str
    domain: str
    query_index: int = 0
    rank: int = 0


def domain_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def normalize_url(url: str) -> str:
    """Canonical form used for de-duplication (no fragment, www, trailing /)."""
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    port = f":{parts.port}" if parts.port and parts.port not in (80, 443) else ""
    path = parts.path.rstrip("/") or ""
    return urlunsplit((parts.scheme.lower(), host + port, path, parts.query, ""))


def is_allowed_url(url: str) -> bool:
    """http(s) only, not an obviously hostile host or non-HTML file type."""
    try:
        parts = urlsplit(url.strip())
        host = (parts.hostname or "").lower()
    except ValueError:
        return False
    if parts.scheme.lower() not in ("http", "https") or not host:
        return False
    labels = host.split(".")
    for i in range(len(labels) - 1):
        if ".".join(labels[i:]) in BLOCKED_DOMAINS:
            return False
    return not parts.path.lower().endswith(_BLOCKED_EXTENSIONS)


def dedupe_and_limit(
    results: Sequence[SearchResult], per_domain: int = 2
) -> List[SearchResult]:
    """Drop disallowed/duplicate URLs and keep at most ``per_domain`` per domain."""
    seen: set[str] = set()
    per: Dict[str, int] = {}
    out: List[SearchResult] = []
    for r in results:
        if not is_allowed_url(r.url):
            continue
        key = normalize_url(r.url)
        if key in seen:
            continue
        domain = r.domain or domain_of(r.url)
        if per.get(domain, 0) >= per_domain:
            continue
        seen.add(key)
        per[domain] = per.get(domain, 0) + 1
        out.append(r)
    return out


def ddgs_searcher(query: str, max_results: int, timeout: int) -> List[Dict[str, str]]:
    """Real searcher (blocking). Imported lazily so tests never need the network."""
    from ddgs import DDGS

    return list(DDGS(timeout=timeout).text(query, max_results=max_results))


async def search_many(
    queries: Sequence[str],
    *,
    results_per_query: int = 8,
    per_domain: int = 2,
    timeout: int = 10,
    delay: float = 1.0,
    searcher: Optional[Searcher] = None,
    sleep: Callable[[float], "asyncio.Future | object"] = asyncio.sleep,
) -> List[SearchResult]:
    """Run queries sequentially (gentle on rate limits); tolerate failures.

    A failing query (rate limit, timeout, no results) is logged and skipped.
    """
    search = searcher or ddgs_searcher
    collected: List[SearchResult] = []
    for qi, query in enumerate(queries):
        if qi and delay:
            await sleep(delay)  # type: ignore[misc]
        try:
            raw = await asyncio.to_thread(search, query, results_per_query, timeout)
        except Exception as e:  # ddgs raises its own exception family
            logger.warning(f"Web search failed for query {query!r}: {e}")
            continue
        for rank, item in enumerate(raw or []):
            url = str(item.get("href") or item.get("url") or "").strip()
            if not url:
                continue
            collected.append(
                SearchResult(
                    url=url,
                    title=str(item.get("title") or "").strip(),
                    snippet=str(item.get("body") or "").strip(),
                    domain=domain_of(url),
                    query_index=qi,
                    rank=rank,
                )
            )
    return dedupe_and_limit(collected, per_domain)
