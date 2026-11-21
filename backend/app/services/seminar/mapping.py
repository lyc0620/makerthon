"""세미나 장소 텍스트 → 건물/호실 매핑.

예: "E7동 304호" → ("bld_E7", "304"), "학술정보관 2층 세미나실" → ("bld_LIB", None)
"""

import re
import unicodedata
from dataclasses import dataclass

from app.models import Building

# 304, B101, L233(강의실), L29 같은 호실 번호
ROOM_RE = re.compile(r"(?<![0-9A-Za-z])([LB]?\d{3,4}|L\d{2})(?!\d)\s*호?")


@dataclass
class PlaceMatch:
    building_id: str | None
    room: str | None
    lat: float | None
    lng: float | None


_SEP = re.compile(r"[\s\-_·,()\[\]/]+")


def _spaced(s: str) -> str:
    """대문자화 + 구분자를 공백 하나로."""
    return _SEP.sub(" ", unicodedata.normalize("NFKC", s).upper()).strip()


def _compact(s: str) -> str:
    return _spaced(s).replace(" ", "")


def _alias_hit(alias: str, spaced: str, compact: str) -> int:
    """별칭이 처음 나오는 위치. 없으면 -1."""
    a = _compact(alias)
    if not a:
        return -1
    if not a[-1].isdigit():
        # "전기전자 컴퓨터공학관" 처럼 띄어쓰기가 달라도 맞도록 공백 없이 비교
        return compact.find(a)
    # "E7" 같은 별칭: 바로 뒤에 숫자가 붙으면("E71", "E7304") 다른 건물/호실이므로 제외.
    # 원문의 구분자를 살린 문자열에서 비교해야 "E7 304" 와 "E71" 을 구분할 수 있다.
    a_sp = _spaced(alias)
    for m in re.finditer(re.escape(a_sp), spaced):
        if not spaced[m.end() : m.end() + 1].isdigit():
            return m.start()
    return -1


def match_place(place_raw: str | None, buildings: list[Building]) -> PlaceMatch:
    if not place_raw:
        return PlaceMatch(None, None, None, None)

    spaced, compact = _spaced(place_raw), _compact(place_raw)
    # 가장 긴 별칭 우선, 길이가 같으면 먼저 나온 것 ("E7 236호 및 E5 1층 로비" → E7)
    best: tuple[tuple[int, int], Building] | None = None
    for b in buildings:
        for alias in {b.name, *b.aliases}:
            pos = _alias_hit(alias, spaced, compact)
            if pos < 0:
                continue
            key = (len(_compact(alias)), -pos)
            if best is None or key > best[0]:
                best = (key, b)

    room = None
    building = best[1] if best else None
    rest = place_raw
    if building is not None:
        # 건물 이름 부분을 지운 뒤 호실 번호를 찾는다 (E7 의 7을 호실로 오인하지 않게)
        for alias in sorted({building.name, *building.aliases}, key=len, reverse=True):
            rest = re.sub(re.escape(alias), " ", rest, flags=re.IGNORECASE)
    m = ROOM_RE.search(unicodedata.normalize("NFKC", rest))
    if m:
        room = m.group(1)

    if building is None:
        return PlaceMatch(None, room, None, None)
    return PlaceMatch(building.id, room, building.lat, building.lng)
