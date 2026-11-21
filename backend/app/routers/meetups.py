"""밥친구 API (규격 6.8): 시간대별로 캠퍼스에서 같이 밥 먹을 사람을 찾아요.

번개 약속(규격 6.11)도 여기 있어요: /quick(버튼 두 번으로 만들기), /suggestions(지금 참여하기 좋은 약속).
참여·나가기·채팅 때 참여자에게만 가는 알림(규격 6.12 meetup.notice)은 app/services/meetup_notify.py 에서 만들어요.
"""

import re
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlmodel import Session, func, select

from app.core import ids, timeutil
from app.core.auth import current_user, optional_user
from app.core.db import get_session
from app.core.errors import conflict, forbidden, not_found, validation
from app.core.geo import haversine_m
from app.models import Meetup, MeetupMember, MeetupMessage, Restaurant, User
from app.schemas.common import Page, make_page
from app.schemas.meetup import (
    MeetupIn,
    MeetupOut,
    MeetupSuggestionOut,
    MessageIn,
    MessageOut,
    QuickMeetupIn,
)
from app.services import meetup_notify
from app.services.realtime import hub

router = APIRouter(prefix="/api/v1/meetups", tags=["밥친구"])

SHOW_AFTER_START = timedelta(minutes=30)  # 밥 시간이 지나도 30분은 목록에 보여요
PAST_GRACE = timedelta(minutes=10)  # 10분 전까지는 "지금 막" 만든 약속으로 봐줘요
MAX_AHEAD = timedelta(days=7)

# 번개 약속 (규격 6.11)
QUICK_OFFSET_MINUTES = {"now": 10, "in_30": 30, "in_60": 60}  # 지금부터 몇 분 뒤
MEAL_HOURS = {"lunch": 12, "dinner": 18}  # 서울 시각, 이미 지났으면 내일
DEFAULT_PLACE = "학생식당"
SUGGEST_WITHIN = timedelta(hours=2)  # 추천은 2시간 안에 시작하는 약속만
SUGGEST_MAX = 5
SUGGEST_FAR_M = 2000  # 이 거리부터는 "멀다"로 봐요 (거리 점수 1)


# ───────────── 도우미 ─────────────
def _members(session: Session, meetup_id: int) -> list[tuple[int, str]]:
    rows = session.exec(
        select(User.id, User.nickname)
        .join(MeetupMember, MeetupMember.user_id == User.id)
        .where(MeetupMember.meetup_id == meetup_id)
        .order_by(MeetupMember.joined_at, User.id)
    ).all()
    return [(uid, nick) for uid, nick in rows]


def _view(session: Session, m: Meetup, user: User | None, personal: bool = True) -> dict:
    """personal=False 면 방송용이라 joined, is_host를 빼요."""
    members = _members(session, m.id)
    host = session.get(User, m.host_id)
    data = {
        "id": ids.encode(ids.MEETUP, m.id),
        "title": m.title,
        "place_name": m.place_name,
        "restaurant_id": ids.encode(ids.RESTAURANT, m.restaurant_id),
        "lat": m.lat,
        "lng": m.lng,
        "meal_time": timeutil.to_iso(m.meal_time),
        "max_people": m.max_people,
        "member_count": len(members),
        "members": [nick for _, nick in members],
        "host_nickname": host.nickname if host else "알 수 없음",
        "note": m.note,
        "status": m.status,
        "created_at": timeutil.to_iso(m.created_at),
    }
    if personal:
        me = user.id if user else None
        data["joined"] = me is not None and any(uid == me for uid, _ in members)
        data["is_host"] = me is not None and me == m.host_id
    return data


def _member_count(session: Session, meetup_id: int) -> int:
    return session.exec(select(func.count()).where(MeetupMember.meetup_id == meetup_id)).one()


def _sync_status(session: Session, m: Meetup) -> None:
    """정원이 차면 full, 자리가 나면 다시 open (취소된 모임은 그대로)."""
    if m.status == "cancelled":
        return
    m.status = "full" if _member_count(session, m.id) >= m.max_people else "open"
    session.add(m)


def _get_meetup(session: Session, meetup_id: str) -> Meetup:
    mid = ids.decode(ids.MEETUP, meetup_id, "모임을 찾을 수 없어요.")
    m = session.get(Meetup, mid)
    if m is None:
        raise not_found("모임을 찾을 수 없어요.")
    return m


def _is_member(session: Session, meetup_id: int, user_id: int) -> bool:
    return session.get(MeetupMember, (meetup_id, user_id)) is not None


def _require_member(session: Session, meetup_id: str, user: User) -> Meetup:
    m = _get_meetup(session, meetup_id)
    if not _is_member(session, m.id, user.id):
        raise forbidden("모임에 참여한 사람만 채팅을 볼 수 있어요.")
    return m


def _parse_after_id(after_id: str | None) -> int:
    """after_id는 "msg_9" 또는 숫자 9 둘 다 받아요.

    "²" 같은 유니코드 숫자나 너무 긴 숫자는 500이 나지 않게 422로 막아요 (ASCII 숫자 18자리까지).
    """
    if not after_id:
        return 0
    match = re.fullmatch(ids.MESSAGE + r"_([0-9]{1,18})|([0-9]{1,18})", after_id)
    if not match:
        raise validation('after_id는 "msg_9" 형식이에요.')
    return int(match.group(1) or match.group(2))


def _restaurant_or_404(session: Session, restaurant_id: str) -> Restaurant:
    rid = ids.decode(ids.RESTAURANT, restaurant_id, "가게를 찾을 수 없어요.")
    restaurant = session.get(Restaurant, rid)
    if restaurant is None:
        raise not_found("가게를 찾을 수 없어요.")
    return restaurant


def _insert_meetup(session: Session, host: User, **fields) -> Meetup:
    """모임을 저장하고 방장을 자동으로 참여시켜요. (일반 모임·번개 약속이 같이 써요)"""
    now = timeutil.now_utc()
    meetup = Meetup(host_id=host.id, status="open", created_at=now, **fields)
    session.add(meetup)
    session.flush()
    session.add(MeetupMember(meetup_id=meetup.id, user_id=host.id, joined_at=now))  # 방장 자동 참여
    session.commit()
    session.refresh(meetup)
    return meetup


def _ceil_5min(dt: datetime) -> datetime:
    """분을 5분 단위로 올려요. 12:31:20 → 12:35, 12:35:00 → 12:35"""
    floored = dt.replace(minute=dt.minute - dt.minute % 5, second=0, microsecond=0)
    return floored if floored == dt else floored + timedelta(minutes=5)


def quick_meal_time(when: str, now: datetime) -> datetime:
    """번개 약속의 when("now", "in_30", "in_60", "lunch", "dinner")을 실제 시각(UTC)으로 바꿔요."""
    seoul_now = timeutil.to_seoul(now)
    if when in QUICK_OFFSET_MINUTES:
        target = seoul_now + timedelta(minutes=QUICK_OFFSET_MINUTES[when])
    else:
        target = seoul_now.replace(hour=MEAL_HOURS[when], minute=0, second=0, microsecond=0)
        if target < seoul_now:
            target += timedelta(days=1)  # 오늘 점심(저녁)이 이미 지났으면 내일이에요
    return timeutil.to_utc(_ceil_5min(target))


def quick_title(meal_time: datetime, place_name: str) -> str:
    """자동 제목: "⚡ 번개 · 12:30 든든국밥" (DB 제목 칸이 40자라서 넘치면 잘라요)"""
    return f"⚡ 번개 · {timeutil.to_seoul(meal_time):%H:%M} {place_name}"[:40]


def create_quick_meetup(session: Session, host: User, body: QuickMeetupIn) -> Meetup:
    """번개 약속 만들기. /meetups/quick 과 /presence/{user_id}/invite 가 같이 써요."""
    meal_time = quick_meal_time(body.when, timeutil.now_utc())
    restaurant_id, lat, lng = None, None, None
    # 장소 정하는 순서: 가게 → 직접 쓴 이름 → "학생식당"
    if body.restaurant_id is not None:
        restaurant = _restaurant_or_404(session, body.restaurant_id)
        restaurant_id, lat, lng = restaurant.id, restaurant.lat, restaurant.lng
        place_name = restaurant.name
    else:
        place_name = body.place_name or DEFAULT_PLACE
    return _insert_meetup(
        session,
        host,
        title=quick_title(meal_time, place_name),
        place_name=place_name,
        restaurant_id=restaurant_id,
        lat=lat,
        lng=lng,
        meal_time=meal_time,
        max_people=body.max_people,
        note=body.note,
    )


def public_view(session: Session, m: Meetup) -> dict:
    """방송용 모임 모양 (다른 라우터에서도 써요)."""
    return _view(session, m, None, personal=False)


def personal_view(session: Session, m: Meetup, user: User | None) -> dict:
    return _view(session, m, user)


# ───────────── 엔드포인트 ─────────────
@router.get("", response_model=Page[MeetupOut], summary="다가오는 밥약속 목록 (meal_time 순)")
def list_meetups(
    within_hours: int = Query(24, ge=1, le=168, description="앞으로 몇 시간 안의 모임까지"),
    include_full: bool = True,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    now = timeutil.now_utc()
    statuses = ["open", "full"] if include_full else ["open"]
    meetups = list(
        session.exec(
            select(Meetup)
            .where(
                Meetup.status.in_(statuses),
                Meetup.meal_time >= now - SHOW_AFTER_START,
                Meetup.meal_time <= now + timedelta(hours=within_hours),
            )
            .order_by(Meetup.meal_time, Meetup.id)
        ).all()
    )
    updated = max((m.created_at for m in meetups), default=None)
    items = [_view(session, m, user) for m in meetups[offset : offset + limit]]
    return make_page(items, len(meetups), timeutil.to_iso(updated))


@router.post("", status_code=201, response_model=MeetupOut, summary="밥친구 구하기 (모임 만들기)")
def create_meetup(
    body: MeetupIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    now = timeutil.now_utc()
    meal_time = timeutil.to_utc(body.meal_time)  # 시간대가 없으면 서울 시간으로 봐요
    if meal_time < now - PAST_GRACE:
        raise validation("이미 지난 시간이에요.")
    if meal_time > now + MAX_AHEAD:
        raise validation("7일 안의 약속만 만들 수 있어요.")

    lat, lng = body.lat, body.lng
    if (lat is None) != (lng is None):
        raise validation("lat과 lng는 함께 보내 주세요.")
    restaurant_id = None
    if body.restaurant_id is not None:
        restaurant = _restaurant_or_404(session, body.restaurant_id)
        restaurant_id, lat, lng = restaurant.id, restaurant.lat, restaurant.lng  # 가게 좌표가 자동으로 들어가요

    meetup = _insert_meetup(
        session,
        user,
        title=body.title,
        place_name=body.place_name,
        restaurant_id=restaurant_id,
        lat=lat,
        lng=lng,
        meal_time=meal_time,
        max_people=body.max_people,
        note=body.note,
    )
    tasks.add_task(hub.broadcast, "meetup.created", public_view(session, meetup))
    return _view(session, meetup, user)


# 아래 두 경로는 "/{meetup_id}" 보다 먼저 선언해야 "quick", "suggestions"가 ID로 읽히지 않아요.
@router.post("/quick", status_code=201, response_model=MeetupOut, summary="번개 약속 (버튼 두 번으로 만들기)")
def create_quick(
    body: QuickMeetupIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    meetup = create_quick_meetup(session, user, body)
    tasks.add_task(hub.broadcast, "meetup.created", public_view(session, meetup))
    return _view(session, meetup, user)


@router.get("/suggestions", response_model=Page[MeetupSuggestionOut], summary="지금 참여하기 좋은 약속 추천 (최대 5개)")
def suggest_meetups(
    lat: float | None = Query(None, ge=-90, le=90, description="내 위치 (lng와 함께)"),
    lng: float | None = Query(None, ge=-180, le=180),
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    """2시간 안에 시작하는 open 약속을 "시간 가까움 + 거리 가까움" 점수로 정렬해요 (점수가 낮을수록 위)."""
    if (lat is None) != (lng is None):
        raise validation("lat과 lng는 함께 보내 주세요.")
    now = timeutil.now_utc()
    candidates = session.exec(
        select(Meetup).where(
            Meetup.status == "open",
            Meetup.meal_time >= now - PAST_GRACE,  # 막 시작한 약속(10분 안)까지는 끼워 줘요
            Meetup.meal_time <= now + SUGGEST_WITHIN,
        )
    ).all()

    scored = []
    for m in candidates:
        # 시간 점수: 지금 바로면 0, 2시간 뒤면 1
        time_score = max((timeutil.as_aware(m.meal_time) - now) / SUGGEST_WITHIN, 0)
        distance_m = None
        if lat is not None and m.lat is not None:
            distance_m = round(haversine_m(lat, lng, m.lat, m.lng))
        # 거리 점수: 바로 옆이면 0, 2km 넘으면 1. 거리를 모르면 중간(0.5)으로 봐요
        distance_score = 0.5 if distance_m is None else min(distance_m / SUGGEST_FAR_M, 1)
        scored.append((time_score + distance_score, m.meal_time, m.id, m, distance_m))
    scored.sort(key=lambda row: row[:3])

    items = [{**_view(session, m, user), "distance_m": distance_m} for *_, m, distance_m in scored[:SUGGEST_MAX]]
    updated = max((m.created_at for m in candidates), default=None)
    return make_page(items, len(candidates), timeutil.to_iso(updated))


@router.get("/{meetup_id}", response_model=MeetupOut, summary="모임 상세")
def get_meetup(
    meetup_id: str,
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    return _view(session, _get_meetup(session, meetup_id), user)


@router.post("/{meetup_id}/join", response_model=MeetupOut, summary="참여하기")
def join_meetup(
    meetup_id: str,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    m = _get_meetup(session, meetup_id)
    if _is_member(session, m.id, user.id):
        raise conflict("이미 참여 중이에요.")
    if m.status == "cancelled":
        raise conflict("취소된 모임이에요.")
    if m.status == "full":
        raise conflict("자리가 다 찼어요.")
    if m.meal_time < timeutil.now_utc() - SHOW_AFTER_START:
        raise conflict("이미 끝난 모임이에요.")

    session.add(MeetupMember(meetup_id=m.id, user_id=user.id, joined_at=timeutil.now_utc()))
    session.flush()
    # 두 사람이 동시에 참여하면 둘 다 위 검사를 통과할 수 있어요. 넣은 뒤 다시 세서 넘치면 되돌려요.
    if _member_count(session, m.id) > m.max_people:
        session.rollback()
        raise conflict("자리가 다 찼어요.")
    _sync_status(session, m)
    session.commit()
    session.refresh(m)
    tasks.add_task(hub.broadcast, "meetup.updated", _view(session, m, None, personal=False))
    # 참여자 알림 (6.12): 이번 참여로 정원이 찼으면 참여한 사람까지 모두에게 "full", 아니면 나머지에게 "joined"
    members = meetup_notify.member_ids(session, m.id)
    kind = "full" if m.status == "full" else "joined"
    recipients = members if kind == "full" else [uid for uid in members if uid != user.id]
    notice = meetup_notify.build_notice(session, m, kind, actor_nickname=user.nickname, member_count=len(members))
    tasks.add_task(meetup_notify.send_notice, recipients, notice)
    return _view(session, m, user)


@router.post("/{meetup_id}/leave", response_model=MeetupOut, summary="나가기 (방장이 나가면 취소돼요)")
def leave_meetup(
    meetup_id: str,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    m = _get_meetup(session, meetup_id)
    if not _is_member(session, m.id, user.id):
        raise conflict("참여하지 않은 모임이에요.")
    was_cancelled = m.status == "cancelled"  # 이미 취소된 모임이면 참여자 알림을 또 보내지 않아요

    if m.host_id == user.id:
        m.status = "cancelled"  # 방장 기록은 남겨 두고 모임만 취소해요
        session.add(m)
        event = "meetup.cancelled"
    else:
        session.delete(session.get(MeetupMember, (m.id, user.id)))
        session.flush()
        _sync_status(session, m)  # 정원이 찼다가 자리가 나면 다시 open
        event = "meetup.updated"
    session.commit()
    session.refresh(m)
    tasks.add_task(hub.broadcast, event, _view(session, m, None, personal=False))
    # 참여자 알림 (6.12): 방장이 나가면 남은 모두에게 "cancelled", 아니면 남은 사람에게 "left"
    # 방장이 취소해도 참여 기록은 남아 있어서, 방장 본인만 빼고 보내요.
    if not was_cancelled:
        members = meetup_notify.member_ids(session, m.id)
        kind = "cancelled" if event == "meetup.cancelled" else "left"
        notice = meetup_notify.build_notice(session, m, kind, actor_nickname=user.nickname, member_count=len(members))
        tasks.add_task(meetup_notify.send_notice, [uid for uid in members if uid != user.id], notice)
    return _view(session, m, user)


@router.get("/{meetup_id}/messages", response_model=Page[MessageOut], summary="모임 채팅 보기 (참여자만)")
def list_messages(
    meetup_id: str,
    after_id: str | None = Query(None, description='이 메시지 다음부터 (예: "msg_9")'),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    m = _require_member(session, meetup_id, user)
    after = _parse_after_id(after_id)
    base = select(MeetupMessage).where(MeetupMessage.meetup_id == m.id, MeetupMessage.id > after)
    total = session.exec(select(func.count()).where(MeetupMessage.meetup_id == m.id, MeetupMessage.id > after)).one()
    messages = session.exec(base.order_by(MeetupMessage.id).limit(limit)).all()
    nicknames = {
        u.id: u.nickname for u in session.exec(select(User).where(User.id.in_({x.user_id for x in messages}))).all()
    }
    items = [
        {
            "id": ids.encode(ids.MESSAGE, x.id),
            "nickname": nicknames.get(x.user_id, "알 수 없음"),
            "content": x.content,
            "created_at": timeutil.to_iso(x.created_at),
        }
        for x in messages
    ]
    latest = session.exec(select(func.max(MeetupMessage.created_at)).where(MeetupMessage.meetup_id == m.id)).one()
    return make_page(items, int(total), timeutil.to_iso(latest))


@router.post("/{meetup_id}/messages", status_code=201, response_model=MessageOut, summary="모임 채팅 보내기")
def send_message(
    meetup_id: str,
    body: MessageIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    m = _require_member(session, meetup_id, user)
    message = MeetupMessage(meetup_id=m.id, user_id=user.id, content=body.content, created_at=timeutil.now_utc())
    session.add(message)
    session.commit()
    session.refresh(message)
    # 채팅 내용은 방송하지 않고 "새 메시지 있음"만 알려요 → 참여자가 GET 으로 가져가요
    tasks.add_task(
        hub.broadcast,
        "meetup.message",
        {"meetup_id": ids.encode(ids.MEETUP, m.id), "message_id": ids.encode(ids.MESSAGE, message.id)},
    )
    # 참여자 알림 (6.12): 보낸 사람 빼고 참여자에게만 미리보기(앞 40자)를 보내요
    members = meetup_notify.member_ids(session, m.id)
    notice = meetup_notify.build_notice(
        session,
        m,
        "message",
        actor_nickname=user.nickname,
        preview=meetup_notify.make_preview(message.content),
        member_count=len(members),
    )
    tasks.add_task(meetup_notify.send_notice, [uid for uid in members if uid != user.id], notice)
    return {
        "id": ids.encode(ids.MESSAGE, message.id),
        "nickname": user.nickname,
        "content": message.content,
        "created_at": timeutil.to_iso(message.created_at),
    }
