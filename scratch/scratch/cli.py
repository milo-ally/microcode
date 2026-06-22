"""CLI entry point for Scratch web scraper."""

import asyncio
import json
from pathlib import Path

import click
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from scratch.models import ScrapeConfig
from scratch.scraper import Scraper


console = Console()


def output_text(result, file=None):
    """Output as plain text."""
    out = console if file is None else file
    out.print(f"# {result.title or result.url}")
    out.print(f"URL: {result.url}")
    out.print()
    out.print(result.content)


def output_markdown(result, file=None):
    """Output as rendered markdown."""
    md = f"# {result.title or 'Untitled'}\n\n"
    md += f"**Source:** {result.url}\n\n"
    md += f"---\n\n{result.content}"
    out = console if file is None else file
    out.print(Markdown(md))


def output_json(result, file=None):
    """Output as JSON."""
    data = result.model_dump()
    out = console if file is None else file
    out.print(json.dumps(data, indent=2, ensure_ascii=False))


OUTPUT_FORMATS = {
    "text": output_text,
    "markdown": output_markdown,
    "json": output_json,
}


@click.group()
def cli():
    """Scratch — Universal Web Scraper CLI"""


@cli.command()
@click.argument("url")
@click.option("-s", "--selector", help="CSS selector to target specific elements")
@click.option(
    "-o", "--output", type=click.Choice(["text", "markdown", "json"]), default="text",
    help="Output format (default: text)"
)
@click.option("--save", type=click.Path(), help="Save output to a file")
@click.option("-r", "--recursive", is_flag=True, help="Recursively follow links")
@click.option("--max-depth", type=int, default=2, help="Max recursion depth (default: 2)")
@click.option("--timeout", type=int, default=30, help="Request timeout in seconds")
@click.option("--user-agent", help="Custom User-Agent header")
def scrape(url, selector, output, save, recursive, max_depth, timeout, user_agent):
    """Scrape a web page and extract its content."""
    config = ScrapeConfig(
        url=url,
        selector=selector,
        output_format=output,
        recursive=recursive,
        max_depth=max_depth,
    )

    scraper = Scraper(timeout=timeout, user_agent=user_agent)
    formatter = OUTPUT_FORMATS.get(output, output_text)

    with console.status(f"Scraping {url}...", spinner="dots") as status:
        results = asyncio.run(
            scraper.scrape_recursive(config) if recursive else asyncio.wrap_future(
                asyncio.ensure_future(scraper.scrape(config))
            )
        )

    if isinstance(results, list):
        for i, result in enumerate(results):
            if i > 0:
                console.print("\n" + "=" * 60 + "\n")
            formatter(result)
        if save:
            path = Path(save)
            with path.open("w", encoding="utf-8") as f:
                for i, result in enumerate(results):
                    if i > 0:
                        f.write("\n" + "=" * 60 + "\n\n")
                    formatter(result, file=f)
            console.print(f"\n[green]✓ Saved to {save}[/]")
    else:
        formatter(results)
        if save:
            path = Path(save)
            with path.open("w", encoding="utf-8") as f:
                formatter(results, file=f)
            console.print(f"\n[green]✓ Saved to {save}[/]")


@cli.command()
@click.argument("url")
@click.option("--pretty/--no-pretty", default=True, help="Pretty print JSON output")
def inspect(url, pretty):
    """Inspect a page's metadata and structure without full content."""
    config = ScrapeConfig(url=url)
    scraper = Scraper()

    with console.status(f"Inspecting {url}..."):
        result = asyncio.run(scraper.scrape(config))

    table = Table(title="Page Info")
    table.add_column("Property", style="bold cyan")
    table.add_column("Value")

    table.add_row("URL", result.url)
    table.add_row("Title", result.title or "N/A")
    table.add_row("Content Length", f"{len(result.content)} chars")
    table.add_row("Links Found", str(len(result.links)))
    for key, val in result.metadata.items():
        table.add_row(f"Meta: {key}", str(val))

    console.print(table)


def main():
    """Entry point for the CLI."""
    cli()
