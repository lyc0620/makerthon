from datetime import datetime

from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.core.db import TZDateTime


class Seminar(SQLModel, table=True):
    __tablename__ = "seminars"

    id: str = Field(primary_key=True)  # sem_portal_12345
    source_id: str = Field(unique=True, index=True)  # 수집처 기준 고유값 (중복 제거용)
    title: str
    category: str = "other"  # seminar | lecture | event | other
    start_at: datetime = Field(sa_column=Column(TZDateTime, nullable=False, index=True))
    end_at: datetime | None = Field(default=None, sa_column=Column(TZDateTime, nullable=True))
    place_raw: str | None = None
    building_id: str | None = Field(default=None, foreign_key="buildings.id", index=True)
    room: str | None = None
    lat: float | None = None
    lng: float | None = None
    host: str | None = None
    source_url: str | None = None
    updated_at: datetime = Field(sa_column=Column(TZDateTime, nullable=False))
