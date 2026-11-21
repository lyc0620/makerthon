"""모든 테이블이 같이 쓰는 컬럼 타입."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """시간대가 있는 시간 컬럼.

    - 저장: 항상 UTC로 바꿔서 저장해요.
    - 읽기: 항상 UTC 시간대가 붙은 값으로 돌려줘요.
    SQLite는 시간대를 저장하지 못해서 UTC 기준 값만 넣고, PostgreSQL은 timestamptz를 그대로 써요.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("시간대가 없는 시간은 저장할 수 없어요. timeutil.to_utc()를 먼저 써 주세요.")
        value = value.astimezone(UTC)
        if dialect.name == "sqlite":
            value = value.replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
