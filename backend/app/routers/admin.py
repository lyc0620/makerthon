"""관리자 API — 포탈 쿠키 넣기, 수집 상태 확인. `X-Admin-Token` 헤더 필요."""

import hmac

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request
from pydantic import BaseModel
from sqlmodel import Session, col, select

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ApiError
from app.models import CrawlLog
from app.scheduler import crawl_seminars
from app.services.seminar.cookies import CookieFormatError, CookieStore

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(
    x_admin_token: str | None = Header(None), settings: Settings = Depends(get_settings)
) -> None:
    if not settings.admin_token:
        raise ApiError(403, "관리자 API가 꺼져 있습니다 (ADMIN_TOKEN 미설정).")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise ApiError(401, "관리자 토큰이 올바르지 않습니다.")


class CookieImportOut(BaseModel):
    saved: int
    crawl_started: bool


@router.put(
    "/portal-cookies", response_model=CookieImportOut, dependencies=[Depends(require_admin)]
)
async def put_portal_cookies(
    request: Request, background: BackgroundTasks, settings: Settings = Depends(get_settings)
):
    """본문에 쿠키를 그대로 보낸다 (Cookie-Editor JSON / Playwright storage_state / Cookie 헤더 문자열).

    저장 후 바로 세미나 수집을 한 번 돌려 쿠키가 유효한지 확인한다 (결과는 /admin/crawl-status).
    """
    raw = (await request.body()).decode("utf-8", errors="replace")
    try:
        saved = CookieStore(settings.resolved_cookie_file).import_raw(raw)
    except CookieFormatError as exc:
        raise ApiError(400, str(exc)) from exc

    crawler = request.app.state.seminar_crawler
    started = crawler.name == "portal"
    if started:
        background.add_task(
            crawl_seminars,
            crawler,
            pages=settings.seminar_full_pages,
            only_new=False,
            force=True,
        )
    return CookieImportOut(saved=saved, crawl_started=started)


@router.post("/seminar-crawl", dependencies=[Depends(require_admin)])
async def run_seminar_crawl_now(
    request: Request,
    background: BackgroundTasks,
    pages: int = 3,
    full: bool = True,
):
    """세미나 수집을 지금 한 번 돌린다. full=true 면 이미 있는 글도 다시 파싱 (파서 수정 후 사용)."""
    if not 1 <= pages <= 20:
        raise ApiError(400, "pages 는 1~20 입니다.")
    background.add_task(
        crawl_seminars,
        request.app.state.seminar_crawler,
        pages=pages,
        only_new=not full,
        force=True,
    )
    return {"started": True, "pages": pages, "full": full}


@router.get("/crawl-status", dependencies=[Depends(require_admin)])
def crawl_status(
    session: Session = Depends(get_session), settings: Settings = Depends(get_settings)
):
    logs = session.exec(select(CrawlLog).order_by(col(CrawlLog.id).desc()).limit(10)).all()
    store = CookieStore(settings.resolved_cookie_file)
    return {
        "seminar_source": settings.seminar_source,
        "cookies_updated_at": store.updated_at(),
        "logs": [
            {
                "job": entry.job,
                "status": entry.status,
                "started_at": entry.started_at,
                "finished_at": entry.finished_at,
                "item_count": entry.item_count,
                "error": entry.error,
            }
            for entry in logs
        ],
    }
