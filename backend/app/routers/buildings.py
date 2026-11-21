from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.errors import ApiError
from app.models import Building
from app.schemas import BuildingOut, ListResponse

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=ListResponse[BuildingOut])
def list_buildings(session: Session = Depends(get_session)):
    items = session.exec(select(Building).order_by(Building.id)).all()
    return ListResponse(items=items, count=len(items), total=len(items), updated_at=None)


@router.get("/{building_id}", response_model=BuildingOut)
def get_building(building_id: str, session: Session = Depends(get_session)):
    b = session.get(Building, building_id)
    if b is None:
        raise ApiError(404, "건물을 찾을 수 없습니다.")
    return b
