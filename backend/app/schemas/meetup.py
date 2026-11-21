"""밥친구 요청/응답 모델 (규격 6.8)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MeetupIn(BaseModel):
    title: str = Field(min_length=2, max_length=40, description="예: 오늘 저녁 학식 같이 드실 분")
    place_name: str = Field(min_length=1, max_length=40)
    meal_time: datetime = Field(description="ISO 시간. 시간대가 없으면 서울 시간으로 봐요")
    max_people: int = Field(default=4, ge=2, le=10)
    restaurant_id: str | None = Field(default=None, description='예: "rst_12"')
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("title", "place_name", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("note")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        return v.strip() or None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=300)

    @field_validator("content", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class MeetupPublicOut(BaseModel):
    """방송(WebSocket)용: 개인 필드(joined, is_host)가 없어요."""

    id: str
    title: str
    place_name: str
    restaurant_id: str | None
    lat: float | None
    lng: float | None
    meal_time: str
    max_people: int
    member_count: int
    members: list[str]
    host_nickname: str
    note: str | None
    status: str
    created_at: str


class MeetupOut(MeetupPublicOut):
    joined: bool
    is_host: bool


class MessageOut(BaseModel):
    id: str
    nickname: str
    content: str
    created_at: str


class QuickMeetupIn(BaseModel):
    """번개 약속 (규격 6.11): 제목·시간을 직접 안 써도 돼요."""

    when: Literal["now", "in_30", "in_60", "lunch", "dinner"]
    restaurant_id: str | None = Field(default=None, description='예: "rst_12"')
    place_name: str | None = Field(default=None, max_length=40, description='없으면 가게 이름이나 "학생식당"')
    max_people: int = Field(default=4, ge=2, le=10)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("place_name", "note")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        return v.strip() or None


class MeetupSuggestionOut(MeetupOut):
    distance_m: int | None
