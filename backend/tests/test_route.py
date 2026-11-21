"""길찾기 / 러닝 루트 테스트. 실행: backend 폴더에서 python -m pytest tests/test_route.py"""

from __future__ import annotations

import math

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import route
from app.services.route.graph import NoPathError, SnapError, WalkGraph, haversine_m

DGIST_GATE = (35.7003, 128.4576)
LECTURE_HALL = (35.7063, 128.4534)


# ---------- 작은 가짜 그래프로 알고리즘 검증 ----------
def grid_graph(n: int = 11, step_deg: float = 0.001) -> WalkGraph:
    """n x n 격자 (간격 약 90~110m)."""
    nodes, edges = [], []
    for r in range(n):
        for c in range(n):
            nodes.append([r * n + c, 35.70 + r * step_deg, 128.45 + c * step_deg])
    for r in range(n):
        for c in range(n):
            i = r * n + c
            for j in ([i + 1] if c + 1 < n else []) + ([i + n] if r + 1 < n else []):
                a, b = nodes[i], nodes[j]
                edges.append([i, j, haversine_m(a[1], a[2], b[1], b[2])])
    return WalkGraph(nodes, edges)


def test_shortest_path_on_grid_is_manhattan():
    g = grid_graph()
    p = g.shortest_path(0, 120)  # 왼쪽 아래 → 오른쪽 위
    assert p.nodes[0] == 0 and p.nodes[-1] == 120
    assert len(p.nodes) == 21  # 10칸 + 10칸
    assert p.length_m == pytest.approx(g.length_of(p.nodes))


def test_snap_too_far_raises():
    g = grid_graph()
    with pytest.raises(SnapError):
        g.snap(36.0, 129.0)


def test_disconnected_raises_no_path():
    g = WalkGraph([[0, 35.7, 128.45], [1, 35.7, 128.451], [2, 35.701, 128.45]], [[0, 1, 90.0]])
    with pytest.raises(NoPathError):
        g.shortest_path(0, 2)


def test_loops_on_grid_hit_target_and_return_home():
    g = grid_graph(21)
    start = (35.71, 128.46)  # 격자 중앙
    loops = g.loops(*start, target_m=3000)
    assert loops, "순환 코스가 하나 이상 나와야 함"
    s = g.snap(*start)
    for lp in loops:
        assert lp.nodes[0] == s and lp.nodes[-1] == s
        assert abs(lp.length_m - 3000) / 3000 <= 0.15
        assert lp.id.startswith("run_")


# ---------- 실제 현풍 그래프 + API ----------
@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    app.include_router(route.router, prefix="/api/v1")
    return TestClient(app)


def test_route_api_real_graph(client: TestClient):
    r = client.get("/api/v1/route", params={"from": "%s,%s" % DGIST_GATE, "to": "%s,%s" % LECTURE_HALL})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"distance_m", "duration_s", "ascent_m", "descent_m", "geometry"}
    assert 500 < body["distance_m"] < 2000
    assert abs(body["duration_s"] - body["distance_m"] / 1.3) <= 1
    coords = body["geometry"]["coordinates"]
    assert body["geometry"]["type"] == "LineString"
    lng, lat = coords[0]  # GeoJSON은 [lng, lat]
    assert math.isclose(lat, DGIST_GATE[0], abs_tol=0.003) and math.isclose(lng, DGIST_GATE[1], abs_tol=0.003)


def test_route_run_mode_is_faster(client: TestClient):
    q = {"from": "%s,%s" % DGIST_GATE, "to": "%s,%s" % LECTURE_HALL}
    walk = client.get("/api/v1/route", params=q).json()
    run = client.get("/api/v1/route", params={**q, "mode": "run"}).json()
    assert run["duration_s"] < walk["duration_s"]


@pytest.mark.parametrize(
    "params,status,code",
    [
        ({"from": "abc", "to": "35.7,128.45"}, 400, "BAD_REQUEST"),
        ({"from": "37.56,126.97", "to": "35.7,128.45"}, 400, "BAD_REQUEST"),  # 서울: 보행로에서 너무 멂
    ],
)
def test_route_api_errors(client: TestClient, params, status, code):
    r = client.get("/api/v1/route", params=params)
    assert r.status_code == status
    assert r.json()["error"]["code"] == code


def test_running_routes_api(client: TestClient):
    r = client.get("/api/v1/running-routes", params={"distance_km": 5})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"items", "count", "updated_at"}
    assert 1 <= body["count"] <= 3
    assert body["count"] == len(body["items"])
    for item in body["items"]:
        assert set(item) == {"id", "name", "distance_m", "ascent_m", "signal_count", "geometry"}
        assert 4250 <= item["distance_m"] <= 5750
        c = item["geometry"]["coordinates"]
        assert c[0] == c[-1], "순환 코스는 출발점으로 돌아와야 함"


def test_running_routes_needs_both_lat_lng(client: TestClient):
    r = client.get("/api/v1/running-routes", params={"lat": 35.7})
    assert r.status_code == 400
