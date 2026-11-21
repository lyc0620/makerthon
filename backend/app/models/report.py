"""제보 관련 테이블: reports, report_votes. 만료·숨김된 제보도 통계용으로 지우지 않아요."""

from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.core.timeutil import now_utc
from app.models.types import UTCDateTime


class Report(SQLModel, table=True):
    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_status_expires_at", "status", "expires_at"),)

    id: int | None = Field(default=None, primary_key=True)
    type: str = Field(max_length=20)
    user_id: int = Field(foreign_key="users.id")
    lat: float
    lng: float
    description: str | None = Field(default=None, max_length=100)
    status: str = Field(default="active", max_length=10)  # active / hidden
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
    last_confirmed_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
    expires_at: datetime = Field(sa_type=UTCDateTime, nullable=False)


class ReportVote(SQLModel, table=True):
    __tablename__ = "report_votes"

    report_id: int = Field(foreign_key="reports.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    vote: str = Field(max_length=10)  # confirm / deny
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
