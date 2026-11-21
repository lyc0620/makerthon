# 현풍 지도 프로젝트 — 작업 인수인계 v2 (크롤링·통합 담당)

> 이 문서는 Claude Code에서 프로젝트를 이어가기 위한 컨텍스트입니다.
> 나는 이 팀 프로젝트에서 **세미나 수집 + 버스 도착정보 수집 + 최종 통합(백엔드 정리 + 프론트엔드)**을 맡았습니다.
> **5~7장의 기술 스택과 API 규격은 확정안**입니다. 이 문서와 다르게 구현해야 할 이유가 생기면 코드보다 문서를 먼저 고칩니다.

---

## 1. 프로젝트 개요

현풍(대구 달성군) 캠퍼스와 주변 생활권 정보를 **지도 하나에 모아 보여주는 모바일 웹 서비스**입니다.
흩어진 정보(버스, 교내 세미나, 맛집 등)를 한곳에서 보게 하는 것이 핵심 가치입니다.

### 기획된 기능

| 기능 | 구현 방향 | 담당 |
|---|---|---|
| 3D 지도 | MapLibre 위에 2.5D 건물 돌출(`fill-extrusion`) + 캠퍼스 주요 건물만 glTF 모델. **2D로 기능 먼저, 3D는 나중** | 김도현 |
| 최단거리 길찾기 | OpenStreetMap 보행로를 그래프로 변환해 백엔드에서 직접 Dijkstra/A*. 외부 경로 엔진은 쓰지 않음. 기울기는 DEM으로 보정(후순위) | 김도현 |
| 러닝 루트 추천 | 길찾기와 같은 보행로 그래프로 목표 거리 순환 코스 자동 생성(후보 최대 3개). 신호등·기울기는 후순위 | 김도현 |
| 제보 (경찰 순찰 → "안전 귀갓길"로 재검토 중) | TTL(기본 60분) + 유저 확인/부정 투표로 만료 | 팀원 |
| 리얼 후기 맛집 | 자체 DB + 학교 이메일 인증 리뷰. 가게 기본정보는 카카오 로컬 API. 타 플랫폼 리뷰 크롤링 금지 | 팀원 |
| **버스 남은 시간** | **공공데이터 API + 서버 메모리 캐시**. 셔틀은 시간표 기반 | **나** |
| **교내 세미나 위치·일정** | **학교 포탈 크롤링(또는 학교 제공 데이터)** + 장소→건물 좌표 매핑 | **나** |
| 커뮤니티 | 후순위. 우선은 리뷰/제보 댓글 정도 | 팀원 |
| **최종 통합** | 백엔드 정리, 프론트엔드(지도 컨테이너, 공통 UI), 배포 | **나** |

### 전체 우선순위
1. 2D 지도 + 버스 + 세미나 + 맛집
2. 길찾기 (기울기 포함)
3. 3D 시각화
4. 러닝 루트, 제보, 커뮤니티

---

## 2. 내 담당 범위와 원칙

### 버스
- **네이버맵 크롤링은 하지 않는다.** (약관 위반 소지, 구조 변경·차단 시 바로 깨짐)
- 공공데이터포털(data.go.kr)의 대구 버스 도착정보 API 또는 TAGO 버스 도착정보 API 사용. 정확한 API 이름·엔드포인트·호출 한도는 포털에서 확인.
- 대상 노선 예: **직행2** 등. 정류장·노선 목록은 팀과 확정 필요.
- 사용자 요청마다 외부 API를 부르지 않는다. **스케줄러가 30초 주기로 받아 메모리 캐시에 저장**, API는 캐시만 반환.

### 세미나
- 학교 포탈의 세미나·행사 게시판이 대상. 로그인 필요 여부, 정적/동적 렌더링 여부는 **아직 미확인**.
- 크롤링 전에 robots.txt·이용 규정 확인, 학교(IT 부서/학생처)에 데이터 제공 가능 여부 문의.
- 요청 간 간격(1초 이상), 하루 4회(06·12·18·24시) 수집.
- 핵심 난제: `"E7동 304호"` → 건물 좌표 변환용 **건물 매핑 테이블** (`buildings`).

### 통합
- 다른 팀원들은 6~7장의 규격대로 자기 모듈(라우터, 레이어 컴포넌트)을 만든다.
- 나는 저장소 뼈대, 공통 설정, 지도 컨테이너, 바텀시트, 배포를 책임진다.

---

## 3. 확정 기술 스택

### 백엔드
| 항목 | 선택 |
|---|---|
| 언어 | Python 3.12+ |
| 패키지 관리 | uv |
| 웹 프레임워크 | FastAPI + Uvicorn (**워커 1개로 실행** — 스케줄러·메모리 캐시가 프로세스 안에 있기 때문) |
| DB | SQLite (WAL 모드) |
| ORM / 마이그레이션 | SQLModel / Alembic |
| 설정 | pydantic-settings (`.env`) |
| 외부 HTTP 호출 | httpx |
| 크롤링 | BeautifulSoup4 (정적), Playwright는 동적 렌더링일 때만 추가 |
| 스케줄러 | APScheduler (FastAPI lifespan 안에서 시작) |
| 인증 | JWT Bearer (학교 이메일 인증 후 발급) |
| 테스트 / 린트 | pytest / ruff |

> PostgreSQL 전환 조건: 길찾기 담당이 pgRouting을 쓰기로 하거나, 위치 검색이 무거워질 때. ORM을 쓰므로 `DATABASE_URL`만 바꾸면 되게 유지한다. **SQLite 전용 문법은 쓰지 않는다.**

### 프론트엔드
| 항목 | 선택 |
|---|---|
| 프레임워크 | React + Vite + TypeScript |
| 패키지 관리 | npm |
| 지도 | MapLibre GL JS + react-map-gl (`react-map-gl/maplibre`) |
| 배경 지도 | MapTiler (OSM 기반) 무료 플랜. 첫 주에 현풍 일대 한글 표기를 확인하고, 부족하면 브이월드 배경으로 교체 (style URL만 바꾸면 되게 구성) |
| 3D (후순위) | deck.gl 또는 Three.js를 MapLibre 레이어로 추가 |
| 서버 데이터 | TanStack Query |
| UI 상태 | Zustand |
| 스타일 | Tailwind CSS |
| PWA | vite-plugin-pwa |
| 린트 / 포맷 | ESLint / Prettier |

### 배포
- VM 한 대(학교 서버 또는 클라우드 VM, **영구 디스크 필수** — SQLite 파일 보존)
- Docker Compose: `backend` + `caddy`(프론트 빌드 정적 서빙 + `/api` 리버스 프록시 + 자동 HTTPS)
- HTTPS 필수 (브라우저 위치 권한이 HTTPS에서만 동작)

### 저장소 / 협업
- 모노레포 하나: `hyeonpung-map/`
- 브랜치: `main`(보호) ← `feat/<이름>-<기능>` PR, 리뷰 1명 이상
- 커밋 메시지: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`

---

## 4. 디렉터리 구조

```
hyeonpung-map/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱, lifespan(스케줄러 시작), CORS, 에러 핸들러
│   │   ├── core/
│   │   │   ├── config.py        # Settings (pydantic-settings)
│   │   │   ├── db.py            # 엔진, 세션, WAL 설정
│   │   │   └── errors.py        # 공통 에러 형식
│   │   ├── models/              # SQLModel 테이블
│   │   ├── schemas/             # 응답/요청 모델 (6장 규격)
│   │   ├── routers/             # health, buildings, bus, seminars, restaurants, reports, route, auth
│   │   └── services/
│   │       ├── bus/             # API 클라이언트, 메모리 캐시, 셔틀 시간표 계산
│   │       ├── seminar/         # 크롤러(fetch_list, parse_detail), 장소 매핑
│   │       └── route/           # (김도현) 보행로 그래프 로드, 최단경로, 순환 코스 생성
│   ├── scheduler.py
│   ├── seed/
│   │   ├── buildings.json
│   │   ├── bus_stops.json
│   │   ├── shuttle_timetable.json
│   │   └── walk_graph.json      # (김도현) OSM 보행로 → 노드/간선 그래프. scripts/build_walk_graph.py로 생성
│   ├── scripts/
│   │   └── build_walk_graph.py  # (김도현) Overpass API로 현풍 일대 보행로 받아 그래프 생성 (1회 실행)
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── map/MapView.tsx      # 지도 하나 (통합 담당 관리)
│   │   ├── layers/              # BusLayer, SeminarLayer, RestaurantLayer, RouteLayer, RunningLayer, ReportLayer, Buildings3DLayer
│   │   ├── sheets/              # 바텀시트 내용 (타입별 상세 화면)
│   │   ├── components/          # BottomSheet, LayerToggle, TabBar 등 공통 UI
│   │   ├── api/
│   │   │   ├── client.ts        # fetch 래퍼 (에러 형식 처리)
│   │   │   ├── types.ts         # 6장 규격의 TS 타입
│   │   │   └── hooks/           # useBusArrivals, useSeminars ... (TanStack Query)
│   │   ├── store/ui.ts          # Zustand: 레이어 on/off, 선택된 항목
│   │   ├── store/route.ts       # (김도현) Zustand: 길찾기 출발/도착, 러닝 목표 거리, 선택된 코스
│   │   └── main.tsx
│   ├── vite.config.ts           # dev 서버: /api → http://localhost:8000 프록시
│   └── package.json
├── docs/api-spec.md             # 6장을 분리해 팀 공유용으로 유지
├── deploy/
│   ├── docker-compose.yml
│   └── Caddyfile
├── .env.example
└── README.md
```

---

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
> **(김도현) `seed/buildings.json` 작성 완료**: DGIST 사이버 투어 기준 21곳(E1~E8, R1~R7, 국제관, 비슬빌리지, 체육관 등). 위 필드에 `code`(예: `"E7"`)가 추가됨. `scripts/build_campus_seed.py`로 재생성.

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

### 6.5 길찾기 / 러닝 루트 (김도현 담당 — 확정)

**공통 전제**
- 경로 계산은 백엔드 `services/route/`에서 `seed/walk_graph.json`을 서버 시작 시 메모리에 올려 직접 수행한다. DB 테이블은 쓰지 않는다.
- 그래프: OSM `highway=footway|path|pedestrian|steps|living_street|residential|service|cycleway|track` 등 보행 가능한 길. 노드 `{id, lat, lng}`, 간선 `{from, to, length_m}` (양방향).
- 입력 좌표는 가장 가까운 그래프 노드로 스냅한다. **스냅 거리가 300m를 넘으면 400 `BAD_REQUEST`** ("보행로에서 너무 멉니다").
- 기울기(DEM)는 후순위. 반영 전까지 `ascent_m`, `descent_m`은 `null`, `slope` 파라미터는 받기만 하고 무시한다.
- 소요 시간: 걷기 1.3 m/s(약 4.7 km/h), 달리기 2.8 m/s(약 6분/km 페이스).

**`GET /api/v1/route?from=35.0,128.0&to=35.01,128.01&mode=walk&slope=false`**
- `from`, `to`: `"lat,lng"` 문자열 (필수)
- `mode`: `"walk"`(기본) | `"run"` / `slope`: 기울기 보정 여부 (기본 `false`)
- 경로가 없으면 404 `NOT_FOUND`
```json
{
  "distance_m": 850,
  "duration_s": 654,
  "ascent_m": null,
  "descent_m": null,
  "geometry": { "type": "LineString", "coordinates": [[128.0, 35.0], [128.01, 35.01]] }
}
```

**`GET /api/v1/running-routes?distance_km=5&lat=35.0&lng=128.0`** → 목록 응답, `items: RunningRoute[]`
| 쿼리 | 기본값 | 설명 |
|---|---|---|
| `distance_km` | 5 | 목표 거리 (1 ~ 21) |
| `lat`, `lng` | 캠퍼스 정문 | 출발·도착점 (순환 코스라 같은 지점으로 돌아옴) |

- 출발점 → 경유지 2곳 → 출발점 형태로 순환 코스를 만들고, 돌아오는 구간은 이미 지난 간선 가중치를 높여 같은 길 왕복을 피한다
- 목표 거리와의 오차가 작은 순서로 **최대 3개** 반환, 오차 ±15% 이내만 포함
- `id`는 요청마다 생성되는 임시 값(`run_` + 해시)이며 저장하지 않는다
```json
{
  "id": "run_a1b2c3",
  "name": "5.1km 코스 1",
  "distance_m": 5120,
  "ascent_m": null,
  "signal_count": null,
  "geometry": { "type": "LineString", "coordinates": [[128.0, 35.0]] }
}
```
- `signal_count`: 신호등(OSM `highway=traffic_signals`) 반영 전까지 `null`

**3D 지도 (프론트만, 후순위)**
- `Buildings3DLayer`: 배경 지도 벡터 타일의 `building` 레이어를 `fill-extrusion`으로 돌출 (`render_height` 사용). API 없음
- 레이어 토글에서 켜면 지도 `pitch`를 45도로 기울이고, 끄면 0으로 되돌린다

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

### 6.8 강의실 검색 (김도현 담당 — 확정)

데이터: `seed/buildings.json`(21곳), `seed/floor_plans.json`(층별 안내도 12장), `seed/rooms.json`(실 254개). DB 테이블은 쓰지 않고 메모리 검색.
안내도는 [DGIST 학부 School Facilities](https://www.dgist.ac.kr/en_college/sub05_02.do) 공식 이미지 (E2~E6의 2층, E3 3층, E7 G·L·2층). 실 위치(x, y)는 이미지 픽셀 기준 수작업 근사값.

**`GET /api/v1/campus/search?q=E7 L21&limit=20`** → 목록 응답, `items: CampusSearchItem[]`
- 검색어 예: `"E7 L21"`, `"e7-233"`, `"L21"`(L·G 번호는 E7), `"216"`(여러 건물), `"멀티미디어"`(실 이름), `"도서관"`(건물 별칭)
- 안내도에 없는 실(`"R2 301"`)은 `type: "building"` + 번호 첫 자리로 추정한 층
```json
{
  "type": "room",
  "id": "room_E7_L21",
  "code": "L21",
  "name": "멀티미디어 강의실3",
  "floor": "L",
  "floor_label": "L층",
  "building": { "id": "bld_E7", "name": "E7 컨실리언스홀", "lat": 35.70595, "lng": 128.454018 },
  "plan": {
    "id": "plan_E7_L_1",
    "image_url": "/api/v1/campus/floor-plans/plan_E7_L_1/image",
    "source_image_url": "https://www.dgist.ac.kr/images/college/sub04/sub0402_img08.png",
    "width": 920, "height": 431,
    "source_url": "https://www.dgist.ac.kr/en_college/sub05_02.do"
  },
  "x": 155,
  "y": 285
}
```
- `type`: `"room"` | `"building"`. `building` 타입이면 `plan`, `x`, `y`, `name`은 `null`
- `scans`: 그 건물·층의 3D 실내 스캔 목록 (없으면 `[]`). 현재 E8 3층 1개
  ```json
  "scans": [{ "id": "e8_3f_gs", "title": "3층 아트리움 → 유리벽 복도", "viewer": "splat", "viewer_url": "/api/v1/scans/splat-viewer?scan=e8_3f_gs" }]
  ```
  - `viewer`: `"splat"`(3D 가우시안 스플래팅) | `"points"`(점 구름). 목록은 `seed/scans.json`, 파일은 `backend/static/scans/`
  - 프론트는 `viewer_url`을 새 탭으로 열기만 하면 됨

**`routers/scans.py`** (Caddy가 `/api`만 백엔드로 넘기므로 뷰어 페이지도 `/api/v1` 아래)
- `GET /api/v1/scans/splat-viewer?scan={id}` → 스플랫 뷰어 HTML (`backend/static/viewers/splat.html`)
- `GET /api/v1/scans/points-viewer?scan={id}` → 점 구름 뷰어 HTML (`backend/static/viewers/points.html`)
- `GET /api/v1/scans/files/{name}` → `.splat` / `.ply` / `.json` 파일. 파일 이름만 허용, 없으면 404

**`GET /api/v1/campus/floor-plans/{plan_id}/image`** → PNG
- 학교 서버가 `Cross-Origin-Resource-Policy: same-site`라 브라우저에서 직접 띄울 수 없어 백엔드가 중계 (메모리 캐시). seed에 등록된 안내도만 허용
- 실패 시 502 `UPSTREAM_ERROR`, 없는 id는 404

---

## 7. DB 테이블 (SQLModel)

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `buildings` | id, name, aliases(JSON), lat, lng | seed에서 로드 |
| `bus_stops` | id, name, external_id, lat, lng, routes(JSON) | seed에서 로드 |
| `seminars` | id, source_id(UNIQUE), title, category, start_at, end_at, place_raw, building_id, room, lat, lng, host, source_url, updated_at | `source_id`로 중복 제거 |
| `crawl_logs` | id, job, started_at, finished_at, status, item_count, error | 크롤러 실패 추적 |
| `users` | id, email_hash, nickname, created_at | |
| `restaurants` | 6.4 필드 | 팀원 |
| `reviews` | id, restaurant_id, user_id, rating, content, created_at | 팀원 |
| `reports` / `report_votes` | 6.6 필드 / report_id, user_id, vote | 팀원 |

- **버스 도착 정보는 DB에 저장하지 않는다** (메모리 캐시). 서버 재시작 시 첫 30초만 비어 있음
- 시간 컬럼은 timezone-aware로 저장

---

## 8. 프론트엔드 구조 규칙

- **지도는 `MapView` 하나**만 존재. 각 기능은 `layers/` 아래 레이어 컴포넌트로 만들어 `MapView` 안에 끼운다
- 레이어 컴포넌트 규약:
  ```tsx
  // 모든 레이어 공통
  type LayerProps = { visible: boolean };
  // 데이터는 자기 훅(api/hooks)에서 가져오고,
  // 마커 클릭 시 store의 select({ type, id })만 호출한다.
  ```
- 선택 상태 (Zustand):
  ```ts
  type SelectedItem =
    | { type: "bus_stop"; id: string }
    | { type: "seminar"; id: string }
    | { type: "restaurant"; id: string }
    | { type: "report"; id: string }
    | null;
  ```
  `BottomSheet`가 `type`에 따라 `sheets/` 안의 상세 화면을 렌더링
- **길찾기·러닝 레이어 (김도현)**: 마커 선택이 아니라 입력 흐름이므로 `SelectedItem`에 넣지 않고 `store/route.ts`에서 따로 관리한다
  - `RouteLayer`: 지도 클릭 1번째 = 출발, 2번째 = 도착 → `useRoute(from, to)` 호출 → 경로를 `line` 레이어로 그림. 다시 클릭하면 초기화
  - `RunningLayer`: 목표 거리 입력 → `useRunningRoutes(km, lat, lng)` → 후보 3개를 색을 달리해 그림, 선택한 코스만 강조
  - `MapView` 수정이 필요하면 통합 담당에게 요청하고, 직접 고치지 않는다
  - 갱신 주기: 자동 갱신 없음 (입력이 바뀔 때만 조회)
- 갱신 주기 (TanStack Query `refetchInterval`): 버스 30초, 제보 60초, 세미나·맛집은 자동 갱신 없음(staleTime 10분)
- 화면 구성: 전체 화면 지도 + 상단 레이어 토글 + 하단 탭(지도 / 세미나 목록 / 버스 즐겨찾기) + 바텀시트
- 버스 즐겨찾기 정류장은 브라우저 localStorage에 저장 (로그인 불필요)

---

## 9. 환경변수 (`.env.example`)

```
# backend
DATABASE_URL=sqlite:///./data/app.db
BUS_API_KEY=
PORTAL_BASE_URL=
JWT_SECRET=
ALLOWED_EMAIL_DOMAIN=
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
CORS_ORIGINS=http://localhost:5173

# frontend (Vite)
VITE_MAP_STYLE_URL=
```
`.env`는 절대 커밋하지 않는다.

---

## 10. 내 To-do 리스트

### 0. 공통 준비
- [x] 기술 스택·API 규격 확정 (이 문서)
- [ ] **[높음]** 이 문서의 5~8장을 팀에 공유하고 맛집·길찾기·제보 담당자에게 초안 확인받기
- [ ] **[높음]** 모노레포 뼈대 생성 (4장 구조, `.env.example`, README)
- [ ] **[높음]** 수집 대상 이용 규정 확인 — 포탈 robots.txt·이용약관, API 이용 조건

### 1. 버스
- [ ] **[높음]** 대상 정류장·노선 목록 확정 (캠퍼스 앞, 테크노폴리스 등 / 직행2 등)
- [ ] **[높음]** 공공데이터 API 활용 신청 — 승인에 시간이 걸릴 수 있으니 가장 먼저
- [ ] **[높음]** `seed/bus_stops.json` 작성 (정류장명 ↔ 외부 ID ↔ 좌표)
- [ ] **[높음]** API 호출·응답 파싱 (노선명, 도착 예정 시간, 남은 정류장 수)
- [ ] **[중간]** 대상 노선의 API 포함 여부 확인 → 빠지면 시간표 기반으로 대체
- [ ] **[높음]** 메모리 캐시 + 30초 갱신 작업 + `is_stale` 처리
- [ ] **[중간]** `seed/shuttle_timetable.json` + 다음 출발 계산
- [ ] **[중간]** `GET /bus/stops`, `GET /bus/arrivals` 구현 + 테스트

### 2. 세미나
- [ ] **[높음]** 포탈 구조 파악 (로그인, URL 구조, 페이지 넘김, 정적/동적)
- [ ] **[높음]** 학교에 데이터 제공·크롤링 허가 문의
- [ ] **[중간]** 수집 대상 게시판 범위 결정
- [ ] **[높음]** 크롤러 작성 (`fetch_list()`, `parse_detail()`), 요청 간격 1초 이상
- [ ] **[높음]** 필드 추출·날짜 파싱
- [ ] **[높음]** `seed/buildings.json` + 장소 텍스트 매칭 (지도 담당과 함께)
- [ ] **[중간]** `source_id` 기준 중복 제거·수정 반영
- [ ] **[중간]** 하루 4회 스케줄 + `crawl_logs` 기록
- [ ] **[중간]** `GET /seminars`, `GET /seminars/{id}` 구현 + 테스트
- [ ] **[낮음]** 매핑 실패 목록 확인·수동 보정 방법 마련

### 3. 백엔드 통합
- [ ] **[높음]** 공통 설정: config, DB(WAL), 에러 형식, CORS, health
- [ ] **[높음]** Alembic 초기 마이그레이션 + seed 로더
- [ ] **[높음]** 스케줄러를 lifespan에 연결 (워커 1개 전제)
- [ ] **[중간]** 이메일 인증 + JWT (맛집 담당과 협의)
- [ ] **[중간]** 팀원 라우터 머지·규격 준수 확인
- [ ] **[낮음]** 크롤러 실패 알림 (디스코드 웹훅)

### 4. 프론트엔드
- [ ] **[높음]** Vite + React + TS + Tailwind + TanStack Query + Zustand 세팅, `/api` 프록시
- [ ] **[높음]** `MapView` + 배경 지도 띄우기 → 현풍 한글 표기 품질 확인 (부족하면 브이월드)
- [ ] **[높음]** `api/types.ts`에 6장 타입 작성, `client.ts` 에러 처리
- [ ] **[높음]** 공통 UI: `LayerToggle`, `BottomSheet`, 하단 탭
- [ ] **[높음]** `BusLayer` + 버스 바텀시트 + 즐겨찾기(localStorage)
- [ ] **[높음]** `SeminarLayer` + 세미나 목록 탭 + 상세 바텀시트
- [ ] **[중간]** 내 위치 표시 (Geolocation)
- [ ] **[중간]** 팀원 레이어(맛집·길찾기·제보) 연결
- [ ] **[중간]** PWA 설정 (아이콘, manifest)

### 5. 배포·마무리
- [ ] **[중간]** Dockerfile + docker-compose + Caddyfile
- [ ] **[중간]** 서버 배포 (영구 디스크, HTTPS)
- [ ] **[중간]** 실제 데이터로 통합 테스트 (폰에서 확인)
- [ ] **[낮음]** README: 실행 방법, API 키 발급 방법, 장애 대응

---

## 11. 아직 정해지지 않은 것

- 버스 대상 정류장·노선 목록, 사용할 API의 정확한 이름과 호출 한도
- 학교 포탈의 접근 방식(로그인 여부)과 학교의 데이터 제공 가능 여부
- 배포 서버 (학교 서버 vs 클라우드 VM)
- 제보 기능의 최종 방향과 `type` 값
- 6.4, 6.6은 담당 팀원의 확인 전 초안 (6.5 길찾기·러닝·3D는 김도현 확정)
- 캠퍼스 내부 보행로가 OSM에 빠져 있으면 `walk_graph.json`에 수동으로 길을 추가해야 함 (김도현 확인 예정)

## 12. Claude Code에게 — 첫 작업 순서

1. 4장 구조로 모노레포 뼈대 생성 (`backend/`, `frontend/`, `docs/`, `deploy/`, `.env.example`, `README.md`)
2. 백엔드: config, DB(WAL), 공통 에러 형식, CORS, `GET /api/v1/health`
3. `docs/api-spec.md`에 이 문서 5~6장을 옮겨 팀 공유용으로 정리
4. 백엔드: `buildings`, `bus_stops`, `seminars` 모델 + Alembic + seed 로더 (seed는 예시 데이터 2~3개로 시작)
5. 버스: API 클라이언트 골격 + 메모리 캐시 + 스케줄러. 실제 응답 샘플을 받기 전까지는 **가짜 클라이언트(mock)**로 `/bus/arrivals`가 동작하게
6. 세미나: 크롤러 인터페이스(`fetch_list`, `parse_detail`)와 장소 매칭 함수 + 테스트. 포탈 구조 확인 전이므로 실제 파싱은 보류
7. 프론트: Vite 세팅, `MapView`, `api/types.ts`, `BusLayer`·`SeminarLayer`를 mock 데이터로 먼저 연결
