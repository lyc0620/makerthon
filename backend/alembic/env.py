"""Alembic 실행 설정. DB 주소는 앱 설정(DATABASE_URL)에서, 테이블 목록은 SQLModel에서 가져와요."""

from logging.config import fileConfig

from sqlmodel import SQLModel

import app.models  # noqa: F401  (모든 테이블을 등록해요)
from alembic import context
from app.core.config import get_settings
from app.core.db import make_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    # alembic.ini 나 -x 옵션으로 주소를 따로 주지 않았으면 앱 설정을 써요
    return config.get_main_option("sqlalchemy.url") or get_settings().DATABASE_URL


def run_migrations_offline() -> None:
    """DB 연결 없이 SQL 문만 만들어요 (alembic upgrade head --sql)."""
    url = _database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _database_url()
    engine = make_engine(url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite는 ALTER가 약해서 batch 모드로 테이블을 다시 만들어요
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
