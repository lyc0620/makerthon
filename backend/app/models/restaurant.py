"""맛집 관련 테이블: restaurants, reviews, review_tags, review_likes."""

from datetime import datetime

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.timeutil import now_utc
from app.models.types import UTCDateTime


class Restaurant(SQLModel, table=True):
    __tablename__ = "restaurants"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=40)
    category: str = Field(max_length=20)
    address: str | None = Field(default=None, max_length=200)
    lat: float
    lng: float
    phone: str | None = Field(default=None, max_length=30)
    kakao_place_id: str | None = Field(default=None, max_length=30, unique=True, nullable=True)
    description: str | None = Field(default=None, max_length=300)
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)


class Review(SQLModel, table=True):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "user_id", name="uq_reviews_restaurant_user"),  # 1인 1후기
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
    )

    id: int | None = Field(default=None, primary_key=True)
    restaurant_id: int = Field(foreign_key="restaurants.id", index=True)
    user_id: int = Field(foreign_key="users.id")
    rating: int
    content: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)


class ReviewTag(SQLModel, table=True):
    __tablename__ = "review_tags"

    review_id: int = Field(foreign_key="reviews.id", primary_key=True)
    tag: str = Field(max_length=20, primary_key=True)


class ReviewLike(SQLModel, table=True):
    __tablename__ = "review_likes"

    review_id: int = Field(foreign_key="reviews.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    created_at: datetime = Field(default_factory=now_utc, sa_type=UTCDateTime, nullable=False)
