# 현풍 지도 API 규격 (v1)

> 팀 공유용. 원본은 `docs/handoff.md` 5~6장이며, 규격을 바꿀 때는 두 곳을 함께 고친다.
> 서버를 띄우면 `http://localhost:8000/docs` 에서 Swagger UI로 직접 호출해 볼 수 있다.

## 5. API 공통 규칙

- **기본 경로**: `/api/v1`
- **필드 이름**: `snake_case` (프론트 TS 타입도 그대로 snake_case, 변환하지 않음)
- **시간**: ISO 8601, 서울 시간대 오프셋 포함 → `"2026-12-01T16:00:00+09:00"`. 날짜만 필요하면 `"2026-12-01"`
- **좌표**: WGS84, `lat`, `lng` 소수점 숫자. **경로 등 선/면 데이터만 GeoJSON**을 쓰고, GeoJSON 안의 좌표 순서는 표준대로 `[lng, lat]`
- **ID**: 문자열. 접두어로 종류를 구분 → `bld_E7`, `stop_...`, `sem_...`, `rst_...`, `rpt_...`
- **값이 없을 때**: 필드를 빼지 않고 `null`로 보낸다
- **목록 응답 형식**:
  ```json
  { "items": [ ... ], "count": 12, "updated_at": "2026-11-21T11:30:00+09:00" }
  ```
  `updated_at`은 데이터가 마지막으로 갱신된 시각(수집 데이터일 때). 페이지가 필요한 목록은 `limit`(기본 50, 최대 200), `offset`(기본 0) 쿼리 사용
- **에러 응답 형식** (HTTP 상태코드와 함께):
  ```json
  { "error": { "code": "NOT_FOUND", "message": "세미나를 찾을 수 없습니다." } }
  ```
  `code` 값: `BAD_REQUEST`(400), `UNAUTHORIZED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `VALIDATION_ERROR`(422), `UPSTREAM_ERROR`(502, 외부 API 실패), `INTERNAL_ERROR`(500). FastAPI 기본 `{"detail": ...}` 형식은 예외 핸들러로 이 형식으로 바꾼다.
- **인증**: 쓰기 API는 `Authorization: Bearer <JWT>` 필요. 읽기 API는 인증 없음
- **CORS**: 개발 중엔 `http://localhost:5173` 허용. 운영은 같은 도메인이라 불필요

---

## 6. 데이터 형식 및 엔드포인트

### 6.1 공통

**`GET /api/v1/health`**
```json
{ "status": "ok", "time": "2026-11-21T11:30:00+09:00" }
```

**`GET /api/v1/buildings`** → 목록 응답, `items: Building[]`
**`GET /api/v1/buildings/{id}`** → `Building`
```json
{
  "id": "bld_E7",
  "name": "E7동",
  "aliases": ["E7", "E7동", "전기전자컴퓨터공학관"],
  "lat": 35.0,
  "lng": 128.0
}
```
> `aliases`는 세미나 장소 텍스트 매칭에 쓴다. 건물 목록은 `seed/buildings.json`에서 관리 (지도 담당과 함께 작성). 위 값은 형식 예시.

### 6.2 버스 (나)

**`GET /api/v1/bus/stops`** → 목록 응답, `items: BusStop[]`
```json
{
  "id": "stop_dgist_front",
  "name": "캠퍼스 정문",
  "lat": 35.0,
  "lng": 128.0,
  "external_id": "API가 쓰는 정류장 ID",
  "routes": ["직행2"]
}
```

**`GET /api/v1/bus/arrivals?stop_ids=stop_a,stop_b`**
- `stop_ids` 필수, 쉼표 구분, 최대 10개 (즐겨찾기 정류장 한 번에 조회용)
- 응답:
```json
{
  "items": [
    {
      "stop_id": "stop_dgist_front",
      "arrivals": [
        {
          "route": "직행2",
          "route_type": "city",
          "direction": "대구 방면",
          "eta_min": 7,
          "stops_left": 3,
          "departure_time": null,
          "source": "realtime"
        },
        {
          "route": "교내 셔틀",
          "route_type": "shuttle",
          "direction": "현풍터미널",
          "eta_min": 12,
          "stops_left": null,
          "departure_time": "2026-11-21T11:45:00+09:00",
          "source": "timetable"
        }
      ]
    }
  ],
  "count": 1,
  "updated_at": "2026-11-21T11:30:00+09:00",
  "is_stale": false
}
```
- `route_type`: `"city"` | `"shuttle"`
- `source`: `"realtime"`(API) | `"timetable"`(시간표 계산)
- `eta_min`이 작은 순으로 정렬
- `is_stale`: 마지막 갱신이 3분 넘게 지났으면 `true` → 프론트에 "실시간 정보 지연" 표시
- 외부 API가 계속 실패해도 500을 내지 않는다. 마지막 캐시 + `is_stale: true`를 반환

### 6.3 세미나 (나)

**`GET /api/v1/seminars`**
| 쿼리 | 기본값 | 설명 |
|---|---|---|
| `from` | 오늘 | 시작 날짜 (`YYYY-MM-DD`) |
| `to` | 오늘 + 7일 | 끝 날짜 (포함) |
| `building_id` | 없음 | 특정 건물만 |
| `category` | 없음 | 아래 값 중 하나 |
| `q` | 없음 | 제목·주최 검색 |
| `limit`, `offset` | 50, 0 | 페이지 |

→ 목록 응답, `items: Seminar[]`, `start_at` 오름차순

**`GET /api/v1/seminars/{id}`** → `Seminar`
```json
{
  "id": "sem_portal_12345",
  "title": "OO 초청 세미나",
  "category": "seminar",
  "start_at": "2026-12-01T16:00:00+09:00",
  "end_at": null,
  "place_raw": "E7동 304호",
  "building_id": "bld_E7",
  "room": "304",
  "lat": 35.0,
  "lng": 128.0,
  "host": "OO학과",
  "source_url": "https://...",
  "updated_at": "2026-11-21T06:00:00+09:00"
}
```
- `category`: `"seminar"` | `"lecture"` | `"event"` | `"other"`
- 장소 매핑에 실패하면 `building_id`, `lat`, `lng`는 `null` → 지도에는 안 뜨고 목록에만 표시

### 6.4 맛집 (팀원 담당 — 초안, 담당자 확인 필요)

**`GET /api/v1/restaurants?category=&lat=&lng=&radius_m=1000`** → 목록 응답, `items: Restaurant[]`
```json
{
  "id": "rst_001",
  "name": "가게 이름",
  "category": "한식",
  "address": "대구 달성군 ...",
  "lat": 35.0,
  "lng": 128.0,
  "phone": null,
  "rating_avg": 4.3,
  "review_count": 12,
  "kakao_place_id": null
}
```
**`GET /api/v1/restaurants/{id}/reviews`** → 목록 응답, `items: Review[]`
**`POST /api/v1/restaurants/{id}/reviews`** (인증 필요) 요청: `{ "rating": 5, "content": "..." }`
```json
{ "id": "rev_001", "restaurant_id": "rst_001", "rating": 5, "content": "...", "author_nickname": "익명1", "created_at": "..." }
```

### 6.5 길찾기 / 러닝 루트 (팀원 담당 — 초안)

**`GET /api/v1/route?from=35.0,128.0&to=35.01,128.01&mode=walk&slope=true`**
- `from`, `to`: `"lat,lng"` 문자열
- `mode`: `"walk"` | `"run"` / `slope`: 기울기 보정 여부
```json
{
  "distance_m": 850,
  "duration_s": 660,
  "ascent_m": 12,
  "descent_m": 3,
  "geometry": { "type": "LineString", "coordinates": [[128.0, 35.0], [128.01, 35.01]] }
}
```

**`GET /api/v1/running-routes?distance_km=5`** → 목록 응답, `items: RunningRoute[]`
```json
{ "id": "run_001", "name": "캠퍼스 한 바퀴", "distance_m": 5000, "ascent_m": 30, "signal_count": 2, "geometry": { "type": "LineString", "coordinates": [] } }
```

### 6.6 제보 (팀원 담당 — 기능 방향 확정 후 `type` 값 정의)

**`GET /api/v1/reports?bbox=minLng,minLat,maxLng,maxLat`** → 목록 응답 (만료 안 된 것만)
**`POST /api/v1/reports`** (인증 필요) 요청: `{ "type": "...", "lat": 35.0, "lng": 128.0, "description": null }`
**`POST /api/v1/reports/{id}/votes`** (인증 필요) 요청: `{ "vote": "confirm" }` 또는 `{ "vote": "deny" }`
```json
{
  "id": "rpt_001",
  "type": "dark_road",
  "lat": 35.0,
  "lng": 128.0,
  "description": null,
  "created_at": "2026-11-21T22:00:00+09:00",
  "expires_at": "2026-11-21T23:00:00+09:00",
  "confirm_count": 3,
  "deny_count": 0
}
```
- 기본 만료 60분, confirm 투표마다 만료 30분 연장, deny가 confirm보다 3개 이상 많으면 즉시 숨김

### 6.7 인증 (통합 — 나, 맛집 담당과 협의)

- `POST /api/v1/auth/email/request` 요청: `{ "email": "xxx@학교도메인" }` → 학교 도메인만 허용, 6자리 코드 메일 발송
- `POST /api/v1/auth/email/verify` 요청: `{ "email": "...", "code": "123456" }` → `{ "access_token": "...", "token_type": "bearer", "expires_in": 2592000 }`
- 이메일 원문은 저장하지 않고 해시만 저장, 화면에는 닉네임만 노출
