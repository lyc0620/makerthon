"""지금 밥 먹을 사람 — 실시간 위치 (규격 6.10) + 위치 알림 (6.11 WebSocket)."""

from datetime import timedelta

from app.core import timeutil
from app.core.errors import AppError
from app.services import presence
from app.services.presence import LAT_STEP, LNG_STEP, cleanup_once, store
from tests.conftest import CAMPUS_LAT, CAMPUS_LNG, assert_error, assert_page, login

PRESENCE_KEYS = {
    "user_id", "nickname", "lat", "lng", "until", "food_pref", "message", "distance_m", "updated_at", "is_me",
}  # fmt: skip

# 격자 칸 경계에 걸리지 않는 "정확한" 좌표 (응답에 절대 나오면 안 돼요)
EXACT_LAT = 35.703471
EXACT_LNG = 128.455832


def token_of(headers: dict) -> str:
    return headers["Authorization"].removeprefix("Bearer ")


def put_me(client, headers, lat=EXACT_LAT, lng=EXACT_LNG, **extra):
    return client.put("/api/v1/presence/me", headers=headers, json={"lat": lat, "lng": lng, **extra})


def on_grid(value: float, step: float) -> bool:
    """격자 칸의 중심이면 (값/칸 - 0.5)가 정수예요."""
    cells = value / step - 0.5
    return abs(cells - round(cells)) < 1e-6


def others_see(client, headers) -> list[str]:
    return [p["nickname"] for p in client.get("/api/v1/presence", headers=headers).json()["items"]]


def test_login_required(client):
    assert_error(client.get("/api/v1/presence"), 401, "UNAUTHORIZED")
    assert_error(put_me(client, {}), 401, "UNAUTHORIZED")
    assert_error(client.delete("/api/v1/presence/me"), 401, "UNAUTHORIZED")
    assert_error(client.post("/api/v1/presence/usr_1/invite", json={"when": "now"}), 401, "UNAUTHORIZED")


def test_opt_in_and_shape(client, clock):
    a, b = login(client, "사슴"), login(client, "너구리")
    assert client.get("/api/v1/presence", headers=b).json()["items"] == []  # 기본은 꺼짐

    resp = put_me(client, a, minutes=30, food_pref="한식", message="  국밥 땡겨요  ")
    assert resp.status_code == 200, resp.text
    me = resp.json()
    assert set(me) == PRESENCE_KEYS
    assert me["user_id"].startswith("usr_") and me["nickname"] == "사슴"
    assert me["is_me"] is True and me["distance_m"] == 0
    assert me["food_pref"] == "한식" and me["message"] == "국밥 땡겨요"
    assert me["until"] == timeutil.to_iso(clock.now + timedelta(minutes=30))
    assert me["updated_at"] == timeutil.to_iso(clock.now)

    body = client.get("/api/v1/presence", headers=b).json()
    assert_page(body)
    assert body["total"] == 1 and body["updated_at"] == me["updated_at"]
    seen = body["items"][0]
    assert seen["is_me"] is False and seen["distance_m"] is None  # 내 위치가 꺼져 있으면 거리 없음


def test_coordinates_are_fuzzed(client):
    a, b = login(client, "사슴"), login(client, "너구리")
    with client.websocket_connect(f"/api/v1/ws?token={token_of(b)}") as ws:
        ws.receive_json()  # online.count
        resp = put_me(client, a)
        broadcast = ws.receive_json()
    listed = client.get("/api/v1/presence", headers=b)

    me = resp.json()
    assert (me["lat"], me["lng"]) != (EXACT_LAT, EXACT_LNG)
    assert on_grid(me["lat"], LAT_STEP) and on_grid(me["lng"], LNG_STEP)
    assert abs(me["lat"] - EXACT_LAT) <= LAT_STEP / 2 and abs(me["lng"] - EXACT_LNG) <= LNG_STEP / 2
    assert broadcast["type"] == "presence.updated"
    assert set(broadcast["data"]) == PRESENCE_KEYS - {"distance_m", "is_me"}
    assert (broadcast["data"]["lat"], broadcast["data"]["lng"]) == (me["lat"], me["lng"])
    for text in (resp.text, listed.text, str(broadcast)):  # 정확한 좌표는 어디에도 안 나가요
        assert str(EXACT_LAT) not in text and str(EXACT_LNG) not in text
    # 메모리에도 흐린 좌표만 있어요
    entry = store.active()[0]
    assert (entry.lat, entry.lng) == (me["lat"], me["lng"])


def test_distance_and_is_me_sorted_nearest(client):
    a, b, c, d = (login(client, n) for n in ("사슴", "너구리", "고양이", "수달"))
    put_me(client, a)
    put_me(client, b, lat=EXACT_LAT + 0.0045)  # 약 500m 북쪽
    put_me(client, c, lat=EXACT_LAT + 0.0018)  # 약 200m 북쪽

    items = client.get("/api/v1/presence", headers=a).json()["items"]
    assert [p["nickname"] for p in items] == ["사슴", "고양이", "너구리"]  # 나 → 가까운 순
    assert [p["is_me"] for p in items] == [True, False, False]
    assert items[0]["distance_m"] == 0
    assert all(isinstance(p["distance_m"], int) for p in items)
    assert 150 <= items[1]["distance_m"] <= 260 and 450 <= items[2]["distance_m"] <= 560

    # 위치를 안 켠 사람은 목록은 보지만 거리는 없어요
    assert all(
        p["distance_m"] is None and not p["is_me"] for p in client.get("/api/v1/presence", headers=d).json()["items"]
    )


def test_heartbeat_keeps_until_unless_minutes_resent(client, clock):
    a = login(client, "사슴")
    first = put_me(client, a, minutes=30).json()
    clock.advance(minutes=1)
    again = put_me(client, a, lat=EXACT_LAT + 0.001, message="자리 옮겼어요").json()
    assert again["until"] == first["until"]  # 시간 연장 안 돼요
    assert again["lat"] != first["lat"] and again["message"] == "자리 옮겼어요"
    assert again["updated_at"] == timeutil.to_iso(clock.now)

    reset = put_me(client, a, minutes=60).json()
    assert reset["until"] == timeutil.to_iso(clock.now + timedelta(minutes=60))  # minutes를 다시 보내면 새로 정함

    # 처음 켤 때 minutes가 없으면 60분이에요
    b = login(client, "너구리")
    assert put_me(client, b).json()["until"] == timeutil.to_iso(clock.now + timedelta(minutes=60))


def test_expires_when_until_passes(client, clock):
    a, b = login(client, "사슴"), login(client, "너구리")
    put_me(client, a, minutes=30)
    for _ in range(14):  # 2분마다 신호를 보내며 28분
        clock.advance(minutes=2)
        put_me(client, a)
    assert others_see(client, b) == ["사슴"]
    clock.advance(minutes=2)  # 30분 지남
    assert others_see(client, b) == []


def test_expires_after_three_minutes_of_silence(client, clock):
    a, b = login(client, "사슴"), login(client, "너구리")
    put_me(client, a, minutes=120)
    clock.advance(minutes=2, seconds=59)
    assert others_see(client, b) == ["사슴"]
    clock.advance(seconds=1)
    assert others_see(client, b) == []
    # 다시 켜면 처음 켜는 것처럼 until이 새로 정해져요
    assert put_me(client, a).json()["until"] == timeutil.to_iso(clock.now + timedelta(minutes=60))


def test_background_cleanup_broadcasts_removed(client, clock):
    a, b = login(client, "사슴"), login(client, "너구리")
    user_id = put_me(client, a).json()["user_id"]
    with client.websocket_connect(f"/api/v1/ws?token={token_of(b)}") as ws:
        ws.receive_json()  # online.count
        clock.advance(minutes=3)
        assert client.portal.call(cleanup_once) == [int(user_id.removeprefix("usr_"))]
        assert ws.receive_json() == {"type": "presence.removed", "data": {"user_id": user_id}}
    assert presence.CLEANUP_EVERY_SECONDS <= 60


def test_delete_turns_off(client):
    a, b = login(client, "사슴"), login(client, "너구리")
    user_id = put_me(client, a).json()["user_id"]
    with client.websocket_connect(f"/api/v1/ws?token={token_of(b)}") as ws:
        ws.receive_json()  # online.count
        resp = client.delete("/api/v1/presence/me", headers=a)
        assert resp.status_code == 204 and resp.content == b""
        assert ws.receive_json() == {"type": "presence.removed", "data": {"user_id": user_id}}
    assert others_see(client, b) == []
    assert client.delete("/api/v1/presence/me", headers=a).status_code == 204  # 이미 꺼져 있어도 OK


def test_validation(client):
    a = login(client, "사슴")
    assert_error(put_me(client, a, lat=36.5, lng=127.0), 422, "VALIDATION_ERROR")  # 서비스 지역 밖
    assert_error(put_me(client, a, minutes=45), 422, "VALIDATION_ERROR")
    assert_error(put_me(client, a, food_pref="떡볶이"), 422, "VALIDATION_ERROR")
    assert_error(put_me(client, a, message="가" * 41), 422, "VALIDATION_ERROR")
    assert put_me(client, a, food_pref=None, message="   ").json()["message"] is None


# ───────── "같이 먹자" ─────────
def test_invite_creates_meetup_and_notifies_only_target(client):
    a, b = login(client, "사슴"), login(client, "너구리")
    b_id = put_me(client, b, lat=CAMPUS_LAT, lng=CAMPUS_LNG).json()["user_id"]

    with (
        client.websocket_connect("/api/v1/ws") as anon,
        client.websocket_connect("/api/v1/ws?token=not-a-real-token") as bad_token,  # 틀린 토큰은 익명으로 받아요
        client.websocket_connect(f"/api/v1/ws?token={token_of(b)}") as target,
    ):
        for ws, connects_seen in ((anon, 3), (bad_token, 2), (target, 1)):
            for _ in range(connects_seen):
                assert ws.receive_json()["type"] == "online.count"

        resp = client.post(
            f"/api/v1/presence/{b_id}/invite", headers=a, json={"when": "in_30", "place_name": "도서관 앞"}
        )
        assert resp.status_code == 201, resp.text
        meetup = resp.json()
        assert meetup["is_host"] is True and meetup["host_nickname"] == "사슴" and meetup["members"] == ["사슴"]
        assert meetup["title"].startswith("⚡ 번개 · ") and meetup["title"].endswith(" 도서관 앞")

        assert target.receive_json()["type"] == "meetup.created"
        invite = target.receive_json()
        assert invite["type"] == "invite.received"
        assert invite["data"]["from_nickname"] == "사슴"
        assert invite["data"]["meetup"]["id"] == meetup["id"]
        assert invite["data"]["meetup"]["joined"] is False and invite["data"]["meetup"]["is_host"] is False

        # 위치 알림은 로그인한 연결만 받아요
        put_me(client, a)
        assert target.receive_json()["type"] == "presence.updated"
        client.post("/api/v1/reports", headers=a, json={"type": "police", "lat": CAMPUS_LAT, "lng": CAMPUS_LNG})
        assert target.receive_json()["type"] == "report.created"
        for ws in (anon, bad_token):
            assert ws.receive_json()["type"] == "meetup.created"  # 공개 알림은 그대로
            assert ws.receive_json()["type"] == "report.created"  # invite.received, presence.updated는 건너뜀


def test_invite_errors_and_cooldown(client, clock):
    a, b = login(client, "사슴"), login(client, "너구리")
    a_id = put_me(client, a).json()["user_id"]
    b_id = put_me(client, b).json()["user_id"]

    def invite(target, headers=a, **body):
        return client.post(f"/api/v1/presence/{target}/invite", headers=headers, json={"when": "now", **body})

    assert_error(invite(a_id), 422, "VALIDATION_ERROR")  # 자기 자신
    assert_error(invite("usr_999"), 404, "NOT_FOUND")
    assert_error(invite("abc"), 404, "NOT_FOUND")
    assert_error(invite(b_id, when="breakfast"), 422, "VALIDATION_ERROR")

    assert invite(b_id).status_code == 201
    err = assert_error(invite(b_id), 429, "RATE_LIMITED")  # 5분 안에 같은 상대
    assert err["details"]["retry_after_seconds"] == 300
    assert invite(a_id, headers=b).status_code == 201  # 반대 방향은 따로 세요

    clock.advance(minutes=2)
    put_me(client, b)  # 신호 유지
    assert_error(invite(b_id), 429, "RATE_LIMITED")
    clock.advance(minutes=3)
    put_me(client, b)
    assert invite(b_id).status_code == 201  # 5분 지나면 다시 돼요

    client.delete("/api/v1/presence/me", headers=b)
    clock.advance(minutes=5)
    assert_error(invite(b_id), 404, "NOT_FOUND")  # 상대가 위치를 껐어요


def test_heartbeat_after_until_does_not_turn_back_on(client, clock):
    """고른 시간(30분)이 지나면 heartbeat를 계속 보내도 다시 켜지지 않아요."""
    a, b = login(client, "사슴"), login(client, "너구리")
    first = put_me(client, a, minutes=30).json()
    for _ in range(30):  # 1분마다 신호를 보내며 30분
        clock.advance(minutes=1)
        resp = put_me(client, a)
    assert_error(resp, 409, "CONFLICT")  # 딱 30분이 되는 순간부터 끝이에요
    assert others_see(client, b) == []

    clock.advance(minutes=1)  # t+31: 백그라운드 정리를 거친 뒤에도 마찬가지예요
    import asyncio

    asyncio.run(cleanup_once())
    assert_error(put_me(client, a), 409, "CONFLICT")
    assert others_see(client, b) == []
    assert first["until"] == timeutil.to_iso(clock.now - timedelta(minutes=1))  # 끝난 지 1분

    # 시간을 골라 다시 켜면(= 다시 동의) 돼요
    again = put_me(client, a, minutes=30)
    assert again.status_code == 200
    assert again.json()["until"] == timeutil.to_iso(clock.now + timedelta(minutes=30))
    assert others_see(client, b) == ["사슴"]


def test_ended_memory_clears_after_silence_or_delete(client, clock):
    a = login(client, "사슴")
    put_me(client, a, minutes=30)
    clock.advance(minutes=30)
    assert_error(put_me(client, a), 409, "CONFLICT")
    # 앱을 닫아 3분 동안 신호가 없으면 다음 PUT은 처음 켜는 것과 같아요
    clock.advance(minutes=3)
    store.expire()
    assert put_me(client, a).json()["until"] == timeutil.to_iso(clock.now + timedelta(minutes=60))

    # 직접 끈(DELETE) 뒤에도 처음 켜는 것과 같아요
    b = login(client, "너구리")
    put_me(client, b, minutes=30)
    clock.advance(minutes=30)
    assert_error(put_me(client, b), 409, "CONFLICT")
    assert client.delete("/api/v1/presence/me", headers=b).status_code == 204
    assert put_me(client, b).status_code == 200


def test_heartbeat_keeps_food_pref_and_message(client, clock):
    a = login(client, "사슴")
    put_me(client, a, minutes=30, food_pref="한식", message="국밥 땡겨요")
    clock.advance(minutes=1)
    beat = put_me(client, a).json()  # 위치만 보내는 heartbeat
    assert beat["food_pref"] == "한식" and beat["message"] == "국밥 땡겨요"
    cleared = put_me(client, a, food_pref=None, message=None).json()  # null을 직접 보내면 지워요
    assert cleared["food_pref"] is None and cleared["message"] is None


def test_invite_reservation_is_atomic_and_rolls_back(client):
    """동시에 여러 번 눌러도 예약은 하나만 통과하고, 약속을 못 만들면 되돌려요."""
    import threading

    results: list[str] = []
    start = threading.Barrier(8)

    def tap():
        start.wait()
        try:
            store.try_reserve_invite(9001, 9002)
            results.append("ok")
        except AppError:
            results.append("429")

    threads = [threading.Thread(target=tap) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count("ok") == 1 and results.count("429") == 7

    # 약속 만들기가 실패하면(없는 가게) 예약을 되돌려서 바로 다시 보낼 수 있어요
    a, b = login(client, "사슴"), login(client, "너구리")
    put_me(client, a)
    b_id = put_me(client, b).json()["user_id"]
    url = f"/api/v1/presence/{b_id}/invite"
    assert_error(client.post(url, headers=a, json={"when": "now", "restaurant_id": "rst_999"}), 404, "NOT_FOUND")
    assert client.post(url, headers=a, json={"when": "now"}).status_code == 201
