"""APScheduler 작업 등록. FastAPI lifespan 에서 start/shutdown 한다 (Uvicorn 워커 1개 전제)."""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.core.time import KST
from app.models import CrawlLog
from app.services.bus.service import BusService
from app.services.seminar.base import SeminarCrawler
from app.services.seminar.cookies import CookieStore
from app.services.seminar.pipeline import (
    STATUS_AUTH_EXPIRED,
    notify,
    run_seminar_crawl,
    should_wait_for_cookies,
)

log = logging.getLogger(__name__)

# 변경 감지·전체 확인·관리자 수동 실행이 겹치지 않게 (크롤러 하나를 공유한다)
_seminar_lock = asyncio.Lock()


async def refresh_bus(bus: BusService) -> None:
    with Session(get_engine()) as session:
        await bus.refresh(session)


async def crawl_seminars(
    crawler: SeminarCrawler, pages: int = 1, only_new: bool = True, force: bool = False
) -> CrawlLog | None:
    settings = get_settings()
    async with _seminar_lock:
        with Session(get_engine()) as session:
            if crawler.name == "portal" and not force:
                store = CookieStore(settings.resolved_cookie_file)
                if should_wait_for_cookies(session, store.updated_at()):
                    log.info("seminar crawl skipped: 새 포탈 쿠키를 기다리는 중")
                    return None
            entry = await run_seminar_crawl(session, crawler, pages=pages, only_new=only_new)
            log.info("seminar crawl %s: %s건", entry.status, entry.item_count)
            if entry.status == STATUS_AUTH_EXPIRED:
                await notify(
                    settings.discord_webhook_url,
                    "⚠️ [현풍 지도] 포탈 로그인 세션이 만료되어 세미나 수집이 멈췄습니다. "
                    "브라우저에서 로그인 후 쿠키를 다시 넣어 주세요.",
                )
            return entry


def build_scheduler(
    settings: Settings, bus: BusService, crawler: SeminarCrawler
) -> AsyncIOScheduler:
    sched = AsyncIOScheduler(timezone=KST)
    sched.add_job(
        refresh_bus,
        "interval",
        seconds=settings.bus_refresh_seconds,
        args=[bus],
        id="bus_refresh",
        max_instances=1,
        coalesce=True,
    )
    # 변경 감지: 07~23시 N분마다 목록 1페이지 → 새 글만 상세 (이 요청이 세션 유지 역할도 한다)
    sched.add_job(
        crawl_seminars,
        CronTrigger(hour="7-23", minute=f"*/{settings.seminar_poll_minutes}", timezone=KST),
        kwargs={"crawler": crawler, "pages": 1, "only_new": True},
        id="seminar_poll",
        max_instances=1,
        coalesce=True,
    )
    # 전체 확인: 매일 05시, 최근 N페이지 상세를 다시 받아 수정 사항 반영
    sched.add_job(
        crawl_seminars,
        CronTrigger(hour=5, minute=0, timezone=KST),
        kwargs={"crawler": crawler, "pages": settings.seminar_full_pages, "only_new": False},
        id="seminar_full",
        max_instances=1,
        coalesce=True,
    )
    return sched
