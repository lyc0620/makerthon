import asyncio
import json
from datetime import date, datetime
from pathlib import Path

import httpx
import pytest
from sqlmodel import select

from app.core.time import KST
from app.models import CrawlLog, Seminar
from app.services.seminar.base import CrawlAuthError, ListItem
from app.services.seminar.cookies import CookieFormatError, CookieStore, parse_cookie_export
from app.services.seminar.pipeline import (
    STATUS_AUTH_EXPIRED,
    run_seminar_crawl,
    should_wait_for_cookies,
)
from app.services.seminar.portal import (
    PortalCrawler,
    guess_category,
    guess_host,
    parse_detail_page,
    parse_list_page,
)

FIX = Path(__file__).parent / "fixtures"
SSO_RELAY = (
    '<script>var sendUrl = "https://isign.dgist.ac.kr/login.html"; sendForm.submit();</script>'
)


def fx(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


# ---------- 파싱 ----------


def test_parse_list_page():
    items = parse_list_page(fx("portal_list.html"), "https://x")
    assert [i.source_id for i in items] == ["130000", "139604", "139582"]
    it = items[1]
    assert it.title.startswith("[뇌과학과 세미나] Sebastien Royer")
    assert it.posted == date(2026, 11, 19)
    assert it.url.endswith("viewBbs.do?NOTIWR_NO=139604&BOARD_ID=BD000254")


def test_parse_detail_page():
    item = ListItem("139604", "https://x/139604", "목록 제목", date(2026, 11, 19))
    s = parse_detail_page(fx("portal_detail_139604.html"), item)
    assert s.title == "[뇌과학과 세미나] Sebastien Royer, Ph.D.(KIST), 11월 25일 16:00pm, E4-114"
    assert s.start_at == datetime(2026, 11, 25, 16, 0, tzinfo=KST)
    assert s.place_raw == "E4-114"
    assert s.host == "뇌과학과 세미나"
    assert s.category == "seminar"


def test_parse_detail_without_title_uses_list_title():
    item = ListItem("139582", "u", "[연구본부지원팀] 2026년 제4회 D-Bridge 세미나 안내", None)
    s = parse_detail_page(fx("portal_detail_139582.html"), item)
    assert s.title == item.title
    assert s.start_at == datetime(2026, 11, 24, 12, 0, tzinfo=KST)
    assert s.end_at == datetime(2026, 11, 24, 13, 30, tzinfo=KST)
    assert s.place_raw == "R1-301호 대회의실"
    assert s.host == "연구본부지원팀"


def test_parse_detail_structure_changed():
    with pytest.raises(ValueError):
        parse_detail_page("<html></html>", ListItem("1", "u"))


@pytest.mark.parametrize(
    "title, cat",
    [
        ("[화학물리학과] 2026 특별 세미나", "seminar"),
        ("[뇌과학과] 슬기로운 뇌!생활 강연", "lecture"),
        ("2026 향기콘서트", "event"),
        ("Joint Research Symposium 2026", "seminar"),
        ("안내", "other"),
    ],
)
def test_guess_category(title, cat):
    assert guess_category(title) == cat


def test_guess_host():
    assert guess_host("[기술경영학과] 심포지엄") == "기술경영학과"
    assert guess_host("[제목] [연구본부지원팀] 세미나") is None
    assert guess_host("「DGIST 초청세미나」") is None


# ---------- 쿠키 ----------


def test_parse_cookie_export_formats():
    editor = json.dumps(
        [
            {"name": "JSESSIONID", "value": "abc", "domain": "stuecm.dgist.ac.kr", "path": "/"},
            {"name": "sso", "value": "t", "domain": ".dgist.ac.kr"},
            {"name": "evil", "value": "x", "domain": ".example.com"},  # 다른 도메인은 버림
        ]
    )
    assert [c["name"] for c in parse_cookie_export(editor)] == ["JSESSIONID", "sso"]
    assert len(parse_cookie_export(json.dumps({"cookies": json.loads(editor)}))) == 2
    header = parse_cookie_export("Cookie: JSESSIONID=abc; WMONID=z9")
    assert header[0] == {
        "name": "JSESSIONID",
        "value": "abc",
        "domain": "stuecm.dgist.ac.kr",
        "path": "/",
    }
    with pytest.raises(CookieFormatError):
        parse_cookie_export("")
    # 쿠키 대신 명령어를 붙여넣은 경우 (실제로 있었던 실수)
    with pytest.raises(CookieFormatError):
        parse_cookie_export(
            "Invoke-RestMethod -Method Put -Uri http://localhost:8000/x -Headers @{ 'X-Admin-Token' = $t }"
        )
    with pytest.raises(CookieFormatError):
        parse_cookie_export('[{"name": "a", "value": "b", "domain": "evil.com"}]')


def test_cookie_store_roundtrip(tmp_path):
    store = CookieStore(tmp_path / "c.json")
    assert not store.exists() and store.updated_at() is None
    assert store.import_raw("JSESSIONID=abc") == 1
    jar = store.load()
    assert jar.get("JSESSIONID", domain="stuecm.dgist.ac.kr") == "abc"


# ---------- 크롤러 (가짜 서버) ----------


def _portal(tmp_path, handler, with_cookies=True):
    store = CookieStore(tmp_path / "cookies.json")
    if with_cookies:
        store.import_raw("JSESSIONID=abc")
    return PortalCrawler(store, delay_seconds=0, transport=httpx.MockTransport(handler)), store


def _fake_portal(request: httpx.Request) -> httpx.Response:
    assert "JSESSIONID=abc" in request.headers.get("cookie", "")
    if request.url.path.endswith("listBbs.do"):
        return httpx.Response(200, text=fx("portal_list.html"))
    no = request.url.params["NOTIWR_NO"]
    if no == "130000":
        return httpx.Response(
            200,
            text='<table class="boardView"><tr><td class="boardViewBody">안내</td></tr></table>',
        )
    return httpx.Response(
        200,
        text=fx(f"portal_detail_{no}.html"),
        headers={"set-cookie": "JSESSIONID=renewed; Domain=stuecm.dgist.ac.kr; Path=/"},
    )


def test_crawl_saves_seminars_and_renews_cookies(session, tmp_path):
    crawler, store = _portal(tmp_path, _fake_portal)
    entry = asyncio.run(run_seminar_crawl(session, crawler, pages=1, only_new=False))
    assert entry.status == "success" and entry.item_count == 2  # 일시 없는 공지글은 저장 안 함
    rows = {s.id: s for s in session.exec(select(Seminar)).all()}
    assert set(rows) == {"sem_portal_139604", "sem_portal_139582"}
    assert rows["sem_portal_139604"].source_id == "portal:139604"
    # 서버가 갱신해 준 세션 쿠키를 저장한다
    assert store.load().get("JSESSIONID", domain="stuecm.dgist.ac.kr") == "renewed"


def test_incremental_crawl_fetches_only_new(session, tmp_path):
    calls: list[str] = []

    def handler(request):
        calls.append(request.url.params.get("NOTIWR_NO", "list"))
        return _fake_portal(request)

    crawler, _ = _portal(tmp_path, handler)
    asyncio.run(run_seminar_crawl(session, crawler, pages=1, only_new=False))
    calls.clear()
    asyncio.run(run_seminar_crawl(session, crawler, pages=1, only_new=True))
    # 이미 있는 글과, 일시가 없어 건너뛴 글은 다시 받지 않는다 → 목록 요청 1번뿐
    assert calls == ["list"]


def test_auth_expired(session, tmp_path):
    def sso(request):
        return httpx.Response(200, text=SSO_RELAY)

    crawler, store = _portal(tmp_path, sso)
    before = store.load().get("JSESSIONID", domain="stuecm.dgist.ac.kr")
    entry = asyncio.run(run_seminar_crawl(session, crawler))
    assert entry.status == STATUS_AUTH_EXPIRED
    assert store.load().get("JSESSIONID", domain="stuecm.dgist.ac.kr") == before  # 덮어쓰지 않음
    # 새 쿠키가 들어오기 전까지는 기다린다
    assert should_wait_for_cookies(session, store.updated_at()) is True
    assert should_wait_for_cookies(session, datetime(2999, 1, 1, tzinfo=KST)) is False


def test_no_cookie_file_is_auth_error(tmp_path):
    crawler, _ = _portal(tmp_path, _fake_portal, with_cookies=False)
    with pytest.raises(CrawlAuthError):
        asyncio.run(crawler.fetch_list())


# ---------- 관리자 API ----------


@pytest.fixture
def admin_client(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret-token")
    monkeypatch.setenv("PORTAL_COOKIE_FILE", str(tmp_path / "pc.json"))
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_admin_cookie_upload(admin_client, client, tmp_path):
    url = "/api/v1/admin/portal-cookies"
    assert client.put(url, content="JSESSIONID=abc").status_code == 401
    r = client.put(url, content="JSESSIONID=abc", headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHORIZED"

    r = client.put(url, content="JSESSIONID=abc", headers={"X-Admin-Token": "secret-token"})
    assert r.status_code == 200
    assert r.json() == {"saved": 1, "crawl_started": False}  # 테스트는 mock 크롤러
    assert (tmp_path / "pc.json").exists()

    r = client.put(url, content="", headers={"X-Admin-Token": "secret-token"})
    assert r.status_code == 400

    r = client.get("/api/v1/admin/crawl-status", headers={"X-Admin-Token": "secret-token"})
    assert r.status_code == 200 and r.json()["cookies_updated_at"]


def test_admin_disabled_without_token(client):
    r = client.get("/api/v1/admin/crawl-status", headers={"X-Admin-Token": "x"})
    assert r.status_code == 403


def test_crawl_log_model_used(session):
    # crawl_logs 는 job 별로 쌓인다 (관리자 상태 화면용)
    session.add(
        CrawlLog(job="seminar", started_at=datetime(2026, 1, 1, tzinfo=KST), status="success")
    )
    session.commit()
    assert session.exec(select(CrawlLog)).first().status == "success"
