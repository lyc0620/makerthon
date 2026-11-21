"""공통 규칙: 헬스체크, 에러 형식, 개발용 로그인, 인증, ID·시간 형식."""

from datetime import UTC, datetime

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import ids, timeutil
from app.core.config import get_settings
from app.core.errors import AppError
from tests.conftest import TEST_SECRET, assert_error, login, restaurant_body


def test_health(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["time"].endswith("+09:00")


def test_unknown_route_uses_error_format(client):
    assert_error(client.get("/api/v1/nothing-here"), 404, "NOT_FOUND")


def test_validation_error_format(client):
    headers = login(client, "검증러")
    resp = client.post("/api/v1/restaurants", headers=headers, json={"name": ""})
    err = assert_error(resp, 422, "VALIDATION_ERROR")
    assert isinstance(err["details"]["fields"], list) and err["details"]["fields"]


def test_unhandled_error_is_500_internal(app):
    @app.get("/boom")
    def boom():
        raise RuntimeError("일부러 낸 오류")

    with TestClient(app, raise_server_exceptions=False) as c:
        assert_error(c.get("/boom"), 500, "INTERNAL_ERROR")


def test_dev_login_creates_and_reuses_user(client):
    first = client.post("/api/v1/auth/dev-login", json={"nickname": "익명의 사슴"})
    assert first.status_code == 200
    body = first.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 2592000
    payload = jwt.decode(body["access_token"], TEST_SECRET, algorithms=["HS256"])
    assert "exp" in payload

    again = client.post("/api/v1/auth/dev-login", json={"nickname": "익명의 사슴"}).json()
    payload2 = jwt.decode(again["access_token"], TEST_SECRET, algorithms=["HS256"])
    assert payload2["sub"] == payload["sub"]  # 같은 닉네임이면 같은 사용자

    other = client.post("/api/v1/auth/dev-login", json={"nickname": "배고픈 고양이"}).json()
    assert jwt.decode(other["access_token"], TEST_SECRET, algorithms=["HS256"])["sub"] != payload["sub"]


def test_dev_login_only_in_dev(engine, monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    get_settings.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as c:
        assert_error(c.post("/api/v1/auth/dev-login", json={"nickname": "누구"}), 404, "NOT_FOUND")


def test_app_env_defaults_to_prod(monkeypatch):
    """APP_ENV를 안 적으면 안전한 운영 모드라서 개발용 로그인이 켜지지 않아요."""
    from app.core.config import Settings

    monkeypatch.delenv("APP_ENV", raising=False)
    settings = Settings(_env_file=None)
    assert settings.APP_ENV == "prod" and settings.is_dev is False


def test_dev_login_off_when_app_env_unset(engine, monkeypatch):
    from app.core import config

    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setattr(config.Settings, "model_config", {**config.Settings.model_config, "env_file": None})
    get_settings.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as c:
        assert_error(c.post("/api/v1/auth/dev-login", json={"nickname": "누구"}), 404, "NOT_FOUND")
    get_settings.cache_clear()


def test_prod_requires_real_jwt_secret(monkeypatch):
    from app.core.config import DEV_JWT_SECRET

    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)
    get_settings.cache_clear()
    with pytest.raises(RuntimeError):
        get_settings()
    get_settings.cache_clear()
    monkeypatch.setenv("JWT_SECRET", "")  # 빈 값도 기본값으로 보고 막아요
    with pytest.raises(RuntimeError):
        get_settings()
    get_settings.cache_clear()


def test_write_requires_auth(client):
    assert_error(client.post("/api/v1/restaurants", json=restaurant_body()), 401, "UNAUTHORIZED")
    bad = {"Authorization": "Bearer not-a-token"}
    assert_error(client.post("/api/v1/restaurants", headers=bad, json=restaurant_body()), 401, "UNAUTHORIZED")
    expired = jwt.encode({"sub": "1", "exp": 1}, TEST_SECRET, algorithm="HS256")
    resp = client.post("/api/v1/restaurants", headers={"Authorization": f"Bearer {expired}"}, json=restaurant_body())
    assert_error(resp, 401, "UNAUTHORIZED")
    wrong_key = jwt.encode({"sub": "1", "exp": 9999999999}, "x" * 40, algorithm="HS256")
    resp = client.post("/api/v1/reports", headers={"Authorization": f"Bearer {wrong_key}"}, json={})
    assert_error(resp, 401, "UNAUTHORIZED")


def test_read_works_without_or_with_bad_token(client):
    assert client.get("/api/v1/restaurants").status_code == 200
    assert client.get("/api/v1/reports", headers={"Authorization": "Bearer nope"}).status_code == 200


def test_cors_allows_vite_dev_server(client):
    resp = client.options(
        "/api/v1/restaurants",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_id_helpers():
    assert ids.encode("rst", 12) == "rst_12"
    assert ids.encode("rst", None) is None
    assert ids.decode("rst", "rst_12") == 12
    for bad in ["12", "rst_", "rst_0", "rst_012", "rev_12", "rst_12x", "", None]:
        with pytest.raises(AppError) as exc:
            ids.decode("rst", bad)
        assert exc.value.status == 404 and exc.value.code == "NOT_FOUND"


def test_time_helpers():
    utc = datetime(2026, 12, 1, 9, 0, tzinfo=UTC)
    assert timeutil.to_iso(utc) == "2026-12-01T18:00:00+09:00"
    naive = datetime(2026, 12, 1, 18, 0)  # 시간대 없음 → 서울 시간
    assert timeutil.to_utc(naive) == utc
    assert timeutil.to_iso(None) is None


# ───────── 버스·세미나 쪽 공통 (통합 전 test_common) ─────────
def test_health_time_is_seoul(client):
    body = client.get("/api/v1/health").json()
    assert datetime.fromisoformat(body["time"]).utcoffset().total_seconds() == 9 * 3600


def test_buildings_from_seed(client):
    r = client.get("/api/v1/buildings")
    body = r.json()
    assert r.status_code == 200
    assert body["count"] == len(body["items"]) >= 1
    assert "updated_at" in body
    assert "bld_E8" in {b["id"] for b in body["items"]}
    assert client.get("/api/v1/buildings/bld_E8").json()["aliases"]


def test_api_error_message_is_kept(client):
    r = client.get("/api/v1/buildings/bld_nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "건물을 찾을 수 없습니다."}}


def test_query_validation_error_format(client):
    assert_error(client.get("/api/v1/seminars?limit=999"), 422, "VALIDATION_ERROR")
