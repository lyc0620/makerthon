from datetime import datetime

from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.core.db import TZDateTime


class CrawlLog(SQLModel, table=True):
    __tablename__ = "crawl_logs"

    id: int | None = Field(default=None, primary_key=True)
    job: str = Field(index=True)  # "seminar" 등
    started_at: datetime = Field(sa_column=Column(TZDateTime, nullable=False))
    finished_at: datetime | None = Field(default=None, sa_column=Column(TZDateTime, nullable=True))
    status: str = "running"  # running | success | failed
    item_count: int = 0
    error: str | None = None
