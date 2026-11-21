"""길찾기 / 러닝 루트 API (명세 6.5, 담당: 김도현).

통합 시 main.py에서:  app.include_router(route.router, prefix="/api/v1")
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.services.route import NoPathError, SnapError, get_graph
from app.services.route.graph import RUN_SPEED_MPS, WALK_SPEED_MPS

router = APIRouter(tags=["route"])

KST = timezone(timedelta(hours=9))
DEFAULT_START = (35.7003, 128.4576)  # DGIST 정문 (OSM 'DGIST Gate Compass Monument')


def _error(status: int, code: str, message: str) -> JSONResponse:
    """공통 에러 형식 (명세 5장). 전역 핸들러가 없어도 같은 형식이 나가도록 직접 만든다."""
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _parse_point(value: str) -> tuple[float, float] | None:
    try:
        lat_s, lng_s = value.split(",")
        lat, lng = float(lat_s), float(lng_s)
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


@router.get("/route")
def get_route(
    from_: str = Query(..., alias="from", description='"lat,lng"'),
    to: str = Query(..., description='"lat,lng"'),
    mode: str = Query("walk", pattern="^(walk|run)$"),
    slope: bool = Query(False, description="기울기 보정 (DEM 반영 전까지 무시)"),
):
    a, b = _parse_point(from_), _parse_point(to)
    if a is None or b is None:
        return _error(400, "BAD_REQUEST", 'from, to는 "lat,lng" 형식이어야 합니다.')
    g = get_graph()
    try:
        path = g.route(a[0], a[1], b[0], b[1])
    except SnapError as e:
        return _error(400, "BAD_REQUEST", str(e))
    except NoPathError as e:
        return _error(404, "NOT_FOUND", str(e))
    speed = RUN_SPEED_MPS if mode == "run" else WALK_SPEED_MPS
    return {
        "distance_m": round(path.length_m),
        "duration_s": round(path.length_m / speed),
        "ascent_m": None,
        "descent_m": None,
        "geometry": g.geometry(path.nodes),
    }


@router.get("/running-routes")
def get_running_routes(
    distance_km: float = Query(5, ge=1, le=21),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
):
    if (lat is None) != (lng is None):
        return _error(400, "BAD_REQUEST", "lat, lng는 함께 보내야 합니다.")
    start = (lat, lng) if lat is not None and lng is not None else DEFAULT_START
    g = get_graph()
    try:
        loops = g.loops(start[0], start[1], distance_km * 1000)
    except SnapError as e:
        return _error(400, "BAD_REQUEST", str(e))
    items = [
        {
            "id": lp.id,
            "name": lp.name,
            "distance_m": round(lp.length_m),
            "ascent_m": None,
            "signal_count": lp.signal_count,
            "geometry": g.geometry(lp.nodes),
        }
        for lp in loops
    ]
    return {"items": items, "count": len(items), "updated_at": datetime.now(KST).isoformat(timespec="seconds")}
