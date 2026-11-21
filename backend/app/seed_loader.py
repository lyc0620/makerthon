"""seed/*.json 을 DB에 반영한다 (id 기준 upsert, 여러 번 실행해도 안전)."""

import json
from pathlib import Path

from sqlmodel import Session, col, delete

from app.models import Building, BusStop

SEED_DIR = Path(__file__).resolve().parents[1] / "seed"


def _items(name: str) -> list[dict]:
    """seed 파일의 항목 목록. {"items": [...]} 와 [...] 두 형식 모두 받는다
    (buildings.json 은 강의실 검색 쪽 scripts/build_campus_seed.py 가 목록으로 만든다)."""
    data = json.loads((SEED_DIR / name).read_text(encoding="utf-8"))
    return data["items"] if isinstance(data, dict) else data


def _row(model, row: dict) -> dict:
    """테이블에 없는 칸(예: 건물 code)은 빼고 넘긴다."""
    fields = model.model_fields
    return {k: v for k, v in row.items() if k in fields}


def load_seeds(session: Session) -> dict[str, int]:
    counts = {}
    for model, filename in ((Building, "buildings.json"), (BusStop, "bus_stops.json")):
        rows = _items(filename)
        for row in rows:
            session.merge(model(**_row(model, row)))
        counts[filename] = len(rows)
    # 정류장은 seed 가 정답: seed 에서 빠진 정류장은 지운다.
    # (건물은 세미나가 참조하므로 지우지 않는다)
    keep = [r["id"] for r in _items("bus_stops.json")]
    session.exec(delete(BusStop).where(col(BusStop.id).not_in(keep)))
    session.commit()
    return counts


def load_shuttle_timetable() -> list[dict]:
    return json.loads((SEED_DIR / "shuttle_timetable.json").read_text(encoding="utf-8"))["routes"]
