"""버스 도착정보: 스케줄러가 refresh()로 캐시를 채우고, API는 get_arrivals()로 캐시만 읽는다."""

import logging
from dataclasses import replace
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core.config import Settings
from app.core.time import now_kst
from app.models import BusStop
from app.services.bus.base import Arrival, BusSource, Snapshot
from app.services.bus.shuttle import next_shuttles

log = logging.getLogger(__name__)


def make_source(settings: Settings) -> BusSource:
    if settings.bus_source == "mock":
        from app.services.bus.mock import MockBusSource

        return MockBusSource()
    if settings.bus_source == "crawl":
        from app.services.bus.crawl import CrawlBusSource

        return CrawlBusSource()
    raise NotImplementedError(f"BUS_SOURCE={settings.bus_source} 미구현")


class BusService:
    def __init__(self, source: BusSource, timetable: list[dict], stale_seconds: int = 180):
        self.source = source
        self.timetable = timetable
        self.stale_after = timedelta(seconds=stale_seconds)
        self.snapshot: Snapshot | None = None
        self.last_error: str | None = None

    async def refresh(self, session: Session) -> None:
        stops = list(session.exec(select(BusStop)).all())
        try:
            arrivals = await self.source.fetch(stops)
        except Exception as exc:  # 실패해도 마지막 캐시는 유지
            self.last_error = repr(exc)
            log.warning("bus refresh failed: %r", exc)
            return
        self.snapshot = Snapshot(fetched_at=now_kst(), arrivals=arrivals)
        self.last_error = None

    def is_stale(self, now: datetime) -> bool:
        return self.snapshot is None or now - self.snapshot.fetched_at > self.stale_after

    def get_arrivals(self, stop_id: str, now: datetime) -> list[Arrival]:
        realtime: list[Arrival] = []
        if self.snapshot is not None:
            # 캐시 시점 이후 흐른 시간만큼 ETA를 줄이고, 이미 지나간 것은 뺀다
            elapsed = int((now - self.snapshot.fetched_at).total_seconds() // 60)
            for a in self.snapshot.arrivals.get(stop_id, []):
                eta = a.eta_min - elapsed
                if eta >= 0:
                    realtime.append(replace(a, eta_min=eta))
        shuttles = next_shuttles(self.timetable, stop_id, now)
        return sorted(realtime + shuttles, key=lambda a: a.eta_min)

    @property
    def updated_at(self) -> datetime | None:
        return self.snapshot.fetched_at if self.snapshot else None
