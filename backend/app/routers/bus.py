from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.errors import ApiError
from app.core.time import now_kst
from app.models import BusStop
from app.schemas import BusArrivalsResponse, BusStopOut, ListResponse, StopArrivalsOut
from app.services.bus.service import BusService

router = APIRouter(prefix="/bus", tags=["bus"])

MAX_STOPS = 10


def get_bus_service(request: Request) -> BusService:
    return request.app.state.bus


@router.get("/stops", response_model=ListResponse[BusStopOut])
def list_stops(session: Session = Depends(get_session)):
    items = session.exec(select(BusStop).order_by(BusStop.id)).all()
    return ListResponse(items=items, count=len(items), total=len(items), updated_at=None)


@router.get("/arrivals", response_model=BusArrivalsResponse)
def arrivals(
    stop_ids: str = Query(..., description="쉼표로 구분, 최대 10개"),
    session: Session = Depends(get_session),
    bus: BusService = Depends(get_bus_service),
):
    ids = list(dict.fromkeys(s.strip() for s in stop_ids.split(",") if s.strip()))
    if not ids:
        raise ApiError(400, "stop_ids 가 비어 있습니다.")
    if len(ids) > MAX_STOPS:
        raise ApiError(400, f"stop_ids 는 최대 {MAX_STOPS}개입니다.")
    known = set(session.exec(select(BusStop.id).where(BusStop.id.in_(ids))).all())
    unknown = [i for i in ids if i not in known]
    if unknown:
        raise ApiError(404, f"정류장을 찾을 수 없습니다: {', '.join(unknown)}")

    now = now_kst()
    items = [StopArrivalsOut(stop_id=i, arrivals=bus.get_arrivals(i, now)) for i in ids]
    return BusArrivalsResponse(
        items=items, count=len(items), total=len(items), updated_at=bus.updated_at, is_stale=bus.is_stale(now)
    )
