"""테스트 공통 준비물 (버스·세미나 + DB 파트 통합).

테스트마다 임시 SQLite 파일을 새로 만들고 Alembic 마이그레이션까지 거친다 (진짜 DB·네트워크 안 씀).
스케줄러·백그라운드 루프는 끈다.
"""

import os
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core import db, timeutil
from app.core.config import get_settings
from app.core.db import get_session, make_engine, reset_engine

# 개발자의 backend/.env 값이 테스트에 섞이지 않게 (환경변수가 .env 보다 우선한다)
for _k, _v in {
    "ADMIN_TOKEN": "",
    "SEMINAR_SOURCE": "mock",
    "BUS_SOURCE": "mock",
    "DISCORD_WEBHOOK_URL": "",
    "KAKAO_REST_API_KEY": "",
}.items():
    os.environ[_k] = _v

# DB 파트 테스트 기준 좌표 (서비스 반경을 넉넉히 둬서 테스트 데이터가 지역 밖으로 나가지 않게)
CAMPUS_LAT = 35.7033
CAMPUS_LNG = 128.4557
TEST_SECRET = "test-secret-0123456789-0123456789-abcdef"


@pytest.fixture
def db_url(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("BUS_SOURCE", "mock")
    monkeypatch.setenv("SEMINAR_SOURCE", "mock")
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("CAMPUS_LAT", str(CAMPUS_LAT))
    monkeypatch.setenv("CAMPUS_LNG", str(CAMPUS_LNG))
    monkeypatch.setenv("SERVICE_RADIUS_M", "8000")
    get_settings.cache_clear()
    reset_engine()
    yield url
    get_settings.cache_clear()
    reset_engine()


@pytest.fixture
def engine(db_url):
    """마이그레이션(버스·세미나 → DB 파트 한 줄)으로 테이블을 만든 엔진."""
    from app.main import run_migrations

    run_migrations()
    eng = make_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture
def app(engine):
    from app.main import create_app
    from app.services.presence import store

    store.clear()  # 실시간 위치는 메모리에 있어서 테스트마다 비운다
    application = create_app()

    def _test_session():
        with Session(engine) as session:
            yield session

    application.dependency_overrides[get_session] = _test_session
    return application


@pytest.fixture
def client(app):
    """시작 과정(마이그레이션·seed·세미나 재매핑)까지 거친 앱."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def session(client):
    with Session(db.get_engine()) as s:
        yield s


class Clock:
    """timeutil.now_utc 를 바꿔서 시간을 앞으로 돌려 볼 수 있다."""

    def __init__(self, monkeypatch):
        self.now = timeutil.now_utc()
        monkeypatch.setattr(timeutil, "now_utc", lambda: self.now)

    def advance(self, **kwargs) -> None:
        self.now = self.now + timedelta(**kwargs)


@pytest.fixture
def clock(monkeypatch):
    return Clock(monkeypatch)


# ───────── 도우미 (DB 파트) ─────────
def login(client: TestClient, nickname: str) -> dict:
    resp = client.post("/api/v1/auth/dev-login", json={"nickname": nickname})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def restaurant_body(
    name="든든국밥", lat=CAMPUS_LAT, lng=CAMPUS_LNG, rating=5, tags=None, **extra
) -> dict:
    body = {
        "name": name,
        "category": "한식",
        "lat": lat,
        "lng": lng,
        "first_review": {"rating": rating, "content": "맛있어요 또 갈래요", "tags": tags or []},
    }
    body.update(extra)
    return body


def create_restaurant(client: TestClient, headers: dict, **kwargs) -> dict:
    resp = client.post("/api/v1/restaurants", headers=headers, json=restaurant_body(**kwargs))
    assert resp.status_code == 201, resp.text
    return resp.json()


def add_review(client, headers, restaurant_id, rating=4, content="괜찮았어요 추천해요", tags=None):
    return client.post(
        f"/api/v1/restaurants/{restaurant_id}/reviews",
        headers=headers,
        json={"rating": rating, "content": content, "tags": tags or []},
    )


def assert_error(resp, status: int, code: str) -> dict:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    return body["error"]


def assert_page(body: dict) -> None:
    assert set(body) == {"items", "count", "total", "updated_at"}
    assert body["count"] == len(body["items"])
