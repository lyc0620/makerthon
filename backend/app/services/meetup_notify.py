"""밥약속 알림 (규격 6.12): 모임 참여자에게만 보내는 WebSocket 알림 `meetup.notice`.

누가 참여·나감·취소했는지, 정원이 찼는지, 채팅이 왔는지, 밥 시간이 다가오는지를 알려 줘요.
로그인한 연결(?token=)에만 갈 수 있어서 hub.send_to_user 로 참여자 한 명씩 보내요.

- 받는 사람과 내용(payload)은 요청 안(동기 세션, 커밋한 뒤)에서 계산하고,
  실제 보내기(async)는 BackgroundTasks 로 넘겨요. 기존 공개 방송과 같은 방식이에요.
- 밥 시간 10분 전 알림(reminder)은 lifespan 에서 시작하는 reminder_loop 가 30초마다 확인해요.
  이미 보낸 (모임 id, 밥 시간)은 메모리에만 기억해요 (워커 1개 전제, 실시간 위치와 같아요).
  서버를 다시 켜면 기억이 사라져서 한 번 더 갈 수 있어요. 이건 괜찮다고 봤어요.
"""

import asyncio
import logging
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Literal

from sqlmodel import Session, select

from app.core import ids, timeutil
from app.core.db import get_engine
from app.models import Meetup, MeetupMember, Restaurant
from app.services.realtime import hub

logger = logging.getLogger("hyeonpung")

EVENT = "meetup.notice"
Kind = Literal["joined", "left", "full", "cancelled", "message", "reminder"]

PREVIEW_MAX = 40  # 채팅 미리보기 글자 수
REMIND_BEFORE = timedelta(minutes=10)  # 밥 시간 10분 전부터 알려요
REMIND_EVERY_SECONDS = 30
REMIND_STATUSES = ("open", "full")

# 이미 알림을 보낸 (모임 id, 밥 시간). 밥 시간이 바뀌면 다시 보낼 수 있게 시간까지 같이 기억해요.
reminded: set[tuple[int, datetime]] = set()


# ───────────── 내용 만들기 ─────────────
def make_preview(content: str) -> str:
    """채팅 앞부분 40자만 보여 줘요. 잘렸으면 "…"를 붙여요."""
    return content if len(content) <= PREVIEW_MAX else content[:PREVIEW_MAX] + "…"


def member_ids(session: Session, meetup_id: int) -> list[int]:
    """지금 모임에 있는 사람들의 정수 id (참여한 순서)."""
    rows = session.exec(
        select(MeetupMember.user_id)
        .where(MeetupMember.meetup_id == meetup_id)
        .order_by(MeetupMember.joined_at, MeetupMember.user_id)
    ).all()
    return list(rows)


def build_notice(
    session: Session,
    m: Meetup,
    kind: Kind,
    actor_nickname: str | None = None,
    preview: str | None = None,
    member_count: int | None = None,
) -> dict:
    """`meetup.notice` 의 data 모양. 커밋한 뒤 상태로 불러야 숫자가 맞아요."""
    place_name = m.place_name
    if m.restaurant_id is not None:
        restaurant = session.get(Restaurant, m.restaurant_id)
        if restaurant is not None:
            place_name = restaurant.name  # 가게가 연결돼 있으면 가게 이름을 써요
    if member_count is None:
        member_count = len(member_ids(session, m.id))
    return {
        "kind": kind,
        "meetup_id": ids.encode(ids.MEETUP, m.id),
        "title": m.title,
        "meal_time": timeutil.to_iso(m.meal_time),
        "place_name": place_name or None,
        "member_count": member_count,
        "max_people": m.max_people,
        "actor_nickname": actor_nickname,
        "preview": preview if kind == "message" else None,
    }


async def send_notice(user_ids: Iterable[int], data: dict) -> None:
    """참여자 한 명 한 명에게 보내요 (각자 여러 탭이 열려 있어도 다 받아요)."""
    for uid in user_ids:
        await hub.send_to_user(uid, EVENT, data)


# ───────────── 밥 시간 알림 ─────────────
def select_reminders(meetups: Iterable[Meetup], now: datetime, already: set[tuple[int, datetime]]) -> list[Meetup]:
    """지금(now) 알림을 보내야 하는 모임을 골라요. 테스트하기 쉽게 DB·시계 없이 동작해요.

    - 상태가 open/full 이고, 밥 시간이 아직 안 왔고(미래), 10분 안이면 골라요.
    - 고른 모임은 already 에 기억해서 다음에는 다시 고르지 않아요 (한 번만).
    """
    picked = []
    for m in meetups:
        meal_time = timeutil.as_aware(m.meal_time)
        key = (m.id, meal_time)
        if m.status not in REMIND_STATUSES or key in already:
            continue
        if now < meal_time <= now + REMIND_BEFORE:
            already.add(key)
            picked.append(m)
    return picked


def _forget_old(now: datetime) -> None:
    """밥 시간이 한참 지난 기억은 지워서 집합이 끝없이 커지지 않게 해요."""
    for key in [k for k in reminded if k[1] < now - timedelta(hours=1)]:
        reminded.discard(key)


async def remind_once(now: datetime | None = None) -> int:
    """한 번 확인해서 알림을 보내요. 보낸 모임 수를 돌려줘요."""
    now = now or timeutil.now_utc()
    _forget_old(now)
    jobs: list[tuple[list[int], dict]] = []
    with Session(get_engine()) as session:
        candidates = session.exec(
            select(Meetup).where(
                Meetup.status.in_(REMIND_STATUSES),
                Meetup.meal_time > now,
                Meetup.meal_time <= now + REMIND_BEFORE,
            )
        ).all()
        for m in select_reminders(candidates, now, reminded):
            members = member_ids(session, m.id)
            jobs.append((members, build_notice(session, m, "reminder", member_count=len(members))))
    for members, data in jobs:
        await send_notice(members, data)
    return len(jobs)


async def reminder_loop() -> None:
    """앱이 켜져 있는 동안 30초마다 밥 시간 알림을 확인해요 (main.py의 lifespan에서 시작해요)."""
    while True:
        await asyncio.sleep(REMIND_EVERY_SECONDS)
        try:
            await remind_once()
        except Exception:  # 한 번 실패해도 루프는 계속 돌아요
            logger.exception("밥약속 알림 확인 중 오류")
