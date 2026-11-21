"""포탈 로그인 쿠키 보관소.

계정에 2차 인증이 있어 서버가 직접 로그인할 수 없으므로, 사람이 브라우저에서 로그인한 뒤
쿠키를 내보내 서버에 넣어 준다. 크롤러는 그 쿠키로 요청하고, 서버가 새로 내려준 쿠키는
다시 파일에 저장해 세션을 이어 간다.

받는 형식 (parse_cookie_export)
  1. JSON 배열   — Cookie-Editor / EditThisCookie 확장의 "Export(JSON)" 결과
                   [{"name": "...", "value": "...", "domain": ".dgist.ac.kr", "path": "/"}, ...]
  2. JSON 객체   — Playwright storage_state: {"cookies": [...]}
  3. 문자열      — 개발자도구의 Cookie 헤더 값 "A=1; B=2" (stuecm.dgist.ac.kr 에만 적용)
"""

import json
import os
import re
import threading
from datetime import datetime
from http.cookiejar import Cookie
from pathlib import Path

import httpx

from app.core.time import now_kst

DEFAULT_DOMAIN = "stuecm.dgist.ac.kr"
_NAME_RE = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")  # RFC 6265 token
ALLOWED_SUFFIX = "dgist.ac.kr"  # 학교 도메인 쿠키만 받는다


class CookieFormatError(ValueError):
    pass


def parse_cookie_export(raw: str) -> list[dict]:
    raw = raw.strip()
    if not raw:
        raise CookieFormatError("쿠키가 비어 있습니다.")

    items: list[dict]
    if raw[0] in "[{":
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CookieFormatError(f"JSON 형식이 아닙니다: {exc}") from exc
        items = data.get("cookies", []) if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise CookieFormatError("쿠키 목록을 찾을 수 없습니다.")
    else:
        raw = raw.removeprefix("Cookie:").strip()
        items = []
        for part in raw.split(";"):
            if "=" in part:
                name, value = part.split("=", 1)
                items.append({"name": name.strip(), "value": value.strip()})

    out = []
    for c in items:
        if not isinstance(c, dict) or not c.get("name"):
            continue
        if not _NAME_RE.fullmatch(str(c["name"])) or any(
            ch in str(c.get("value", "")) for ch in " \t\r\n"
        ):
            continue  # 쿠키가 아닌 텍스트(명령어 등)를 붙여넣은 경우
        domain = str(c.get("domain") or DEFAULT_DOMAIN)
        if not domain.lstrip(".").endswith(ALLOWED_SUFFIX):
            continue
        out.append(
            {
                "name": str(c["name"]),
                "value": str(c.get("value", "")),
                "domain": domain,
                "path": str(c.get("path") or "/"),
            }
        )
    if not out:
        raise CookieFormatError("dgist.ac.kr 쿠키가 하나도 없습니다.")
    return out


class CookieStore:
    """JSON 파일 하나에 쿠키 목록을 저장한다. 파일 권한은 소유자 전용(0600)으로 만든다."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def exists(self) -> bool:
        return self.path.exists()

    def updated_at(self) -> datetime | None:
        if not self.path.exists():
            return None
        return datetime.fromtimestamp(self.path.stat().st_mtime, tz=now_kst().tzinfo)

    def load(self) -> httpx.Cookies:
        jar = httpx.Cookies()
        if not self.path.exists():
            return jar
        for c in json.loads(self.path.read_text(encoding="utf-8")):
            jar.set(c["name"], c["value"], domain=c["domain"], path=c.get("path", "/"))
        return jar

    def save_list(self, cookies: list[dict]) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(cookies, ensure_ascii=False, indent=1), encoding="utf-8")
            try:
                os.chmod(tmp, 0o600)
            except OSError:  # Windows 등
                pass
            tmp.replace(self.path)

    def save_jar(self, jar: httpx.Cookies) -> None:
        """세션 중 바뀐 쿠키를 반영해 저장한다.

        서버가 "Domain=stuecm..." 으로 다시 내려준 쿠키는 ".stuecm..." 으로 저장돼 기존 것과
        중복되므로, (이름, 점 뺀 도메인, 경로)가 같으면 파일에 있던 값과 다른 쪽(새 값)을 남긴다.
        """
        previous = {_key(c): c["value"] for c in self._read()}
        merged: dict[tuple, dict] = {}
        for c in (_cookie_to_dict(x) for x in jar.jar):
            k = _key(c)
            if k in merged and c["value"] == previous.get(k):
                continue  # 이미 새 값이 있으면 옛 값으로 덮지 않는다
            merged[k] = {**c, "domain": c["domain"].lstrip(".") if k in previous else c["domain"]}
        if merged:
            self.save_list(list(merged.values()))

    def _read(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def import_raw(self, raw: str) -> int:
        cookies = parse_cookie_export(raw)
        self.save_list(cookies)
        return len(cookies)


def _key(c: dict) -> tuple[str, str, str]:
    return c["name"], c["domain"].lstrip("."), c.get("path") or "/"


def _cookie_to_dict(c: Cookie) -> dict:
    return {"name": c.name, "value": c.value or "", "domain": c.domain, "path": c.path or "/"}
