"""DGIST 건물·강의실 검색 (담당: 김도현).

seed/buildings.json, floor_plans.json, rooms.json (scripts/build_campus_seed.py로 생성)을 메모리에 올려 검색한다.

검색 예
- "E7 L21", "e7-233", "E7233"  → 건물 + 실 번호
- "L21", "G01"                  → E7 실 (L·G 번호는 E7에만 있음)
- "233"                         → 그 번호를 가진 모든 건물의 실
- "멀티미디어", "이준석"           → 실 이름
- "컨실리언스", "도서관", "R2"     → 건물
- "R2 301" (안내도 없음)          → 건물 + 번호 첫 자리로 추정한 층
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

SEED = Path(__file__).resolve().parents[3] / "seed"


@dataclass
class CampusData:
    buildings: dict[str, dict]
    plans: dict[str, dict]
    rooms: list[dict]
    scans: list[dict]


@lru_cache(maxsize=1)
def get_campus() -> CampusData:
    def load(name: str) -> list[dict]:
        return json.loads((SEED / f"{name}.json").read_text(encoding="utf-8"))

    return CampusData(
        buildings={b["id"]: b for b in load("buildings")},
        plans={p["id"]: p for p in load("floor_plans")},
        rooms=load("rooms"),
        scans=load("scans") if (SEED / "scans.json").exists() else [],
    )


_VIEWER_PATH = {"splat": "/api/v1/scans/splat-viewer", "points": "/api/v1/scans/points-viewer"}


def _scans_for(c: CampusData, building_id: str, floor: str | None) -> list[dict]:
    """그 건물(층을 알면 그 층)의 3D 스캔 목록. viewer_url은 routers/scans.py의 뷰어 페이지."""
    return [
        {
            "id": s["id"],
            "title": s["title"],
            "viewer": s["viewer"],
            "viewer_url": f"{_VIEWER_PATH[s['viewer']]}?scan={s['id']}",
        }
        for s in c.scans
        if s["building_id"] == building_id and (floor is None or s["floor"] == floor)
    ]


def _norm(s: str) -> str:
    return re.sub(r"[\s\-_.·/()]", "", s).upper()


_CODE_RE = re.compile(r"^(E\d|R\d|S\d|H501)?([GL]?\d{2,3}[AB]?|[GL]\d{2})$")
_FLOOR_LABEL = {"G": "G층", "L": "L층"}


def _guess_floor(code: str) -> str | None:
    if code[0] in "GL":
        return code[0]
    if code[0].isdigit() and len(code) >= 3:
        return code[0]
    return None


def _room_item(c: CampusData, r: dict) -> dict:
    b = c.buildings[r["building_id"]]
    p = c.plans.get(r["plan_id"])
    return {
        "type": "room",
        "id": r["id"],
        "code": r["code"],
        "name": r["name"],
        "floor": r["floor"],
        "floor_label": _FLOOR_LABEL.get(r["floor"], f"{r['floor']}층"),
        "building": {"id": b["id"], "name": b["name"], "lat": b["lat"], "lng": b["lng"]},
        "plan": None
        if p is None
        else {
            "id": p["id"],
            # 학교 서버가 Cross-Origin-Resource-Policy: same-site 라 브라우저에서 직접 못 띄움 → 우리 API로 중계
            "image_url": f"/api/v1/campus/floor-plans/{p['id']}/image",
            "source_image_url": p["image_url"],
            "width": p["width"],
            "height": p["height"],
            "source_url": p["source_url"],
        },
        "x": r["x"],
        "y": r["y"],
        "scans": _scans_for(c, b["id"], r["floor"]),
    }


def _building_item(b: dict, floor: str | None = None, code: str | None = None) -> dict:
    return {
        "scans": _scans_for(get_campus(), b["id"], floor),
        "type": "building",
        "id": b["id"],
        "code": code,
        "name": None,
        "floor": floor,
        "floor_label": None if floor is None else _FLOOR_LABEL.get(floor, f"{floor}층"),
        "building": {"id": b["id"], "name": b["name"], "lat": b["lat"], "lng": b["lng"]},
        "plan": None,
        "x": None,
        "y": None,
    }


def search(q: str, limit: int = 20) -> list[dict]:
    c = get_campus()
    nq = _norm(q)
    if not nq:
        return []
    nq = nq.removesuffix("호")

    # 1) 건물 코드 + 실 번호 ("E7 L21", "E7233")
    m = _CODE_RE.match(nq)
    if m and m.group(2):
        bcode, rcode = m.group(1), m.group(2)
        bld_id = f"bld_{bcode}" if bcode else None
        hits = [
            r for r in c.rooms
            if _norm(r["code"]) == rcode and (bld_id is None or r["building_id"] == bld_id)
        ]
        if hits:
            return [_room_item(c, r) for r in hits[:limit]]
        if bld_id and bld_id in c.buildings:  # 안내도에 없는 실: 건물 + 추정 층
            return [_building_item(c.buildings[bld_id], _guess_floor(rcode), rcode)]

    # 2) 건물 이름·별칭·코드
    out: list[dict] = []
    for b in c.buildings.values():
        if any(nq in _norm(a) or (len(_norm(a)) >= 2 and _norm(a) == nq) for a in [b["name"], *b["aliases"]]):
            out.append(_building_item(b))

    # 3) 실 이름
    for r in c.rooms:
        if r["name"] and nq in _norm(r["name"]):
            out.append(_room_item(c, r))
        if len(out) >= limit:
            break
    return out[:limit]
