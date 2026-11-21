"""OSM 보행로를 받아 seed/walk_graph.json 으로 저장한다 (1회 실행).

실행:  python backend/scripts/build_walk_graph.py
옵션:  --bbox minLat,minLng,maxLat,maxLng   (기본: 현풍/DGIST 일대)
       --input raw.json                     (이미 받아둔 Overpass 응답을 재사용)

출력 형식:
{
  "bbox": [...], "generated_at": "...",
  "nodes": [[id, lat, lng], ...],
  "edges": [[from_idx, to_idx, length_m], ...],     # 양방향, 노드 배열 인덱스 기준
  "signals": [[lat, lng], ...]                       # highway=traffic_signals
}
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_BBOX = (35.672, 128.415, 35.722, 128.485)  # 현풍읍 + 테크노폴리스 + DGIST + 현풍천
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
WALKABLE = (
    "footway|path|pedestrian|steps|living_street|residential|service|"
    "cycleway|track|unclassified|tertiary|secondary|primary|corridor"
)
OUT = Path(__file__).resolve().parents[1] / "seed" / "walk_graph.json"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch(bbox: tuple[float, float, float, float]) -> dict:
    s, w, n, e = bbox
    query = f"""
[out:json][timeout:90];
(
  way["highway"~"^({WALKABLE})$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"]({s},{w},{n},{e});
  node["highway"="traffic_signals"]({s},{w},{n},{e});
);
(._;>;);
out body;
"""
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "hyeonpung-map-builder/0.1"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def build(raw: dict, bbox: tuple[float, float, float, float]) -> dict:
    coords: dict[int, tuple[float, float]] = {}
    signals: list[list[float]] = []
    ways: list[list[int]] = []
    for el in raw["elements"]:
        if el["type"] == "node":
            coords[el["id"]] = (el["lat"], el["lon"])
            if el.get("tags", {}).get("highway") == "traffic_signals":
                signals.append([round(el["lat"], 7), round(el["lon"], 7)])
        elif el["type"] == "way" and len(el.get("nodes", [])) >= 2:
            ways.append(el["nodes"])

    # 길에 쓰인 노드만 남기고, 연속된 점 사이를 간선으로 만든다
    index: dict[int, int] = {}
    nodes: list[list[float]] = []
    edge_set: dict[tuple[int, int], float] = {}
    for way in ways:
        for a, b in zip(way, way[1:], strict=False):
            if a not in coords or b not in coords or a == b:
                continue
            for osm_id in (a, b):
                if osm_id not in index:
                    index[osm_id] = len(nodes)
                    lat, lng = coords[osm_id]
                    nodes.append([osm_id, round(lat, 7), round(lng, 7)])
            ia, ib = index[a], index[b]
            key = (min(ia, ib), max(ia, ib))
            if key not in edge_set:
                edge_set[key] = round(haversine_m(*coords[a], *coords[b]), 2)

    edges = [[a, b, d] for (a, b), d in edge_set.items()]
    nodes, edges = keep_largest_component(nodes, edges)
    kst = timezone(timedelta(hours=9))
    return {
        "bbox": list(bbox),
        "generated_at": datetime.now(kst).isoformat(timespec="seconds"),
        "source": "OpenStreetMap contributors (ODbL), via Overpass API",
        "nodes": nodes,
        "edges": edges,
        "signals": signals,
    }


def keep_largest_component(nodes: list, edges: list) -> tuple[list, list]:
    """끊어진 작은 길 조각을 버려, 스냅한 점끼리 항상 경로가 있게 한다."""
    parent = list(range(len(nodes)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, _ in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    sizes: dict[int, int] = {}
    for i in range(len(nodes)):
        r = find(i)
        sizes[r] = sizes.get(r, 0) + 1
    if not sizes:
        return nodes, edges
    big = max(sizes, key=sizes.get)
    remap: dict[int, int] = {}
    new_nodes = []
    for i, n in enumerate(nodes):
        if find(i) == big:
            remap[i] = len(new_nodes)
            new_nodes.append(n)
    new_edges = [[remap[a], remap[b], d] for a, b, d in edges if a in remap and b in remap]
    return new_nodes, new_edges


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="minLat,minLng,maxLat,maxLng")
    ap.add_argument("--input", help="이미 받은 Overpass JSON 파일")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    bbox = tuple(float(x) for x in args.bbox.split(",")) if args.bbox else DEFAULT_BBOX
    if args.input:
        raw = json.loads(Path(args.input).read_text(encoding="utf-8"))
    else:
        print(f"Overpass 요청 중... bbox={bbox}", file=sys.stderr)
        raw = fetch(bbox)  # type: ignore[arg-type]
    graph = build(raw, bbox)  # type: ignore[arg-type]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total_km = sum(e[2] for e in graph["edges"]) / 1000
    print(
        f"저장: {out}  노드 {len(graph['nodes'])}개, 간선 {len(graph['edges'])}개, "
        f"총 {total_km:.1f}km, 신호등 {len(graph['signals'])}개",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
