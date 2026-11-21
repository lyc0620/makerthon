import asyncio
import json
from datetime import datetime
from pathlib import Path

import httpx
import pytest

from app.core.time import KST
from app.models import BusStop
from app.services.bus.crawl import CrawlBusSource, load_route_config, parse_arrivals

FIX = Path(__file__).parent / "fixtures"
ROUTES = load_route_config()
NOW = datetime(2026, 11, 21, 13, 40, tzinfo=KST)


def _fixture(bs_id: str) -> dict:
    return json.loads((FIX / f"businfo_arr2_{bs_id}.json").read_text(encoding="utf-8"))


def test_route_config_has_our_routes():
    names = {v["name"] for k, v in ROUTES.items() if not k.startswith("_")}
    assert names == {"직행2", "급행8", "급행8-1"}


def test_parse_front_stop():
    arr = parse_arrivals(_fixture("7111067000"), ROUTES, NOW)
    # 665, 달성5 같은 대상 외 노선은 빠진다
    assert {a.route for a in arr} == {"직행2", "급행8", "급행8-1"}
    assert [a.eta_min for a in arr] == sorted(a.eta_min for a in arr)
    first = arr[0]
    assert (first.route, first.eta_min, first.source) == ("직행2", 1, "realtime")  # "곧 도착"
    assert all(a.direction == "테크노폴리스 방면" for a in arr)  # moveDir 0
    assert any(a.stops_left == 3 for a in arr if a.route == "급행8-1")


def test_parse_across_stop_states():
    arr = parse_arrivals(_fixture("7111067100"), ROUTES, NOW)
    by = {(a.route, a.eta_min) for a in arr}
    assert ("급행8", 3) in by  # "전전"
    assert ("급행8", 13) in by
    assert ("직행2", 18) in by
    assert all(a.direction == "대구 시내 방면" for a in arr)  # moveDir 1


def test_parse_departure_planned():
    payload = {
        "body": {
            "block": False,
            "list": [
                {
                    "arrList": [
                        {
                            "routeId": "1000008101",
                            "moveDir": "1",
                            "bsGap": -2,
                            "bsNm": "13:55 기점출발예정",
                            "arrState": "기점출발예정",
                        }
                    ]
                }
            ],
        }
    }
    [a] = parse_arrivals(payload, ROUTES, NOW)
    assert a.eta_min == 15 and a.source == "timetable"
    assert a.departure_time == datetime(2026, 11, 21, 13, 55, tzinfo=KST)
    assert a.stops_left is None


def test_parse_blocked_raises():
    with pytest.raises(RuntimeError):
        parse_arrivals({"body": {"block": True, "blockMsg": "점검 중"}}, ROUTES, NOW)


def test_fetch_uses_user_agent_and_external_id():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        bs = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=_fixture(bs))

    client = httpx.AsyncClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(handler),
        headers={"User-Agent": "test-agent"},
    )
    src = CrawlBusSource(ROUTES, client=client, delay_seconds=0)
    stops = [
        BusStop(id="a", name="A", external_id="7111067000", lat=0, lng=0, routes=[]),
        BusStop(id="b", name="B", external_id=None, lat=0, lng=0, routes=[]),  # ID 없으면 건너뜀
    ]
    result = asyncio.run(src.fetch(stops))
    assert set(result) == {"a"}
    assert seen[0].url.path == "/realtime/arr2/7111067000"
    assert seen[0].headers["user-agent"] == "test-agent"


def test_fetch_all_failed_raises():
    client = httpx.AsyncClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(lambda r: httpx.Response(400)),
    )
    src = CrawlBusSource(ROUTES, client=client, delay_seconds=0)
    stop = BusStop(id="a", name="A", external_id="1", lat=0, lng=0, routes=[])
    with pytest.raises(RuntimeError):
        asyncio.run(src.fetch([stop]))
