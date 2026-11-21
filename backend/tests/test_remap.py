from datetime import datetime

from sqlmodel import select

from app.core.time import KST
from app.models import Building, Seminar
from app.services.seminar.pipeline import remap_places


def test_remap_places_applies_new_buildings(session):
    now = datetime(2026, 11, 21, tzinfo=KST)
    session.add(
        Seminar(
            id="sem_t_1",
            source_id="t:1",
            title="x",
            start_at=now,
            updated_at=now,
            place_raw="Z9-101호",  # 처음엔 없는 건물
        )
    )
    session.commit()
    assert remap_places(session) == 1  # room 만 잡힘
    s = session.exec(select(Seminar)).one()
    assert (s.building_id, s.room) == (None, "101")

    session.add(Building(id="bld_Z9", name="Z9", aliases=["Z9"], lat=1.5, lng=2.5))
    session.commit()
    assert remap_places(session) == 1
    s = session.exec(select(Seminar)).one()
    assert (s.building_id, s.room, s.lat, s.lng) == ("bld_Z9", "101", 1.5, 2.5)
    assert remap_places(session) == 0  # 바뀐 게 없으면 0
