"""밥친구 관련 테이블: meetups, meetup_members, meetup_messages."""

from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.core.timeutil import now_utc
from app.models.types import UTCDateTime


class Meetup(SQLModel, table=True):
    __tablename__ = "meetups"
    __table_args__ = (Index("ix_meetups_status_meal_time", "status", "meal_time"),)

    id: int | None = Field(default=None, primary_key=True)
    host_id: int = Field(foreign_key="users.id")
    title: str = Field(max_length=40)
    place_name: str = Field(max_length=40)
    restaurant_id: int | None = Field(default=None, foreign_key="restaurants.id", nullable=True)
    lat: float | None = None
    lng: float | None = None
    meal_time: datetime = Field(sa_type=UTCDateTime, nullable=False)
    max_people: int
    note: str | None = Field(default=None, max_length=200)
    status: str = Field(default="open", max_length=10)  # open / full / cancelled
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)


class MeetupMember(SQLModel, table=True):
    __tablename__ = "meetup_members"

    meetup_id: int = Field(foreign_key="meetups.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    joined_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)


class MeetupMessage(SQLModel, table=True):
    __tablename__ = "meetup_messages"
    __table_args__ = (Index("ix_meetup_messages_meetup_id_id", "meetup_id", "id"),)

    id: int | None = Field(default=None, primary_key=True)
    meetup_id: int = Field(foreign_key="meetups.id")
    user_id: int = Field(foreign_key="users.id")
    content: str = Field(max_length=300)
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
