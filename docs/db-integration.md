# DB 파트 통합 안내 (맛집 · 경찰 제보 · 밥친구)

> 만든 사람: bamfiring · 브랜치 `feat/db-part`
> 자세한 API 규칙은 [api-spec-db.md](api-spec-db.md)에 있어요.

## 1. 한눈에 보기

| 구분 | 내용 |
|---|---|
| 서버 | FastAPI + SQLModel + SQLite, 주소는 모두 `/api/v1/...`, 실시간은 웹소켓 `/api/v1/ws` 하나 |
| 화면 | React + Vite + TS, 지도는 `react-map-gl/maplibre`, 데이터는 TanStack Query, 상태는 zustand, 스타일은 Tailwind v4 |
| 기능 | 맛집 추천·후기, 경찰 순찰 제보·단속 구역, 밥친구(번개 약속·지금 밥 먹을 사람·같이 먹자 제안·채팅·알림) |

## 2. 파일 나누기: 그대로 가져가면 되는 것 / 바꿔 끼울 것 / 버릴 것

### ✅ 그대로 쓰는 것 (DB 파트 소유)

**백엔드 `backend/`**
- `app/routers/` : `restaurants.py`, `reports.py`, `meetups.py`, `presence.py` (API 4묶음), `dev_auth.py`(개발용 로그인)
- `app/models/`, `app/schemas/` : DB 표와 요청·응답 모양
- `app/services/` : `realtime.py`(웹소켓 허브), `presence.py`(실시간 위치), `meetup_notify.py`(밥약속 알림), `kakao.py`(장소 검색)
- `alembic/` : DB 표 만들기(마이그레이션)
- `seed/db_sample.py`(예시 가게·제보·약속), `seed/demo_presence.py`(발표용 예시 사람)
- `tests/` : 테스트

**프론트 `frontend/src/`**
- `layers/` : 지도 레이어 4개 `RestaurantLayer`, `ReportLayer`, `MeetupLayer`, `PresenceLayer` (+ 보조 파일)
- `panels/` : 옆 패널 (`RestaurantPanel`, `ReportPanel`, `MeetupPanel`, `PresenceHero`, `QuickMeetup`, `RecommendForm`)
- `sheets/` : 상세 시트 (`RestaurantSheet`, `ReportSheet`, `MeetupSheet`, `PresenceSheet`)
- `api/types.db.ts`, `api/clientDb.ts`, `api/hooks/db/` : 타입, API 호출, 훅
- `store/db.ts`, `components/db/`, `lib/dbFormat.ts`, `lib/notify.ts`

### 🔁 통합 담당 파일이 오면 바꿔 끼울 것 (임시 대역)
- `backend/app/main.py` : 앱 시작점. 통합 `main.py`에 아래 4번 내용만 옮기면 돼요.
- `backend/app/core/` : 설정, DB 연결, 로그인 토큰, 에러 모양. 통합 쪽에 같은 게 있으면 그걸 쓰고, 없으면 이걸 그대로 써도 돼요.
- `frontend/src/main.tsx`, `index.html`, `vite.config.ts`, `package.json` : 앱 틀

### 🗑️ 버리는 것
- `frontend/src/dev/` : 혼자 확인하려고 만든 가짜 지도와 앱 틀이에요. **통합 때 버려요.** 단, 메인 지도에 무엇을 끼워야 하는지 보여 주는 예시라서 `DevMap.tsx`를 참고하면 편해요.

## 3. 프론트: 메인 지도(dohyun님)에 끼우는 법

```tsx
import { RestaurantLayer } from "../layers/RestaurantLayer";
import { ReportLayer } from "../layers/ReportLayer";
import { MeetupLayer } from "../layers/MeetupLayer";
import { PresenceLayer } from "../layers/PresenceLayer";
import { usePickStore } from "../store/db";

// 1) 지도를 감싼 div에 isolate (안 붙이면 핀이 바텀시트 위로 올라와요)
<div className="relative isolate h-full w-full">
  <Map
    onClick={(e) => usePickStore.getState().handleClick({ lng: e.lngLat.lng, lat: e.lngLat.lat })} // 2) 제보·가게 위치 찍기
  >
    {/* 3) 레이어 4개. 모두 visible, onSelect만 받아요 */}
    <RestaurantLayer visible={layers.restaurant} onSelect={select} />
    <ReportLayer visible={layers.report} onSelect={select} />
    <MeetupLayer visible={layers.meetup} onSelect={select} />
    <PresenceLayer visible={layers.presence} onSelect={select} />
  </Map>
</div>
```
- (선택) 목록에서 가게를 누르면 지도가 그쪽으로 가게 하려면 `useDbNavStore`의 `focus`를 구독해서 `flyTo` 해 주세요. `DevMap.tsx`에 예시가 있어요.

## 4. 프론트: 앱 틀(lyc0620님)에 붙이는 법

- **선택 항목 타입**에 `meetup`, `presence`를 추가해 주세요 (`restaurant`, `report`는 이미 있어요). 타입은 `SelectedDbItem`(`api/types.db.ts`)이에요.
- **바텀시트**에서 선택 타입에 따라 시트를 골라요.
  ```tsx
  case "restaurant": return <RestaurantSheet id={selected.id} onSelect={select} />;
  case "report":     return <ReportSheet id={selected.id} />;
  case "meetup":     return <MeetupSheet id={selected.id} onSelect={select} />;
  case "presence":   return <PresenceSheet id={selected.id} onSelect={select} />;
  ```
- **탭/패널**: `RestaurantPanel`, `ReportPanel`, `MeetupPanel`을 각 탭에 넣어요.
- **앱에서 한 번만** `useRealtime()`을 부르고, `<DbToaster />`(`components/db/Toaster`), `<InviteToast />`를 화면 맨 위에 한 번 놓아요. (실시간 알림·밥약속 알림이 여기로 떠요)
- **스타일**: `src/index.css`의 `@theme` 색 토큰(`brand-*` 파랑, `sun-*` 노랑)이 필요해요. 통합 CSS에 이 부분을 옮겨 주세요.
- 패키지: `@tanstack/react-query`, `zustand`, `react-map-gl`, `maplibre-gl`, `tailwindcss` v4.

## 5. 백엔드: 통합 서버에 붙이는 법

통합 `main.py`에서 아래만 하면 돼요.

```python
from app.routers import restaurants, reports, meetups, presence, dev_auth
from app.services.presence import cleanup_loop        # 실시간 위치 정리 (30초마다)
from app.services.meetup_notify import reminder_loop  # 밥약속 10분 전 알림 (30초마다)

app.include_router(restaurants.router)
app.include_router(reports.router)
app.include_router(meetups.router)
app.include_router(presence.router)
if settings.is_dev:
    app.include_router(dev_auth.router)

# lifespan에서 cleanup_loop(), reminder_loop()을 asyncio.create_task로 켜고, 끝날 때 cancel
# 웹소켓 /api/v1/ws 엔드포인트는 지금 main.py의 것을 그대로 옮겨요
```

- **워커는 1개**로 실행해야 해요. 웹소켓 허브와 실시간 위치가 서버 메모리에 있어서예요.
- DB 표 만들기: `uv run alembic upgrade head`, 예시 데이터: `uv run python -m seed.db_sample`
- dohyun님 브랜치의 `routers/route.py`와 이름이 겹치는 파일은 없어요. `__init__.py`(빈 파일)만 양쪽에 있어요.

## 6. 환경 변수 (`backend/.env`, 깃허브에 올리지 않아요)

`.env.example`을 복사해서 각자 만들어요. `start-dev.ps1`이 없으면 자동으로 만들어 줘요.

| 이름 | 뜻 | 기본값 |
|---|---|---|
| `APP_ENV` | `dev`면 개발용 로그인이 켜져요. 발표 시연은 `dev` | `prod` |
| `KAKAO_REST_API_KEY` | 카카오 장소 검색 키 (없으면 지도에서 직접 찍기로 대신해요) | 없음 |
| `CAMPUS_LAT`, `CAMPUS_LNG` | 캠퍼스 중심 | 35.7033, 128.4557 |
| `SERVICE_RADIUS_M` | 서비스 반경(m) | 8000 |

## 7. 혼자 돌려 보기

```powershell
.\start-dev.ps1          # 서버 2개 + 브라우저
.\start-dev.ps1 -Demo    # 발표용 예시 사람도 같이 (봇이 내 약속에 참여해서 알림이 떠요)
```
화면 `http://localhost:5173`, API 문서 `http://127.0.0.1:8000/docs`

## 8. 임시로 정한 것 (팀과 다르면 바꿔요)
에러 코드 `CONFLICT`/`RATE_LIMITED` 추가, 목록 응답에 `total`, 실시간은 웹소켓 하나, 선택 타입에 `meetup`·`presence` 추가, 개발용 닉네임 로그인, 캠퍼스 중심 좌표, 실시간 위치·알림 기록은 서버 메모리에만 둬요. 자세한 건 `api-spec-db.md` 맨 아래에 있어요.
