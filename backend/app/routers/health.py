from fastapi import APIRouter

from app.core.time import now_kst
from app.schemas import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(time=now_kst())
