from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol

from app.models import BusStop


@dataclass
class Arrival:
    route: str
    route_type: Literal["city", "shuttle"]
    direction: str | None
    eta_min: int
    stops_left: int | None = None
    departure_time: datetime | None = None
    source: Literal["realtime", "timetable"] = "realtime"


@dataclass
class Snapshot:
    """한 번의 수집 결과. stop_id(우리 ID) → 도착 목록."""

    fetched_at: datetime
    arrivals: dict[str, list[Arrival]] = field(default_factory=dict)


class BusSource(Protocol):
    """실시간 도착정보 수집기. mock / crawl(웹) / api(공공데이터) 구현이 이 규약을 따른다.

    실패하면 예외를 던진다. 캐시는 마지막 성공값을 유지한다.
    """

    async def fetch(self, stops: list[BusStop]) -> dict[str, list[Arrival]]: ...
