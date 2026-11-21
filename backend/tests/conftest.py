"""테스트 공통 준비물. 테스트마다 임시 DB 파일을 새로 만들어요 (진짜 DB·네트워크 안 씀)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core import timeutil
from app.core.config import get_settings
from app.core.db import create_db_and_tables, get_session, make_engine, reset_engine

CAMPUS_LAT = 35.7033
CAMPUS_LNG = 128.4557
TEST_SECRET = "test-secret-0123456789-0123456789-abcdef"


@pytest.fixture
def db_url(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("KAKAO_REST_API_KEY", "")
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
    eng = make_engine(db_url)
    create_db_and_tables(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def app(engine):
    from app.main import create_app
    from app.services.presence import store

    store.clear()  # 실시간 위치는 메모리에 있어서 테스트마다 비워요
    application = create_app()

    def _test_session():
        with Session(engine) as session:
            yield session

    application.dependency_overrides[get_session] = _test_session
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


class Clock:
    """timeutil.now_utc 를 바꿔서 시간을 앞으로 돌려 볼 수 있어요."""

    def __init__(self, monkeypatch):
        self.now = timeutil.now_utc()
        monkeypatch.setattr(timeutil, "now_utc", lambda: self.now)

    def advance(self, **kwargs) -> None:
        self.now = self.now + timedelta(**kwargs)


@pytest.fixture
def clock(monkeypatch):
    return Clock(monkeypatch)


# ───────── 도우미 ─────────
def login(client: TestClient, nickname: str) -> dict:
    resp = client.post("/api/v1/auth/dev-login", json={"nickname": nickname})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def restaurant_body(name="든든국밥", lat=CAMPUS_LAT, lng=CAMPUS_LNG, rating=5, tags=None, **extra) -> dict:
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
