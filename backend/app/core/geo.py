"""거리 계산과 서비스 지역 확인."""

import math

from app.core.config import get_settings

EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 사이 거리(m)를 구해요."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def in_service_area(lat: float, lng: float) -> bool:
    """캠퍼스 중심에서 SERVICE_RADIUS_M 안이면 True예요."""
    s = get_settings()
    return haversine_m(lat, lng, s.CAMPUS_LAT, s.CAMPUS_LNG) <= s.SERVICE_RADIUS_M
