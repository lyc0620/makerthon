"""SQLModel 테이블. Alembic이 메타데이터를 찾을 수 있도록 여기서 모두 import한다."""

from app.models.building import Building
from app.models.bus import BusStop
from app.models.crawl_log import CrawlLog
from app.models.seminar import Seminar

__all__ = ["Building", "BusStop", "CrawlLog", "Seminar"]
