"""지금 밥 먹을 사람 — 실시간 위치 저장소 (규격 6.10).

개인정보 원칙을 이 파일에서 지켜요.
- DB에 저장하지 않아요. 서버 메모리(딕셔너리)에만 있고 서버를 끄면 사라져요.
- 받은 좌표는 들어오자마자 약 50m 격자의 중심으로 흐려서 저장해요.
  정확한 좌표는 어디에도 남지 않으니 응답에 나갈 수도 없어요.
- 고른 시간(until)이 지나거나 3분 동안 신호(heartbeat)가 없으면 사라져요.
  목록을 볼 때마다 지우고(lazy), 백그라운드에서도 30초마다 지워요(cleanup_loop).
- 고른 시간이 끝난 뒤 앱이 heartbeat를 계속 보내도 다시 켜지지 않아요(409).
  사용자가 minutes를 골라 다시 켜야만 공유가 돼요. 이를 위해 "시간이 끝난 사람" id만
  잠깐 기억해요(좌표는 기억하지 않아요). 3분 동안 신호가 없으면 이 기억도 지워요.

시간은 timeutil.now_utc()로 읽어요. 테스트의 clock 준비물이 이 함수를 바꿔서 시간을 움직여요.
Uvicorn 워커 1개 전제예요. 동기 API는 여러 스레드에서 돌아서 자물쇠(lock)로 지켜요.
"""

import asyncio
import logging
import math
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core import ids, timeutil
from app.core.errors import AppError
from app.core.geo import haversine_m
from app.services.realtime import hub

logger = logging.getLogger("hyeonpung")

# 격자 크기: 위도 0.0005° ≈ 55m, 경도 0.0006° ≈ 54m (현풍 위도 35.7° 기준)
LAT_STEP = 0.0005
LNG_STEP = 0.0006
SILENCE_LIMIT = timedelta(minutes=3)  # 이만큼 신호가 없으면 꺼져요
INVITE_COOLDOWN = timedelta(minutes=5)  # 같은 상대에게 다시 "같이 먹자"를 보내려면 기다려야 하는 시간
CLEANUP_EVERY_SECONDS = 30


def fuzz(lat: float, lng: float) -> tuple[float, float]:
    """좌표를 약 50m 격자 칸의 중심으로 바꿔요. 같은 칸 안이면 누구든 같은 값이 나와요."""
    cell_lat = math.floor(lat / LAT_STEP)
    cell_lng = math.floor(lng / LNG_STEP)
    return round((cell_lat + 0.5) * LAT_STEP, 6), round((cell_lng + 0.5) * LNG_STEP, 6)


@dataclass
class Entry:
    """한 사람의 위치 공유 상태. lat, lng는 이미 흐린 좌표예요."""

    user_id: int
    nickname: str
    lat: float
    lng: float
    until: datetime
    food_pref: str | None
    message: str | None
    updated_at: datetime

    def public(self) -> dict:
        """방송(presence.updated)용 모양: distance_m, is_me가 없어요."""
        return {
            "user_id": ids.encode(ids.USER, self.user_id),
            "nickname": self.nickname,
            "lat": self.lat,
            "lng": self.lng,
            "until": timeutil.to_iso(self.until),
            "food_pref": self.food_pref,
            "message": self.message,
            "updated_at": timeutil.to_iso(self.updated_at),
        }

    def view(self, me: "Entry | None", my_id: int) -> dict:
        """GET 응답용 모양: 내 위치도 켜져 있으면 distance_m을 채워요 (흐린 좌표끼리 계산)."""
        data = self.public()
        data["is_me"] = self.user_id == my_id
        if me is None:
            data["distance_m"] = None
        else:
            data["distance_m"] = round(haversine_m(me.lat, me.lng, self.lat, self.lng))
        return data


# 따로 보내지 않은 칸을 알아보는 표시예요. None(= "아무거나"로 지움)과 구분하려고 써요.
KEEP = object()


class PresenceStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[int, Entry] = {}  # 사용자 id → 상태
        self._invites: dict[tuple[int, int], datetime] = {}  # (보낸 사람, 받는 사람) → 마지막으로 보낸 시각
        # 고른 시간이 끝난 사람 id → 마지막 신호 시각. 좌표 없이 id와 시각만 있어요.
        self._ended: dict[int, datetime] = {}

    # ───── 만료 ─────
    @staticmethod
    def _expired(entry: Entry, now: datetime) -> bool:
        return now >= entry.until or now - entry.updated_at >= SILENCE_LIMIT

    def expire(self) -> list[int]:
        """시간이 다 됐거나 신호가 끊긴 사람을 지우고, 지운 사용자 id 목록을 돌려줘요."""
        now = timeutil.now_utc()
        with self._lock:
            gone = [uid for uid, e in self._entries.items() if self._expired(e, now)]
            for uid in gone:
                entry = self._entries.pop(uid)
                if now >= entry.until:  # 시간이 끝났으면 heartbeat로 되살아나지 않게 기억해요
                    self._ended[uid] = entry.updated_at
            # 3분 넘게 신호가 없으면 앱이 닫힌 거라서 "시간 끝남" 기억도 지워요
            for uid in [u for u, t in self._ended.items() if now - t >= SILENCE_LIMIT]:
                del self._ended[uid]
            # 오래된 "같이 먹자" 기록도 같이 치워요
            for key in [k for k, t in self._invites.items() if now - t >= INVITE_COOLDOWN]:
                del self._invites[key]
        return gone

    # ───── 켜기·갱신·끄기 ─────
    def upsert(
        self,
        user_id: int,
        nickname: str,
        lat: float,
        lng: float,
        minutes: int | None,
        food_pref=KEEP,
        message=KEEP,
    ) -> Entry:
        """켜기·갱신(heartbeat).

        - until은 처음 켤 때 정하고, 이후에는 minutes를 다시 보낼 때만 새로 정해요.
        - 고른 시간이 끝난 뒤 minutes 없이 오면 다시 켜지 않고 409예요 (본인이 다시 동의해야 해요).
        - food_pref, message를 안 보내면(KEEP) 켜져 있는 동안은 예전 값을 그대로 써요.
        """
        now = timeutil.now_utc()
        fuzzy_lat, fuzzy_lng = fuzz(lat, lng)  # 정확한 좌표는 여기서 바로 버려요
        with self._lock:
            old = self._entries.get(user_id)
            time_over = user_id in self._ended or (old is not None and now >= old.until)
            if minutes is None and time_over:
                self._ended[user_id] = now  # 앱이 계속 보내는 동안은 기억을 유지해요
                self._entries.pop(user_id, None)
                raise AppError("CONFLICT", 409, "공유 시간이 끝났어요. 시간을 골라 다시 켜 주세요.")
            if old is not None and self._expired(old, now):
                old = None  # 3분 동안 신호가 없어 꺼진 상태면 처음 켜는 것과 같아요
            if minutes is not None:
                until = now + timedelta(minutes=minutes)
            elif old is not None:
                until = old.until
            else:
                until = now + timedelta(minutes=60)  # 처음인데 시간을 안 보내면 60분
            if food_pref is KEEP:
                food_pref = old.food_pref if old is not None else None
            if message is KEEP:
                message = old.message if old is not None else None
            entry = Entry(user_id, nickname, fuzzy_lat, fuzzy_lng, until, food_pref, message, now)
            self._entries[user_id] = entry
            self._ended.pop(user_id, None)  # 다시 켰으니 "시간 끝남" 기억을 지워요
        return entry

    def remove(self, user_id: int) -> bool:
        with self._lock:
            self._ended.pop(user_id, None)  # 직접 껐으면 다음 PUT은 새로 켜는 거예요
            return self._entries.pop(user_id, None) is not None

    # ───── 조회 ─────
    def get(self, user_id: int) -> Entry | None:
        """만료된 사람은 없는 것으로 봐요."""
        now = timeutil.now_utc()
        with self._lock:
            entry = self._entries.get(user_id)
            return None if entry is None or self._expired(entry, now) else entry

    def active(self) -> list[Entry]:
        now = timeutil.now_utc()
        with self._lock:
            return [e for e in self._entries.values() if not self._expired(e, now)]

    # ───── "같이 먹자" 5분 제한 ─────
    def try_reserve_invite(self, from_id: int, to_id: int) -> datetime:
        """5분 제한을 확인하고 바로 기록해요. 둘을 한 자물쇠 안에서 해서 동시에 두 번 눌러도 하나만 통과해요.

        5분 안에 같은 상대에게 보낸 적이 있으면 429예요.
        돌려준 시각은 약속 만들기가 실패했을 때 release_invite()로 되돌릴 때 써요.
        """
        now = timeutil.now_utc()
        with self._lock:
            last = self._invites.get((from_id, to_id))
            if last is not None and now - last < INVITE_COOLDOWN:
                wait = int((INVITE_COOLDOWN - (now - last)).total_seconds())
                raise AppError(
                    "RATE_LIMITED", 429, "같은 사람에게는 5분 뒤에 다시 보낼 수 있어요.", {"retry_after_seconds": wait}
                )
            self._invites[(from_id, to_id)] = now
        return now

    def release_invite(self, from_id: int, to_id: int, reserved_at: datetime) -> None:
        """예약을 되돌려요. 그 사이 다른 요청이 새로 기록했으면 건드리지 않아요."""
        with self._lock:
            if self._invites.get((from_id, to_id)) == reserved_at:
                del self._invites[(from_id, to_id)]

    def clear(self) -> None:
        """테스트에서 처음 상태로 돌릴 때 써요."""
        with self._lock:
            self._entries.clear()
            self._invites.clear()
            self._ended.clear()


store = PresenceStore()


async def cleanup_once() -> list[int]:
    """만료된 사람을 지우고 로그인한 연결에 presence.removed 를 보내요."""
    gone = store.expire()
    for uid in gone:
        await hub.broadcast_logged_in("presence.removed", {"user_id": ids.encode(ids.USER, uid)})
    return gone


async def cleanup_loop() -> None:
    """앱이 켜져 있는 동안 30초마다 만료된 사람을 지워요 (main.py의 lifespan에서 시작해요)."""
    while True:
        await asyncio.sleep(CLEANUP_EVERY_SECONDS)
        try:
            await cleanup_once()
        except Exception:  # 한 번 실패해도 루프는 계속 돌아요
            logger.exception("실시간 위치 정리 중 오류")
