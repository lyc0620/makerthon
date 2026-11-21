# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""DB 엔진과 세션. SQLite일 때만 WAL 모드와 외래키 검사를 켜요."""

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import Engine, make_url
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

_engine: Engine | None = None


def make_engine(url: str) -> Engine:
    """주소에 맞는 엔진을 만들어요. SQLite 파일 폴더가 없으면 만들어 줘요."""
    parsed = make_url(url)
    is_sqlite = parsed.get_backend_name() == "sqlite"
    connect_args: dict = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
        if parsed.database and parsed.database != ":memory:":
            Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(url, connect_args=connect_args)

    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # SQLite 전용 설정은 여기에만 둬요
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = make_engine(get_settings().DATABASE_URL)
    return _engine


def reset_engine() -> None:
    """테스트에서 DB 주소를 바꿀 때 써요."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def create_db_and_tables(engine: Engine | None = None) -> None:
    import app.models  # noqa: F401  (테이블 등록용)

    SQLModel.metadata.create_all(engine or get_engine())


def get_session() -> Iterator[Session]:
    """FastAPI 의존성: 요청마다 세션 하나를 열고 닫아요."""
    with Session(get_engine()) as session:
        yield session
