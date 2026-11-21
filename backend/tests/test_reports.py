"""제보 API (규격 6.6)."""

from datetime import timedelta

from sqlmodel import Session

from app.core import timeutil
from app.models import Report, User
from tests.conftest import CAMPUS_LAT, CAMPUS_LNG, assert_error, assert_page, login

REPORT_KEYS = {
    "id", "type", "lat", "lng", "description", "created_at", "last_confirmed_at", "expires_at",
    "confirm_count", "deny_count", "confidence", "is_active", "my_vote",
}  # fmt: skip
LAT_10M = 0.00009  # 위도 0.00009도 ≈ 10m


def post_report(client, headers, lat=CAMPUS_LAT, lng=CAMPUS_LNG, type="police", description=None):
    return client.post(
        "/api/v1/reports", headers=headers, json={"type": type, "lat": lat, "lng": lng, "description": description}
    )


def vote(client, headers, report_id, value):
    return client.post(f"/api/v1/reports/{report_id}/votes", headers=headers, json={"vote": value})


def test_create_report(client, clock):
    h = login(client, "사슴")
    resp = post_report(client, h, description="정문 앞 2명, 헬멧 단속")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body) == REPORT_KEYS | {"merged"}
    assert body["merged"] is False and body["id"].startswith("rpt_")
    assert body["confirm_count"] == 0 and body["deny_count"] == 0
    assert body["confidence"] == 0.6 and body["is_active"] is True and body["my_vote"] is None
    assert body["created_at"] == timeutil.to_iso(clock.now)
    assert body["expires_at"] == timeutil.to_iso(clock.now + timedelta(minutes=30))
    assert "user" not in str(body)  # 제보자 정보는 없어요

    # 시간이 지나면 신뢰도가 내려가요 (15분 = 기본 유지의 절반 → -0.2)
    clock.advance(minutes=15)
    assert client.get(f"/api/v1/reports/{body['id']}").json()["confidence"] == 0.4


def test_report_requires_auth_and_valid_input(client):
    assert_error(post_report(client, {}), 401, "UNAUTHORIZED")
    h = login(client, "사슴")
    assert_error(post_report(client, h, type="ufo"), 422, "VALIDATION_ERROR")
    assert_error(post_report(client, h, lat=37.5665, lng=126.978), 422, "VALIDATION_ERROR")  # 서비스 지역 밖


def test_merge_within_type_radius(client, clock):
    a, b, c, d = (login(client, n) for n in ["사슴", "고양이", "수달", "너구리"])
    first = post_report(client, a).json()

    clock.advance(minutes=10)
    merged = post_report(client, b, lat=CAMPUS_LAT + LAT_10M * 8)  # 80m → police(100m) 안
    assert merged.status_code == 201
    body = merged.json()
    assert body["merged"] is True and body["id"] == first["id"]
    assert body["confirm_count"] == 1 and body["my_vote"] == "confirm"
    assert body["last_confirmed_at"] == timeutil.to_iso(clock.now)
    # 22:00 제보 → 22:10 확인 → 22:45 만료 (규격 예시와 같아요: 기존 만료 + 15분)
    assert body["expires_at"] == timeutil.to_iso(clock.now - timedelta(minutes=10) + timedelta(minutes=45))
    assert body["confidence"] == 0.75

    separate = post_report(client, c, lat=CAMPUS_LAT + LAT_10M * 15).json()  # 150m → 따로
    assert separate["merged"] is False and separate["id"] != first["id"]

    # dark_road는 50m 반경: 80m 떨어지면 새 제보, 30m면 합쳐요
    dark = post_report(client, a, type="dark_road", lat=CAMPUS_LAT - 0.01).json()
    assert dark["merged"] is False
    assert dark["expires_at"] == timeutil.to_iso(clock.now + timedelta(minutes=60))
    not_merged = post_report(client, d, type="dark_road", lat=CAMPUS_LAT - 0.01 + LAT_10M * 8).json()
    assert not_merged["merged"] is False
    merged_dark = post_report(client, b, type="dark_road", lat=CAMPUS_LAT - 0.01 + LAT_10M * 3).json()
    assert merged_dark["merged"] is True and merged_dark["id"] == dark["id"]


def test_cooldown_429_but_not_on_merge(client, clock):
    a, b = login(client, "사슴"), login(client, "고양이")
    mine = post_report(client, a).json()
    others = post_report(client, b, lat=CAMPUS_LAT + 0.01).json()

    clock.advance(minutes=1)
    err = assert_error(post_report(client, a, lat=CAMPUS_LAT - 0.01), 429, "RATE_LIMITED")
    assert "2분" in err["message"]
    # 합쳐지는 경우는 쿨다운에 안 걸려요
    merged = post_report(client, a, lat=CAMPUS_LAT + 0.01 + LAT_10M)
    assert merged.status_code == 201 and merged.json()["merged"] is True and merged.json()["id"] == others["id"]

    clock.advance(minutes=1, seconds=1)
    later = post_report(client, a, lat=CAMPUS_LAT - 0.01)
    assert later.status_code == 201 and later.json()["id"] != mine["id"]


def test_deny_hides_and_hidden_vote_409(client):
    a, b, c, d = (login(client, n) for n in ["사슴", "고양이", "수달", "너구리"])
    report = post_report(client, a).json()

    one = vote(client, b, report["id"], "deny").json()
    assert one["deny_count"] == 1 and one["is_active"] is True and one["my_vote"] == "deny"

    two = vote(client, c, report["id"], "deny").json()
    assert two["deny_count"] == 2 and two["is_active"] is False  # deny≥2 이고 deny>confirm

    assert client.get("/api/v1/reports").json()["items"] == []
    assert client.get(f"/api/v1/reports/{report['id']}").json()["is_active"] is False  # 조회는 돼요
    assert_error(vote(client, d, report["id"], "confirm"), 409, "CONFLICT")


def test_deny_not_hidden_when_confirms_match(client):
    a, b, c, d, e = (login(client, n) for n in ["사슴", "고양이", "수달", "너구리", "오리"])
    report = post_report(client, a).json()
    vote(client, b, report["id"], "confirm")
    vote(client, c, report["id"], "confirm")
    vote(client, d, report["id"], "deny")
    still = vote(client, e, report["id"], "deny").json()
    assert still["deny_count"] == 2 and still["confirm_count"] == 2 and still["is_active"] is True
    # 한 명이 확인→아니에요로 바꾸면 deny 3 > confirm 1 → 숨김
    changed = vote(client, b, report["id"], "deny").json()
    assert changed["confirm_count"] == 1 and changed["deny_count"] == 3 and changed["is_active"] is False


def test_my_vote_and_revote(client, clock):
    a, b = login(client, "사슴"), login(client, "고양이")
    report = post_report(client, a).json()
    first = vote(client, b, report["id"], "confirm").json()
    expires_once = first["expires_at"]

    assert client.get(f"/api/v1/reports/{report['id']}", headers=b).json()["my_vote"] == "confirm"
    assert client.get(f"/api/v1/reports/{report['id']}", headers=a).json()["my_vote"] is None
    assert client.get(f"/api/v1/reports/{report['id']}").json()["my_vote"] is None

    clock.advance(minutes=1)
    again = vote(client, b, report["id"], "confirm").json()
    assert again["confirm_count"] == 1 and again["expires_at"] == expires_once  # 같은 표로는 또 연장 안 돼요

    # 확인했던 사람이 '없어졌어요'로 바꾸면 표가 바뀌고 제보는 바로 내려가요
    changed = vote(client, b, report["id"], "deny").json()
    assert changed["my_vote"] == "deny" and changed["confirm_count"] == 0 and changed["deny_count"] == 1
    assert changed["is_active"] is False
    assert_error(vote(client, b, report["id"], "maybe"), 422, "VALIDATION_ERROR")
    assert_error(vote(client, b, "rpt_999", "deny"), 404, "NOT_FOUND")


def test_reconfirm_extends_only_after_5_minutes(client, clock):
    """같은 사람이 "아직 있어요"를 다시 누르면, 마지막 연장 뒤 5분이 지났을 때만 15분 늘어나요."""
    a, b = login(client, "사슴"), login(client, "고양이")
    report = post_report(client, a).json()
    once = vote(client, b, report["id"], "confirm").json()["expires_at"]

    clock.advance(minutes=2)
    assert vote(client, b, report["id"], "confirm").json()["expires_at"] == once  # 5분 안이라 그대로

    clock.advance(minutes=3)
    later = vote(client, b, report["id"], "confirm").json()
    assert later["expires_at"] > once and later["confirm_count"] == 1  # 5분이 지나서 다시 연장, 표 수는 그대로
    assert vote(client, b, report["id"], "confirm").json()["expires_at"] == later["expires_at"]  # 바로 또 누르면 그대로


def test_vouched_person_saying_gone_hides_right_away(client):
    """'있다'고 했던 사람(처음 제보한 사람, 확인한 사람)이 '없어졌어요'를 누르면 바로 내려가요."""
    a, b, c = login(client, "사슴"), login(client, "고양이"), login(client, "여우")

    # 확인했던 사람이 없어졌다고 하면 → 바로 내림 (다른 사람 확인이 더 많아도)
    report = post_report(client, a).json()
    vote(client, b, report["id"], "confirm")
    vote(client, c, report["id"], "confirm")
    gone = vote(client, b, report["id"], "deny").json()
    assert gone["is_active"] is False

    # 처음 제보한 사람이 없어졌다고 해도 → 바로 내림
    report2 = post_report(client, c, lat=35.7100, lng=128.4700).json()  # 제보는 2분에 한 번이라 다른 사람이 올려요
    assert vote(client, c, report2["id"], "deny").json()["is_active"] is False

    # 확인한 적 없는 사람의 '없어졌어요' 한 표는 바로 내리지 않아요
    report3 = post_report(client, b, lat=35.7200, lng=128.4800).json()
    assert vote(client, a, report3["id"], "deny").json()["is_active"] is True


def test_expired_report(client, clock):
    a, b = login(client, "사슴"), login(client, "고양이")
    report = post_report(client, a).json()
    clock.advance(minutes=31)
    assert client.get("/api/v1/reports").json()["total"] == 0
    detail = client.get(f"/api/v1/reports/{report['id']}").json()
    assert detail["is_active"] is False
    assert_error(vote(client, b, report["id"], "confirm"), 409, "CONFLICT")
    # 만료된 제보와는 합쳐지지 않아요
    fresh = post_report(client, b).json()
    assert fresh["merged"] is False and fresh["id"] != report["id"]


def test_list_bbox_type_and_order(client, clock):
    a, b, c = login(client, "사슴"), login(client, "고양이"), login(client, "수달")
    inside = post_report(client, a).json()
    clock.advance(minutes=3)
    outside = post_report(client, b, lat=CAMPUS_LAT + 0.02).json()
    clock.advance(minutes=3)
    dark = post_report(client, c, type="dark_road", lat=CAMPUS_LAT - 0.001).json()

    all_items = client.get("/api/v1/reports").json()
    assert_page(all_items)
    assert [x["id"] for x in all_items["items"]] == [dark["id"], outside["id"], inside["id"]]  # 최신순
    assert all_items["updated_at"] == timeutil.to_iso(clock.now)

    bbox = f"{CAMPUS_LNG - 0.005},{CAMPUS_LAT - 0.005},{CAMPUS_LNG + 0.005},{CAMPUS_LAT + 0.005}"
    boxed = client.get("/api/v1/reports", params={"bbox": bbox}).json()
    assert {x["id"] for x in boxed["items"]} == {inside["id"], dark["id"]}
    typed = client.get("/api/v1/reports", params={"bbox": bbox, "type": "police"}).json()
    assert [x["id"] for x in typed["items"]] == [inside["id"]]

    assert_error(client.get("/api/v1/reports", params={"bbox": "1,2,3"}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/reports", params={"bbox": "a,b,c,d"}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/reports", params={"bbox": "129,36,128,35"}), 422, "VALIDATION_ERROR")
    for bad in ["1,2,nan,4", "nan,nan,nan,nan", "-inf,2,inf,4", "1,2,3,Infinity"]:  # 이상한 숫자는 422
        assert_error(client.get("/api/v1/reports", params={"bbox": bad}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/reports/abc"), 404, "NOT_FOUND")


def test_hotspots_peak_hour_in_seoul_time(client, engine):
    now = timeutil.now_utc()
    with Session(engine) as session:
        user = User(nickname="통계용", created_at=now)
        session.add(user)
        session.flush()

        def add(lat, lng, created, type="police", status="hidden"):
            session.add(
                Report(type=type, user_id=user.id, lat=lat, lng=lng, status=status, created_at=created,
                       last_confirmed_at=created, expires_at=created + timedelta(minutes=30))
            )  # fmt: skip

        # UTC 23:10 = 서울 다음 날 08:10 → peak_hour는 8이어야 해요 (UTC 기준이면 23)
        base = (now - timedelta(days=5)).replace(hour=23, minute=10, second=0)
        for i in range(3):
            add(35.69601 + i * 0.0001, 128.45601, base - timedelta(days=7 * i))
        add(35.69604, 128.45602, base.replace(hour=5))  # 서울 14시, 한 번뿐
        add(35.7000, 128.4600, now - timedelta(days=2))  # 다른 칸
        add(35.69601, 128.45601, now - timedelta(days=40))  # 기간 밖
        add(35.69601, 128.45601, now - timedelta(days=1), type="dark_road")  # 다른 타입
        session.commit()

    body = client.get("/api/v1/reports/hotspots", params={"type": "police", "days": 30}).json()
    assert_page(body)
    assert body["total"] == 2
    top = body["items"][0]
    assert set(top) == {"lat", "lng", "count", "peak_hour", "peak_weekday"}
    assert top["count"] == 4 and top["peak_hour"] == 8
    expected_day = "월화수목금토일"[timeutil.to_seoul(base).weekday()]
    assert top["peak_weekday"] == expected_day
    assert body["items"][1]["count"] == 1

    longer = client.get("/api/v1/reports/hotspots", params={"days": 60}).json()
    assert longer["items"][0]["count"] == 5
    assert_error(client.get("/api/v1/reports/hotspots", params={"days": 0}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/reports/hotspots", params={"days": 366}), 422, "VALIDATION_ERROR")
