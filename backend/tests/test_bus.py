import asyncio
from datetime import datetime, timedelta

from app.core.time import KST
from app.services.bus.base import Arrival, Snapshot
from app.services.bus.service import BusService
from app.services.bus.shuttle import next_shuttles

TIMETABLE = [
    {
        "route": "교내 셔틀",
        "stop_id": "stop_a",
        "direction": "현풍터미널",
        "days": ["mon", "tue", "wed", "thu", "fri"],
        "times": ["08:00", "08:30", "09:00", "23:50"],
    }
]


def test_next_shuttles_weekday():
    now = datetime(2026, 11, 23, 8, 10, tzinfo=KST)  # 월요일
    out = next_shuttles(TIMETABLE, "stop_a", now)
    assert [a.eta_min for a in out] == [20, 50]
    assert out[0].source == "timetable" and out[0].route_type == "shuttle"
    assert out[0].departure_time == datetime(2026, 11, 23, 8, 30, tzinfo=KST)


def test_next_shuttles_weekend_and_midnight():
    assert (
        next_shuttles(TIMETABLE, "stop_a", datetime(2026, 11, 22, 8, 0, tzinfo=KST)) == []
    )  # 일요일
    # 일요일 23:30 → 월요일 첫차는 2시간 넘게 남아 제외
    late_sun = datetime(2026, 11, 22, 23, 30, tzinfo=KST)
    assert next_shuttles(TIMETABLE, "stop_a", late_sun) == []
    # 월요일 07:00 → 첫차 08:00 (60분)
    assert (
        next_shuttles(TIMETABLE, "stop_a", datetime(2026, 11, 23, 7, 0, tzinfo=KST))[0].eta_min
        == 60
    )


class FailingSource:
    async def fetch(self, stops):
        raise RuntimeError("upstream down")


def test_cache_keeps_last_value_and_goes_stale():
    bus = BusService(FailingSource(), TIMETABLE, stale_seconds=180)
    t0 = datetime(2026, 11, 23, 12, 0, tzinfo=KST)
    bus.snapshot = Snapshot(
        fetched_at=t0,
        arrivals={"stop_a": [Arrival("직행2", "city", "대구 방면", eta_min=10, stops_left=4)]},
    )

    asyncio.run(bus.refresh(_FakeSession()))  # 실패해도 캐시 유지
    assert bus.snapshot.fetched_at == t0
    assert bus.last_error

    assert not bus.is_stale(t0 + timedelta(minutes=2))
    assert bus.is_stale(t0 + timedelta(minutes=4))
    # 캐시 이후 흐른 시간만큼 ETA 감소
    assert bus.get_arrivals("stop_a", t0 + timedelta(minutes=3))[0].eta_min == 7


class _FakeSession:
    def exec(self, _stmt):
        class R:
            def all(self):
                return []

        return R()


def test_stops_endpoint(client):
    r = client.get("/api/v1/bus/stops")
    assert r.status_code == 200
    assert r.json()["items"][0]["routes"]


def test_arrivals_endpoint(client):
    # 스케줄러가 꺼져 있으니 직접 한 번 갱신
    from sqlmodel import Session

    from app.core.db import get_engine

    bus = client.app.state.bus
    r = client.get("/api/v1/bus/arrivals?stop_ids=stop_yuga_office_front")
    assert r.json()["is_stale"] is True  # 아직 수집 전
    assert r.json()["updated_at"] is None

    with Session(get_engine()) as s:
        asyncio.run(bus.refresh(s))

    r = client.get("/api/v1/bus/arrivals?stop_ids=stop_yuga_office_front,stop_jungheung_sclass")
    body = r.json()
    assert r.status_code == 200
    assert body["is_stale"] is False
    assert body["count"] == 2
    etas = [a["eta_min"] for a in body["items"][0]["arrivals"]]
    assert etas == sorted(etas)
    a = body["items"][0]["arrivals"][0]
    assert set(a) == {
        "route",
        "route_type",
        "direction",
        "eta_min",
        "stops_left",
        "departure_time",
        "source",
    }


def test_arrivals_validation(client):
    assert client.get("/api/v1/bus/arrivals").status_code == 422
    assert (
        client.get("/api/v1/bus/arrivals?stop_ids=stop_nope").json()["error"]["code"] == "NOT_FOUND"
    )
    many = ",".join(f"s{i}" for i in range(11))
    assert client.get(f"/api/v1/bus/arrivals?stop_ids={many}").status_code == 400
