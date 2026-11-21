"""캠퍼스 물길의 끊긴 곳(OSM) → frontend/public/data/campus-water.geojson

E7(강의동)과 E8(학술정보관) 사이 물길은 OSM 에서 물 면(natural=water) 여러 조각으로 나뉘어 있고,
조각 사이 틈이 길이 지나가는 곳이다. 틈 길이로 구분한다 (2026-11-21 사용자 확인):
  - 좁은 틈 (< ROAD_MIN_GAP_M) → 다리: 틈은 물로 메우고(다리 밑으로 물이 흐름), 그 위에 다리 상판
  - 넓은 틈 → 도로: 틈은 포장(보도색)으로 메우고, 틈을 지나는 길을 도로로 그린다

    cd backend
    uv run python scripts/build_campus_water.py

출력 feature 의 kind:
  gap_water  (Polygon)    다리 밑 물
  gap_paved  (Polygon)    도로가 지나는 틈의 포장면
  bridge     (LineString) 물길을 가로지르는 다리 중심선, width_m = 상판 폭(물길 방향)
  road       (LineString) 넓은 틈을 지나는 길, width_m = 아스팔트 폭
데이터: © OpenStreetMap contributors (ODbL)
"""

import json
import math
import sys
import time
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "campus-water.geojson"

# 캠퍼스 범위 (build_campus_buildings.py 의 CAMPUS_AREA 와 같음)
BBOX = (35.7000, 128.4485, 35.7100, 128.4600)  # south, west, north, east
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
GAP_MIN_M = 1.5  # 이보다 가까우면 이어진 조각 (틈 아님)
GAP_MAX_M = 60.0  # 이보다 멀면 서로 다른 물길
ROAD_MIN_GAP_M = 15.0  # 틈이 이보다 넓으면 도로, 좁으면 다리
BRIDGE_OVERHANG_M = 3.0  # 다리가 물가 밖으로 더 나가는 길이 (양쪽)
ROAD_WIDTH_M = (4.0, 10.0)  # 도로 아스팔트 폭 범위 (틈 길이 − 보도 5m 를 이 범위로)

LAT0 = (BBOX[0] + BBOX[2]) / 2
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LNG = 111_320.0 * math.cos(math.radians(LAT0))

Pt = tuple[float, float]  # 로컬 미터 좌표 (x=동, y=북)


def to_m(lng: float, lat: float) -> Pt:
    return (lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT)


def to_lnglat(p: Pt) -> list[float]:
    return [round(p[0] / M_PER_DEG_LNG, 7), round(p[1] / M_PER_DEG_LAT, 7)]


def fetch() -> list[dict]:
    s, w, n, e = BBOX
    query = f"""[out:json][timeout:30];
(way["natural"="water"]({s},{w},{n},{e});
 way["highway"]({s},{w},{n},{e}););
out tags geom;"""
    last: Exception | None = None
    for attempt in range(4):  # 공개 Overpass 는 가끔 502/429 → 잠시 쉬고 미러를 번갈아 시도
        url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        try:
            r = httpx.post(
                url,
                data={"data": query},
                headers={"User-Agent": "hyeonpung-map-build/0.1"},
                timeout=60,
            )
            r.raise_for_status()
            return r.json()["elements"]
        except httpx.HTTPError as exc:
            last = exc
            print(f"Overpass 실패({url}): {exc} — 재시도", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("Overpass 요청 실패") from last


def dist_pt_seg(p: Pt, a: Pt, b: Pt) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def dist_pt_ring(p: Pt, ring: list[Pt]) -> float:
    return min(dist_pt_seg(p, ring[i], ring[i + 1]) for i in range(len(ring) - 1))


def ring_dist(r1: list[Pt], r2: list[Pt]) -> float:
    return min(min(dist_pt_ring(p, r2) for p in r1), min(dist_pt_ring(p, r1) for p in r2))


def facing_edge(ring: list[Pt], other: list[Pt]) -> tuple[Pt, Pt]:
    """ring 에서 other 와 가장 가까운 꼭짓점 두 개 = 틈을 마주보는 끝 변"""
    pts = sorted(set(ring), key=lambda p: dist_pt_ring(p, other))
    return pts[0], pts[1]


def mid(a: Pt, b: Pt) -> Pt:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def segs_cross(p1: Pt, p2: Pt, q1: Pt, q2: Pt) -> bool:
    def orient(a: Pt, b: Pt, c: Pt) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    return (orient(p1, p2, q1) * orient(p1, p2, q2) < 0) and (
        orient(q1, q2, p1) * orient(q1, q2, p2) < 0
    )


def crosses_quad(line: list[Pt], quad: list[Pt]) -> bool:
    return any(
        segs_cross(line[i], line[i + 1], quad[j], quad[j + 1])
        for i in range(len(line) - 1)
        for j in range(len(quad) - 1)
    )


def feature(kind: str, coords: list, geom: str, **props) -> dict:
    return {
        "type": "Feature",
        "properties": {"kind": kind, **props},
        "geometry": {"type": geom, "coordinates": coords},
    }


def main() -> int:
    elements = fetch()
    waters = [
        (el["id"], [to_m(p["lon"], p["lat"]) for p in el["geometry"]])
        for el in elements
        if el.get("tags", {}).get("natural") == "water" and len(el.get("geometry", [])) >= 4
    ]
    ways = [
        (el["id"], el["tags"], [to_m(p["lon"], p["lat"]) for p in el["geometry"]])
        for el in elements
        if "highway" in el.get("tags", {})
    ]

    # 서로 붙은 조각은 한 물길 덩어리로 묶는다 → 같은 덩어리 안의 먼 조각끼리는 틈이 아니다
    n = len(waters)
    dist = {
        (i, j): ring_dist(waters[i][1], waters[j][1]) for i in range(n) for j in range(i + 1, n)
    }
    group = list(range(n))

    def root(k: int) -> int:
        while group[k] != k:
            k = group[k]
        return k

    for (i, j), d in dist.items():
        if d <= GAP_MIN_M:
            group[root(i)] = root(j)

    feats: list[dict] = []
    for (i, j), d in dist.items():
        (id1, r1), (id2, r2) = waters[i], waters[j]
        if not GAP_MIN_M < d < GAP_MAX_M or root(i) == root(j):
            continue
        a1, a2 = facing_edge(r1, r2)
        b1, b2 = facing_edge(r2, r1)
        if math.dist(a1, b1) + math.dist(a2, b2) > math.dist(a1, b2) + math.dist(a2, b1):
            b1, b2 = b2, b1
        quad = [a1, a2, b2, b1, a1]
        ma, mb = mid(a1, a2), mid(b1, b2)
        gap = math.dist(ma, mb)
        width = (math.dist(a1, a2) + math.dist(b1, b2)) / 2  # 물길 폭
        quad_ll = [[to_lnglat(p) for p in quad]]
        tag = f"{id1}/{id2}"

        if gap < ROAD_MIN_GAP_M:
            # 다리: 물길 방향(ma→mb)에 수직으로, 물길 폭 + 양쪽 여유만큼
            c = mid(ma, mb)
            ux, uy = (mb[0] - ma[0]) / gap, (mb[1] - ma[1]) / gap
            half = width / 2 + BRIDGE_OVERHANG_M
            line = [(c[0] + uy * half, c[1] - ux * half), (c[0] - uy * half, c[1] + ux * half)]
            feats.append(feature("gap_water", quad_ll, "Polygon", water=tag))
            feats.append(
                feature(
                    "bridge",
                    [to_lnglat(p) for p in line],
                    "LineString",
                    water=tag,
                    width_m=round(gap + 1.0, 1),
                )
            )
            print(f"다리  {tag}: 틈 {gap:.1f}m, 물길 폭 {width:.1f}m")
        else:
            hits = [(wid, w) for wid, _t, w in ways if crosses_quad(w, quad)]
            if not hits:
                print(f"건너뜀 {tag}: 틈 {gap:.1f}m 인데 지나는 길이 없음")
                continue
            feats.append(feature("gap_paved", quad_ll, "Polygon", water=tag))
            road_w = max(ROAD_WIDTH_M[0], min(ROAD_WIDTH_M[1], gap - 5.0))
            for wid, w in hits:
                feats.append(
                    feature(
                        "road",
                        [to_lnglat(p) for p in w],
                        "LineString",
                        osm_id=wid,
                        width_m=round(road_w, 1),
                    )
                )
            print(f"도로  {tag}: 틈 {gap:.1f}m → 지나는 길 {[wid for wid, _ in hits]}")

    if not feats:
        print("끊긴 곳을 찾지 못했습니다.", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "attribution": "© OpenStreetMap contributors (ODbL)",
                "features": feats,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(feats)}개 → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
