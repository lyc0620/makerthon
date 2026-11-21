from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol


@dataclass
class ListItem:
    """목록 페이지에서 얻는 최소 정보."""

    source_id: str  # 포탈 게시글 번호 등, 수집처 안에서 고유한 값
    url: str
    title: str | None = None
    posted: date | None = None  # 게시일 (연도 없는 일시를 해석할 기준)


@dataclass
class RawSeminar:
    """상세 페이지 파싱 결과 (장소 매핑 전)."""

    source_id: str
    title: str
    start_at: datetime
    end_at: datetime | None
    place_raw: str | None
    host: str | None
    source_url: str | None
    category: str = "other"


class CrawlAuthError(RuntimeError):
    """로그인 세션이 없거나 만료됨 — 사람이 쿠키를 다시 넣어 줘야 한다."""


class SeminarCrawler(Protocol):
    """세미나 수집기 규약.

    요청 간격(crawl_delay_seconds)은 파이프라인이 아니라 크롤러가 지킨다.
    parse_detail 이 None 을 돌려주면 일시를 찾지 못한 글이라 저장하지 않는다.
    """

    name: str

    async def fetch_list(self, pages: int = 1) -> list[ListItem]: ...

    async def parse_detail(self, item: ListItem) -> RawSeminar | None: ...
