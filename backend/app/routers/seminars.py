from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.core.errors import ApiError
from app.core.time import KST, now_kst
from app.models import CrawlLog, Seminar
from app.schemas import ListResponse, SeminarCategory, SeminarOut

router = APIRouter(prefix="/seminars", tags=["seminars"])


@router.get("", response_model=ListResponse[SeminarOut])
def list_seminars(
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    building_id: str | None = None,
    category: SeminarCategory | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    today = now_kst().date()
    start_day = from_ or today
    end_day = to or (start_day + timedelta(days=7))
    if end_day < start_day:
        raise ApiError(400, "to 는 from 보다 빠를 수 없습니다.")

    start = datetime.combine(start_day, time.min, tzinfo=KST)
    end = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=KST)  # to 포함

    stmt = select(Seminar).where(Seminar.start_at >= start, Seminar.start_at < end)
    if building_id:
        stmt = stmt.where(Seminar.building_id == building_id)
    if category:
        stmt = stmt.where(Seminar.category == category)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Seminar.title).like(like), func.lower(Seminar.host).like(like))
        )

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    items = session.exec(stmt.order_by(col(Seminar.start_at)).offset(offset).limit(limit)).all()
    return ListResponse(items=items, count=len(items), total=total, updated_at=_last_crawl(session))


@router.get("/{seminar_id}", response_model=SeminarOut)
def get_seminar(seminar_id: str, session: Session = Depends(get_session)):
    s = session.get(Seminar, seminar_id)
    if s is None:
        raise ApiError(404, "세미나를 찾을 수 없습니다.")
    return s


def _last_crawl(session: Session) -> datetime | None:
    return session.exec(
        select(CrawlLog.finished_at)
        .where(CrawlLog.job == "seminar", CrawlLog.status == "success")
        .order_by(col(CrawlLog.id).desc())
        .limit(1)
    ).first()
