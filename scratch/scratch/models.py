from pydantic import BaseModel


class ScrapeResult(BaseModel):
    url: str
    title: str | None = None
    content: str
    links: list[str]
    metadata: dict


class ScrapeConfig(BaseModel):
    url: str
    selector: str | None = None
    output_format: str = "text"
    recursive: bool = False
    max_depth: int = 1
