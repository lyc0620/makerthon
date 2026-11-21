"""세미나 공지의 자유 형식 텍스트에서 일시·장소를 뽑는다.

실제 포탈 공지에서 본 형식 (2026-11 기준)
  일 시 : 2026년 11월 26일 (목) 12시          일시: 2026. 11. 26.(목) 14:00~17:00
  일시(Date&Time) : 11월 24일(화), 16:30      시간: 11월 19일(목) 12:00~13:00
  Date & Time : 16:00, November 25(Wed), 2026  Date: 4:30 pm, Nov 24(Tue), 2026
  Date: November 24(Tue)-25(Wed), 2026         Date & Time: November 26(Thu), 2026, 4:30 PM
  장 소 : DGIST E4-114   Venue: E2-625 (offline only)   장소(Lacation) : E3-112호   장소: E7 L29
제목에도 "11월 25일 16:00pm, E4-114" 처럼 들어 있는 경우가 많다.
"""

import re
from datetime import date, datetime, time, timedelta

from app.core.time import KST

MONTHS = {
    m: i
    for i, names in enumerate(
        [
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ],
        start=1,
    )
    for m in names
}
_MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"

# ---- 날짜 ----
_D_KO = re.compile(r"(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일")
_D_NUM = re.compile(r"(?<!\d)(\d{4}|['′’]\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)")
_D_SLASH = re.compile(r"(?<![\d.])(\d{1,2})\s*/\s*(\d{1,2})(?![\d/])")
_D_EN_MD = re.compile(
    _MON + r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*\([^)]*\))?(?:\s*,?\s*(\d{4}))?", re.I
)
_D_EN_DM = re.compile(r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+" + _MON + r"(?:\s*,?\s*(\d{4}))?", re.I)

# ---- 시각 ----
_T_COLON = re.compile(r"(?<![\d.])(\d{1,2})\s*:\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?", re.I)
_T_KO = re.compile(r"(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*반)?")
_T_AMPM = re.compile(r"(?<![\d:])(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)", re.I)

_DATE_LABEL = re.compile(
    r"(?:일\s*시|일\s*정|날\s*짜|시\s*간|기\s*간|date\s*(?:&|and)?\s*(?:time)?|time|when)"
    r"\s*(?:\([^)]*\))?\s*[:：]",
    re.I,
)
_PLACE_LABEL = re.compile(
    r"(?:장\s*소|위\s*치|venue|location|lacation|place|where)\s*(?:\([^)]*\))?\s*[:：]", re.I
)


def _lines(text: str) -> list[str]:
    return [ln.strip(" \t​ -·ㅇ○●▶※*") for ln in text.splitlines() if ln.strip()]


def _labeled(text: str, label: re.Pattern) -> list[str]:
    """'라벨: 값' 형태의 값들. 값이 비어 있으면 다음 줄을 쓴다."""
    lines = _lines(text)
    out = []
    for i, ln in enumerate(lines):
        if m := label.search(ln):
            val = ln[m.end() :].strip()
            if not val and i + 1 < len(lines):
                val = lines[i + 1]
            if val:
                out.append(val)
    return out


def _find_date(s: str) -> tuple[int | None, int, int, int] | None:
    """(year|None, month, day, 매치 위치) 중 가장 앞에 나온 것."""
    cands = []
    if m := _D_KO.search(s):
        cands.append((int(m[1]) if m[1] else None, int(m[2]), int(m[3]), m.start()))
    if m := _D_NUM.search(s):
        y = m[1]
        year = int(y) if len(y) == 4 else 2000 + int(y[1:])
        cands.append((year, int(m[2]), int(m[3]), m.start()))
    if m := _D_EN_MD.search(s):
        cands.append((int(m[3]) if m[3] else None, MONTHS[m[1].lower()[:3]], int(m[2]), m.start()))
    if m := _D_EN_DM.search(s):
        cands.append((int(m[3]) if m[3] else None, MONTHS[m[2].lower()[:3]], int(m[1]), m.start()))
    if m := _D_SLASH.search(s):
        cands.append((None, int(m[1]), int(m[2]), m.start()))
    cands = [c for c in cands if 1 <= c[1] <= 12 and 1 <= c[2] <= 31]
    return min(cands, key=lambda c: c[3]) if cands else None


def _to_24h(h: int, mer: str | None) -> int:
    if not mer:
        return h
    mer = mer.lower().replace(".", "")
    if mer in ("pm", "오후", "저녁", "밤") and h < 12:
        return h + 12
    if mer in ("am", "오전") and h == 12:
        return 0
    if mer == "낮" and h < 6:
        return h + 12
    return h


def _find_times(s: str) -> list[time]:
    """문자열에 나온 시각들을 위치 순서대로."""
    return [t for _, _, t in _find_times_pos(s)]


def _find_times_pos(s: str) -> list[tuple[int, int, time]]:
    """(시작 위치, 끝 위치, 시각) 목록."""
    found: list[tuple[int, int, time]] = []
    for m in _T_COLON.finditer(s):
        h, mi = int(m[1]), int(m[2])
        # "16:00pm" 처럼 24시 표기 뒤에 pm 이 붙는 경우가 있어 13시 이상이면 그대로 둔다
        h = _to_24h(h, m[3]) if h < 13 else h
        if h < 24 and mi < 60:
            found.append((m.start(), m.end(), time(h, mi)))
    for m in _T_KO.finditer(s):
        h = _to_24h(int(m[2]), m[1])
        mi = int(m[3]) if m[3] else (30 if "반" in m[0] else 0)
        if h < 24 and mi < 60:
            found.append((m.start(), m.end(), time(h, mi)))
    for m in _T_AMPM.finditer(s):
        h = _to_24h(int(m[1]), m[2])
        if h < 24:
            found.append((m.start(), m.end(), time(h, 0)))
    found.sort(key=lambda x: x[0])
    # 같은 위치에서 중복으로 잡힌 것 제거
    out: list[tuple[int, int, time]] = []
    last = -10
    for pos, end, t in found:
        if pos - last > 2:
            out.append((pos, end, t))
        last = pos
    return out


def _resolve_year(year: int | None, month: int, day: int, ref: date) -> date | None:
    try:
        if year:
            return date(year, month, day)
        d = date(ref.year, month, day)
        # 연도가 없고 기준일(게시일)보다 두 달 넘게 과거라면 내년 일정으로 본다
        if d < ref - timedelta(days=60):
            d = date(ref.year + 1, month, day)
        return d
    except ValueError:
        return None


def parse_when(text: str, ref: date) -> tuple[datetime, datetime | None, bool] | None:
    """한 덩어리 텍스트에서 (시작, 끝, 시각을 찾았는지). 날짜가 없으면 None."""
    d = _find_date(text)
    if d is None:
        return None
    day = _resolve_year(d[0], d[1], d[2], ref)
    if day is None:
        return None
    times = _find_times_pos(text)
    if not times:
        return datetime.combine(day, time(0, 0), tzinfo=KST), None, False
    start = datetime.combine(day, times[0][2], tzinfo=KST)
    end = None
    # 끝 시각은 "12:00~13:30", "13:00 - 18:00" 처럼 범위로 붙어 있을 때만 인정한다
    if len(times) > 1 and times[1][2] > times[0][2]:
        between = text[times[0][1] : times[1][0]]
        if _RANGE_SEP.fullmatch(between):
            end = datetime.combine(day, times[1][2], tzinfo=KST)
    return start, end, True


_RANGE_SEP = re.compile(r"\s*(?:am|pm|a\.m\.|p\.m\.)?\s*[~\-–—]\s*(?:오전|오후)?\s*", re.I)
# 신청 마감 같은 문장의 날짜를 행사 일시로 착각하지 않도록 (라벨 없는 본문 검색에서만 제외)
_DEADLINE = re.compile(
    r"신청|등록|마감|까지|접수|deadline|register|registration|apply|rsvp|\bby\b", re.I
)


def _without_deadlines(body: str) -> str:
    return "\n".join(ln for ln in body.splitlines() if not _DEADLINE.search(ln))


def extract_when(title: str, body: str, posted: date) -> tuple[datetime, datetime | None] | None:
    """라벨 붙은 값 → 제목 → 본문 전체 순서로 찾는다. 시각이 있는 결과를 우선한다."""
    plain = _without_deadlines(body)
    candidates = [*_labeled(body, _DATE_LABEL), title, plain]
    date_only = None
    for cand in candidates:
        r = parse_when(cand, posted)
        if r is None:
            continue
        start, end, has_time = r
        if has_time:
            return start, end
        if date_only is None:
            date_only = (start, end)
            # 라벨 값에 날짜만 있고 시각은 다음 줄에 있는 경우 ("날짜 / 11월 13일 / 12:00")
            for t_src in (title, plain):
                times = _find_times(t_src)
                if times:
                    return datetime.combine(start.date(), times[0], tzinfo=KST), None
    return date_only


# ---- 장소 ----
_ROOM_CODE = re.compile(r"(?<![A-Za-z])([A-Z]{1,2}\d{1,2})\s*[-\s]?\s*(L?B?\d{2,4})\s*호?", re.I)


def extract_place(title: str, body: str) -> str | None:
    for val in _labeled(body, _PLACE_LABEL):
        val = re.sub(r"^(DGIST|디지스트)\s*", "", val, flags=re.I)
        val = re.sub(r"^(오프라인|offline)\s*", "", val, flags=re.I)
        # "강연일시 및 장소: 2026.11.11.(수) 17:30~19:30 / E7-235" 처럼 일시가 섞인 경우 걷어낸다
        for pat in (_D_NUM, _D_KO, _D_EN_MD):
            val = pat.sub(" ", val)
        val = re.sub(r"\(\s*[월화수목금토일]\s*\)\.?", " ", val)
        val = re.sub(r"\d{1,2}\s*:\s*\d{2}\s*(?:[~\-–]\s*\d{1,2}\s*:\s*\d{2})?", " ", val)
        val = re.sub(r"\s+", " ", val).strip(" ,/|·~-.")
        if val:
            return val[:100]
    # 라벨이 없으면 제목·본문에서 "E4-114" 같은 강의실 코드를 찾는다
    for src in (title, body):
        if m := _ROOM_CODE.search(src):
            return m.group(0).strip()
    return None


def parse_kst(text: str) -> datetime | None:
    """(이전 API 호환) 문자열의 첫 날짜·시각. 연도가 없으면 올해 기준."""
    r = parse_when(text, date.today())
    return r[0] if r else None
