from datetime import timedelta

from app.core.time import now_kst
from app.services.seminar.base import ListItem, RawSeminar

_SAMPLES = [
    (
        "1001",
        "AI 초청 세미나: 대규모 언어모델의 현재",
        "seminar",
        1,
        16,
        "E7동 304호",
        "전기전자컴퓨터공학과",
    ),
    ("1002", "로봇공학 특강", "lecture", 2, 14, "E1동 B101호", "로봇및기계전자공학과"),
    ("1003", "도서관 북토크", "event", 3, 18, "학술정보관 2층 세미나실", "학술정보관"),
    ("1004", "온라인 진로 설명회", "event", 4, 19, "Zoom 온라인", "학생처"),
]


class MockSeminarCrawler:
    """포탈 구조 확인 전 개발용. 오늘 기준으로 날짜가 정해지는 예시 4건."""

    name = "mock"

    async def fetch_list(self, pages: int = 1) -> list[ListItem]:
        return [ListItem(source_id=s[0], url=f"https://example.invalid/{s[0]}") for s in _SAMPLES]

    async def parse_detail(self, item: ListItem) -> RawSeminar | None:
        _, title, category, day, hour, place, host = next(
            s for s in _SAMPLES if s[0] == item.source_id
        )
        base = now_kst().replace(hour=hour, minute=0, second=0)
        start = base + timedelta(days=day)
        return RawSeminar(
            source_id=item.source_id,
            title=title,
            category=category,
            start_at=start,
            end_at=start + timedelta(hours=1, minutes=30),
            place_raw=place,
            host=host,
            source_url=item.url,
        )
