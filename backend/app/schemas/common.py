"""여러 기능이 같이 쓰는 응답 모양."""

from pydantic import BaseModel


class Page[T](BaseModel):
    """목록 응답: { items, count(이번 개수), total(전체 개수), updated_at }"""

    items: list[T]
    count: int
    total: int
    updated_at: str | None


def make_page(items: list, total: int, updated_at: str | None) -> dict:
    return {"items": items, "count": len(items), "total": total, "updated_at": updated_at}
