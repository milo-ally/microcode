"""Core web scraping engine."""

from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from scratch.models import ScrapeConfig, ScrapeResult


class Scraper:
    """Main scraper engine that fetches and parses web pages."""

    def __init__(self, timeout: int = 30, user_agent: str | None = None):
        self.timeout = timeout
        self.user_agent = user_agent or (
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )

    async def scrape(self, config: ScrapeConfig) -> ScrapeResult:
        """Scrape a single URL and return structured result."""
        headers = {"User-Agent": self.user_agent}
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.get(config.url, headers=headers)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        title = soup.title.string.strip() if soup.title else None

        if config.selector:
            elements = soup.select(config.selector)
            content = "\n\n".join(el.get_text(strip=True) for el in elements)
        else:
            # Remove script/style elements, get text
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            content = soup.get_text(separator="\n", strip=True)

        links = []
        for a_tag in soup.find_all("a", href=True):
            absolute = urljoin(config.url, a_tag["href"])
            parsed = urlparse(absolute)
            if parsed.scheme in ("http", "https"):
                links.append(absolute)

        return ScrapeResult(
            url=config.url,
            title=title,
            content=content,
            links=list(set(links)),
            metadata={
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type", ""),
            },
        )

    async def scrape_recursive(
        self, config: ScrapeConfig, current_depth: int = 0
    ) -> list[ScrapeResult]:
        """Scrape a URL and recursively follow links up to max_depth."""
        if current_depth >= config.max_depth:
            return []

        results = [await self.scrape(config)]

        if config.recursive and current_depth < config.max_depth - 1:
            base_parsed = urlparse(config.url)
            for link in results[0].links:
                link_parsed = urlparse(link)
                # Only follow links to the same domain
                if link_parsed.netloc == base_parsed.netloc:
                    child_config = ScrapeConfig(
                        url=link,
                        selector=config.selector,
                        output_format=config.output_format,
                        recursive=True,
                        max_depth=config.max_depth,
                    )
                    try:
                        child_results = await self.scrape_recursive(
                            child_config, current_depth + 1
                        )
                        results.extend(child_results)
                    except Exception:
                        continue

        return results
