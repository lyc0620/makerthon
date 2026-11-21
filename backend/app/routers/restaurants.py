"""맛집 · 후기 API (규격 6.4).

학생들이 가게를 추천(첫 후기와 함께 등록)하고 후기를 쌓아 가요.
캠퍼스 주변 가게 수는 많지 않아서, 점수·거리 계산은 파이썬에서 한 번에 해요.
"""

from collections import Counter, defaultdict
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from app.core import ids, timeutil
from app.core.auth import current_user, optional_user
from app.core.db import get_session
from app.core.errors import conflict, forbidden, not_found, validation
from app.core.geo import haversine_m, in_service_area
from app.models import Meetup, MeetupMember, Restaurant, Review, ReviewLike, ReviewTag, User
from app.schemas.common import Page, make_page
from app.schemas.restaurant import (
    CATEGORIES,
    TAGS,
    Category,
    LikeOut,
    MetaOut,
    PlaceOut,
    RestaurantDetailOut,
    RestaurantIn,
    RestaurantOut,
    ReviewIn,
    ReviewOut,
    Tag,
)
from app.services import kakao
from app.services.realtime import hub

router = APIRouter(prefix="/api/v1", tags=["맛집"])

PRIOR_WEIGHT = 3  # 베이지안 평균의 C: 후기 1개짜리 5점 가게가 1등 되는 걸 막아요
DEFAULT_MEAN = 3.5  # 후기가 하나도 없을 때 쓰는 전체 평균(m)
DUPLICATE_RADIUS_M = 50  # 같은 이름이 이 안에 있으면 같은 가게로 봐요
MEETUP_SHOW_AFTER_START = timedelta(minutes=30)


# ───────────── 점수·요약 계산 ─────────────
class _Stats:
    """가게별 후기 수·별점 합·태그 수와 전체 평균을 한 번에 모아 둬요."""

    def __init__(self, session: Session):
        self.count: dict[int, int] = {}
        self.total: dict[int, int] = {}
        rows = session.exec(
            select(Review.restaurant_id, func.count(Review.id), func.sum(Review.rating)).group_by(Review.restaurant_id)
        ).all()
        for rid, n, s in rows:
            self.count[rid] = int(n)
            self.total[rid] = int(s or 0)
        all_n = sum(self.count.values())
        self.mean = (sum(self.total.values()) / all_n) if all_n else DEFAULT_MEAN

        self.tags: dict[int, Counter] = defaultdict(Counter)
        tag_rows = session.exec(
            select(Review.restaurant_id, ReviewTag.tag, func.count())
            .join(Review, Review.id == ReviewTag.review_id)
            .group_by(Review.restaurant_id, ReviewTag.tag)
        ).all()
        for rid, tag, n in tag_rows:
            self.tags[rid][tag] = int(n)

    def score(self, rid: int) -> float:
        n, s = self.count.get(rid, 0), self.total.get(rid, 0)
        return round((PRIOR_WEIGHT * self.mean + s) / (PRIOR_WEIGHT + n), 3)

    def top_tags(self, rid: int) -> list[str]:
        order = {t: i for i, t in enumerate(TAGS)}
        items = sorted(self.tags[rid].items(), key=lambda kv: (-kv[1], order.get(kv[0], 99)))
        return [t for t, _ in items[:3]]


def _summary(r: Restaurant, stats: _Stats, origin: tuple[float, float] | None = None) -> dict:
    n = stats.count.get(r.id, 0)
    distance = None
    if origin is not None:
        distance = int(round(haversine_m(origin[0], origin[1], r.lat, r.lng)))
    return {
        "id": ids.encode(ids.RESTAURANT, r.id),
        "name": r.name,
        "category": r.category,
        "address": r.address,
        "lat": r.lat,
        "lng": r.lng,
        "phone": r.phone,
        "kakao_place_id": r.kakao_place_id,
        "rating_avg": round(stats.total.get(r.id, 0) / n, 2) if n else None,
        "review_count": n,
        "score": stats.score(r.id),
        "top_tags": stats.top_tags(r.id),
        "distance_m": distance,
        "created_at": timeutil.to_iso(r.created_at),
    }


def _detail(session: Session, r: Restaurant) -> dict:
    stats = _Stats(session)
    data = _summary(r, stats)
    distribution = {str(i): 0 for i in range(1, 6)}
    for rating, n in session.exec(
        select(Review.rating, func.count()).where(Review.restaurant_id == r.id).group_by(Review.rating)
    ).all():
        distribution[str(rating)] = int(n)

    # 이 가게로 잡힌 다가오는 밥친구 모임 (시작 후 30분까지 보여요)
    since = timeutil.now_utc() - MEETUP_SHOW_AFTER_START
    meetups = session.exec(
        select(Meetup)
        .where(Meetup.restaurant_id == r.id, Meetup.status != "cancelled", Meetup.meal_time >= since)
        .order_by(Meetup.meal_time)
    ).all()
    member_counts = _member_counts(session, [m.id for m in meetups])

    data.update(
        {
            "description": r.description,
            "rating_distribution": distribution,
            "tag_counts": dict(stats.tags[r.id]),
            "upcoming_meetups": [
                {
                    "id": ids.encode(ids.MEETUP, m.id),
                    "title": m.title,
                    "meal_time": timeutil.to_iso(m.meal_time),
                    "member_count": member_counts.get(m.id, 0),
                    "max_people": m.max_people,
                    "status": m.status,
                }
                for m in meetups
            ],
        }
    )
    return data


def _member_counts(session: Session, meetup_ids: list[int]) -> dict[int, int]:
    if not meetup_ids:
        return {}
    rows = session.exec(
        select(MeetupMember.meetup_id, func.count())
        .where(MeetupMember.meetup_id.in_(meetup_ids))
        .group_by(MeetupMember.meetup_id)
    ).all()
    return {mid: int(n) for mid, n in rows}


def _review_views(session: Session, reviews: list[Review], me: User | None) -> list[dict]:
    """후기 목록에 작성자·태그·도움돼요 수·내 표시를 붙여요."""
    if not reviews:
        return []
    review_ids = [v.id for v in reviews]
    user_ids = {v.user_id for v in reviews}
    nicknames = {u.id: u.nickname for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    tags: dict[int, list[str]] = defaultdict(list)
    for t in session.exec(select(ReviewTag).where(ReviewTag.review_id.in_(review_ids))).all():
        tags[t.review_id].append(t.tag)
    likes = dict(
        session.exec(
            select(ReviewLike.review_id, func.count())
            .where(ReviewLike.review_id.in_(review_ids))
            .group_by(ReviewLike.review_id)
        ).all()
    )
    liked: set[int] = set()
    if me is not None:
        liked = set(
            session.exec(
                select(ReviewLike.review_id).where(ReviewLike.review_id.in_(review_ids), ReviewLike.user_id == me.id)
            ).all()
        )
    order = {t: i for i, t in enumerate(TAGS)}
    return [
        {
            "id": ids.encode(ids.REVIEW, v.id),
            "restaurant_id": ids.encode(ids.RESTAURANT, v.restaurant_id),
            "rating": v.rating,
            "content": v.content,
            "tags": sorted(tags[v.id], key=lambda t: order.get(t, 99)),
            "author_nickname": nicknames.get(v.user_id, "알 수 없음"),
            "like_count": int(likes.get(v.id, 0)),
            "liked_by_me": v.id in liked,
            "is_mine": me is not None and v.user_id == me.id,
            "created_at": timeutil.to_iso(v.created_at),
        }
        for v in reviews
    ]


def _get_restaurant(session: Session, restaurant_id: str) -> Restaurant:
    rid = ids.decode(ids.RESTAURANT, restaurant_id, "가게를 찾을 수 없어요.")
    r = session.get(Restaurant, rid)
    if r is None:
        raise not_found("가게를 찾을 수 없어요.")
    return r


def _get_review(session: Session, review_id: str) -> Review:
    vid = ids.decode(ids.REVIEW, review_id, "후기를 찾을 수 없어요.")
    v = session.get(Review, vid)
    if v is None:
        raise not_found("후기를 찾을 수 없어요.")
    return v


def _add_review(session: Session, restaurant_id: int, user_id: int, body: ReviewIn) -> Review:
    """후기 + 태그를 넣어요. 같은 가게에 두 번째 후기면 409예요 (커밋은 부르는 쪽에서)."""
    exists = session.exec(
        select(Review.id).where(Review.restaurant_id == restaurant_id, Review.user_id == user_id)
    ).first()
    if exists is not None:
        raise conflict("이 가게에는 이미 후기를 남겼어요. (1인 1후기)")
    review = Review(
        restaurant_id=restaurant_id,
        user_id=user_id,
        rating=body.rating,
        content=body.content,
        created_at=timeutil.now_utc(),
    )
    session.add(review)
    session.flush()  # review.id를 받아요
    for tag in body.tags:
        session.add(ReviewTag(review_id=review.id, tag=tag))
    return review


def _latest_change(session: Session, restaurant_id: int | None = None) -> str | None:
    """목록의 updated_at: 가게 등록·후기 작성 중 가장 최근 시각."""
    review_q = select(func.max(Review.created_at))
    if restaurant_id is not None:
        review_q = review_q.where(Review.restaurant_id == restaurant_id)
        latest = [session.exec(review_q).one()]
    else:
        latest = [session.exec(review_q).one(), session.exec(select(func.max(Restaurant.created_at))).one()]
    values = [timeutil.as_aware(v) for v in latest if v is not None]
    return timeutil.to_iso(max(values)) if values else None


# ───────────── 엔드포인트 ─────────────
@router.get("/restaurants/meta", response_model=MetaOut, summary="카테고리·태그 선택지")
def meta():
    return {"categories": CATEGORIES, "tags": TAGS}


@router.get("/restaurants/place-search", response_model=Page[PlaceOut], summary="카카오 장소 검색 프록시")
def place_search(
    q: str = Query(min_length=1, max_length=50, description="예: 국밥"),
    _user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    places = kakao.search_places(q.strip())
    place_ids = [p["kakao_place_id"] for p in places]
    registered = {}
    if place_ids:
        registered = {
            r.kakao_place_id: r.id
            for r in session.exec(select(Restaurant).where(Restaurant.kakao_place_id.in_(place_ids))).all()
        }
    for p in places:
        p["already_registered_id"] = ids.encode(ids.RESTAURANT, registered.get(p["kakao_place_id"]))
    return make_page(places, len(places), None)


@router.get("/restaurants", response_model=Page[RestaurantOut], summary="맛집 목록 (필터·정렬)")
def list_restaurants(
    category: Category | None = None,
    tag: Tag | None = Query(None, description="이 태그가 붙은 후기가 하나라도 있는 가게"),
    q: str | None = Query(None, max_length=40, description="이름 검색"),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_m: float | None = Query(None, gt=0, le=50_000),
    sort: Literal["score", "distance", "recent", "reviews"] = "score",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    if (lat is None) != (lng is None):
        raise validation("lat과 lng는 함께 보내 주세요.")
    origin = (lat, lng) if lat is not None and lng is not None else None
    if sort == "distance" and origin is None:
        raise validation("거리순 정렬은 lat, lng가 필요해요.")
    if radius_m is not None and origin is None:
        raise validation("반경 검색은 lat, lng가 필요해요.")

    stmt = select(Restaurant)
    if category:
        stmt = stmt.where(Restaurant.category == category)
    if q and q.strip():
        stmt = stmt.where(Restaurant.name.contains(q.strip(), autoescape=True))
    if tag:
        tagged = (
            select(Review.restaurant_id).join(ReviewTag, ReviewTag.review_id == Review.id).where(ReviewTag.tag == tag)
        )
        stmt = stmt.where(Restaurant.id.in_(tagged))

    stats = _Stats(session)
    items = [_summary(r, stats, origin) for r in session.exec(stmt).all()]
    if radius_m is not None:
        items = [it for it in items if it["distance_m"] <= radius_m]

    if sort == "distance":
        items.sort(key=lambda x: (x["distance_m"], -x["score"]))
    elif sort == "recent":
        items.sort(key=lambda x: (x["created_at"], int(x["id"][4:])), reverse=True)
    elif sort == "reviews":
        items.sort(key=lambda x: (x["review_count"], x["score"]), reverse=True)
    else:  # score (추천순)
        items.sort(key=lambda x: (x["score"], x["review_count"]), reverse=True)

    total = len(items)
    return make_page(items[offset : offset + limit], total, _latest_change(session))


@router.post("/restaurants", status_code=201, response_model=RestaurantDetailOut, summary="맛집 추천 (첫 후기 포함)")
def create_restaurant(
    body: RestaurantIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    if not in_service_area(body.lat, body.lng):
        raise validation("현풍 캠퍼스 주변 가게만 등록할 수 있어요.")

    # 중복 방지 1: 같은 카카오 장소
    if body.kakao_place_id:
        same = session.exec(select(Restaurant).where(Restaurant.kakao_place_id == body.kakao_place_id)).first()
        if same:
            raise conflict(
                "이미 등록된 가게예요. 후기를 남겨 주세요!",
                {"restaurant_id": ids.encode(ids.RESTAURANT, same.id)},
            )
    # 중복 방지 2: 같은 이름이 50m 안에
    for r in session.exec(select(Restaurant).where(Restaurant.name == body.name)).all():
        if haversine_m(body.lat, body.lng, r.lat, r.lng) <= DUPLICATE_RADIUS_M:
            raise conflict(
                "이미 등록된 가게예요. 후기를 남겨 주세요!",
                {"restaurant_id": ids.encode(ids.RESTAURANT, r.id)},
            )

    restaurant = Restaurant(
        name=body.name,
        category=body.category,
        address=body.address,
        lat=body.lat,
        lng=body.lng,
        phone=body.phone,
        kakao_place_id=body.kakao_place_id,
        description=body.description,
        created_by=user.id,
        created_at=timeutil.now_utc(),
    )
    session.add(restaurant)
    try:
        session.flush()
        _add_review(session, restaurant.id, user.id, body.first_review)
        session.commit()
    except IntegrityError as exc:  # 동시에 같은 카카오 장소가 등록된 경우
        session.rollback()
        raise conflict("이미 등록된 가게예요. 후기를 남겨 주세요!") from exc
    session.refresh(restaurant)

    detail = _detail(session, restaurant)
    tasks.add_task(hub.broadcast, "restaurant.created", _summary(restaurant, _Stats(session)))
    return detail


@router.get("/restaurants/{restaurant_id}", response_model=RestaurantDetailOut, summary="맛집 상세")
def get_restaurant(
    restaurant_id: str,
    _user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    return _detail(session, _get_restaurant(session, restaurant_id))


@router.get("/restaurants/{restaurant_id}/reviews", response_model=Page[ReviewOut], summary="후기 목록")
def list_reviews(
    restaurant_id: str,
    sort: Literal["helpful", "recent"] = "helpful",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(optional_user),
    session: Session = Depends(get_session),
):
    r = _get_restaurant(session, restaurant_id)
    reviews = list(session.exec(select(Review).where(Review.restaurant_id == r.id)).all())
    views = _review_views(session, reviews, user)
    if sort == "recent":
        views.sort(key=lambda x: (x["created_at"], int(x["id"][4:])), reverse=True)
    else:  # helpful: 도움돼요 많은 순 → 최신
        views.sort(key=lambda x: (x["like_count"], x["created_at"], int(x["id"][4:])), reverse=True)
    return make_page(views[offset : offset + limit], len(views), _latest_change(session, r.id))


@router.post("/restaurants/{restaurant_id}/reviews", status_code=201, response_model=ReviewOut, summary="후기 남기기")
def create_review(
    restaurant_id: str,
    body: ReviewIn,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    r = _get_restaurant(session, restaurant_id)
    try:
        review = _add_review(session, r.id, user.id, body)
        session.commit()
    except IntegrityError as exc:  # 동시에 두 번 눌린 경우
        session.rollback()
        raise conflict("이 가게에는 이미 후기를 남겼어요. (1인 1후기)") from exc
    session.refresh(review)
    tasks.add_task(hub.broadcast, "restaurant.updated", _summary(r, _Stats(session)))
    return _review_views(session, [review], user)[0]


@router.delete("/reviews/{review_id}", status_code=204, summary="내 후기 지우기")
def delete_review(
    review_id: str,
    tasks: BackgroundTasks,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    review = _get_review(session, review_id)
    if review.user_id != user.id:
        raise forbidden("내 후기만 지울 수 있어요.")
    restaurant = session.get(Restaurant, review.restaurant_id)
    # 외래키 때문에 태그·도움돼요를 먼저 지워요
    for like in session.exec(select(ReviewLike).where(ReviewLike.review_id == review.id)).all():
        session.delete(like)
    for tag in session.exec(select(ReviewTag).where(ReviewTag.review_id == review.id)).all():
        session.delete(tag)
    session.flush()
    session.delete(review)
    session.commit()
    if restaurant is not None:
        tasks.add_task(hub.broadcast, "restaurant.updated", _summary(restaurant, _Stats(session)))
    return Response(status_code=204)


@router.post("/reviews/{review_id}/like", response_model=LikeOut, summary="도움돼요 켜기/끄기")
def toggle_like(
    review_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    review = _get_review(session, review_id)
    if review.user_id == user.id:
        raise forbidden("내 후기에는 도움돼요를 누를 수 없어요.")
    existing = session.get(ReviewLike, (review.id, user.id))
    if existing:
        session.delete(existing)
        liked = False
    else:
        session.add(ReviewLike(review_id=review.id, user_id=user.id, created_at=timeutil.now_utc()))
        liked = True
    session.commit()
    count = session.exec(select(func.count()).where(ReviewLike.review_id == review.id)).one()
    return {"liked": liked, "like_count": int(count)}
