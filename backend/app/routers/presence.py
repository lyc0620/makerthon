"""지금 밥 먹을 사람 — 실시간 위치 API (규격 6.10).

"지금 밥 먹을래요"를 켠 사람만 지도에 점으로 떠요. 모든 API가 로그인 필수예요.
위치는 DB가 아니라 메모리(app/services/presence.py)에만 있고, 약 50m 격자로 흐려서 보여 줘요.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlmodel import Session

from app.core import ids, timeutil
from app.core.auth import current_user
from app.core.db import get_session
from app.core.errors import not_found, validation
from app.core.geo import in_service_area
from app.models import User
from app.routers.meetups import create_quick_meetup, personal_view, public_view
from app.schemas.common import Page, make_page
from app.schemas.meetup import MeetupOut, QuickMeetupIn
from app.schemas.presence import PresenceIn, PresenceOut
from app.services.presence import store
from app.services.realtime import hub

router = APIRouter(prefix="/api/v1/presence", tags=["지금 밥 먹을 사람"])


def _announce_expired(tasks: BackgroundTasks) -> None:
    """목록을 볼 때 만료된 사람을 지우고, 로그인한 연결에 presence.removed 를 알려요."""
    for uid in store.expire():
        tasks.add_task(hub.broadcast_logged_in, "presence.removed", {"user_id": ids.encode(ids.USER, uid)})


@router.put("/me", response_model=PresenceOut, summary="지금 밥 먹을래요 켜기·갱신 (heartbeat)")
def put_my_presence(
    body: PresenceIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
):
    if not in_service_area(body.lat, body.lng):
        raise validation("서비스 지역(캠퍼스 주변) 밖이에요.")
    # food_pref, message는 보낸 것만 바꿔요. 안 보낸 칸은 켜져 있는 동안 예전 값을 지켜요.
    kept = {name: getattr(body, name) for name in ("food_pref", "message") if name in body.model_fields_set}
    entry = store.upsert(user.id, user.nickname, body.lat, body.lng, body.minutes, **kept)
    tasks.add_task(hub.broadcast_logged_in, "presence.updated", entry.public())
    return entry.view(entry, user.id)


@router.delete("/me", status_code=204, summary="지금 밥 먹을래요 끄기")
def delete_my_presence(tasks: BackgroundTasks, user: User = Depends(current_user)):
    if store.remove(user.id):
        tasks.add_task(hub.broadcast_logged_in, "presence.removed", {"user_id": ids.encode(ids.USER, user.id)})
    return Response(status_code=204)


@router.get("", response_model=Page[PresenceOut], summary="지금 켜진 사람들 (나 포함, 가까운 순)")
def list_presence(
    tasks: BackgroundTasks,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
):
    _announce_expired(tasks)
    entries = store.active()
    me = next((e for e in entries if e.user_id == user.id), None)
    items = [e.view(me, user.id) for e in entries]
    if me is not None:
        items.sort(key=lambda x: (x["distance_m"], not x["is_me"], x["user_id"]))  # 가까운 순, 나는 맨 앞
    else:
        items.sort(key=lambda x: x["updated_at"], reverse=True)  # 내 위치를 모르면 최근 신호 순
    updated = max((e.updated_at for e in entries), default=None)
    return make_page(items[offset : offset + limit], len(items), timeutil.to_iso(updated))


@router.post(
    "/{user_id}/invite", status_code=201, response_model=MeetupOut, summary='"같이 먹자" 보내기 (번개 약속 만들기)'
)
def invite(
    user_id: str,
    body: QuickMeetupIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    target_id = ids.decode(ids.USER, user_id, "위치를 켠 사람을 찾을 수 없어요.")
    if target_id == user.id:
        raise validation("자기 자신에게는 보낼 수 없어요.")
    target = session.get(User, target_id)
    if target is None or store.get(target_id) is None:
        raise not_found("상대가 위치 공유를 껐어요.")
    # 5분 안에 같은 상대에게 또 보내면 429. 확인과 기록을 한 번에 해서 두 번 눌러도 하나만 통과해요.
    reserved_at = store.try_reserve_invite(user.id, target_id)
    try:
        meetup = create_quick_meetup(session, user, body)  # 나 = 방장
    except Exception:
        store.release_invite(user.id, target_id, reserved_at)  # 약속을 못 만들었으면 예약을 되돌려요
        raise
    tasks.add_task(hub.broadcast, "meetup.created", public_view(session, meetup))
    tasks.add_task(
        hub.send_to_user,
        target_id,
        "invite.received",
        {"meetup": personal_view(session, meetup, target), "from_nickname": user.nickname},
    )
    return personal_view(session, meetup, user)
