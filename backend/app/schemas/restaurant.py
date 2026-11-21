"""맛집 요청/응답 모델 (규격 6.4)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

CATEGORIES = ["한식", "중식", "일식", "양식", "분식", "카페", "술집", "패스트푸드", "학식", "기타"]
TAGS = ["혼밥가능", "가성비", "양많음", "분위기", "늦게까지", "배달", "단체석", "학생할인"]

Category = Literal["한식", "중식", "일식", "양식", "분식", "카페", "술집", "패스트푸드", "학식", "기타"]
Tag = Literal["혼밥가능", "가성비", "양많음", "분위기", "늦게까지", "배달", "단체석", "학생할인"]


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


# ───────── 요청 ─────────
class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    content: str = Field(min_length=5, max_length=500, description="5~500자")
    tags: list[Tag] = Field(default_factory=list, max_length=len(TAGS))

    @field_validator("content", mode="before")
    @classmethod
    def _strip_content(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("tags")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))  # 같은 태그를 두 번 보내도 하나로 봐요


class RestaurantIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    category: Category
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    kakao_place_id: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=300)
    first_review: ReviewIn  # 추천하려면 첫 후기를 꼭 남겨요

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("address", "phone", "kakao_place_id", "description")
    @classmethod
    def _blank_to_none(cls, v):
        return _strip_or_none(v)


# ───────── 응답 ─────────
class RestaurantOut(BaseModel):
    id: str
    name: str
    category: str
    address: str | None
    lat: float
    lng: float
    phone: str | None
    kakao_place_id: str | None
    rating_avg: float | None
    review_count: int
    score: float
    top_tags: list[str]
    distance_m: int | None
    created_at: str


class MeetupBrief(BaseModel):
    id: str
    title: str
    meal_time: str
    member_count: int
    max_people: int
    status: str


class RestaurantDetailOut(RestaurantOut):
    description: str | None
    rating_distribution: dict[str, int]
    tag_counts: dict[str, int]
    upcoming_meetups: list[MeetupBrief]


class ReviewOut(BaseModel):
    id: str
    restaurant_id: str
    rating: int
    content: str
    tags: list[str]
    author_nickname: str
    like_count: int
    liked_by_me: bool
    is_mine: bool
    created_at: str


class LikeOut(BaseModel):
    liked: bool
    like_count: int


class MetaOut(BaseModel):
    categories: list[str]
    tags: list[str]


class PlaceOut(BaseModel):
    kakao_place_id: str
    name: str
    category_hint: str | None
    address: str | None
    phone: str | None
    lat: float
    lng: float
    already_registered_id: str | None
