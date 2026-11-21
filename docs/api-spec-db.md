# DB 파트 API 규격 — 맛집 · 제보(경찰) · 밥친구

> 담당: bamfiring (DB 파트)
> 기준 문서: 팀 인수인계 v2 (`hyeonpung-map-handoff.md`)의 5장 공통 규칙을 그대로 따라요.
> 이 문서는 인수인계 v2의 **6.4(맛집), 6.6(제보)를 확정안으로 바꾸고, 6.8(밥친구)을 새로 제안**해요.
> 공통 규칙에 추가가 필요한 것은 맨 아래 "팀 합의 필요" 에 모아 뒀어요.

---

## 0. 공통 규칙 (v2 5장 요약 — 그대로 따름)

- 기본 경로 `/api/v1`, 필드 `snake_case`, 값이 없으면 `null` (필드를 빼지 않음)
- 시간: 서울 오프셋 포함 ISO 8601 → `"2026-12-01T18:00:00+09:00"`. 요청에 오프셋이 없으면 서울 시간으로 해석
- 좌표: WGS84 `lat`, `lng`
- ID: 문자열 + 접두어. 이 파트 접두어: `rst_`(가게) `rev_`(후기) `rpt_`(제보) `mtp_`(밥약속) `msg_`(채팅) `usr_`(사용자)
  - 내부 DB는 정수 PK, API에서 `rst_12` 처럼 바꿔요. 형식이 틀린 ID는 404 `NOT_FOUND`
- 목록 응답: `{ "items": [...], "count": <이번 응답 개수>, "total": <전체 개수>, "updated_at": <가장 최근 변경 시각 또는 null> }`, `limit`(기본 50, 최대 200)/`offset`(기본 0)
- 에러: `{ "error": { "code": "...", "message": "한국어 설명" } }`
- 인증: 쓰기 API는 `Authorization: Bearer <JWT>`. 읽기 API는 인증 없이 되고, 토큰이 있으면 `is_mine`, `liked_by_me`, `my_vote`, `joined` 같은 개인 필드를 채워요(없으면 `false`/`null`)
- JWT: HS256, `sub` = 사용자 정수 id 문자열, `exp` 포함. 비밀키는 `JWT_SECRET` (통합 담당의 이메일 인증이 발급)

---

## 6.4 맛집 (확정안)

### 데이터: `Restaurant`
```json
{
  "id": "rst_12",
  "name": "든든국밥",
  "category": "한식",
  "address": "대구 달성군 현풍읍 ...",
  "lat": 35.69,
  "lng": 128.45,
  "phone": null,
  "kakao_place_id": null,
  "rating_avg": 4.33,
  "review_count": 3,
  "score": 4.21,
  "top_tags": ["가성비", "혼밥가능"],
  "distance_m": null,
  "created_at": "2026-11-21T12:00:00+09:00"
}
```
- `rating_avg`: 후기 없으면 `null`. 소수 둘째 자리 반올림
- `score`: **추천순 점수** = 베이지안 평균 `(C·m + 별점합) / (C + 후기수)`, `C=3`, `m`=전체 후기 평균(후기가 하나도 없으면 3.5). 후기 1개짜리 5점 가게가 1등이 되지 않게 해요. 소수 셋째 자리
- `top_tags`: 후기에 가장 많이 붙은 태그 최대 3개
- `distance_m`: 요청에 `lat`,`lng`가 있을 때만 정수(m), 아니면 `null`

### 데이터: `RestaurantDetail` = `Restaurant` + 아래 필드
```json
{
  "description": null,
  "rating_distribution": { "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 },
  "tag_counts": { "가성비": 2, "혼밥가능": 1 },
  "upcoming_meetups": [ { "id": "mtp_3", "title": "저녁 같이", "meal_time": "...", "member_count": 2, "max_people": 4, "status": "open" } ]
}
```

### 데이터: `Review`
```json
{
  "id": "rev_40",
  "restaurant_id": "rst_12",
  "rating": 5,
  "content": "시험기간 밤에 가기 좋아요",
  "tags": ["늦게까지"],
  "author_nickname": "익명의 사슴",
  "like_count": 2,
  "liked_by_me": false,
  "is_mine": false,
  "created_at": "2026-11-21T12:00:00+09:00"
}
```

### 선택지
- `category`: `한식` `중식` `일식` `양식` `분식` `카페` `술집` `패스트푸드` `학식` `기타`
- `tags`: `혼밥가능` `가성비` `양많음` `분위기` `늦게까지` `배달` `단체석` `학생할인`

### 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/v1/restaurants/meta` | - | `{ "categories": [...], "tags": [...] }` |
| GET | `/api/v1/restaurants` | 선택 | 목록. 쿼리 아래 표 |
| POST | `/api/v1/restaurants` | 필수 | 맛집 추천 (첫 후기 필수) → 201 `RestaurantDetail` |
| GET | `/api/v1/restaurants/{id}` | 선택 | `RestaurantDetail` |
| GET | `/api/v1/restaurants/{id}/reviews` | 선택 | 목록 `items: Review[]`. `sort=helpful`(기본, 도움돼요 많은 순→최신) \| `recent` |
| POST | `/api/v1/restaurants/{id}/reviews` | 필수 | `{ "rating": 1~5, "content": "5~500자", "tags": [] }` → 201 `Review` |
| DELETE | `/api/v1/reviews/{id}` | 필수 | 내 후기만 → 204 |
| POST | `/api/v1/reviews/{id}/like` | 필수 | 도움돼요 켜기/끄기 → `{ "liked": true, "like_count": 3 }`. 내 후기엔 403 |
| GET | `/api/v1/restaurants/place-search?q=국밥` | 필수 | 카카오 로컬 검색 프록시(아래) |

`GET /restaurants` 쿼리
| 쿼리 | 기본 | 설명 |
|---|---|---|
| `category` | - | 위 선택지 |
| `tag` | - | 위 선택지 (그 태그가 붙은 후기가 하나라도 있는 가게) |
| `q` | - | 이름 검색 |
| `lat`, `lng` | - | 있으면 `distance_m` 계산 |
| `radius_m` | - | `lat`,`lng`와 함께 쓰면 반경 안만 |
| `sort` | `score` | `score` \| `distance`(lat,lng 필수) \| `recent` \| `reviews` |
| `limit`, `offset` | 50, 0 | |

`POST /restaurants` 요청
```json
{
  "name": "든든국밥", "category": "한식",
  "lat": 35.69, "lng": 128.45,
  "address": null, "phone": null, "kakao_place_id": null, "description": null,
  "first_review": { "rating": 5, "content": "맛있어요 또 갈래요", "tags": ["가성비"] }
}
```
- 서비스 지역(캠퍼스 중심 반경 `SERVICE_RADIUS_M`, 기본 8000m) 밖이면 422 `VALIDATION_ERROR`
- **중복 방지**: 같은 `kakao_place_id`가 있거나, 같은 이름이 50m 안에 있으면 409 `CONFLICT` + `error.details = { "restaurant_id": "rst_12" }` → 프론트는 "이미 있어요, 후기를 남겨 주세요"로 안내
- 1인 1후기: 같은 가게 두 번째 후기는 409 `CONFLICT`

**카카오 로컬 검색 프록시** `GET /restaurants/place-search?q=`
- 서버가 `KAKAO_REST_API_KEY`로 카카오 키워드 검색을 대신 불러요 (키를 브라우저에 노출하지 않기 위해). 캠퍼스 중심 좌표·반경으로 제한, 음식점(FD6)·카페(CE7) 분류만
- 응답: 목록 `items: [{ "kakao_place_id", "name", "category_hint", "address", "phone", "lat", "lng", "already_registered_id": "rst_12" | null }]`
- 키가 없거나 카카오가 실패하면 502 `UPSTREAM_ERROR` (프론트는 "지도에서 직접 찍기"로 대체)
- 가게 **기본 정보만** 가져와요. 다른 플랫폼 리뷰는 수집하지 않아요

---

## 6.6 제보 (확정안 — 첫 타입은 경찰 단속)

킥보드 헬멧 단속을 피하려는 용도로 시작하고, "안전 귀갓길" 방향이 정해지면 `type`만 늘리면 되게 만들어요.

### `type`과 규칙 (타입별 설정)
| type | 뜻 | 기본 유지 | 확인 1표당 연장 | 합치기 반경 |
|---|---|---|---|---|
| `police` | 경찰 단속·순찰 | 30분 | 15분 | 100m |
| `dark_road` | 어두운 길 (귀갓길용 예비) | 60분 | 30분 | 50m |
| `hazard` | 공사·위험 (예비) | 60분 | 30분 | 50m |

- 경찰은 금방 이동하니까 v2 초안(60분)보다 짧게 잡았어요
- **합치기**: 같은 type의 활성 제보가 반경 안에 있으면 새로 만들지 않고 그 제보에 `confirm` 투표한 것으로 처리 → 응답의 `merged: true`
- **숨김**: `deny ≥ 2` 이면서 `deny > confirm` 이면 바로 숨김. (v2 초안은 "deny가 confirm보다 3 많으면"이었는데, 사용자가 적은 발표 시연에서는 3표 차이가 거의 안 나와서 바꿨어요)
- **도배 방지**: 같은 사람은 2분에 한 번만 새 제보 → 429 `RATE_LIMITED` (합쳐지는 경우는 제외)
- 제보자 정보는 응답에 넣지 않아요 (익명)
- 만료·숨김된 제보도 DB에서 지우지 않고 통계(단속 다발 구역)에 써요

### 데이터: `Report`
```json
{
  "id": "rpt_7",
  "type": "police",
  "lat": 35.69, "lng": 128.45,
  "description": "정문 앞 2명, 헬멧 단속",
  "created_at": "2026-11-21T22:00:00+09:00",
  "last_confirmed_at": "2026-11-21T22:10:00+09:00",
  "expires_at": "2026-11-21T22:45:00+09:00",
  "confirm_count": 1,
  "deny_count": 0,
  "confidence": 0.71,
  "is_active": true,
  "my_vote": null
}
```
- `confidence` (0~1, 소수 둘째): `0.6 + 0.15·confirm − 0.25·deny − 0.4·min(마지막 확인 후 지난 분 / 기본 유지 분, 1)` 을 0~1로 자름
- `my_vote`: `"confirm"` | `"deny"` | `null`

### 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/v1/reports?bbox=minLng,minLat,maxLng,maxLat&type=police` | 선택 | 활성 제보만, 최신순. bbox·type 생략 가능 |
| POST | `/api/v1/reports` | 필수 | `{ "type": "police", "lat", "lng", "description": null }` → 201 `Report` + `"merged": bool` |
| GET | `/api/v1/reports/{id}` | 선택 | `Report` (만료돼도 조회는 됨, `is_active: false`) |
| POST | `/api/v1/reports/{id}/votes` | 필수 | `{ "vote": "confirm" \| "deny" }` → `Report`. 이미 내려간 제보는 409 `CONFLICT`. 다시 투표하면 내 표가 바뀜 |
| GET | `/api/v1/reports/hotspots?type=police&days=30` | - | 단속 다발 구역 (아래) |

**단속 다발 구역** `GET /reports/hotspots`
- 지난 `days`일(1~365) 제보를 약 100m 격자(위경도 소수 셋째 자리)로 묶어요
- 목록 `items: [{ "lat", "lng", "count", "peak_hour": 0~23 (서울 시각), "peak_weekday": "월"~"일" }]`, `count` 큰 순
- 발표 포인트: "이 앞은 주로 화요일 8시에 단속해요"

---

## 6.8 밥친구 (새 제안 — v2에서 "커뮤니티 후순위" 항목)

시간대별로 캠퍼스에서 같이 밥 먹을 사람을 찾는 기능이에요. 맛집과 이어져요(가게 상세 → "여기서 같이 먹을 사람 구하기").

### 데이터: `Meetup`
```json
{
  "id": "mtp_3",
  "title": "오늘 저녁 학식 같이 드실 분",
  "place_name": "학생식당",
  "restaurant_id": null,
  "lat": null, "lng": null,
  "meal_time": "2026-11-21T18:00:00+09:00",
  "max_people": 4,
  "member_count": 2,
  "members": ["익명의 사슴", "배고픈 고양이"],
  "host_nickname": "익명의 사슴",
  "note": null,
  "status": "open",
  "joined": false,
  "is_host": false,
  "created_at": "2026-11-21T15:00:00+09:00"
}
```
- `status`: `open` | `full`(정원 참) | `cancelled`(방장이 나감)
- `restaurant_id`를 주면 가게 좌표가 `lat`,`lng`에 자동으로 들어가요

### 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/v1/meetups?within_hours=24&include_full=true` | 선택 | 앞으로 N시간(1~168) 안 모임, `meal_time` 순. 시작 후 30분까지는 보여요 |
| POST | `/api/v1/meetups` | 필수 | `{ "title", "place_name", "meal_time", "max_people": 2~10, "restaurant_id"?, "lat"?, "lng"?, "note"? }` → 201. 방장 자동 참여. 지난 시간(10분 넘게)·7일 넘는 미래는 422 |
| GET | `/api/v1/meetups/{id}` | 선택 | `Meetup` |
| POST | `/api/v1/meetups/{id}/join` | 필수 | 참여 → `Meetup`. 이미 참여/정원 참/취소됨/끝남 → 409 `CONFLICT` |
| POST | `/api/v1/meetups/{id}/leave` | 필수 | 나가기 → `Meetup`. 방장이 나가면 `cancelled` |
| GET | `/api/v1/meetups/{id}/messages?after_id=` | 필수(참여자) | 목록 `items: [{ "id": "msg_1", "nickname", "content", "created_at" }]`. 비참여자 403 |
| POST | `/api/v1/meetups/{id}/messages` | 필수(참여자) | `{ "content": "1~300자" }` → 201 |

---

## 6.9 실시간 알림 (추가 제안, 선택)

v2는 제보를 60초마다 다시 불러오는(polling) 방식이에요. 경찰 제보는 몇 초가 중요해서 **WebSocket을 덧붙이는 것**을 제안해요. 안 쓰기로 해도 polling만으로 다 동작해요.

- `ws(s)://<서버>/api/v1/ws` 연결 → 서버가 `{ "type": "...", "data": {...} }` 를 보내요
- 프론트는 받은 `type`에 맞는 TanStack Query 키를 무효화(invalidate)만 하면 돼요

| type | data |
|---|---|
| `report.created` / `report.updated` | `Report` |
| `report.removed` | `{ "id": "rpt_7" }` |
| `restaurant.created` / `restaurant.updated` | `Restaurant` |
| `meetup.created` / `meetup.updated` / `meetup.cancelled` | `Meetup` (개인 필드 제외) |
| `meetup.message` | `{ "meetup_id": "mtp_3", "message_id": "msg_9" }` (내용은 방송 안 함) |
| `online.count` | `{ "count": 5 }` |

Caddy는 WebSocket을 별도 설정 없이 프록시해요. Uvicorn 워커 1개 전제와도 맞아요.

---

## 6.10 지금 밥 먹을 사람 — 실시간 위치 (새 기능)

"지금 밥 먹을래요"를 켠 사람만 지도에 점으로 떠요. 서로 보고 바로 "같이 먹자"를 보낼 수 있어요.

### 개인정보 원칙 (꼭 지켜요)
- **기본은 꺼짐**. 사용자가 직접 켜야만 공유돼요. 켤 때 "내 대략적인 위치가 다른 학생에게 보여요" 안내
- **위치는 약 50m 격자로 흐려서** 보여 줘요 (서버에서 처리, 정확한 좌표는 응답에 절대 안 나감)
- **DB에 저장하지 않아요**. 서버 메모리에만 있고, 기록도 안 남겨요 (버스 캐시와 같은 방식, 워커 1개 전제)
- **자동으로 꺼져요**: 고른 시간(30/60/120분)이 지나거나, 3분 동안 신호(heartbeat)가 없으면 사라져요. 앱을 닫으면 곧 사라지는 셈이에요
- 서비스 지역 밖이면 422
- 로그인한 사람만 목록을 볼 수 있어요 (외부에서 긁어 가기 어렵게)

### 데이터: `Presence`
```json
{
  "user_id": "usr_3",
  "nickname": "배고픈 너구리",
  "lat": 35.7031, "lng": 128.4559,
  "until": "2026-11-21T13:30:00+09:00",
  "food_pref": "한식",
  "message": "국밥 땡겨요",
  "distance_m": 120,
  "updated_at": "2026-11-21T12:58:10+09:00",
  "is_me": false
}
```
- `lat`,`lng`: 흐린 좌표 (소수 넷째 자리 기준 약 50m 격자 중심)
- `food_pref`: 맛집 카테고리 중 하나 또는 `null` ("아무거나")
- `distance_m`: 내 위치도 켜져 있을 때만 정수, 아니면 `null`

### 엔드포인트
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| PUT | `/api/v1/presence/me` | 필수 | 켜기·갱신(heartbeat). `{ "lat", "lng", "minutes": 30\|60\|120, "food_pref": null, "message": null(0~40자) }` → `Presence`. 처음 켤 때만 `until`이 정해지고, 이후 PUT은 위치·메시지만 바꾸고 시간을 연장하지 않아요 (`minutes`를 다시 보내면 새로 정함) |
| DELETE | `/api/v1/presence/me` | 필수 | 끄기 → 204 |
| GET | `/api/v1/presence` | 필수 | 지금 켜진 사람들 → 목록 `items: Presence[]` (나 포함, `is_me`로 구분), 가까운 순 |
| POST | `/api/v1/presence/{user_id}/invite` | 필수 | "같이 먹자" 제안. 요청은 6.11 번개 약속과 같은 형식 → 번개 약속을 만들고(나=방장) 상대에게 `invite.received` 알림 → 201 `Meetup`. 상대가 위치를 껐으면 404, 자기 자신에게는 422, 같은 상대에게 5분 안에 다시 보내면 429 |

---

## 6.11 번개 약속 — 한 번에 잡기 (새 기능)

제목·시간을 직접 안 써도 버튼 두 번으로 약속을 만들어요.

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/v1/meetups/quick` | 필수 | `{ "when": "now"\|"in_30"\|"in_60"\|"lunch"\|"dinner", "restaurant_id": null, "place_name": null, "max_people": 4, "note": null }` → 201 `Meetup` |
| GET | `/api/v1/meetups/suggestions?lat=&lng=` | 선택 | 지금 참여하기 좋은 약속 추천: 2시간 안에 시작하는 `open` 약속을 "시간 가까움 + 거리 가까움" 점수로 정렬, 최대 5개 → 목록 `items: Meetup[]` + 각 항목에 `distance_m` |

- `when` 계산 (서울 시각): `now`=지금+10분, `in_30`, `in_60`, `lunch`=오늘 12:00 (이미 지났으면 내일), `dinner`=오늘 18:00 (지났으면 내일). 분은 5분 단위로 올림
- 장소: `restaurant_id`가 있으면 가게 이름·좌표, 없으면 `place_name`, 둘 다 없으면 `"학생식당"`
- 제목 자동: `"⚡ 번개 · 12:30 든든국밥"`

### 실시간 알림 추가 (6.9에 더해요)
- WebSocket 주소에 토큰을 붙이면 나에게만 오는 알림도 받아요: `ws(s)://<서버>/api/v1/ws?token=<JWT>` (없으면 공개 알림만)
| type | 누구에게 | data |
|---|---|---|
| `presence.updated` | 전체(로그인 연결만) | `Presence` (`distance_m`·`is_me` 제외) |
| `presence.removed` | 전체(로그인 연결만) | `{ "user_id": "usr_3" }` |
| `invite.received` | 받는 사람만 | `{ "meetup": Meetup, "from_nickname": "..." }` |

---

## 6.12 밥약속 알림 (meetup.notice)

밥약속에 **참여한 사람에게만** 가는 WebSocket 알림이에요. 로그인한 연결(`?token=<JWT>`)에만 가요. 6.9의 공개 방송(`meetup.created/updated/cancelled/message`)은 그대로 두고, 이 알림을 하나 더 보내요.

- type: `meetup.notice`
- data:

| 칸 | 타입 | 설명 |
|---|---|---|
| `kind` | `"joined"`\|`"left"`\|`"full"`\|`"cancelled"`\|`"message"`\|`"reminder"` | 무슨 일인지 |
| `meetup_id` | string | `"mtp_3"` |
| `title` | string | 모임 제목 |
| `meal_time` | string | `"2026-11-21T12:30:00+09:00"` |
| `place_name` | string \| null | 가게가 연결돼 있으면 가게 이름, 아니면 `place_name` |
| `member_count` | int | 이 일이 끝난 뒤 인원 |
| `max_people` | int | 정원 |
| `actor_nickname` | string \| null | 참여·나감·취소·채팅한 사람. `reminder`는 `null` |
| `preview` | string \| null | `message`일 때만: 채팅 앞 40자 (잘렸으면 끝에 `…`). 그 밖에는 `null` |

| kind | 언제 | 누구에게 |
|---|---|---|
| `joined` | 누가 참여했고 아직 자리가 남음 | 참여한 사람을 뺀 모든 참여자 |
| `full` | 이번 참여로 정원이 참 (`joined`는 따로 안 감) | 참여한 사람을 **포함한** 모든 참여자 |
| `left` | 방장이 아닌 사람이 나감 | 남은 참여자 |
| `cancelled` | 방장이 나가서 모임이 취소됨 | 방장을 뺀 모든 참여자 |
| `message` | 채팅이 옴 | 보낸 사람을 뺀 참여자 (채팅은 참여자만 볼 수 있어서 미리보기를 줘도 돼요) |
| `reminder` | 상태가 `open`/`full`인 모임의 밥 시간이 10분 이내로 다가옴 (아직 미래일 때) | 모든 참여자, 모임마다 한 번 |

- 이미 취소된 모임에서 다시 나가기를 눌러도 `left`/`cancelled` 알림은 또 가지 않아요.
- `reminder`는 서버가 30초마다 확인해요. 이미 보낸 (모임, 밥 시간)은 서버 메모리에 기억해요 (워커 1개 전제). 서버를 다시 켜면 한 번 더 갈 수 있어요.

---

## DB 테이블 (SQLModel, SQLite 전용 문법 없음)

| 테이블 | 컬럼 |
|---|---|
| `users` *(통합 담당 소유)* | id, email_hash(UNIQUE, null 허용 — 개발용 로그인), nickname(UNIQUE), created_at |
| `restaurants` | id, name, category, address, lat, lng, phone, kakao_place_id(UNIQUE, null 허용), description, created_by → users, created_at |
| `reviews` | id, restaurant_id, user_id, rating(1~5), content, created_at, UNIQUE(restaurant_id, user_id) |
| `review_tags` | review_id, tag — PK(review_id, tag) |
| `review_likes` | review_id, user_id, created_at — PK(review_id, user_id) |
| `reports` | id, type, user_id, lat, lng, description, status(`active`/`hidden`), created_at, last_confirmed_at, expires_at |
| `report_votes` | report_id, user_id, vote(`confirm`/`deny`), created_at — PK(report_id, user_id) |
| `meetups` | id, host_id, title, place_name, restaurant_id, lat, lng, meal_time, max_people, note, status, created_at |
| `meetup_members` | meetup_id, user_id, joined_at — PK(meetup_id, user_id) |
| `meetup_messages` | id, meetup_id, user_id, content, created_at |

- 시간 컬럼은 timezone-aware(UTC로 저장, 응답 때 +09:00으로 변환)
- 인덱스: reviews.restaurant_id, reports(status, expires_at), meetups(status, meal_time), meetup_messages(meetup_id, id)

---

## 프론트엔드 (v2 8장 규약 따름)

내가 만드는 파일 (통합 담당의 `MapView`·`BottomSheet` 안에 끼워요)
- `src/layers/RestaurantLayer.tsx`, `src/layers/ReportLayer.tsx`, `src/layers/MeetupLayer.tsx` — `{ visible: boolean }`, 마커 클릭 시 `select({ type, id })`만 호출
- `src/sheets/RestaurantSheet.tsx`, `ReportSheet.tsx`, `MeetupSheet.tsx` — 바텀시트 상세 화면
- `src/panels/` — 맛집 목록·추천 폼, 제보 버튼, 밥친구 목록·만들기 폼
- `src/api/types.db.ts`, `src/api/hooks/db/*.ts` — 이 문서의 타입과 TanStack Query 훅
- `src/dev/` — **임시** 지도·바텀시트 (통합 전까지 나 혼자 확인용, 통합 때 버림)
- 갱신 주기: 제보 60초(+WebSocket 오면 즉시), 밥친구 30초, 맛집 staleTime 10분

`SelectedItem`에 `{ type: "meetup"; id: string }` 추가가 필요해요.

---

## 임시로 정한 것 (팀과 다르면 그때 바꿔요)

팀원에게 묻지 않고 일단 이렇게 정해서 만들었어요. 다르게 정해지면 그때 맞춰요.

1. 에러 `code`에 `CONFLICT`(409), `RATE_LIMITED`(429) 추가, `error.details`(선택, 객체) 허용
2. 목록 응답에 `total`(전체 개수) 추가
3. 6.9 WebSocket 사용 (polling만으로도 동작)
4. `SelectedItem`에 `meetup`, `presence` 추가
5. 개발용 로그인 `POST /api/v1/auth/dev-login { "nickname" }` — `APP_ENV=dev`일 때만
6. 환경변수 추가: `KAKAO_REST_API_KEY`, `CAMPUS_LAT`, `CAMPUS_LNG`, `SERVICE_RADIUS_M`, `APP_ENV`
7. 캠퍼스 중심 좌표: OSM 기준 정문(35.7003,128.4576)과 강의동(35.7063,128.4538)의 중간점 35.7033, 128.4557
8. 실시간 위치(6.10)는 DB가 아니라 서버 메모리에 둬요 (워커 1개 전제와 같음)
9. 밥약속 알림(6.12)의 "밥 시간 10분 전" 알림은 보낸 기록을 서버 메모리에만 둬요. 서버를 다시 켜면 같은 알림이 한 번 더 갈 수 있어요
