from datetime import datetime
from typing import Literal

from pydantic import BaseModel as _BaseModel
from pydantic import ConfigDict


class BaseModel(_BaseModel):
    # ORM 객체(SQLModel)·dataclass 를 그대로 넘겨도 변환되게
    model_config = ConfigDict(from_attributes=True)


class ListResponse[T](BaseModel):
    items: list[T]
    count: int
    updated_at: datetime | None = None


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    time: datetime


class BuildingOut(BaseModel):
    id: str
    name: str
    aliases: list[str]
    lat: float
    lng: float


class BusStopOut(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    external_id: str | None
    routes: list[str]


class BusArrivalOut(BaseModel):
    route: str
    route_type: Literal["city", "shuttle"]
    direction: str | None
    eta_min: int
    stops_left: int | None
    departure_time: datetime | None
    source: Literal["realtime", "timetable"]


class StopArrivalsOut(BaseModel):
    stop_id: str
    arrivals: list[BusArrivalOut]


class BusArrivalsResponse(ListResponse[StopArrivalsOut]):
    is_stale: bool


SeminarCategory = Literal["seminar", "lecture", "event", "other"]


class SeminarOut(BaseModel):
    id: str
    title: str
    category: SeminarCategory
    start_at: datetime
    end_at: datetime | None
    place_raw: str | None
    building_id: str | None
    room: str | None
    lat: float | None
    lng: float | None
    host: str | None
    source_url: str | None
    updated_at: datetime
