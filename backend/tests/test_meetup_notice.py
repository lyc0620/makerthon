"""밥약속 알림 meetup.notice (규격 6.12): 참여자에게만 가는 WebSocket 알림."""

import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest

from app.core import timeutil
from app.core.auth import decode_user_id
from app.services import meetup_notify
from app.services.meetup_notify import make_preview, remind_once, select_reminders
from tests.conftest import create_restaurant, login

NOTICE_KEYS = {
    "kind", "meetup_id", "title", "meal_time", "place_name", "member_count", "max_people", "actor_nickname", "preview",
}  # fmt: skip


def token_of(headers: dict) -> str:
    return headers["Authorization"].removeprefix("Bearer ")


def uid_of(headers: dict) -> int:
    return decode_user_id(token_of(headers))


@pytest.fixture
def sent(monkeypatch):
    """hub.send_to_user 를 바꿔서 누구에게 무엇이 갔는지 기록해요 (meetup.notice 만)."""
    calls: list[tuple[int, dict]] = []

    async def fake_send(user_id, event, data):
        if event == meetup_notify.EVENT:
            calls.append((user_id, data))

    monkeypatch.setattr(meetup_notify.hub, "send_to_user", fake_send)
    meetup_notify.reminded.clear()
    yield calls
    meetup_notify.reminded.clear()


def create_meetup(client, headers, clock, **overrides) -> dict:
    body = {
        "title": "오늘 저녁 학식 같이",
        "place_name": "학생식당",
        "meal_time": timeutil.to_iso(clock.now + timedelta(hours=2)),
    }
    body.update(overrides)
    resp = client.post("/api/v1/meetups", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_joined_goes_to_members_except_joiner(client, clock, sent):
    host, joiner, other = login(client, "사슴"), login(client, "너구리"), login(client, "수달")
    m = create_meetup(client, host, clock, max_people=3)
    assert sent == []  # 만들 때는 알림 없음

    assert client.post(f"/api/v1/meetups/{m['id']}/join", headers=joiner).status_code == 200
    assert [uid for uid, _ in sent] == [uid_of(host)]
    data = sent[0][1]
    assert set(data) == NOTICE_KEYS
    assert data["kind"] == "joined" and data["meetup_id"] == m["id"]
    assert data["actor_nickname"] == "너구리" and data["preview"] is None
    assert data["member_count"] == 2 and data["max_people"] == 3
    assert data["title"] == m["title"] and data["meal_time"] == m["meal_time"] and data["place_name"] == "학생식당"
    assert uid_of(joiner) not in [uid for uid, _ in sent] and uid_of(other) not in [uid for uid, _ in sent]


def test_full_goes_to_everyone_including_joiner(client, clock, sent):
    host, a, b = login(client, "사슴"), login(client, "너구리"), login(client, "수달")
    restaurant = create_restaurant(client, host, name="든든국밥")
    m = create_meetup(client, host, clock, max_people=3, place_name="아무 이름", restaurant_id=restaurant["id"])
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=a)
    sent.clear()

    assert client.post(f"/api/v1/meetups/{m['id']}/join", headers=b).json()["status"] == "full"
    assert sorted(uid for uid, _ in sent) == sorted([uid_of(host), uid_of(a), uid_of(b)])
    assert {d["kind"] for _, d in sent} == {"full"}  # 따로 "joined"는 안 가요
    data = sent[0][1]
    assert data["actor_nickname"] == "수달" and data["member_count"] == 3
    assert data["place_name"] == "든든국밥"  # 가게가 연결돼 있으면 가게 이름


def test_left_goes_to_remaining_members(client, clock, sent):
    host, a, b = login(client, "사슴"), login(client, "너구리"), login(client, "수달")
    m = create_meetup(client, host, clock)
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=a)
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=b)
    sent.clear()

    client.post(f"/api/v1/meetups/{m['id']}/leave", headers=a)
    assert sorted(uid for uid, _ in sent) == sorted([uid_of(host), uid_of(b)])
    data = sent[0][1]
    assert data["kind"] == "left" and data["actor_nickname"] == "너구리" and data["member_count"] == 2


def test_cancelled_goes_to_other_members(client, clock, sent):
    host, a, outsider = login(client, "사슴"), login(client, "너구리"), login(client, "수달")
    m = create_meetup(client, host, clock)
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=a)
    sent.clear()

    client.post(f"/api/v1/meetups/{m['id']}/leave", headers=host)
    assert [uid for uid, _ in sent] == [uid_of(a)]
    assert sent[0][1]["kind"] == "cancelled" and sent[0][1]["actor_nickname"] == "사슴"
    assert uid_of(outsider) not in [uid for uid, _ in sent]

    # 이미 취소된 모임에서 또 나가도 알림이 다시 가지 않아요
    sent.clear()
    client.post(f"/api/v1/meetups/{m['id']}/leave", headers=host)
    client.post(f"/api/v1/meetups/{m['id']}/leave", headers=a)
    assert sent == []


def test_message_preview_to_members_except_sender(client, clock, sent):
    host, a, outsider = login(client, "사슴"), login(client, "너구리"), login(client, "수달")
    m = create_meetup(client, host, clock)
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=a)
    sent.clear()

    long_text = "가" * 45
    client.post(f"/api/v1/meetups/{m['id']}/messages", headers=a, json={"content": long_text})
    assert [uid for uid, _ in sent] == [uid_of(host)]
    data = sent[0][1]
    assert data["kind"] == "message" and data["actor_nickname"] == "너구리"
    assert data["preview"] == "가" * 40 + "…"

    sent.clear()
    client.post(f"/api/v1/meetups/{m['id']}/messages", headers=host, json={"content": "좋아요"})
    assert [uid for uid, _ in sent] == [uid_of(a)] and sent[0][1]["preview"] == "좋아요"
    assert uid_of(outsider) not in [uid for uid, _ in sent]


def test_make_preview():
    assert make_preview("짧아요") == "짧아요"
    assert make_preview("a" * 40) == "a" * 40
    assert make_preview("a" * 41) == "a" * 40 + "…"


def test_notice_arrives_over_websocket(client, clock):
    """진짜 WebSocket으로: 방장 연결에 공개 방송 다음 meetup.notice 가 와요."""
    host, joiner = login(client, "사슴"), login(client, "너구리")
    m = create_meetup(client, host, clock)
    with client.websocket_connect(f"/api/v1/ws?token={token_of(host)}") as ws:
        ws.receive_json()  # online.count
        client.post(f"/api/v1/meetups/{m['id']}/join", headers=joiner)
        assert ws.receive_json()["type"] == "meetup.updated"  # 공개 방송은 그대로
        notice = ws.receive_json()
    assert notice["type"] == "meetup.notice"
    assert notice["data"]["kind"] == "joined" and notice["data"]["actor_nickname"] == "너구리"


# ───────── 밥 시간 알림 ─────────
def fake(mid: int, status: str, meal_time):
    return SimpleNamespace(id=mid, status=status, meal_time=meal_time)


def test_select_reminders_pure():
    now = timeutil.now_utc()
    meetups = [
        fake(1, "open", now + timedelta(minutes=10)),  # 딱 10분 전 → 보내요
        fake(2, "full", now + timedelta(minutes=3)),  # 꽉 찬 모임도 보내요
        fake(3, "cancelled", now + timedelta(minutes=5)),  # 취소 → 안 보내요
        fake(4, "open", now - timedelta(minutes=1)),  # 이미 지남 → 안 보내요
        fake(5, "open", now),  # 바로 지금 → 미래가 아니라 안 보내요
        fake(6, "open", now + timedelta(minutes=11)),  # 아직 멀어요
    ]
    already: set = set()
    assert [m.id for m in select_reminders(meetups, now, already)] == [1, 2]
    assert select_reminders(meetups, now + timedelta(seconds=30), already) == []  # 한 번만

    # 6번은 1분 뒤에 10분 안으로 들어와요
    assert [m.id for m in select_reminders(meetups, now + timedelta(minutes=1), already)] == [6]
    # 밥 시간이 바뀌면 다시 보낼 수 있어요
    moved = [fake(1, "open", now + timedelta(minutes=8))]
    assert [m.id for m in select_reminders(moved, now, already)] == [1]


def test_remind_once_sends_to_all_members(client, clock, sent):
    host, a = login(client, "사슴"), login(client, "너구리")
    m = create_meetup(client, host, clock, meal_time=timeutil.to_iso(clock.now + timedelta(minutes=30)))
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=a)
    sent.clear()

    assert asyncio.run(remind_once(clock.now)) == 0  # 아직 30분 남음
    assert asyncio.run(remind_once(clock.now + timedelta(minutes=21))) == 1
    assert sorted(uid for uid, _ in sent) == sorted([uid_of(host), uid_of(a)])
    data = sent[0][1]
    assert data["kind"] == "reminder" and data["actor_nickname"] is None and data["preview"] is None
    assert data["member_count"] == 2
    assert asyncio.run(remind_once(clock.now + timedelta(minutes=22))) == 0  # 한 번만
    assert len(sent) == 2
