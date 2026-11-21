"""카카오 로컬 키워드 검색 프록시.

키를 브라우저에 노출하지 않으려고 서버가 대신 불러요.
가게 기본 정보(이름·주소·전화·좌표)만 가져오고, 다른 플랫폼 리뷰는 가져오지 않아요.
"""

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
CATEGORY_GROUPS = ("FD6", "CE7")  # 음식점, 카페
MAX_RADIUS_M = 20_000  # 카카오가 허용하는 최대 반경

# 카카오 분류 이름에 이 단어가 있으면 우리 카테고리로 바꿔요 (위에서부터 먼저 맞는 것)
_CATEGORY_HINTS = [
    ("패스트푸드", "패스트푸드"),
    ("분식", "분식"),
    ("술집", "술집"),
    ("호프", "술집"),
    ("한식", "한식"),
    ("중식", "중식"),
    ("일식", "일식"),
    ("양식", "양식"),
]


def _upstream(message: str) -> AppError:
    return AppError("UPSTREAM_ERROR", 502, message)


def _make_client() -> httpx.Client:
    """테스트에서는 이 함수를 바꿔서 가짜 응답을 넣어요 (진짜 네트워크 안 씀)."""
    return httpx.Client(timeout=5.0)


def category_hint(doc: dict) -> str | None:
    if doc.get("category_group_code") == "CE7":
        return "카페"
    name = doc.get("category_name") or ""
    for word, category in _CATEGORY_HINTS:
        if word in name:
            return category
    return "기타" if name else None


def search_places(query: str) -> list[dict]:
    """음식점(FD6)·카페(CE7)를 차례로 검색해서 합쳐요. 실패하면 502예요."""
    settings = get_settings()
    if not settings.KAKAO_REST_API_KEY:
        raise _upstream("장소 검색 키가 설정되지 않았어요. 지도에서 직접 찍어 주세요.")

    radius = int(min(settings.SERVICE_RADIUS_M, MAX_RADIUS_M))
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    found: dict[str, dict] = {}
    try:
        with _make_client() as client:
            for code in CATEGORY_GROUPS:
                params = {
                    "query": query,
                    "x": settings.CAMPUS_LNG,
                    "y": settings.CAMPUS_LAT,
                    "radius": radius,
                    "category_group_code": code,
                    "size": 15,
                }
                resp = client.get(KAKAO_URL, params=params, headers=headers)
                resp.raise_for_status()
                for doc in resp.json().get("documents", []):
                    if doc.get("category_group_code") in CATEGORY_GROUPS and doc.get("id"):
                        found.setdefault(str(doc["id"]), doc)
    except (httpx.HTTPError, ValueError) as exc:
        raise _upstream("장소 검색에 실패했어요. 지도에서 직접 찍어 주세요.") from exc

    places = []
    for place_id, doc in found.items():
        try:
            lat, lng = float(doc["y"]), float(doc["x"])
        except (KeyError, TypeError, ValueError):
            continue  # 좌표가 없는 결과는 건너뛰어요
        places.append(
            {
                "kakao_place_id": place_id,
                "name": doc.get("place_name") or "",
                "category_hint": category_hint(doc),
                "address": doc.get("road_address_name") or doc.get("address_name") or None,
                "phone": doc.get("phone") or None,
                "lat": lat,
                "lng": lng,
            }
        )
    return places
