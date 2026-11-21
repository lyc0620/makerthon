# 통합 담당(lyc0620) 영역의 임시 대역 — 통합 때 그쪽 파일로 교체
"""FastAPI 앱 시작점.

실행: uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
워커 1개로 실행하는 전제예요 (WebSocket 허브가 메모리에 있어요).
"""

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core import timeutil
from app.core.auth import decode_user_id
from app.core.config import get_settings
from app.core.db import create_db_and_tables, get_engine
from app.core.errors import install_error_handlers
from app.models import User
from app.routers import dev_auth, meetups, presence, reports, restaurants
from app.services.meetup_notify import reminder_loop
from app.services.presence import cleanup_loop
from app.services.realtime import hub


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 개발 중에는 테이블이 없으면 바로 만들어요. 운영은 `alembic upgrade head`로 만들어요.
    if get_settings().is_dev:
        create_db_and_tables()
    # 실시간 위치(6.10): 시간이 다 됐거나 신호가 끊긴 사람을 30초마다 지워요
    cleanup = asyncio.create_task(cleanup_loop())
    # 밥약속 알림(6.12): 밥 시간 10분 전인 모임의 참여자에게 30초마다 확인해서 한 번 알려요
    reminder = asyncio.create_task(reminder_loop())
    yield
    for task in (cleanup, reminder):
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def _ws_user_id(token: str | None) -> int | None:
    """WebSocket 토큰을 사용자 id로 바꿔요. 틀리거나 사용자가 없으면 None(익명)이에요."""
    if not token:
        return None
    user_id = decode_user_id(token)
    if user_id is None:
        return None
    try:
        with Session(get_engine()) as session:
            return user_id if session.get(User, user_id) is not None else None
    except Exception:  # DB를 못 읽어도 연결은 익명으로 받아요
        return None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="현풍 지도 API (DB 파트)", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    @app.get("/api/v1/health", tags=["공통"], summary="서버 상태 확인")
    def health():
        return {"status": "ok", "time": timeutil.to_iso(timeutil.now_utc())}

    app.include_router(restaurants.router)
    app.include_router(reports.router)
    app.include_router(meetups.router)
    app.include_router(presence.router)
    if settings.is_dev:
        app.include_router(dev_auth.router)  # 개발용 로그인은 dev에서만 켜요

    @app.websocket("/api/v1/ws")
    async def websocket_endpoint(ws: WebSocket, token: str | None = None):
        # ?token=<JWT> 가 맞으면 로그인한 연결이에요. 없거나 틀리면 공개 알림만 받는 익명 연결이에요.
        await hub.connect(ws, _ws_user_id(token))
        try:
            while True:
                await ws.receive_text()  # 클라이언트가 보내는 내용은 쓰지 않아요 (연결 유지용)
        except WebSocketDisconnect:
            await hub.disconnect(ws)

    return app


app = create_app()
