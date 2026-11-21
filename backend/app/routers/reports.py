"""제보 API (규격 6.6). 첫 타입은 경찰 단속(police)이에요.

규칙 요약
- 제보는 타입별 기본 시간 뒤 사라지고, 새 "확인" 1표마다 연장돼요.
- 같은 타입의 활성 제보가 합치기 반경 안에 있으면 새로 만들지 않고 그 제보에 "확인"한 것으로 쳐요.
- "아니에요"가 2표 이상이면서 "확인"보다 많으면 바로 숨겨요.
- 같은 사람은 2분에 한 번만 새 제보를 할 수 있어요 (합쳐지는 경우는 제외).
- 제보자 정보는 응답에 넣지 않아요. 만료·숨김된 제보도 통계용으로 남겨요.
"""

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlmodel import Session, func, select

from app.core import ids, timeutil
from app.core.auth import current_user, optional_user
from app.core.db import get_session
from app.core.errors import AppError, conflict, not_found, validation
from app.core.geo import haversine_m, in_service_area
from app.models import Report, ReportVote, User
from app.schemas.common import Page, make_page
from app.schemas.report import HotspotOut, ReportCreatedOut, ReportIn, ReportOut, ReportType, VoteIn
from app.services.realtime import hub

router = APIRouter(prefix="/api/v1/reports", tags=["제보"])


@dataclass(frozen=True)
class TypeRule:
    ttl_min: int  # 기본 유지(분)
    extend_min: int  # 확인 1표당 연장(분)
    merge_radius_m: int  # 합치기 반경(m)


# 타입을 늘릴 때는 여기에 한 줄만 추가하면 돼요
TYPE_RULES: dict[str, TypeRule] = {
    "police": TypeRule(ttl_min=30, extend_min=15, merge_radius_m=100),
    "dark_road": TypeRule(ttl_min=60, extend_min=30, merge_radius_m=50),
    "hazard": TypeRule(ttl_min=60, extend_min=30, merge_radius_m=50),
}
COOLDOWN = timedelta(minutes=2)
HIDE_MIN_DENY = 2
WEEKDAYS = "월화수목금토일"


# ───────────── 도우미 ─────────────
def _is_active(report: Report) -> bool:
    return report.status == "active" and report.expires_at > timeutil.now_utc()


def _vote_counts(session: Session, report_ids: list[int]) -> dict[int, Counter]:
    counts: dict[int, Counter] = defaultdict(Counter)
    if report_ids:
        rows = session.exec(
            select(ReportVote.report_id, ReportVote.vote, func.count())
            .where(ReportVote.report_id.in_(report_ids))
            .group_by(ReportVote.report_id, ReportVote.vote)
        ).all()
        for rid, vote, n in rows:
            counts[rid][vote] = int(n)
    return counts


def _my_votes(session: Session, report_ids: list[int], user: User | None) -> dict[int, str]:
    if user is None or not report_ids:
        return {}
    rows = session.exec(
        select(ReportVote).where(ReportVote.report_id.in_(report_ids), ReportVote.user_id == user.id)
    ).all()
    return {v.report_id: v.vote for v in rows}


def _confidence(report: Report, confirm: int, deny: int) -> float:
    """0.6 + 0.15·확인 − 0.25·아니에요 − 0.4·min(마지막 확인 후 분 / 기본 유지 분, 1) 을 0~1로 잘라요."""
    rule = TYPE_RULES.get(report.type, TYPE_RULES["police"])
    age_min = (timeutil.now_utc() - report.last_confirmed_at).total_seconds() / 60
    value = 0.6 + 0.15 * confirm - 0.25 * deny - 0.4 * min(max(age_min, 0) / rule.ttl_min, 1)
    return round(max(0.0, min(1.0, value)), 2)


def _views(session: Session, reports: list[Report], user: User | None) -> list[dict]:
    report_ids = [r.id for r in reports]
    counts = _vote_counts(session, report_ids)
    mine = _my_votes(session, report_ids, user)
    return [
        {
            "id": ids.encode(ids.REPORT, r.id),
            "type": r.type,
            "lat": r.lat,
            "lng": r.lng,
            "description": r.description,
            "created_at": timeutil.to_iso(r.created_at),
            "last_confirmed_at": timeutil.to_iso(r.last_confirmed_at),
            "expires_at": timeutil.to_iso(r.expires_at),
            "confirm_count": counts[r.id]["confirm"],
            "deny_count": counts[r.id]["deny"],
            "confidence": _confidence(r, counts[r.id]["confirm"], counts[r.id]["deny"]),
            "is_active": _is_active(r),
            "my_vote": mine.get(r.id),
        }
        for r in reports
    ]


def _view(session: Session, report: Report, user: User | None) -> dict:
    return _views(session, [report], user)[0]


def _public(view: dict) -> dict:
    """방송용: 개인 필드(my_vote)는 비워서 보내요."""
    return {**view, "my_vote": None}


def _cast_vote(session: Session, report: Report, user: User, vote: str) -> None:
    """표를 넣거나 바꿔요. '확인'이면 시간을 연장하는데, 한 사람당 제보 하나에 한 번만이에요.
    (확인 → 없어요 → 확인을 반복해도 처음 한 번만 늘어나요. 커밋은 부르는 쪽에서)"""
    now = timeutil.now_utc()
    existing = session.get(ReportVote, (report.id, user.id))
    if existing is None:
        existing = ReportVote(report_id=report.id, user_id=user.id, vote=vote, created_at=now)
    else:
        existing.vote = vote
        existing.created_at = now
    if vote == "confirm" and not existing.extended:
        rule = TYPE_RULES[report.type]
        report.last_confirmed_at = now
        report.expires_at = max(report.expires_at, now) + timedelta(minutes=rule.extend_min)
        existing.extended = True
        session.add(report)
    session.add(existing)


def _get_report(session: Session, report_id: str) -> Report:
    rid = ids.decode(ids.REPORT, report_id, "제보를 찾을 수 없어요.")
    report = session.get(Report, rid)
    if report is None:
        raise not_found("제보를 찾을 수 없어요.")
    return report


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        min_lng, min_lat, max_lng, max_lat = (float(x) for x in bbox.split(","))
    except ValueError as exc:
        raise validation("bbox는 minLng,minLat,maxLng,maxLat 형식이에요.") from exc
    if not all(math.isfinite(v) for v in (min_lng, min_lat, max_lng, max_lat)):
        raise validation("bbox에는 nan, inf 말고 보통 숫자만 넣어 주세요.")
    if min_lng > max_lng or min_lat > max_lat:
        raise validation("bbox의 최소값이 최대값보다 커요.")
    return min_lng, min_lat, max_lng, max_lat


# ───────────── 엔드포인트 ─────────────
@router.get("", response_model=Page[ReportOut], summary="지금 활성인 제보 (최신순)")
def list_reports(
    bbox: str | None = Query(None, description="minLng,minLat,maxLng,maxLat"),
    type: ReportType | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    stmt = select(Report).where(Report.status == "active", Report.expires_at > timeutil.now_utc())
    if type:
        stmt = stmt.where(Report.type == type)
    if bbox:
        min_lng, min_lat, max_lng, max_lat = _parse_bbox(bbox)
        stmt = stmt.where(Report.lng >= min_lng, Report.lng <= max_lng, Report.lat >= min_lat, Report.lat <= max_lat)
    reports = list(session.exec(stmt.order_by(Report.created_at.desc(), Report.id.desc())).all())
    updated = max((r.last_confirmed_at for r in reports), default=None)
    page = reports[offset : offset + limit]
    return make_page(_views(session, page, user), len(reports), timeutil.to_iso(updated))


@router.post("", status_code=201, response_model=ReportCreatedOut, summary="제보하기 (근처 같은 제보면 합쳐요)")
def create_report(
    body: ReportIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    if not in_service_area(body.lat, body.lng):
        raise validation("현풍 캠퍼스 주변만 제보할 수 있어요.")
    rule = TYPE_RULES[body.type]
    now = timeutil.now_utc()

    # 1) 근처에 같은 타입 활성 제보가 있으면 가장 가까운 것에 '확인'으로 합쳐요
    nearby = session.exec(
        select(Report).where(Report.type == body.type, Report.status == "active", Report.expires_at > now)
    ).all()
    candidates = [(haversine_m(body.lat, body.lng, r.lat, r.lng), r) for r in nearby]
    candidates = [(d, r) for d, r in candidates if d <= rule.merge_radius_m]
    if candidates:
        _, target = min(candidates, key=lambda x: x[0])
        _cast_vote(session, target, user, "confirm")
        session.commit()
        session.refresh(target)
        view = _view(session, target, user)
        tasks.add_task(hub.broadcast, "report.updated", _public(view))
        return {**view, "merged": True}

    # 2) 새 제보는 2분에 한 번만
    last = session.exec(select(func.max(Report.created_at)).where(Report.user_id == user.id)).one()
    if last is not None and now - timeutil.as_aware(last) < COOLDOWN:
        raise AppError("RATE_LIMITED", 429, "제보는 2분에 한 번만 할 수 있어요. 잠시 후 다시 해 주세요.")

    report = Report(
        type=body.type,
        user_id=user.id,
        lat=body.lat,
        lng=body.lng,
        description=body.description,
        status="active",
        created_at=now,
        last_confirmed_at=now,
        expires_at=now + timedelta(minutes=rule.ttl_min),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    view = _view(session, report, user)
    tasks.add_task(hub.broadcast, "report.created", _public(view))
    return {**view, "merged": False}


@router.get("/hotspots", response_model=Page[HotspotOut], summary="단속 다발 구역 (지난 제보 통계)")
def hotspots(
    type: ReportType = "police",
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    """약 100m 격자(위경도 소수 셋째 자리)로 묶어 제보 수와 가장 많은 시각·요일(서울 기준)을 알려 줘요."""
    since = timeutil.now_utc() - timedelta(days=days)
    reports = session.exec(select(Report).where(Report.type == type, Report.created_at >= since)).all()

    cells: dict[tuple[float, float], dict] = {}
    for r in reports:
        key = (round(r.lat, 3), round(r.lng, 3))
        cell = cells.setdefault(key, {"count": 0, "lat": 0.0, "lng": 0.0, "hours": Counter(), "weekdays": Counter()})
        local = timeutil.to_seoul(r.created_at)
        cell["count"] += 1
        cell["lat"] += r.lat
        cell["lng"] += r.lng
        cell["hours"][local.hour] += 1
        cell["weekdays"][local.weekday()] += 1

    items = []
    for cell in cells.values():
        n = cell["count"]
        # 같은 횟수면 이른 시각·이른 요일을 골라요 (결과가 매번 같도록)
        peak_hour = min(cell["hours"].items(), key=lambda kv: (-kv[1], kv[0]))[0]
        peak_day = min(cell["weekdays"].items(), key=lambda kv: (-kv[1], kv[0]))[0]
        items.append(
            {
                "lat": round(cell["lat"] / n, 6),
                "lng": round(cell["lng"] / n, 6),
                "count": n,
                "peak_hour": peak_hour,
                "peak_weekday": WEEKDAYS[peak_day],
            }
        )
    items.sort(key=lambda x: (-x["count"], x["lat"], x["lng"]))
    updated = max((r.created_at for r in reports), default=None)
    return make_page(items[offset : offset + limit], len(items), timeutil.to_iso(updated))


@router.get("/{report_id}", response_model=ReportOut, summary="제보 하나 (만료돼도 조회돼요)")
def get_report(
    report_id: str,
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    return _view(session, _get_report(session, report_id), user)


@router.post("/{report_id}/votes", response_model=ReportOut, summary="확인 / 아니에요 투표")
def vote_report(
    report_id: str,
    body: VoteIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    report = _get_report(session, report_id)
    if not _is_active(report):
        raise conflict("이미 내려간 제보예요.")

    _cast_vote(session, report, user, body.vote)
    session.commit()
    session.refresh(report)

    counts = _vote_counts(session, [report.id])[report.id]
    if counts["deny"] >= HIDE_MIN_DENY and counts["deny"] > counts["confirm"]:
        report.status = "hidden"
        session.add(report)
        session.commit()
        session.refresh(report)
        tasks.add_task(hub.broadcast, "report.removed", {"id": ids.encode(ids.REPORT, report.id)})
        return _view(session, report, user)

    view = _view(session, report, user)
    tasks.add_task(hub.broadcast, "report.updated", _public(view))
    return view
