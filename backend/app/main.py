import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, func, select

from app.core.auth import decode_user_id
from app.core.config import BACKEND_DIR, get_settings
from app.core.db import create_db_and_tables, get_engine
from app.core.errors import install_error_handlers
from app.models import Seminar, User
from app.routers import (
    admin,
    buildings,
    bus,
    campus,
    dev_auth,
    health,
    meetups,
    presence,
    reports,
    restaurants,
    route,
    scans,
    seminars,
)
from app.scheduler import build_scheduler, crawl_seminars, refresh_bus
from app.seed_loader import load_seeds, load_shuttle_timetable
from app.services.bus.service import BusService, make_source
from app.services.meetup_notify import reminder_loop
from app.services.presence import cleanup_loop
from app.services.realtime import hub
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
    elif settings.is_dev:
        create_db_and_tables()  # 마이그레이션을 끈 개발 환경에서도 테이블은 있게
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
        # DB 파트: 실시간 위치 정리(30초마다), 밥약속 10분 전 알림(30초마다)
        tasks.append(asyncio.create_task(cleanup_loop()))
        tasks.append(asyncio.create_task(reminder_loop()))
    try:
        yield
    finally:
        if sched:
            sched.shutdown(wait=False)
        for t in tasks:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t


def _ws_user_id(token: str | None) -> int | None:
    """웹소켓 토큰 → 사용자 id. 틀리거나 사용자가 없으면 None(익명 연결)."""
    if not token:
        return None
    user_id = decode_user_id(token)
    if user_id is None:
        return None
    try:
        with Session(get_engine()) as session:
            return user_id if session.get(User, user_id) is not None else None
    except Exception:  # DB 를 못 읽어도 연결은 익명으로 받는다
        return None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="현풍 지도 API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for r in (health.router, buildings.router, bus.router, seminars.router, admin.router):
        app.include_router(r, prefix="/api/v1")
    # 길찾기·러닝 코스, 강의실 검색, 3D 실내 스캔 뷰어 (김도현)
    for r in (route.router, campus.router, scans.router):
        app.include_router(r, prefix="/api/v1")
    # DB 파트 라우터는 경로에 /api/v1 을 이미 포함한다
    for r in (restaurants.router, reports.router, meetups.router, presence.router):
        app.include_router(r)
    if settings.is_dev:
        app.include_router(dev_auth.router)  # 닉네임만으로 로그인 — 개발·시연용

    @app.websocket("/api/v1/ws")
    async def websocket_endpoint(ws: WebSocket, token: str | None = None):
        # ?token=<JWT> 가 맞으면 로그인한 연결, 아니면 공개 알림만 받는 익명 연결
        await hub.connect(ws, _ws_user_id(token))
        try:
            while True:
                await ws.receive_text()  # 연결 유지용 (내용은 쓰지 않음)
        except WebSocketDisconnect:
            await hub.disconnect(ws)

    return app


app = create_app()
