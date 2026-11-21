"""WebSocket 실시간 알림 (규격 6.9)."""

from datetime import timedelta

from app.core import timeutil
from tests.conftest import CAMPUS_LAT, CAMPUS_LNG, create_restaurant, login


def test_websocket_receives_report_created(client):
    h = login(client, "사슴")
    with client.websocket_connect("/api/v1/ws") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "online.count" and hello["data"]["count"] >= 1

        resp = client.post("/api/v1/reports", headers=h, json={"type": "police", "lat": CAMPUS_LAT, "lng": CAMPUS_LNG})
        msg = ws.receive_json()
        assert msg["type"] == "report.created"
        assert msg["data"]["id"] == resp.json()["id"]
        assert msg["data"]["my_vote"] is None and "merged" not in msg["data"]


def test_websocket_other_events(client):
    a, b, c = login(client, "사슴"), login(client, "고양이"), login(client, "수달")
    with client.websocket_connect("/api/v1/ws") as ws:
        ws.receive_json()  # online.count

        create_restaurant(client, a)
        msg = ws.receive_json()
        assert msg["type"] == "restaurant.created" and msg["data"]["id"].startswith("rst_")

        report = client.post("/api/v1/reports", headers=a, json={"lat": CAMPUS_LAT, "lng": CAMPUS_LNG}).json()
        assert ws.receive_json()["type"] == "report.created"
        client.post(f"/api/v1/reports/{report['id']}/votes", headers=b, json={"vote": "deny"})
        assert ws.receive_json()["type"] == "report.updated"
        client.post(f"/api/v1/reports/{report['id']}/votes", headers=c, json={"vote": "deny"})
        removed = ws.receive_json()
        assert removed == {"type": "report.removed", "data": {"id": report["id"]}}

        meal = timeutil.to_iso(timeutil.now_utc() + timedelta(hours=2))
        m = client.post(
            "/api/v1/meetups", headers=a, json={"title": "저녁 같이", "place_name": "학식", "meal_time": meal}
        ).json()
        created = ws.receive_json()
        assert created["type"] == "meetup.created"
        assert "joined" not in created["data"] and "is_host" not in created["data"]  # 개인 필드 제외

        client.post(f"/api/v1/meetups/{m['id']}/messages", headers=a, json={"content": "비밀 내용"})
        chat = ws.receive_json()
        assert chat["type"] == "meetup.message"
        assert set(chat["data"]) == {"meetup_id", "message_id"}  # 내용은 방송 안 해요

        client.post(f"/api/v1/meetups/{m['id']}/leave", headers=a)
        assert ws.receive_json()["type"] == "meetup.cancelled"
