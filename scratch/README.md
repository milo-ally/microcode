# Scratch — Universal Web Scraper CLI

A command-line web scraper that can crawl pages, extract content, and output in multiple formats.

## Quick Usage

Scrape a single page:
```bash
scratch https://example.com
```

Extract content with a CSS selector:
```bash
scratch https://example.com --selector "article.main"
```

Output as JSON:
```bash
scratch https://example.com --format json
```

Recursive crawl with depth limit:
```bash
scratch https://example.com --recursive --max-depth 2
```
