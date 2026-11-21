"""DB 파트 예시 데이터 넣기. 여러 번 실행해도 같은 데이터가 두 번 들어가지 않아요.

실행 (backend 폴더에서):
    uv run alembic upgrade head
    uv run python -m seed.db_sample

모든 예시 데이터에는 "[예시]"가 붙어 있어서 실제 데이터와 구분돼요.
가게 좌표·이름은 지어낸 값이에요 (실제 가게 아님).
"""

from datetime import timedelta

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core import timeutil
from app.core.db import create_db_and_tables, get_engine
from app.models import Meetup, MeetupMember, Report, Restaurant, Review, ReviewTag, User

USERS = ["[예시] 익명의 사슴", "[예시] 배고픈 고양이", "[예시] 졸린 수달"]

# (이름, 카테고리, 위도, 경도, 설명, [(작성자 번호, 별점, 내용, 태그)])
RESTAURANTS = [
    (
        "[예시] 든든국밥",
        "한식",
        35.7046,
        128.4574,
        "예시 데이터예요. 실제 가게가 아니에요.",
        [
            (0, 5, "[예시] 시험기간 밤에 가기 좋아요", ["늦게까지", "가성비"]),
            (1, 5, "[예시] 양이 많아서 든든해요", ["양많음", "가성비"]),
            (2, 5, "[예시] 혼자 가도 편해요", ["혼밥가능"]),
        ],
    ),
    (
        "[예시] 캠퍼스 카페",
        "카페",
        35.7027,
        128.4543,
        None,
        [
            (1, 5, "[예시] 조용해서 공부하기 좋아요", ["분위기"]),
        ],
    ),
    (
        "[예시] 매운 분식",
        "분식",
        35.7060,
        128.4595,
        None,
        [
            (0, 3, "[예시] 무난하게 먹기 좋아요", ["가성비", "배달"]),
            (2, 4, "[예시] 떡볶이가 맛있어요", ["학생할인"]),
        ],
    ),
]

# 지난 경찰 제보 (단속 다발 구역 통계용, 전부 만료된 상태) — (위도, 경도, 며칠 전, 서울 기준 시)
PAST_POLICE = [
    (35.7038, 128.4562, 2, 8),
    (35.7039, 128.4563, 9, 8),
    (35.7040, 128.4561, 16, 8),
    (35.7068, 128.4602, 5, 22),
    (35.7069, 128.4603, 12, 22),
]


def _get_or_create_user(session: Session, nickname: str) -> User:
    user = session.exec(select(User).where(User.nickname == nickname)).first()
    if user is None:
        user = User(nickname=nickname, created_at=timeutil.now_utc())
        session.add(user)
        session.flush()
    return user


def seed(engine: Engine | None = None) -> dict[str, int]:
    """예시 데이터를 넣고, 새로 넣은 개수를 돌려줘요."""
    engine = engine or get_engine()
    create_db_and_tables(engine)  # 테이블이 없으면 만들어요 (alembic을 먼저 돌렸으면 그대로)
    added = {"users": 0, "restaurants": 0, "reports": 0, "meetups": 0}
    now = timeutil.now_utc()

    with Session(engine) as session:
        before = len(session.exec(select(User).where(User.nickname.in_(USERS))).all())
        users = [_get_or_create_user(session, n) for n in USERS]
        added["users"] = len(USERS) - before

        first_restaurant = None
        for name, category, lat, lng, desc, reviews in RESTAURANTS:
            r = session.exec(select(Restaurant).where(Restaurant.name == name)).first()
            if r is None:
                r = Restaurant(
                    name=name,
                    category=category,
                    lat=lat,
                    lng=lng,
                    description=desc,
                    address="[예시] 대구 달성군 현풍읍",
                    created_by=users[reviews[0][0]].id,
                    created_at=now - timedelta(days=3),
                )
                session.add(r)
                session.flush()
                for author, rating, content, tags in reviews:
                    review = Review(
                        restaurant_id=r.id,
                        user_id=users[author].id,
                        rating=rating,
                        content=content,
                        created_at=now - timedelta(days=2),
                    )
                    session.add(review)
                    session.flush()
                    for tag in tags:
                        session.add(ReviewTag(review_id=review.id, tag=tag))
                added["restaurants"] += 1
            first_restaurant = first_restaurant or r

        # 지난 제보는 "예시" 표시가 있는 것만 세서 중복을 막아요
        has_reports = session.exec(select(Report).where(Report.description.like("[예시]%"))).first()
        if has_reports is None:
            for lat, lng, days_ago, hour in PAST_POLICE:
                local_day = timeutil.to_seoul(now - timedelta(days=days_ago))
                created = timeutil.to_utc(local_day.replace(hour=hour, minute=10, second=0, tzinfo=None))
                session.add(
                    Report(
                        type="police",
                        user_id=users[days_ago % 3].id,
                        lat=lat,
                        lng=lng,
                        description="[예시] 지난 단속 제보",
                        status="active",
                        created_at=created,
                        last_confirmed_at=created,
                        expires_at=created + timedelta(minutes=30),
                    )
                )
                added["reports"] += 1

        meetup = session.exec(select(Meetup).where(Meetup.title.like("[예시]%"))).first()
        if meetup is None or meetup.meal_time < now:
            # 예전에 넣은 예시 모임이 지났으면 새 시간으로 하나 더 만들어요
            local = timeutil.to_seoul(now + timedelta(days=1))
            meal_time = timeutil.to_utc(local.replace(hour=18, minute=0, second=0, tzinfo=None))
            meetup = Meetup(
                host_id=users[0].id,
                title="[예시] 내일 저녁 국밥 같이 드실 분",
                place_name=first_restaurant.name,
                restaurant_id=first_restaurant.id,
                lat=first_restaurant.lat,
                lng=first_restaurant.lng,
                meal_time=meal_time,
                max_people=4,
                note="[예시] 편하게 오세요",
                status="open",
                created_at=now,
            )
            session.add(meetup)
            session.flush()
            session.add(MeetupMember(meetup_id=meetup.id, user_id=users[0].id, joined_at=now))
            session.add(MeetupMember(meetup_id=meetup.id, user_id=users[1].id, joined_at=now))
            added["meetups"] += 1

        session.commit()
    return added


if __name__ == "__main__":
    result = seed()
    print("예시 데이터를 넣었어요 (새로 추가된 개수):", result)
    print("개발용 로그인 닉네임:", ", ".join(USERS))
