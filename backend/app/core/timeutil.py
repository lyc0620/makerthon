"""시간 도우미. DB에는 UTC로 저장하고, 응답은 서울 시간(+09:00)으로 보내요."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

# Windows에는 시간대 데이터가 없어서 tzdata 패키지를 같이 설치했어요.
SEOUL = ZoneInfo("Asia/Seoul")


def now_utc() -> datetime:
    """지금 시각(UTC, 초 단위). 테스트에서는 이 함수를 바꿔서 시간을 움직여요."""
    return datetime.now(UTC).replace(microsecond=0)


def to_utc(dt: datetime) -> datetime:
    """시간대가 없는 값은 서울 시간으로 보고 UTC로 바꿔요."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SEOUL)
    return dt.astimezone(UTC)


def as_aware(dt: datetime) -> datetime:
    """DB에서 시간대 없이 읽힌 값은 UTC로 붙여 줘요."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def to_seoul(dt: datetime) -> datetime:
    return as_aware(dt).astimezone(SEOUL)


def to_iso(dt: datetime | None) -> str | None:
    """응답용 문자열: "2026-12-01T18:00:00+09:00" 형식."""
    if dt is None:
        return None
    return to_seoul(dt).isoformat(timespec="seconds")
