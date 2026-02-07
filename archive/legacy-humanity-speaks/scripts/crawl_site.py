#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import parse_qsl, urlencode, urldefrag, urljoin, urlparse, urlunparse
from urllib import robotparser

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from readability import Document


TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "fbclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
}

SKIP_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".mp4",
    ".mov",
    ".mp3",
    ".wav",
    ".avi",
    ".mkv",
    ".webm",
    ".css",
    ".js",
    ".json",
    ".xml",
    ".rss",
}


def parse_max_bytes(value: str) -> int:
    text = value.strip().upper()
    match = re.match(r"^(\d+(?:\.\d+)?)([KMGTP]?B?)$", text)
    if not match:
        raise argparse.ArgumentTypeError(f"Invalid max-bytes value: {value}")
    number = float(match.group(1))
    unit = match.group(2)
    scale = {
        "": 1,
        "B": 1,
        "K": 1024,
        "KB": 1024,
        "M": 1024 ** 2,
        "MB": 1024 ** 2,
        "G": 1024 ** 3,
        "GB": 1024 ** 3,
        "T": 1024 ** 4,
        "TB": 1024 ** 4,
        "P": 1024 ** 5,
        "PB": 1024 ** 5,
    }[unit]
    return int(number * scale)


def normalize_base_host(host: str) -> str:
    host = host.lower()
    if host.startswith("www."):
        return host[4:]
    return host


def is_allowed_host(host: str, base_host: str, include_subdomains: bool) -> bool:
    if not host:
        return False
    host = host.lower()
    if include_subdomains:
        return host == base_host or host.endswith("." + base_host)
    return host == base_host or host == f"www.{base_host}"


def normalize_url(base_url: str, href: str) -> Optional[str]:
    if not href:
        return None
    href = href.strip()
    if href.startswith("javascript:") or href.startswith("mailto:") or href.startswith("tel:"):
        return None
    url = urljoin(base_url, href)
    url, _ = urldefrag(url)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    query = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS
    ]
    normalized = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        query=urlencode(query, doseq=True),
        fragment="",
    )
    return urlunparse(normalized)


def should_skip_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    for ext in SKIP_EXTENSIONS:
        if path.endswith(ext):
            return True
    return False


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def hash_url(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def absolutize_links(soup: BeautifulSoup, base_url: str) -> None:
    for tag, attr in ("a", "href"), ("img", "src"), ("link", "href"):
        for node in soup.find_all(tag):
            if not node.has_attr(attr):
                continue
            raw = node.get(attr)
            if not raw:
                continue
            if raw.startswith("javascript:") or raw.startswith("mailto:") or raw.startswith("tel:"):
                continue
            node[attr] = urljoin(base_url, raw)


def extract_markdown(html: str, base_url: str, fetched_at: str) -> str:
    title = None
    body_html = None
    try:
        doc = Document(html)
        title = doc.title()
        body_html = doc.summary(html_partial=True)
    except Exception:
        body_html = html

    soup = BeautifulSoup(body_html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    absolutize_links(soup, base_url)

    markdown = md(str(soup), heading_style="ATX")
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
    if title and not markdown.lstrip().startswith("#"):
        markdown = f"# {title}\n\n{markdown}" if markdown else f"# {title}"

    front_matter = "\n".join(
        [
            "---",
            f"source: {base_url}",
            f"fetched_at: {fetched_at}",
            "---",
            "",
        ]
    )
    return front_matter + markdown + "\n"


def parse_sitemaps_from_robots(text: str) -> List[str]:
    sitemaps: List[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("sitemap:"):
            sitemap = line.split(":", 1)[1].strip()
            if sitemap:
                sitemaps.append(sitemap)
    return sitemaps


def fetch_robots(session: requests.Session, base_url: str, user_agent: str, timeout: int) -> Tuple[robotparser.RobotFileParser, List[str], Optional[float]]:
    robots_url = urljoin(base_url, "/robots.txt")
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    sitemaps: List[str] = []
    crawl_delay: Optional[float] = None
    try:
        resp = session.get(robots_url, timeout=timeout)
        if resp.status_code < 400:
            text = resp.text
            rp.parse(text.splitlines())
            sitemaps = parse_sitemaps_from_robots(text)
            crawl_delay = rp.crawl_delay(user_agent)
        else:
            rp.parse([])
    except Exception:
        rp.parse([])
    return rp, sitemaps, crawl_delay


def strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def fetch_sitemap_urls(
    session: requests.Session,
    sitemap_url: str,
    timeout: int,
    seen: Set[str],
    max_urls: Optional[int] = None,
) -> List[str]:
    if sitemap_url in seen:
        return []
    seen.add(sitemap_url)

    try:
        resp = session.get(sitemap_url, timeout=timeout)
    except Exception:
        return []
    if resp.status_code >= 400:
        return []

    content = resp.content
    if sitemap_url.endswith(".gz"):
        try:
            content = gzip.decompress(content)
        except Exception:
            return []

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []

    tag = strip_ns(root.tag)
    urls: List[str] = []

    if tag == "urlset":
        for loc in root.findall(".//{*}loc"):
            if loc.text:
                urls.append(loc.text.strip())
                if max_urls and len(urls) >= max_urls:
                    break
    elif tag == "sitemapindex":
        for loc in root.findall(".//{*}loc"):
            if not loc.text:
                continue
            child_url = loc.text.strip()
            urls.extend(fetch_sitemap_urls(session, child_url, timeout, seen, max_urls=max_urls))
            if max_urls and len(urls) >= max_urls:
                break

    return urls


def load_existing_meta(meta_path: str) -> Tuple[Set[str], int]:
    visited: Set[str] = set()
    total_bytes = 0
    if not os.path.exists(meta_path):
        return visited, total_bytes
    with open(meta_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            url = row.get("url")
            if url:
                visited.add(url)
            total_bytes += int(row.get("markdown_bytes") or 0)
    return visited, total_bytes


def save_meta(meta_path: str, record: dict) -> None:
    with open(meta_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def should_throttle(last_request_at: Dict[str, float], host: str, delay: float) -> None:
    if delay <= 0:
        return
    now = time.time()
    previous = last_request_at.get(host)
    if previous is None:
        return
    elapsed = now - previous
    if elapsed < delay:
        time.sleep(delay - elapsed)


def fetch_url(session: requests.Session, url: str, timeout: int) -> Optional[requests.Response]:
    try:
        return session.get(url, timeout=timeout)
    except requests.RequestException:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Polite, robots-aware site crawler to extract Markdown.")
    parser.add_argument(
        "--start-url",
        action="append",
        required=True,
        help="Seed URL(s) to crawl. Repeat for multiple seeds.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/world_org_crawl",
        help="Directory for output Markdown and metadata.",
    )
    parser.add_argument(
        "--max-bytes",
        type=parse_max_bytes,
        default=parse_max_bytes("5GB"),
        help="Stop after writing this many Markdown bytes (e.g. 5GB).",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=0,
        help="Stop after this many HTML pages (0 = unlimited).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Delay between requests to the same host (seconds).",
    )
    parser.add_argument(
        "--user-agent",
        default="CodexCrawler/1.0",
        help="User-Agent to send with requests.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="Request timeout in seconds.",
    )
    parser.add_argument(
        "--include-subdomains",
        action="store_true",
        help="Include subdomains of the base host.",
    )
    parser.add_argument(
        "--no-sitemaps",
        action="store_true",
        help="Disable sitemap seeding from robots.txt.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from existing meta.jsonl in output directory.",
    )

    args = parser.parse_args()

    start_urls = [normalize_url(url, "") or url for url in args.start_url]
    parsed = urlparse(start_urls[0])
    if not parsed.netloc:
        logging.error("Invalid start URL: %s", start_urls[0])
        return 1

    base_host = normalize_base_host(parsed.netloc)
    output_dir = args.output_dir
    pages_dir = os.path.join(output_dir, "pages")
    ensure_dir(pages_dir)
    meta_path = os.path.join(output_dir, "meta.jsonl")

    visited: Set[str] = set()
    total_bytes = 0
    if args.resume:
        visited, total_bytes = load_existing_meta(meta_path)

    session = requests.Session()
    session.headers.update({"User-Agent": args.user_agent})

    base_url = f"{parsed.scheme}://{parsed.netloc}"
    robots_by_host: Dict[str, Tuple[robotparser.RobotFileParser, Optional[float], List[str]]] = {}

    def get_robots(host: str) -> Tuple[robotparser.RobotFileParser, Optional[float], List[str]]:
        if host in robots_by_host:
            return robots_by_host[host]
        rp, sitemaps, crawl_delay = fetch_robots(
            session,
            f"{parsed.scheme}://{host}",
            args.user_agent,
            args.timeout,
        )
        robots_by_host[host] = (rp, crawl_delay, sitemaps)
        return robots_by_host[host]

    rp, robots_delay, sitemaps = get_robots(parsed.netloc)
    alt_www = f"www.{base_host}"
    if alt_www != parsed.netloc and is_allowed_host(alt_www, base_host, args.include_subdomains):
        _, _, extra_sitemaps = get_robots(alt_www)
        sitemaps.extend(extra_sitemaps)

    queue: Deque[str] = deque()
    for url in start_urls:
        normalized = normalize_url(url, "") or url
        if normalized:
            queue.append(normalized)

    use_sitemaps = not args.no_sitemaps
    if use_sitemaps and sitemaps:
        seen_sitemaps: Set[str] = set()
        for sitemap in sorted(set(sitemaps)):
            for url in fetch_sitemap_urls(session, sitemap, args.timeout, seen_sitemaps):
                normalized = normalize_url(url, "")
                if normalized:
                    queue.append(normalized)

    last_request_at: Dict[str, float] = {}
    pages_written = 0
    skipped_non_html = 0

    while queue:
        if args.max_pages and pages_written >= args.max_pages:
            break
        if total_bytes >= args.max_bytes:
            break

        url = queue.popleft()
        if not url or url in visited:
            continue
        parsed_url = urlparse(url)
        if not is_allowed_host(parsed_url.netloc, base_host, args.include_subdomains):
            continue
        if should_skip_url(url):
            continue

        rp, robots_delay, _ = get_robots(parsed_url.netloc)
        if not rp.can_fetch(args.user_agent, url):
            save_meta(
                meta_path,
                {
                    "url": url,
                    "status": "blocked_by_robots",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            visited.add(url)
            continue

        delay = max(args.delay, robots_delay or 0)
        should_throttle(last_request_at, parsed_url.netloc, delay)

        response = fetch_url(session, url, args.timeout)
        last_request_at[parsed_url.netloc] = time.time()

        if response is None:
            save_meta(
                meta_path,
                {
                    "url": url,
                    "status": "request_failed",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            visited.add(url)
            continue

        final_url = response.url
        final_parsed = urlparse(final_url)
        if not is_allowed_host(final_parsed.netloc, base_host, args.include_subdomains):
            save_meta(
                meta_path,
                {
                    "url": url,
                    "status": "redirected_off_domain",
                    "redirect": final_url,
                    "http_status": response.status_code,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            visited.add(url)
            continue

        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            skipped_non_html += 1
            save_meta(
                meta_path,
                {
                    "url": final_url,
                    "status": "non_html",
                    "http_status": response.status_code,
                    "content_type": content_type,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            visited.add(final_url)
            continue

        html = response.text
        fetched_at = datetime.now(timezone.utc).isoformat()
        markdown = extract_markdown(html, final_url, fetched_at)
        markdown_bytes = len(markdown.encode("utf-8"))

        if total_bytes + markdown_bytes > args.max_bytes:
            break

        digest = hash_url(final_url)
        shard = digest[:2]
        shard_dir = os.path.join(pages_dir, shard)
        ensure_dir(shard_dir)
        filename = os.path.join(shard_dir, f"{digest}.md")

        with open(filename, "w", encoding="utf-8") as handle:
            handle.write(markdown)

        total_bytes += markdown_bytes
        pages_written += 1

        save_meta(
            meta_path,
            {
                "url": final_url,
                "status": "ok",
                "http_status": response.status_code,
                "content_type": content_type,
                "markdown_path": os.path.relpath(filename, output_dir),
                "markdown_bytes": markdown_bytes,
                "total_bytes": total_bytes,
                "fetched_at": fetched_at,
            },
        )

        visited.add(final_url)

        soup = BeautifulSoup(html, "lxml")
        for link in soup.find_all("a", href=True):
            normalized = normalize_url(final_url, link.get("href"))
            if not normalized:
                continue
            if should_skip_url(normalized):
                continue
            parsed_link = urlparse(normalized)
            if not is_allowed_host(parsed_link.netloc, base_host, args.include_subdomains):
                continue
            if normalized not in visited:
                queue.append(normalized)

        if pages_written % 50 == 0:
            logging.info("Pages written: %s | Queue: %s | Total bytes: %s", pages_written, len(queue), total_bytes)

    stats_path = os.path.join(output_dir, "stats.json")
    stats = {
        "pages_written": pages_written,
        "total_markdown_bytes": total_bytes,
        "skipped_non_html": skipped_non_html,
        "queue_remaining": len(queue),
        "base_host": base_host,
        "include_subdomains": args.include_subdomains,
        "max_bytes": args.max_bytes,
        "max_pages": args.max_pages,
        "ended_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(stats_path, "w", encoding="utf-8") as handle:
        json.dump(stats, handle, ensure_ascii=False, indent=2)

    logging.info("Done. Pages: %s | Bytes: %s", pages_written, total_bytes)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(main())
