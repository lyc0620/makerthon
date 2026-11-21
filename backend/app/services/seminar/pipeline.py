"""세미나 수집 파이프라인: 목록 → (새 글만) 상세 → 장소 매핑 → source_id 기준 upsert → crawl_logs.

두 가지 모드
  - 변경 감지 (only_new=True, pages=1): 10분마다. 목록 1페이지만 받고 DB에 없는 글의 상세만 받는다.
    새 글이 없으면 요청은 목록 1번뿐이다.
  - 전체 확인 (only_new=False, pages=N): 하루 1번. 최근 N페이지의 상세를 모두 다시 받아 수정 사항 반영.

로그인 만료(CrawlAuthError) 후에는 쿠키가 새로 들어올 때까지 시도하지 않는다 (SSO에 반복 요청 방지).
"""

import logging
from datetime import datetime

import httpx
from sqlmodel import Session, col, select

from app.core.config import Settings
from app.core.time import now_kst
from app.models import Building, CrawlLog, Seminar
from app.services.seminar.base import CrawlAuthError, SeminarCrawler
from app.services.seminar.mapping import match_place

log = logging.getLogger(__name__)

STATUS_AUTH_EXPIRED = "auth_expired"


def make_crawler(settings: Settings) -> SeminarCrawler:
    if settings.seminar_source == "mock":
        from app.services.seminar.mock import MockSeminarCrawler

        return MockSeminarCrawler()
    from app.services.seminar.cookies import CookieStore
    from app.services.seminar.portal import PortalCrawler

    return PortalCrawler(CookieStore(settings.resolved_cookie_file), settings.crawl_delay_seconds)


def seminar_keys(crawler_name: str, source_id: str) -> tuple[str, str]:
    """(DB의 source_id, API의 id). 수집처가 여러 개여도 겹치지 않게 수집처 이름을 붙인다."""
    return f"{crawler_name}:{source_id}", f"sem_{crawler_name}_{source_id}"


# 일시를 못 찾아 저장하지 않은 글. 변경 감지 때마다 상세를 다시 받지 않도록 기억한다 (재시작 시 초기화)
_skipped: set[str] = set()


async def run_seminar_crawl(
    session: Session, crawler: SeminarCrawler, pages: int = 1, only_new: bool = False
) -> CrawlLog:
    entry = CrawlLog(job="seminar", started_at=now_kst())
    session.add(entry)
    session.commit()

    ok = False
    try:
        buildings = list(session.exec(select(Building)).all())
        items = await crawler.fetch_list(pages)
        if only_new:
            keys = {seminar_keys(crawler.name, it.source_id)[0]: it for it in items}
            existing = set(
                session.exec(
                    select(Seminar.source_id).where(col(Seminar.source_id).in_(keys))
                ).all()
            )
            items = [it for k, it in keys.items() if k not in existing and k not in _skipped]

        count = 0
        for item in items:
            try:
                raw = await crawler.parse_detail(item)
            except CrawlAuthError:
                raise
            except Exception as exc:  # 한 건 실패로 전체를 멈추지 않는다
                log.warning("parse_detail failed for %s: %r", item.source_id, exc)
                continue
            source_key, sem_id = seminar_keys(crawler.name, item.source_id)
            if raw is None:
                _skipped.add(source_key)
                # 예전 파서로 잘못 저장된 글이면 지운다 (예: 신청 마감일을 행사일로 잡은 경우)
                if stale := session.exec(
                    select(Seminar).where(Seminar.source_id == source_key)
                ).first():
                    session.delete(stale)
                    session.commit()
                continue
            place = match_place(raw.place_raw, buildings)
            row = session.exec(select(Seminar).where(Seminar.source_id == source_key)).first()
            row = row or Seminar(
                id=sem_id,
                source_id=source_key,
                title="",
                start_at=raw.start_at,
                updated_at=now_kst(),
            )
            row.title = raw.title
            row.category = raw.category
            row.start_at = raw.start_at
            row.end_at = raw.end_at
            row.place_raw = raw.place_raw
            row.building_id = place.building_id
            row.room = place.room
            row.lat = place.lat
            row.lng = place.lng
            row.host = raw.host
            row.source_url = raw.source_url
            row.updated_at = now_kst()
            session.add(row)
            session.commit()  # 한 건씩 저장 (중간에 세션이 끊겨도 앞의 결과는 남는다)
            count += 1
        entry.status = "success"
        entry.item_count = count
        ok = True
    except CrawlAuthError as exc:
        log.warning("seminar crawl: %s", exc)
        session.rollback()
        entry.status = STATUS_AUTH_EXPIRED
        entry.error = str(exc)
    except Exception as exc:
        log.exception("seminar crawl failed")
        session.rollback()
        entry.status = "failed"
        entry.error = repr(exc)[:2000]
    finally:
        close = getattr(crawler, "close", None)
        if close is not None:
            await close(save_cookies=ok)

    entry.finished_at = now_kst()
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def last_log(session: Session) -> CrawlLog | None:
    return session.exec(
        select(CrawlLog).where(CrawlLog.job == "seminar").order_by(col(CrawlLog.id).desc()).limit(1)
    ).first()


def should_wait_for_cookies(session: Session, cookies_updated_at: datetime | None) -> bool:
    """직전 시도가 로그인 만료였고 그 뒤로 쿠키가 바뀌지 않았으면 True."""
    last = last_log(session)
    if last is None or last.status != STATUS_AUTH_EXPIRED:
        return False
    # started_at 은 초 단위로 저장되므로 같은 단위로 비교
    return (
        cookies_updated_at is None or cookies_updated_at.replace(microsecond=0) <= last.started_at
    )


async def notify(webhook_url: str, message: str) -> None:
    """디스코드 웹훅 알림 (설정돼 있을 때만). 실패해도 수집에는 영향 없음."""
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(webhook_url, json={"content": message})
    except Exception as exc:
        log.warning("webhook failed: %r", exc)


def remap_places(session: Session) -> int:
    """저장된 세미나의 장소를 현재 건물 목록으로 다시 매핑한다 (buildings.json 수정 반영용).

    바뀐 행 수를 돌려준다. 네트워크 요청 없음.
    """
    buildings = list(session.exec(select(Building)).all())
    changed = 0
    for s in session.exec(select(Seminar)).all():
        m = match_place(s.place_raw, buildings)
        if (s.building_id, s.room, s.lat, s.lng) != (m.building_id, m.room, m.lat, m.lng):
            s.building_id, s.room, s.lat, s.lng = m.building_id, m.room, m.lat, m.lng
            session.add(s)
            changed += 1
    session.commit()
    return changed
