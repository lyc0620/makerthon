"""맛집 · 후기 API (규격 6.4)."""

import httpx
import pytest

from app.core.config import get_settings
from app.services import kakao
from tests.conftest import (
    CAMPUS_LAT,
    CAMPUS_LNG,
    add_review,
    assert_error,
    assert_page,
    create_restaurant,
    login,
    restaurant_body,
)

RESTAURANT_KEYS = {
    "id", "name", "category", "address", "lat", "lng", "phone", "kakao_place_id",
    "rating_avg", "review_count", "score", "top_tags", "distance_m", "created_at",
}  # fmt: skip
DETAIL_KEYS = RESTAURANT_KEYS | {"description", "rating_distribution", "tag_counts", "upcoming_meetups"}
REVIEW_KEYS = {
    "id", "restaurant_id", "rating", "content", "tags", "author_nickname",
    "like_count", "liked_by_me", "is_mine", "created_at",
}  # fmt: skip

LAT_100M = 0.0009  # 위도 0.0009도 ≈ 100m


def test_meta(client):
    body = client.get("/api/v1/restaurants/meta").json()
    assert body["categories"][0] == "한식" and "학식" in body["categories"]
    assert "혼밥가능" in body["tags"] and len(body["tags"]) == 8


def test_create_restaurant_returns_detail(client):
    h = login(client, "사슴")
    body = create_restaurant(client, h, tags=["가성비", "혼밥가능"])
    assert set(body) == DETAIL_KEYS
    assert body["id"].startswith("rst_")
    assert body["address"] is None and body["phone"] is None and body["kakao_place_id"] is None
    assert body["description"] is None and body["distance_m"] is None
    assert body["rating_avg"] == 5.0 and body["review_count"] == 1
    assert body["score"] == 5.0  # 후기가 이것뿐이면 전체 평균도 5
    assert body["top_tags"] == ["혼밥가능", "가성비"]
    assert body["rating_distribution"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 1}
    assert body["tag_counts"] == {"가성비": 1, "혼밥가능": 1}
    assert body["upcoming_meetups"] == []
    assert body["created_at"].endswith("+09:00")


def test_create_restaurant_validation(client):
    h = login(client, "사슴")
    bad_category = restaurant_body(category="피자")
    assert_error(client.post("/api/v1/restaurants", headers=h, json=bad_category), 422, "VALIDATION_ERROR")
    bad_tag = restaurant_body(tags=["없는태그"])
    assert_error(client.post("/api/v1/restaurants", headers=h, json=bad_tag), 422, "VALIDATION_ERROR")
    short = restaurant_body()
    short["first_review"]["content"] = "짧아"
    assert_error(client.post("/api/v1/restaurants", headers=h, json=short), 422, "VALIDATION_ERROR")
    no_review = restaurant_body()
    del no_review["first_review"]
    assert_error(client.post("/api/v1/restaurants", headers=h, json=no_review), 422, "VALIDATION_ERROR")


def test_service_area_422(client):
    h = login(client, "사슴")
    far = restaurant_body(lat=37.5665, lng=126.9780)  # 서울
    err = assert_error(client.post("/api/v1/restaurants", headers=h, json=far), 422, "VALIDATION_ERROR")
    assert "캠퍼스" in err["message"]


def test_duplicate_name_within_50m_409(client):
    h = login(client, "사슴")
    first = create_restaurant(client, h, name="든든국밥")
    near = restaurant_body(name="든든국밥", lat=CAMPUS_LAT + 0.0002)  # 약 22m
    err = assert_error(client.post("/api/v1/restaurants", headers=h, json=near), 409, "CONFLICT")
    assert err["details"] == {"restaurant_id": first["id"]}
    # 같은 이름이라도 멀리 있으면 다른 가게예요
    far = restaurant_body(name="든든국밥", lat=CAMPUS_LAT + 0.002)
    assert client.post("/api/v1/restaurants", headers=h, json=far).status_code == 201


def test_duplicate_kakao_place_id_409(client):
    h = login(client, "사슴")
    first = create_restaurant(client, h, name="가게1", kakao_place_id="12345")
    dup = restaurant_body(name="다른 이름", lat=CAMPUS_LAT + 0.01, kakao_place_id="12345")
    err = assert_error(client.post("/api/v1/restaurants", headers=h, json=dup), 409, "CONFLICT")
    assert err["details"]["restaurant_id"] == first["id"]


def test_one_review_per_user(client):
    a, b = login(client, "사슴"), login(client, "고양이")
    r = create_restaurant(client, a)
    assert_error(add_review(client, a, r["id"]), 409, "CONFLICT")
    resp = add_review(client, b, r["id"], rating=3, tags=["양많음", "양많음"])
    assert resp.status_code == 201
    review = resp.json()
    assert set(review) == REVIEW_KEYS
    assert review["restaurant_id"] == r["id"] and review["tags"] == ["양많음"]
    assert review["author_nickname"] == "고양이" and review["is_mine"] is True
    assert review["like_count"] == 0 and review["liked_by_me"] is False
    assert_error(add_review(client, b, "rst_999"), 404, "NOT_FOUND")


def test_bayesian_ordering(client):
    users = [login(client, f"사용자{i}") for i in range(4)]
    single = create_restaurant(client, users[0], name="후기하나 5점", rating=5)
    many = create_restaurant(client, users[1], name="후기셋", lat=CAMPUS_LAT + 0.003, rating=5)
    add_review(client, users[2], many["id"], rating=5)
    add_review(client, users[3], many["id"], rating=4)
    low = create_restaurant(client, users[2], name="별로", lat=CAMPUS_LAT + 0.006, rating=2)
    add_review(client, users[3], low["id"], rating=2)

    items = client.get("/api/v1/restaurants").json()["items"]
    assert [x["name"] for x in items] == ["후기셋", "후기하나 5점", "별로"]
    # 전체 평균 m = (5+5+5+4+2+2)/6 = 23/6, C = 3
    m = 23 / 6
    by_name = {x["name"]: x for x in items}
    assert by_name["후기셋"]["score"] == round((3 * m + 14) / 6, 3)
    assert by_name["후기하나 5점"]["score"] == round((3 * m + 5) / 4, 3)
    assert by_name["후기셋"]["rating_avg"] == 4.67
    assert single["id"] in {x["id"] for x in items}

    by_reviews = client.get("/api/v1/restaurants", params={"sort": "reviews"}).json()["items"]
    assert by_reviews[0]["name"] == "후기셋"
    recent = client.get("/api/v1/restaurants", params={"sort": "recent"}).json()["items"]
    assert recent[0]["name"] == "별로"


def test_filters_tag_category_q(client):
    a, b = login(client, "사슴"), login(client, "고양이")
    r1 = create_restaurant(client, a, name="혼밥국밥", tags=["혼밥가능"])
    r2 = create_restaurant(client, a, name="단체 고깃집", lat=CAMPUS_LAT + 0.003, category="양식")
    add_review(client, b, r2["id"], tags=["단체석"])

    tag = client.get("/api/v1/restaurants", params={"tag": "혼밥가능"}).json()
    assert [x["id"] for x in tag["items"]] == [r1["id"]]
    cat = client.get("/api/v1/restaurants", params={"category": "양식"}).json()
    assert [x["id"] for x in cat["items"]] == [r2["id"]]
    q = client.get("/api/v1/restaurants", params={"q": "국밥"}).json()
    assert [x["id"] for x in q["items"]] == [r1["id"]]
    q2 = client.get("/api/v1/restaurants", params={"q": "%"}).json()  # 특수문자는 글자 그대로 검색해요
    assert q2["items"] == []
    assert_error(client.get("/api/v1/restaurants", params={"tag": "없는태그"}), 422, "VALIDATION_ERROR")


def test_distance_radius_and_paging(client):
    h = login(client, "사슴")
    near = create_restaurant(client, h, name="가까운집", lat=CAMPUS_LAT + LAT_100M)  # 약 100m
    mid = create_restaurant(client, h, name="중간집", lat=CAMPUS_LAT + LAT_100M * 5)  # 약 500m
    far = create_restaurant(client, h, name="먼집", lat=CAMPUS_LAT + LAT_100M * 20)  # 약 2km

    params = {"lat": CAMPUS_LAT, "lng": CAMPUS_LNG, "sort": "distance"}
    body = client.get("/api/v1/restaurants", params=params).json()
    assert_page(body)
    assert [x["id"] for x in body["items"]] == [near["id"], mid["id"], far["id"]]
    assert all(isinstance(x["distance_m"], int) for x in body["items"])
    assert 90 <= body["items"][0]["distance_m"] <= 110

    radius = client.get("/api/v1/restaurants", params={**params, "radius_m": 600}).json()
    assert [x["id"] for x in radius["items"]] == [near["id"], mid["id"]]
    assert radius["total"] == 2

    page = client.get("/api/v1/restaurants", params={**params, "limit": 1, "offset": 1}).json()
    assert page["count"] == 1 and page["total"] == 3 and page["items"][0]["id"] == mid["id"]
    assert page["updated_at"].endswith("+09:00")

    assert_error(client.get("/api/v1/restaurants", params={"sort": "distance"}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/restaurants", params={"radius_m": 100}), 422, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/restaurants", params={"limit": 201}), 422, "VALIDATION_ERROR")
    no_loc = client.get("/api/v1/restaurants").json()
    assert all(x["distance_m"] is None for x in no_loc["items"])


def test_empty_list_envelope(client):
    body = client.get("/api/v1/restaurants").json()
    assert body == {"items": [], "count": 0, "total": 0, "updated_at": None}


def test_id_format_404(client):
    for bad in ["abc", "rst_abc", "rev_1", "rst_999"]:
        assert_error(client.get(f"/api/v1/restaurants/{bad}"), 404, "NOT_FOUND")
    assert_error(client.get("/api/v1/restaurants/12/reviews"), 404, "NOT_FOUND")


def test_detail_and_reviews_list(client):
    a, b, c = login(client, "사슴"), login(client, "고양이"), login(client, "수달")
    r = create_restaurant(client, a, rating=5, tags=["가성비"])
    rev_b = add_review(client, b, r["id"], rating=3, tags=["가성비", "늦게까지"]).json()
    rev_c = add_review(client, c, r["id"], rating=4).json()
    client.post(f"/api/v1/reviews/{rev_b['id']}/like", headers=a)

    detail = client.get(f"/api/v1/restaurants/{r['id']}").json()
    assert detail["rating_distribution"] == {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1}
    assert detail["tag_counts"] == {"가성비": 2, "늦게까지": 1}
    assert detail["top_tags"] == ["가성비", "늦게까지"]
    assert detail["rating_avg"] == 4.0 and detail["review_count"] == 3

    helpful = client.get(f"/api/v1/restaurants/{r['id']}/reviews", headers=a).json()
    assert_page(helpful)
    assert helpful["total"] == 3
    assert helpful["items"][0]["id"] == rev_b["id"]  # 도움돼요가 제일 많아요
    assert helpful["items"][0]["liked_by_me"] is True and helpful["items"][0]["like_count"] == 1
    mine = [x for x in helpful["items"] if x["is_mine"]]
    assert len(mine) == 1 and mine[0]["author_nickname"] == "사슴"

    recent = client.get(f"/api/v1/restaurants/{r['id']}/reviews", params={"sort": "recent"}).json()
    assert recent["items"][0]["id"] == rev_c["id"]
    assert all(x["liked_by_me"] is False and x["is_mine"] is False for x in recent["items"])  # 익명


def test_like_toggle_and_own_review_403(client):
    a, b = login(client, "사슴"), login(client, "고양이")
    r = create_restaurant(client, a)
    review_id = add_review(client, b, r["id"]).json()["id"]

    on = client.post(f"/api/v1/reviews/{review_id}/like", headers=a)
    assert on.status_code == 200 and on.json() == {"liked": True, "like_count": 1}
    off = client.post(f"/api/v1/reviews/{review_id}/like", headers=a)
    assert off.json() == {"liked": False, "like_count": 0}
    assert_error(client.post(f"/api/v1/reviews/{review_id}/like", headers=b), 403, "FORBIDDEN")
    assert_error(client.post("/api/v1/reviews/rev_999/like", headers=a), 404, "NOT_FOUND")
    assert_error(client.post(f"/api/v1/reviews/{review_id}/like"), 401, "UNAUTHORIZED")


def test_delete_own_review_only(client):
    a, b = login(client, "사슴"), login(client, "고양이")
    r = create_restaurant(client, a)
    review = add_review(client, b, r["id"], tags=["배달"]).json()
    client.post(f"/api/v1/reviews/{review['id']}/like", headers=a)  # 도움돼요가 있어도 지워져야 해요

    assert_error(client.delete(f"/api/v1/reviews/{review['id']}", headers=a), 403, "FORBIDDEN")
    resp = client.delete(f"/api/v1/reviews/{review['id']}", headers=b)
    assert resp.status_code == 204 and resp.content == b""
    assert client.get(f"/api/v1/restaurants/{r['id']}").json()["review_count"] == 1
    assert_error(client.delete(f"/api/v1/reviews/{review['id']}", headers=b), 404, "NOT_FOUND")
    # 지운 뒤에는 다시 후기를 쓸 수 있어요
    assert add_review(client, b, r["id"]).status_code == 201


# ───────── 카카오 장소 검색 (가짜 응답) ─────────
def _use_fake_kakao(monkeypatch, handler):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "test-kakao-key")
    get_settings.cache_clear()
    monkeypatch.setattr(kakao, "_make_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))


def test_place_search_requires_auth(client):
    assert_error(client.get("/api/v1/restaurants/place-search", params={"q": "국밥"}), 401, "UNAUTHORIZED")


def test_place_search_without_key_502(client, monkeypatch):
    def handler(request):  # 키가 없으면 여기까지 오면 안 돼요
        raise AssertionError("네트워크를 부르면 안 돼요")

    monkeypatch.setattr(kakao, "_make_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    h = login(client, "사슴")
    resp = client.get("/api/v1/restaurants/place-search", params={"q": "국밥"}, headers=h)
    assert_error(resp, 502, "UPSTREAM_ERROR")


def test_place_search_success(client, monkeypatch):
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        code = request.url.params["category_group_code"]
        docs = {
            "FD6": [
                {"id": "111", "place_name": "든든국밥", "category_name": "음식점 > 한식 > 국밥",
                 "category_group_code": "FD6", "phone": "", "address_name": "현풍읍 1",
                 "road_address_name": "현풍로 1", "x": "128.4560", "y": "35.6960"},
                {"id": "999", "place_name": "편의점", "category_name": "편의점",
                 "category_group_code": "CS2", "x": "128.4", "y": "35.6"},
            ],
            "CE7": [
                {"id": "222", "place_name": "캠퍼스 카페", "category_name": "음식점 > 카페",
                 "category_group_code": "CE7", "phone": "053-000-0000", "address_name": "현풍읍 2",
                 "road_address_name": "", "x": "128.4550", "y": "35.6950"},
            ],
        }[code]  # fmt: skip
        return httpx.Response(200, json={"documents": docs, "meta": {}})

    _use_fake_kakao(monkeypatch, handler)
    h = login(client, "사슴")
    registered = create_restaurant(client, h, name="든든국밥", kakao_place_id="111")

    resp = client.get("/api/v1/restaurants/place-search", params={"q": "국밥"}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert_page(body)
    assert [x["kakao_place_id"] for x in body["items"]] == ["111", "222"]  # 편의점은 빠져요
    first, cafe = body["items"]
    assert first == {
        "kakao_place_id": "111", "name": "든든국밥", "category_hint": "한식", "address": "현풍로 1",
        "phone": None, "lat": 35.696, "lng": 128.456, "already_registered_id": registered["id"],
    }  # fmt: skip
    assert cafe["category_hint"] == "카페" and cafe["address"] == "현풍읍 2"
    assert cafe["already_registered_id"] is None

    assert len(seen) == 2
    req = seen[0]
    assert req.headers["Authorization"] == "KakaoAK test-kakao-key"
    assert req.url.host == "dapi.kakao.com" and req.url.path == "/v2/local/search/keyword.json"
    assert req.url.params["query"] == "국밥"
    assert float(req.url.params["x"]) == CAMPUS_LNG and float(req.url.params["y"]) == CAMPUS_LAT
    assert int(req.url.params["radius"]) <= 20000
    assert {r.url.params["category_group_code"] for r in seen} == {"FD6", "CE7"}


@pytest.mark.parametrize("failure", ["status", "network"])
def test_place_search_upstream_failure_502(client, monkeypatch, failure):
    def handler(request):
        if failure == "network":
            raise httpx.ConnectError("연결 실패", request=request)
        return httpx.Response(500, json={"msg": "error"})

    _use_fake_kakao(monkeypatch, handler)
    h = login(client, "사슴")
    resp = client.get("/api/v1/restaurants/place-search", params={"q": "국밥"}, headers=h)
    assert_error(resp, 502, "UPSTREAM_ERROR")
