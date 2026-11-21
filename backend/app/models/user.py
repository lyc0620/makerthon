# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""users 테이블 (통합 담당 소유). 개발용 로그인을 위해 email_hash는 비워 둘 수 있어요."""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.timeutil import now_utc
from app.models.types import UTCDateTime


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email_hash: str | None = Field(default=None, max_length=128, unique=True, nullable=True)
    nickname: str = Field(max_length=20, unique=True)
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
