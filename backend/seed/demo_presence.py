"""발표용 "지금 밥 먹을 사람" 예시 봇 (규격 6.10).

서버(APP_ENV=dev)를 켠 상태에서 다른 터미널로 실행하면,
"[예시]" 닉네임 4명이 캠퍼스 근처에서 "지금 밥 먹을래요"를 켠 것처럼 지도에 떠요.
1분마다 신호(heartbeat)를 보내서 계속 떠 있고, Ctrl+C로 끄면 위치 공유를 끄고 끝나요.

밥약속 알림(규격 6.12) 시연: 사람(봇이 아닌 사용자)이 2시간 안에 시작하는 밥약속을 열면,
"[예시] 배고픈 너구리"가 15~25초 뒤에 자동으로 참여하고 채팅을 한 번 남겨요 (모임마다 한 번).
그래서 방장 화면에 "참여했어요"(joined)와 "새 채팅"(message) 알림이 바로 떠요.

실행 (backend 폴더에서, 서버가 http://127.0.0.1:8000 에 켜져 있어야 해요):
    uv run python -m seed.demo_presence

실제 사람이 아니라 예시 데이터예요. 발표나 혼자 확인할 때만 써요.
"""

import random
import time
from datetime import UTC, datetime, timedelta

import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"
HEARTBEAT_SECONDS = 60  # 서버는 3분 동안 신호가 없으면 지워요
REFRESH_MINUTES = 100  # 공유 시간(120분)이 끝나기 전에 시간을 새로 정해요
SHARE_MINUTES = 120

# (닉네임, 캠퍼스 중심에서 위도 차이, 경도 차이, 먹고 싶은 것, 한마디)
BOTS = [
    ("[예시] 배고픈 너구리", 0.0012, 0.0016, "한식", "국밥 땡겨요"),
    ("[예시] 졸린 판다", -0.0020, -0.0011, "분식", "떡볶이 같이 드실 분"),
    ("[예시] 산책하는 여우", 0.0005, -0.0024, "카페", "커피 한 잔 해요"),
    ("[예시] 시험기간 다람쥐", -0.0008, 0.0030, None, "아무거나 좋아요"),
]
CAMPUS_LAT = 35.7033
CAMPUS_LNG = 128.4557

# 밥약속 자동 참여 (규격 6.12 시연용)
TICK_SECONDS = 5  # 이만큼마다 새 밥약속이 있는지 봐요
JOIN_DELAY_SECONDS = (15, 25)  # 처음 본 뒤 이만큼 기다렸다가 참여해요 (사람처럼 보이게)
JOIN_WITHIN = timedelta(hours=2)  # 2시간 안에 시작하는 약속만
JOINER_INDEX = 0  # BOTS 중 누가 참여할지 ("[예시] 배고픈 너구리")
JOIN_MESSAGE = "저도 갈게요! 🙌"
BOT_PREFIX = "[예시]"


def login(client: httpx.Client, nickname: str) -> dict:
    resp = client.post(f"{BASE_URL}/auth/dev-login", json={"nickname": nickname})
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def share(client: httpx.Client, headers: dict, bot: tuple, with_minutes: bool) -> None:
    _, dlat, dlng, food_pref, message = bot
    body = {"lat": CAMPUS_LAT + dlat, "lng": CAMPUS_LNG + dlng, "food_pref": food_pref, "message": message}
    if with_minutes:
        body["minutes"] = SHARE_MINUTES  # 처음이거나 시간을 새로 정할 때만 보내요
    client.put(f"{BASE_URL}/presence/me", headers=headers, json=body).raise_for_status()


class AutoJoiner:
    """사람이 연 밥약속을 처음 본 뒤 15~25초 기다렸다가 참여하고 채팅을 한 번 남겨요."""

    def __init__(self, client: httpx.Client, headers: dict, nickname: str) -> None:
        self.client = client
        self.headers = headers
        self.nickname = nickname
        self.due: dict[str, float] = {}  # 모임 id → 참여할 시각 (time.monotonic 기준)
        self.done: set[str] = set()  # 이미 참여했거나 건너뛴 모임 (모임마다 한 번만)

    def _wanted(self, meetup: dict, now: datetime) -> bool:
        if meetup["status"] != "open" or meetup.get("joined"):
            return False
        if meetup["host_nickname"].startswith(BOT_PREFIX):
            return False  # 봇끼리는 참여하지 않아요
        meal_time = datetime.fromisoformat(meetup["meal_time"])
        return now < meal_time <= now + JOIN_WITHIN

    def tick(self) -> None:
        resp = self.client.get(
            f"{BASE_URL}/meetups", headers=self.headers, params={"within_hours": 2, "include_full": "false"}
        )
        resp.raise_for_status()
        now = datetime.now(UTC)
        for meetup in resp.json()["items"]:
            mid = meetup["id"]
            if mid in self.done or mid in self.due or not self._wanted(meetup, now):
                continue
            delay = random.uniform(*JOIN_DELAY_SECONDS)
            self.due[mid] = time.monotonic() + delay
            print(f"새 밥약속 '{meetup['title']}'을 봤어요. {delay:.0f}초 뒤에 {self.nickname}가 참여해요.")

        for mid, at in list(self.due.items()):
            if time.monotonic() < at:
                continue
            del self.due[mid]
            self.done.add(mid)
            joined = self.client.post(f"{BASE_URL}/meetups/{mid}/join", headers=self.headers)
            if joined.status_code != 200:
                print(f"{mid} 참여를 못 했어요 ({joined.status_code}). 이미 찼거나 취소됐을 수 있어요.")
                continue
            self.client.post(
                f"{BASE_URL}/meetups/{mid}/messages", headers=self.headers, json={"content": JOIN_MESSAGE}
            ).raise_for_status()
            print(f"{self.nickname}가 '{joined.json()['title']}'에 참여하고 채팅을 남겼어요.")


def main() -> None:
    with httpx.Client(timeout=5.0) as client:
        try:
            tokens = [login(client, bot[0]) for bot in BOTS]
        except httpx.HTTPError as exc:
            print(f"서버에 로그인하지 못했어요. 서버가 켜져 있고 APP_ENV=dev 인지 확인해 주세요. ({exc})")
            return

        started = time.monotonic()
        last_refresh = started
        for headers, bot in zip(tokens, BOTS, strict=True):
            share(client, headers, bot, with_minutes=True)
        print(f"예시 봇 {len(BOTS)}명이 지도에 떴어요. 끄려면 Ctrl+C를 눌러요.")
        joiner = AutoJoiner(client, tokens[JOINER_INDEX], BOTS[JOINER_INDEX][0])
        last_beat = time.monotonic()

        try:
            while True:
                time.sleep(TICK_SECONDS)
                try:
                    joiner.tick()
                except httpx.HTTPError as exc:
                    print(f"밥약속 확인 실패: {exc}")
                if time.monotonic() - last_beat < HEARTBEAT_SECONDS:
                    continue
                last_beat = time.monotonic()
                refresh = time.monotonic() - last_refresh >= REFRESH_MINUTES * 60
                if refresh:
                    last_refresh = time.monotonic()
                for headers, bot in zip(tokens, BOTS, strict=True):
                    try:
                        share(client, headers, bot, with_minutes=refresh)
                    except httpx.HTTPError as exc:
                        print(f"{bot[0]} 신호 보내기 실패: {exc}")
                print(f"신호 보냈어요 ({int((time.monotonic() - started) // 60)}분째)")
        except KeyboardInterrupt:
            pass
        finally:
            for headers in tokens:
                try:
                    client.delete(f"{BASE_URL}/presence/me", headers=headers)
                except httpx.HTTPError:
                    pass  # 서버가 먼저 꺼졌어도 3분 뒤 저절로 사라져요
            print("예시 봇의 위치 공유를 껐어요.")


if __name__ == "__main__":
    main()
