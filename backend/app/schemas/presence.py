"""지금 밥 먹을 사람 요청/응답 모델 (규격 6.10)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.restaurant import CATEGORIES


class PresenceIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    minutes: Literal[30, 60, 120] | None = Field(
        default=None, description="처음 켤 때 정해요 (없으면 60분). 다시 보내면 지금부터 새로 정해요"
    )
    food_pref: str | None = Field(default=None, description='맛집 카테고리 중 하나, null이면 "아무거나"')
    message: str | None = Field(default=None, max_length=40)

    @field_validator("food_pref")
    @classmethod
    def _check_food_pref(cls, v):
        if v is not None and v not in CATEGORIES:
            raise ValueError(f"food_pref는 {', '.join(CATEGORIES)} 중 하나예요.")
        return v

    @field_validator("message")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        return v.strip() or None


class PresencePublicOut(BaseModel):
    """방송(presence.updated)용: distance_m, is_me가 없어요."""

    user_id: str
    nickname: str
    lat: float
    lng: float
    until: str
    food_pref: str | None
    message: str | None
    updated_at: str


class PresenceOut(PresencePublicOut):
    distance_m: int | None
    is_me: bool
