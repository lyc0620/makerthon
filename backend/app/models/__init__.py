"""SQLModel 테이블. Alembic·create_all 이 메타데이터를 찾을 수 있도록 여기서 모두 import한다."""

from app.models.building import Building
from app.models.bus import BusStop
from app.models.crawl_log import CrawlLog
from app.models.meetup import Meetup, MeetupMember, MeetupMessage
from app.models.report import Report, ReportVote
from app.models.restaurant import Restaurant, Review, ReviewLike, ReviewTag
from app.models.seminar import Seminar
from app.models.user import User

__all__ = [
    # 통합(버스·세미나)
    "Building",
    "BusStop",
    "CrawlLog",
    "Seminar",
    "User",
    # DB 파트 (맛집·제보·밥친구)
    "Restaurant",
    "Review",
    "ReviewTag",
    "ReviewLike",
    "Report",
    "ReportVote",
    "Meetup",
    "MeetupMember",
    "MeetupMessage",
]
