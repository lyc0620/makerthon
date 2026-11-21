"""API용 문자열 ID ("rst_12") ↔ DB 정수 ID 변환."""

import re

from app.core.errors import not_found

RESTAURANT = "rst"
REVIEW = "rev"
REPORT = "rpt"
MEETUP = "mtp"
MESSAGE = "msg"
USER = "usr"


def encode(prefix: str, value: int | None) -> str | None:
    return None if value is None else f"{prefix}_{value}"


def decode(prefix: str, value: str | None, message: str = "찾을 수 없어요.") -> int:
    """형식이 틀리면 404 NOT_FOUND 로 응답해요 (규격 0장)."""
    match = re.fullmatch(prefix + r"_([1-9][0-9]{0,17})", value or "")
    if not match:
        raise not_found(message)
    return int(match.group(1))
