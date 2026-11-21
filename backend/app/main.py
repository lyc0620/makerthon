import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, func, select

from app.core.config import BACKEND_DIR, get_settings
from app.core.db import get_engine
from app.core.errors import register_error_handlers
from app.models import Seminar
from app.routers import admin, buildings, bus, health, seminars
from app.scheduler import build_scheduler, crawl_seminars, refresh_bus
from app.seed_loader import load_seeds, load_shuttle_timetable
from app.services.bus.service import BusService, make_source
from app.services.seminar.pipeline import make_crawler, remap_places

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


def run_migrations() -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(BACKEND_DIR) / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().resolved_database_url)
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.auto_migrate:
        run_migrations()
    with Session(get_engine()) as session:
        log.info("seed loaded: %s", load_seeds(session))
        log.info("seminar places re-mapped: %s", remap_places(session))
        has_seminars = session.exec(select(func.count()).select_from(Seminar)).one() > 0

    app.state.bus = BusService(
        make_source(settings), load_shuttle_timetable(), settings.bus_stale_seconds
    )
    crawler = make_crawler(settings)
    app.state.seminar_crawler = crawler

    sched = None
    tasks: list[asyncio.Task] = []
    if settings.scheduler_enabled:
        await refresh_bus(app.state.bus)  # 첫 30초 공백 줄이기
        # 시작 직후 세미나 1회 수집 (DB가 비어 있으면 최근 N페이지 전체). 서버 시작을 막지 않게 백그라운드로
        pages = 1 if has_seminars else settings.seminar_full_pages
        tasks.append(
            asyncio.create_task(crawl_seminars(crawler, pages=pages, only_new=has_seminars))
        )
        sched = build_scheduler(settings, app.state.bus, crawler)
        sched.start()
    try:
        yield
    finally:
        if sched:
            sched.shutdown(wait=False)
        for t in tasks:
            t.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="현풍 지도 API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    for r in (health.router, buildings.router, bus.router, seminars.router, admin.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
