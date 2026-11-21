"""밥친구 API (규격 6.8)."""

from datetime import UTC, timedelta

from app.core import timeutil
from tests.conftest import assert_error, assert_page, create_restaurant, login

MEETUP_KEYS = {
    "id", "title", "place_name", "restaurant_id", "lat", "lng", "meal_time", "max_people", "member_count",
    "members", "host_nickname", "note", "status", "joined", "is_host", "created_at",
}  # fmt: skip


def iso_in(clock, **delta) -> str:
    return timeutil.to_iso(clock.now + timedelta(**delta))


def create_meetup(client, headers, clock, **overrides):
    body = {"title": "오늘 저녁 학식 같이", "place_name": "학생식당", "meal_time": iso_in(clock, hours=2)}
    body.update(overrides)
    return client.post("/api/v1/meetups", headers=headers, json=body)


def test_create_meetup(client, clock):
    h = login(client, "사슴")
    resp = create_meetup(client, h, clock)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body) == MEETUP_KEYS
    assert body["id"].startswith("mtp_")
    assert body["restaurant_id"] is None and body["lat"] is None and body["lng"] is None and body["note"] is None
    assert body["max_people"] == 4 and body["status"] == "open"
    assert body["members"] == ["사슴"] and body["member_count"] == 1  # 방장 자동 참여
    assert body["joined"] is True and body["is_host"] is True and body["host_nickname"] == "사슴"
    assert body["meal_time"] == iso_in(clock, hours=2)

    anon = client.get(f"/api/v1/meetups/{body['id']}").json()
    assert anon["joined"] is False and anon["is_host"] is False
    assert_error(client.get("/api/v1/meetups/mtp_x"), 404, "NOT_FOUND")
    assert_error(create_meetup(client, {}, clock), 401, "UNAUTHORIZED")


def test_meetup_with_restaurant_gets_coordinates(client, clock):
    h = login(client, "사슴")
    r = create_restaurant(client, h, name="든든국밥")
    body = create_meetup(client, h, clock, restaurant_id=r["id"], place_name="든든국밥").json()
    assert body["restaurant_id"] == r["id"] and body["lat"] == r["lat"] and body["lng"] == r["lng"]

    detail = client.get(f"/api/v1/restaurants/{r['id']}").json()
    assert detail["upcoming_meetups"] == [
        {"id": body["id"], "title": body["title"], "meal_time": body["meal_time"],
         "member_count": 1, "max_people": 4, "status": "open"}
    ]  # fmt: skip
    assert_error(create_meetup(client, h, clock, restaurant_id="rst_999"), 404, "NOT_FOUND")
    assert_error(create_meetup(client, h, clock, restaurant_id="abc"), 404, "NOT_FOUND")


def test_meetup_time_validation(client, clock):
    h = login(client, "사슴")
    assert create_meetup(client, h, clock, meal_time=iso_in(clock, minutes=-5)).status_code == 201  # 10분 안은 OK
    assert_error(create_meetup(client, h, clock, meal_time=iso_in(clock, minutes=-11)), 422, "VALIDATION_ERROR")
    assert_error(create_meetup(client, h, clock, meal_time=iso_in(clock, days=7, minutes=1)), 422, "VALIDATION_ERROR")
    assert create_meetup(client, h, clock, meal_time=iso_in(clock, days=6, hours=23)).status_code == 201
    assert_error(create_meetup(client, h, clock, max_people=1), 422, "VALIDATION_ERROR")
    assert_error(create_meetup(client, h, clock, max_people=11), 422, "VALIDATION_ERROR")
    assert_error(create_meetup(client, h, clock, lat=35.69), 422, "VALIDATION_ERROR")  # lng 없이


def test_naive_meal_time_is_seoul(client, clock):
    h = login(client, "사슴")
    seoul = timeutil.to_seoul(clock.now + timedelta(hours=3)).replace(minute=0, second=0)
    naive = seoul.replace(tzinfo=None).isoformat()  # "2026-11-21T18:00:00" 처럼 오프셋 없음
    body = create_meetup(client, h, clock, meal_time=naive).json()
    assert body["meal_time"] == seoul.isoformat(timespec="seconds")
    assert body["meal_time"].endswith("+09:00")
    # UTC로 보낸 값도 서울 시간으로 바꿔서 돌려줘요
    utc_text = (clock.now + timedelta(hours=1)).isoformat()
    assert create_meetup(client, h, clock, meal_time=utc_text).json()["meal_time"] == iso_in(clock, hours=1)


def test_join_full_leave_reopen_and_host_cancel(client, clock):
    host, b, c = login(client, "방장"), login(client, "참가1"), login(client, "참가2")
    m = create_meetup(client, host, clock, max_people=2).json()

    joined = client.post(f"/api/v1/meetups/{m['id']}/join", headers=b)
    assert joined.status_code == 200
    body = joined.json()
    assert body["status"] == "full" and body["member_count"] == 2 and body["joined"] is True
    assert body["is_host"] is False and body["members"] == ["방장", "참가1"]

    assert_error(client.post(f"/api/v1/meetups/{m['id']}/join", headers=c), 409, "CONFLICT")  # 정원 참
    assert_error(client.post(f"/api/v1/meetups/{m['id']}/join", headers=b), 409, "CONFLICT")  # 이미 참여
    assert_error(client.post(f"/api/v1/meetups/{m['id']}/leave", headers=c), 409, "CONFLICT")  # 참여 안 함

    left = client.post(f"/api/v1/meetups/{m['id']}/leave", headers=b).json()
    assert left["status"] == "open" and left["joined"] is False and left["member_count"] == 1  # 다시 열려요
    assert client.post(f"/api/v1/meetups/{m['id']}/join", headers=c).json()["status"] == "full"

    cancelled = client.post(f"/api/v1/meetups/{m['id']}/leave", headers=host).json()
    assert cancelled["status"] == "cancelled"
    assert_error(client.post(f"/api/v1/meetups/{m['id']}/join", headers=b), 409, "CONFLICT")  # 취소됨
    assert client.get("/api/v1/meetups").json()["items"] == []  # 취소된 모임은 목록에서 빠져요


def test_join_ended_meetup_409(client, clock):
    host, b = login(client, "방장"), login(client, "참가1")
    m = create_meetup(client, host, clock, meal_time=iso_in(clock, minutes=30)).json()
    clock.advance(minutes=61)  # 시작 후 31분
    assert_error(client.post(f"/api/v1/meetups/{m['id']}/join", headers=b), 409, "CONFLICT")


def test_list_meetups_window_and_full(client, clock):
    a, b = login(client, "사슴"), login(client, "고양이")
    soon = create_meetup(client, a, clock, title="곧 모임", meal_time=iso_in(clock, hours=1)).json()
    later = create_meetup(client, a, clock, title="내일 모임", meal_time=iso_in(clock, hours=30)).json()
    full = create_meetup(client, a, clock, title="꽉 찬 모임", meal_time=iso_in(clock, hours=2), max_people=2).json()
    client.post(f"/api/v1/meetups/{full['id']}/join", headers=b)

    body = client.get("/api/v1/meetups", headers=b).json()
    assert_page(body)
    assert [x["id"] for x in body["items"]] == [soon["id"], full["id"]]  # meal_time 순, 24시간 안
    assert [x["joined"] for x in body["items"]] == [False, True]

    no_full = client.get("/api/v1/meetups", params={"include_full": "false"}).json()
    assert [x["id"] for x in no_full["items"]] == [soon["id"]]
    wide = client.get("/api/v1/meetups", params={"within_hours": 48}).json()
    assert wide["total"] == 3 and wide["items"][-1]["id"] == later["id"]
    assert_error(client.get("/api/v1/meetups", params={"within_hours": 169}), 422, "VALIDATION_ERROR")

    clock.advance(minutes=89)  # 곧 모임 시작 후 29분 → 아직 보여요
    assert soon["id"] in [x["id"] for x in client.get("/api/v1/meetups").json()["items"]]
    clock.advance(minutes=2)  # 31분 → 빠져요
    assert soon["id"] not in [x["id"] for x in client.get("/api/v1/meetups").json()["items"]]


def test_chat_member_only(client, clock):
    host, b, outsider = login(client, "방장"), login(client, "참가1"), login(client, "구경꾼")
    m = create_meetup(client, host, clock).json()
    client.post(f"/api/v1/meetups/{m['id']}/join", headers=b)
    url = f"/api/v1/meetups/{m['id']}/messages"

    assert_error(client.get(url), 401, "UNAUTHORIZED")
    assert_error(client.get(url, headers=outsider), 403, "FORBIDDEN")
    assert_error(client.post(url, headers=outsider, json={"content": "안녕"}), 403, "FORBIDDEN")
    assert_error(client.post(url, headers=b, json={"content": ""}), 422, "VALIDATION_ERROR")
    assert_error(client.post(url, headers=b, json={"content": "가" * 301}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/meetups/mtp_999/messages", headers=b), 404, "NOT_FOUND")

    first = client.post(url, headers=host, json={"content": " 6시에 정문에서 봬요 "})
    assert first.status_code == 201
    msg = first.json()
    assert set(msg) == {"id", "nickname", "content", "created_at"}
    assert msg["id"].startswith("msg_") and msg["nickname"] == "방장" and msg["content"] == "6시에 정문에서 봬요"
    second = client.post(url, headers=b, json={"content": "넵!"}).json()

    listed = client.get(url, headers=b).json()
    assert_page(listed)
    assert [x["id"] for x in listed["items"]] == [msg["id"], second["id"]]
    after = client.get(url, headers=b, params={"after_id": msg["id"]}).json()
    assert [x["id"] for x in after["items"]] == [second["id"]] and after["total"] == 1
    assert_error(client.get(url, headers=b, params={"after_id": "xyz"}), 422, "VALIDATION_ERROR")
    # 유니코드 숫자나 너무 긴 숫자도 500이 아니라 422예요
    for bad in ["²", "msg_²", "99999999999999999999999", "msg_99999999999999999999999", "msg_", "٣"]:
        assert_error(client.get(url, headers=b, params={"after_id": bad}), 422, "VALIDATION_ERROR")
    assert client.get(url, headers=b, params={"after_id": "0"}).json()["total"] == 2  # 숫자만 줘도 돼요


def test_join_rechecks_capacity_after_insert(client, clock, engine):
    """동시에 참여해서 status가 아직 open으로 보여도, 넣은 뒤 다시 세서 정원을 넘지 않게 막아요."""
    from sqlmodel import Session

    from app.core import ids
    from app.models import Meetup

    host, b, c = login(client, "방장"), login(client, "참가1"), login(client, "참가2")
    m = create_meetup(client, host, clock, max_people=2).json()
    assert client.post(f"/api/v1/meetups/{m['id']}/join", headers=b).json()["status"] == "full"

    # 다른 요청이 아직 full을 반영하기 전 상태를 흉내 내요
    with Session(engine) as session:
        row = session.get(Meetup, ids.decode(ids.MEETUP, m["id"]))
        row.status = "open"
        session.add(row)
        session.commit()

    assert_error(client.post(f"/api/v1/meetups/{m['id']}/join", headers=c), 409, "CONFLICT")
    detail = client.get(f"/api/v1/meetups/{m['id']}").json()
    assert detail["member_count"] == 2 and detail["members"] == ["방장", "참가1"]


# ───────── 번개 약속 (규격 6.11) ─────────
def seoul(hour, minute=0, second=0, day=21):
    from datetime import datetime

    return datetime(2026, 11, day, hour, minute, second, tzinfo=timeutil.SEOUL).astimezone(UTC)


def test_quick_meal_time_rules():
    from app.routers.meetups import quick_meal_time

    now = seoul(12, 31, 20)  # 점심이 이미 지난 시각
    assert quick_meal_time("now", now) == seoul(12, 45)  # +10분 = 12:41:20 → 5분 올림
    assert quick_meal_time("in_30", now) == seoul(13, 5)
    assert quick_meal_time("in_60", now) == seoul(13, 35)
    assert quick_meal_time("lunch", now) == seoul(12, 0, day=22)  # 지났으면 내일
    assert quick_meal_time("dinner", now) == seoul(18, 0)

    exact = seoul(12, 35)  # 이미 5분 단위면 그대로
    assert quick_meal_time("in_30", exact) == seoul(13, 5)
    assert quick_meal_time("now", exact) == seoul(12, 45)

    morning, night = seoul(11, 0), seoul(19, 0)
    assert quick_meal_time("lunch", morning) == seoul(12, 0)
    assert quick_meal_time("dinner", night) == seoul(18, 0, day=22)
    assert quick_meal_time("now", seoul(23, 55)) == seoul(0, 5, day=22)  # 자정 넘어가도 돼요


def test_quick_meetup_endpoint(client, clock):
    clock.now = seoul(12, 31, 20)
    h = login(client, "사슴")
    resp = client.post("/api/v1/meetups/quick", headers=h, json={"when": "now"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body) == MEETUP_KEYS
    assert body["title"] == "⚡ 번개 · 12:45 학생식당"  # 장소가 없으면 학생식당
    assert body["place_name"] == "학생식당" and body["lat"] is None and body["restaurant_id"] is None
    assert body["meal_time"] == "2026-11-21T12:45:00+09:00"
    assert body["max_people"] == 4 and body["is_host"] is True and body["members"] == ["사슴"]

    dinner = client.post(
        "/api/v1/meetups/quick", headers=h, json={"when": "dinner", "place_name": " 도서관 앞 ", "max_people": 2}
    ).json()
    assert dinner["title"] == "⚡ 번개 · 18:00 도서관 앞" and dinner["place_name"] == "도서관 앞"
    assert dinner["max_people"] == 2

    lunch = client.post("/api/v1/meetups/quick", headers=h, json={"when": "lunch", "note": "  "}).json()
    assert lunch["meal_time"] == "2026-11-22T12:00:00+09:00" and lunch["note"] is None

    assert_error(client.post("/api/v1/meetups/quick", json={"when": "now"}), 401, "UNAUTHORIZED")
    assert_error(client.post("/api/v1/meetups/quick", headers=h, json={"when": "soon"}), 422, "VALIDATION_ERROR")
    assert_error(
        client.post("/api/v1/meetups/quick", headers=h, json={"when": "now", "max_people": 11}), 422, "VALIDATION_ERROR"
    )


def test_quick_meetup_place_order(client, clock):
    clock.now = seoul(11, 0)
    h = login(client, "사슴")
    r = create_restaurant(client, h, name="든든국밥")
    # 가게가 있으면 직접 쓴 이름보다 가게가 먼저예요
    body = client.post(
        "/api/v1/meetups/quick", headers=h, json={"when": "lunch", "restaurant_id": r["id"], "place_name": "딴곳"}
    ).json()
    assert body["title"] == "⚡ 번개 · 12:00 든든국밥"
    assert body["place_name"] == "든든국밥" and body["restaurant_id"] == r["id"]
    assert (body["lat"], body["lng"]) == (r["lat"], r["lng"])

    long_name = "가" * 40
    title = client.post("/api/v1/meetups/quick", headers=h, json={"when": "now", "place_name": long_name}).json()[
        "title"
    ]
    assert len(title) == 40 and title.startswith("⚡ 번개 · 11:10 ")

    assert_error(
        client.post("/api/v1/meetups/quick", headers=h, json={"when": "now", "restaurant_id": "rst_999"}),
        404,
        "NOT_FOUND",
    )


def test_suggestions(client, clock):
    a, b = login(client, "사슴"), login(client, "고양이")
    near = {"lat": 35.7033, "lng": 128.4557}
    far = {"lat": 35.7233, "lng": 128.4557}  # 약 2.2km 북쪽

    m_soon_far = create_meetup(client, a, clock, title="곧 먼 곳", meal_time=iso_in(clock, minutes=30), **far).json()
    m_mid_near = create_meetup(
        client, a, clock, title="중간 가까움", meal_time=iso_in(clock, minutes=60), **near
    ).json()
    m_late_near = create_meetup(
        client, a, clock, title="늦게 가까움", meal_time=iso_in(clock, minutes=100), **near
    ).json()
    create_meetup(client, a, clock, title="세 시간 뒤", meal_time=iso_in(clock, hours=3), **near)  # 2시간 밖
    full = create_meetup(client, a, clock, title="꽉 참", meal_time=iso_in(clock, minutes=20), max_people=2).json()
    client.post(f"/api/v1/meetups/{full['id']}/join", headers=b)
    cancelled = create_meetup(client, a, clock, title="취소됨", meal_time=iso_in(clock, minutes=20)).json()
    client.post(f"/api/v1/meetups/{cancelled['id']}/leave", headers=a)

    body = client.get("/api/v1/meetups/suggestions", params=near, headers=a).json()
    assert_page(body)
    titles = [m["title"] for m in body["items"]]
    assert titles == ["중간 가까움", "늦게 가까움", "곧 먼 곳"]  # 시간 + 거리 점수
    assert body["items"][0]["distance_m"] == 0 and body["items"][2]["distance_m"] > 2000
    assert body["items"][0]["is_host"] is True  # 토큰이 있으면 개인 필드도 채워요
    assert {m["status"] for m in body["items"]} == {"open"}

    # 위치를 안 보내면 시간 가까운 순, 거리는 null
    anon = client.get("/api/v1/meetups/suggestions").json()
    assert [m["id"] for m in anon["items"]] == [m_soon_far["id"], m_mid_near["id"], m_late_near["id"]]
    assert all(m["distance_m"] is None and m["joined"] is False for m in anon["items"])

    for i in range(4):
        create_meetup(client, b, clock, title=f"추가 약속 {i}", meal_time=iso_in(clock, minutes=40 + i))
    many = client.get("/api/v1/meetups/suggestions").json()
    assert many["count"] == 5 and many["total"] == 7  # 최대 5개

    assert_error(client.get("/api/v1/meetups/suggestions", params={"lat": 35.7}), 422, "VALIDATION_ERROR")
