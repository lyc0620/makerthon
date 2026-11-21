import asyncio
from datetime import datetime

import pytest
from sqlmodel import select

from app.core.time import KST
from app.models import Building, Seminar
from app.services.seminar.base import ListItem, RawSeminar
from app.services.seminar.dates import parse_kst
from app.services.seminar.mapping import match_place
from app.services.seminar.mock import MockSeminarCrawler
from app.services.seminar.pipeline import run_seminar_crawl

BUILDINGS = [
    Building(id="bld_E7", name="E7동", aliases=["E7", "전기전자컴퓨터공학관"], lat=1.0, lng=2.0),
    Building(id="bld_E71", name="E71동", aliases=["E71"], lat=3.0, lng=4.0),
    Building(id="bld_LIB", name="학술정보관", aliases=["도서관"], lat=5.0, lng=6.0),
]


@pytest.mark.parametrize(
    "text, building_id, room",
    [
        ("E7동 304호", "bld_E7", "304"),
        ("e7 304", "bld_E7", "304"),
        ("E7-304", "bld_E7", "304"),
        ("E71동 1201호", "bld_E71", "1201"),
        ("전기전자컴퓨터공학관 B101호", "bld_E7", "B101"),
        ("학술정보관 2층 세미나실", "bld_LIB", None),
        ("도서관", "bld_LIB", None),
        ("Zoom 온라인", None, None),
        (None, None, None),
    ],
)
def test_match_place(text, building_id, room):
    m = match_place(text, BUILDINGS)
    assert (m.building_id, m.room) == (building_id, room)
    if building_id is None:
        assert m.lat is None and m.lng is None


@pytest.mark.parametrize(
    "text, expected",
    [
        ("일시: 2026-12-01 16:00", datetime(2026, 12, 1, 16, 0, tzinfo=KST)),
        ("2026.12.01(화) 16:30 ~ 18:00", datetime(2026, 12, 1, 16, 30, tzinfo=KST)),
        ("2026년 12월 1일 (화) 오후 4시 30분", datetime(2026, 12, 1, 16, 30, tzinfo=KST)),
        ("2026년 12월 1일 오전 12시", datetime(2026, 12, 1, 0, 0, tzinfo=KST)),
        ("날짜 미정", None),
    ],
)
def test_parse_kst(text, expected):
    assert parse_kst(text) == expected


class _EditableCrawler:
    name = "test"

    def __init__(self, title: str):
        self.title = title

    async def fetch_list(self, pages=1):
        return [ListItem(source_id="1", url="u1"), ListItem(source_id="bad", url="u2")]

    async def parse_detail(self, item):
        if item.source_id == "bad":
            raise ValueError("broken page")
        return RawSeminar(
            source_id="1",
            title=self.title,
            start_at=datetime(2026, 12, 1, 16, tzinfo=KST),
            end_at=None,
            place_raw="E8 304호",
            host="학과",
            source_url="u1",
            category="seminar",
        )


def test_pipeline_upserts_by_source_id(session):
    log1 = asyncio.run(run_seminar_crawl(session, _EditableCrawler("옛 제목")))
    assert log1.status == "success" and log1.item_count == 1  # 깨진 한 건은 건너뜀
    asyncio.run(run_seminar_crawl(session, _EditableCrawler("새 제목")))

    rows = session.exec(select(Seminar)).all()
    assert len(rows) == 1
    s = rows[0]
    assert s.id == "sem_test_1" and s.source_id == "test:1"
    assert s.title == "새 제목"
    assert (s.building_id, s.room) == ("bld_E8", "304")
    assert s.start_at == datetime(2026, 12, 1, 16, tzinfo=KST)
    assert s.start_at.utcoffset().total_seconds() == 9 * 3600  # 읽을 때 KST


def test_seminar_endpoints(client, session):
    asyncio.run(run_seminar_crawl(session, MockSeminarCrawler()))

    r = client.get("/api/v1/seminars")
    body = r.json()
    assert r.status_code == 200
    assert body["count"] == 4
    assert body["updated_at"] is not None
    starts = [s["start_at"] for s in body["items"]]
    assert starts == sorted(starts)
    assert starts[0].endswith("+09:00")

    online = next(s for s in body["items"] if s["place_raw"] == "Zoom 온라인")
    assert online["building_id"] is None and online["lat"] is None

    assert client.get("/api/v1/seminars?building_id=bld_E8").json()["count"] == 1
    assert client.get("/api/v1/seminars?category=event").json()["count"] == 2
    assert client.get("/api/v1/seminars?q=로봇").json()["count"] == 1
    page = client.get("/api/v1/seminars?limit=1").json()
    assert (page["count"], page["total"], len(page["items"])) == (1, 4, 1)  # count=이번 개수, total=전체

    sid = body["items"][0]["id"]
    assert client.get(f"/api/v1/seminars/{sid}").json()["id"] == sid
    assert client.get("/api/v1/seminars/sem_nope").status_code == 404
    assert client.get("/api/v1/seminars?from=2026-12-10&to=2026-12-01").status_code == 400


def test_match_place_tie_prefers_first_mentioned():
    # 실제 공지: "E7 236호 및 E5 1층 로비 일대" — 목록 순서(E5가 먼저)와 무관하게 E7
    blds = [
        Building(id="bld_E5", name="E5", aliases=["E5", "E5동"], lat=1.0, lng=1.0),
        Building(id="bld_E7", name="E7", aliases=["E7", "E7동"], lat=2.0, lng=2.0),
        Building(id="bld_E4", name="E4", aliases=["E4", "E4동"], lat=3.0, lng=3.0),
    ]
    assert match_place("E7 236호 및 E5 1층 로비 일대", blds).building_id == "bld_E7"
    # 더 긴 별칭("E4동")이 있으면 그쪽이 우선
    assert match_place("E7 해동창의마루 인근 E4동 지하1층 라운지", blds).building_id == "bld_E4"
