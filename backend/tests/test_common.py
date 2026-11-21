from datetime import datetime


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert datetime.fromisoformat(body["time"]).utcoffset().total_seconds() == 9 * 3600


def test_buildings_from_seed(client):
    r = client.get("/api/v1/buildings")
    body = r.json()
    assert r.status_code == 200
    assert body["count"] == len(body["items"]) >= 1
    assert "updated_at" in body
    ids = {b["id"] for b in body["items"]}
    assert "bld_E8" in ids

    r = client.get("/api/v1/buildings/bld_E8")
    assert r.json()["aliases"]


def test_not_found_error_format(client):
    r = client.get("/api/v1/buildings/bld_nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "건물을 찾을 수 없습니다."}}

    r = client.get("/api/v1/no-such-route")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_validation_error_format(client):
    r = client.get("/api/v1/seminars?limit=999")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
