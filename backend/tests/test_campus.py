"""강의실 검색 테스트. 실행: backend 폴더에서 python -m pytest tests/test_campus.py"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import campus
from app.services.campus import get_campus, search


def codes(items):
    return [(i["building"]["id"], i["code"]) for i in items]


@pytest.mark.parametrize("q", ["E7 L21", "e7-l21", "E7L21", "L21", "l21호"])
def test_room_code_variants(q):
    items = search(q)
    assert codes(items) == [("bld_E7", "L21")]
    it = items[0]
    assert it["type"] == "room" and it["floor_label"] == "L층" and it["name"] == "멀티미디어 강의실3"
    assert it["plan"]["image_url"] == f"/api/v1/campus/floor-plans/{it['plan']['id']}/image"
    assert it["plan"]["source_image_url"].startswith("https://www.dgist.ac.kr/images/college/sub04/")
    assert 0 <= it["x"] <= it["plan"]["width"] and 0 <= it["y"] <= it["plan"]["height"]


def test_bare_number_matches_many_buildings():
    items = search("216")
    bids = {i["building"]["id"] for i in items}
    assert {"bld_E3", "bld_E4", "bld_E5", "bld_E6", "bld_E7"} <= bids  # E2에는 216이 없음


def test_building_and_number():
    assert codes(search("E3 316")) == [("bld_E3", "316")]
    assert search("E5 220A")[0]["name"] == "자동제어 시스템 실습실1"


def test_unknown_room_falls_back_to_building_floor():
    items = search("R2 301")
    assert len(items) == 1 and items[0]["type"] == "building"
    assert items[0]["building"]["id"] == "bld_R2" and items[0]["floor_label"] == "3층"


def test_scan_attached_to_e8_third_floor():
    it = search("E8 301")[0]
    assert it["building"]["id"] == "bld_E8" and it["floor"] == "3"
    assert [s["id"] for s in it["scans"]] == ["e8_3f_gs"]
    assert it["scans"][0]["viewer_url"] == "/splat-viewer?scan=e8_3f_gs"
    assert search("도서관")[0]["scans"]  # 층 모르는 건물 검색도 스캔 연결
    assert search("E8 201")[0]["scans"] == []  # 다른 층은 없음
    assert search("L21")[0]["scans"] == []


def test_name_search():
    names = [i["name"] for i in search("멀티미디어")]
    assert "멀티미디어 강의실1" in names and "멀티미디어 강의실6" in names
    assert search("도서관")[0]["building"]["id"] == "bld_E8"


def test_seed_integrity():
    c = get_campus()
    assert len(c.buildings) == 21 and len(c.plans) == 12
    for r in c.rooms:
        p = c.plans[r["plan_id"]]
        assert r["building_id"] == p["building_id"]
        assert 0 <= r["x"] <= p["width"] and 0 <= r["y"] <= p["height"], r["id"]


def test_api():
    app = FastAPI()
    app.include_router(campus.router, prefix="/api/v1")
    cl = TestClient(app)
    r = cl.get("/api/v1/campus/search", params={"q": "E7 233"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1 and body["items"][0]["name"] == "일반 강의실(대)-1"
    assert cl.get("/api/v1/campus/search", params={"q": "없는강의실xyz"}).json()["count"] == 0
    bad = cl.get("/api/v1/campus/floor-plans/plan_nope/image")
    assert bad.status_code == 404 and bad.json()["error"]["code"] == "NOT_FOUND"
