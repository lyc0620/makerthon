"""DGIST 학생포탈 "세미나 공지" 게시판 크롤러.

  목록  GET https://stuecm.dgist.ac.kr/s/potal_board/_0002/listBbs.do?BOARD_ID=BD000254&currentPage=N
        a.selectListTitle[href*=NOTIWR_NO]  (한 페이지 15건, 상단 공지글은 모든 페이지에 반복)
  상세  GET .../_0002/viewBbs.do?NOTIWR_NO=...&BOARD_ID=BD000254
        table.boardView  th strong b (제목, 없을 수 있음) / tr#cntn_kor_view td.boardViewBody (본문)

로그인: 계정에 2차 인증이 있어 서버가 직접 로그인하지 않는다. 사람이 넣어 준 쿠키(CookieStore)로
요청하고, 세션이 끊겨 SSO 로그인 페이지로 넘어가면 CrawlAuthError 를 던진다.
"""

import asyncio
import logging
import re
from datetime import date
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag

from app.services.seminar.base import CrawlAuthError, ListItem, RawSeminar
from app.services.seminar.cookies import CookieStore
from app.services.seminar.dates import extract_place, extract_when

log = logging.getLogger(__name__)

BASE_URL = "https://stuecm.dgist.ac.kr"
BOARD_PATH = "/s/potal_board/_0002"
BOARD_ID = "BD000254"
USER_AGENT = "Mozilla/5.0 (compatible; hyeonpung-map/0.1; DGIST makerthon)"

_HOST_RE = re.compile(r"^\[([^\]]{2,30})\]")  # "[뇌과학과] ..." → 주최


def _text(el: Tag | None) -> str:
    """줄바꿈을 살린 텍스트."""
    if el is None:
        return ""
    for br in el.find_all("br"):
        br.replace_with("\n")
    for blk in el.find_all(["p", "div", "li", "tr"]):
        blk.append("\n")
    txt = el.get_text()
    txt = re.sub(r"[ \t ​]+", " ", txt)
    return re.sub(r"\n\s*\n+", "\n", txt).strip()


def guess_category(title: str) -> str:
    t = title.lower()
    if re.search(r"특강|강연|lecture|멘토리얼", t):
        return "lecture"
    if re.search(
        r"세미나|seminar|심포지엄|symposium|콜로키움|colloquium|포럼|forum|워크숍|workshop", t
    ):
        return "seminar"
    if re.search(r"행사|콘서트|설명회|경진대회|축제|소개의 날|박람회|festival|fair", t):
        return "event"
    return "other"


def guess_host(title: str) -> str | None:
    if m := _HOST_RE.match(title.strip()):
        host = m.group(1).strip()
        return None if host in ("제목", "추가등록", "공지") else host
    return None


def parse_list_page(html: str, page_url: str) -> list[ListItem]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("a.selectListTitle[href*=NOTIWR_NO]"):
        href = a.get("href", "")
        no = parse_qs(urlparse(href).query).get("NOTIWR_NO", [None])[0]
        if not no:
            continue
        posted = None
        row = a.find_parent("tr")
        if row:
            for td in row.find_all("td"):
                if m := re.fullmatch(r"\s*(\d{4})-(\d{2})-(\d{2})\s*", td.get_text()):
                    posted = date(int(m[1]), int(m[2]), int(m[3]))
                    break
        title = re.sub(r"\s+", " ", a.get_text()).strip()
        out.append(
            ListItem(
                source_id=no,
                url=f"{BASE_URL}{BOARD_PATH}/viewBbs.do?NOTIWR_NO={no}&BOARD_ID={BOARD_ID}",
                title=title,
                posted=posted,
            )
        )
    return out


def parse_detail_page(html: str, item: ListItem) -> RawSeminar | None:
    soup = BeautifulSoup(html, "html.parser")
    view = soup.select_one("table.boardView")
    if view is None:
        raise ValueError("상세 페이지 구조가 바뀌었습니다 (table.boardView 없음)")

    # 상세 제목은 "한국어 <br> English" 형태. 첫 줄만 쓰고, 없으면 목록 제목을 쓴다
    title_el = view.select_one("th strong b") or view.select_one("th strong")
    title = (_text(title_el).split("\n")[0].strip() if title_el else "") or (item.title or "")
    title = re.sub(r"^\[(제목|추가등록)\]\s*", "", title)  # 작성자가 붙인 의미 없는 접두어
    body = _text(view.select_one("#cntn_kor_view td.boardViewBody")) or _text(
        view.select_one("td.boardViewBody")
    )

    posted = item.posted
    if posted is None and (
        m := re.search(r"작성일\s*:\s*(\d{4})-(\d{2})-(\d{2})", view.get_text())
    ):
        posted = date(int(m[1]), int(m[2]), int(m[3]))

    when = extract_when(title, body, posted or date.today())
    if when is None:
        log.info("일시를 찾지 못함: #%s %s", item.source_id, title)
        return None
    start, end = when
    return RawSeminar(
        source_id=item.source_id,
        title=title,
        start_at=start,
        end_at=end,
        place_raw=extract_place(title, body),
        host=guess_host(title),
        source_url=item.url,
        category=guess_category(title),
    )


def is_login_redirect(resp: httpx.Response) -> bool:
    url = str(resp.url)
    host = urlparse(url).hostname or ""
    if "/sso/" in url or host.startswith(("isign.", "auth.")):
        return True
    # SSO 중계 페이지: 자바스크립트로 로그인 페이지에 폼을 전송한다
    return "isign.dgist.ac.kr/login" in resp.text[:2000]


class PortalCrawler:
    name = "portal"

    def __init__(
        self,
        cookie_store: CookieStore,
        delay_seconds: float = 1.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.cookie_store = cookie_store
        self.delay = delay_seconds
        self._transport = transport
        self._client: httpx.AsyncClient | None = None
        self._requests = 0

    def _new_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko"},
            cookies=self.cookie_store.load(),  # 실행마다 새로 읽어 업로드된 쿠키를 반영
            transport=self._transport,
        )

    async def _get(self, url: str) -> str:
        if self._client is None:
            if not self.cookie_store.exists():
                raise CrawlAuthError("포탈 쿠키가 없습니다. 관리자 API로 쿠키를 넣어 주세요.")
            self._client = self._new_client()
        if self._requests:
            await asyncio.sleep(self.delay)  # 요청 간격
        self._requests += 1
        resp = await self._client.get(url)
        if is_login_redirect(resp):
            raise CrawlAuthError("포탈 로그인 세션이 만료되었습니다. 쿠키를 다시 넣어 주세요.")
        resp.raise_for_status()
        return resp.text

    async def fetch_list(self, pages: int = 1) -> list[ListItem]:
        seen: dict[str, ListItem] = {}
        for page in range(1, pages + 1):
            url = f"{BOARD_PATH}/listBbs.do?BOARD_ID={BOARD_ID}&currentPage={page}"
            for it in parse_list_page(await self._get(url), urljoin(BASE_URL, url)):
                seen.setdefault(it.source_id, it)  # 공지글은 페이지마다 반복된다
        return list(seen.values())

    async def parse_detail(self, item: ListItem) -> RawSeminar | None:
        return parse_detail_page(await self._get(item.url), item)

    async def close(self, save_cookies: bool = True) -> None:
        """세션 중 서버가 갱신한 쿠키를 저장하고 연결을 닫는다 (로그인 실패 시엔 저장하지 않음)."""
        if self._client is not None:
            if save_cookies:
                self.cookie_store.save_jar(self._client.cookies)
            await self._client.aclose()
            self._client = None
            self._requests = 0
