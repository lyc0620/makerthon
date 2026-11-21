"""캠퍼스 건물 윤곽(OSM) → frontend/public/data/campus-buildings.geojson

지도에서 3D 로 세우는 건물은 이 파일의 건물뿐이다 (아파트 등 주변 건물은 평면).

    cd backend
    uv run python scripts/build_campus_buildings.py

층수 고치기: 아래 LEVELS 표에 OSM id 또는 이름으로 적고 다시 실행한다.
높이 = 층수 × FLOOR_HEIGHT_M. 표에 없고 OSM 에도 층수가 없으면 용도별 기본값(추정)을 쓴다.
데이터: © OpenStreetMap contributors (ODbL)
"""

import json
import sys
from pathlib import Path

import httpx

OUT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "data"
    / "campus-buildings.geojson"
)

# OSM 에서 받아 올 범위 (넉넉하게)
BBOX = (35.6990, 128.4480, 35.7120, 128.4620)  # south, west, north, east
# 실제 캠퍼스 영역: 건물 중심점이 이 안에 있어야 3D 로 세운다.
# (동쪽 원형 공원 건너편 생활관 단지 128.461~ 는 캠퍼스 밖이라 제외 — 2026-11-21 사용자 확인)
CAMPUS_AREA = (35.7000, 128.4485, 35.7100, 128.4600)  # south, west, north, east
FLOOR_HEIGHT_M = 3.6

# 층수 직접 지정 (OSM id 또는 name). 확인되면 여기만 고치면 된다.
LEVELS: dict[str, int] = {
    # "대구경북과학기술원 강의동": 6,   # OSM 값 사용 중
}
# OSM·표 모두 없을 때 용도별 기본 층수 (추정값 → estimated=true 로 표시)
DEFAULT_LEVELS = {"university": 4, "dormitory": 8, "commercial": 2}


def fetch() -> list[dict]:
    s, w, n, e = BBOX
    q = f"""[out:json][timeout:40];
(way["building"]({s},{w},{n},{e}); relation["building"]({s},{w},{n},{e}););
out tags geom;"""
    r = httpx.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": q},
        headers={"User-Agent": "hyeonpung-map/0.1 (DGIST makerthon)"},
        timeout=90,
    )
    r.raise_for_status()
    return r.json()["elements"]


def to_feature(el: dict) -> dict | None:
    geom = el.get("geometry")
    if el["type"] != "way" or not geom:
        return None  # 멀티폴리곤(relation)은 캠퍼스에 없어서 생략
    lat = sum(p["lat"] for p in geom) / len(geom)
    lng = sum(p["lon"] for p in geom) / len(geom)
    s, w, n, e = CAMPUS_AREA
    if not (s <= lat <= n and w <= lng <= e):
        return None  # 캠퍼스 밖 건물은 지도에서 평면 윤곽으로만 그린다
    ring = [[round(p["lon"], 7), round(p["lat"], 7)] for p in geom]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    tags = el.get("tags", {})
    kind = tags.get("building", "yes")
    name = tags.get("name")
    # OSM 입력 실수 보정: 이름이 층수 칸에 들어간 경우 (예: R4 "로봇시스템IT융합연구동 R4")
    raw_levels = tags.get("building:levels", "")
    if not name and raw_levels and not raw_levels.isdigit():
        name = raw_levels

    levels, estimated = None, False
    for key in (str(el["id"]), name):
        if key and key in LEVELS:
            levels = LEVELS[key]
    if levels is None:
        try:
            levels = int(tags.get("building:levels", ""))
        except ValueError:
            levels = DEFAULT_LEVELS.get(kind, 3)
            estimated = True

    return {
        "type": "Feature",
        "id": el["id"],
        "properties": {
            "osm_id": el["id"],
            "name": name,
            "kind": kind,
            "levels": levels,
            "height": round(levels * FLOOR_HEIGHT_M, 1),
            "estimated": estimated,
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def main() -> int:
    feats = [f for f in map(to_feature, fetch()) if f]
    if not feats:
        print("건물을 하나도 받지 못했습니다.", file=sys.stderr)
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
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    for f in feats:
        p = f["properties"]
        mark = " (추정)" if p["estimated"] else ""
        print(f"{p['osm_id']:>11} {p['kind']:<11} {p['levels']:>2}층{mark} {p['name'] or ''}")
    print(f"{len(feats)}개 → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
