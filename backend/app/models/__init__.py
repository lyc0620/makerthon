"""모든 테이블을 여기서 불러와요. Alembic과 create_all이 이 목록을 봐요."""

from app.models.meetup import Meetup, MeetupMember, MeetupMessage
from app.models.report import Report, ReportVote
from app.models.restaurant import Restaurant, Review, ReviewLike, ReviewTag
from app.models.user import User

__all__ = [
    "User",
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
