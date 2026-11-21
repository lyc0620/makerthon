from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Building(SQLModel, table=True):
    __tablename__ = "buildings"

    id: str = Field(primary_key=True)  # bld_E7
    name: str
    aliases: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    lat: float
    lng: float
