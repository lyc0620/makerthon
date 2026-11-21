from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class BusStop(SQLModel, table=True):
    __tablename__ = "bus_stops"

    id: str = Field(primary_key=True)  # stop_dgist_front
    name: str
    external_id: str | None = None  # 수집 대상(웹/API)이 쓰는 정류장 ID
    lat: float
    lng: float
    routes: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
