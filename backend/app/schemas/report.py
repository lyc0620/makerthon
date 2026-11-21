"""제보 요청/응답 모델 (규격 6.6)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ReportType = Literal["police", "dark_road", "hazard"]
VoteType = Literal["confirm", "deny"]


class ReportIn(BaseModel):
    type: ReportType = "police"
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    description: str | None = Field(default=None, max_length=100, description="예: 정문 앞 2명, 헬멧 단속")

    @field_validator("description")
    @classmethod
    def _blank_to_none(cls, v):
        if v is None:
            return None
        return v.strip() or None


class VoteIn(BaseModel):
    vote: VoteType


class ReportOut(BaseModel):
    id: str
    type: str
    lat: float
    lng: float
    description: str | None
    created_at: str
    last_confirmed_at: str
    expires_at: str
    confirm_count: int
    deny_count: int
    confidence: float
    is_active: bool
    my_vote: VoteType | None


class ReportCreatedOut(ReportOut):
    merged: bool


class HotspotOut(BaseModel):
    lat: float
    lng: float
    count: int
    peak_hour: int
    peak_weekday: str
