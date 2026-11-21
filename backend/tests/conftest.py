import os

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core import db
from app.core.config import get_settings

# 개발자의 backend/.env 값이 테스트에 섞이지 않게 (환경변수가 .env 보다 우선한다)
for _k, _v in {
    "ADMIN_TOKEN": "",
    "SEMINAR_SOURCE": "mock",
    "BUS_SOURCE": "mock",
    "DISCORD_WEBHOOK_URL": "",
}.items():
    os.environ[_k] = _v


@pytest.fixture
def client(tmp_path, monkeypatch):
    """임시 SQLite 파일 + 마이그레이션 + seed 까지 거친 앱. 스케줄러는 끈다."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("BUS_SOURCE", "mock")
    monkeypatch.setenv("SEMINAR_SOURCE", "mock")
    get_settings.cache_clear()
    db.reset_engine()

    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c

    db.reset_engine()
    get_settings.cache_clear()


@pytest.fixture
def session(client):
    with Session(db.get_engine()) as s:
        yield s
