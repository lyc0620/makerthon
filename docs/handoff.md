# 현풍 지도 프로젝트 — 작업 인수인계 v3 (크롤링·통합·3D 담당)

> 이 문서는 Claude Code에서 프로젝트를 이어가기 위한 컨텍스트입니다. **이 파일 하나만 읽으면 이어서 작업할 수 있게** 썼습니다.
> 나(lyc0620)는 이 팀 프로젝트에서 **세미나 수집 + 버스 도착정보 수집 + 최종 통합(백엔드 정리 + 프론트엔드) + 3D 지도**를 맡았습니다.
> **5~7장의 기술 스택과 API 규격은 확정안**입니다. 이 문서와 다르게 구현해야 할 이유가 생기면 코드보다 문서를 먼저 고칩니다.
> 읽는 순서: **00장(현재 상태·다음 할 일) → 0장(결정 변경 이력) → 1~9장(원래 규격)**.

---

## 00. 다음 Claude 세션에게 — 현재 상태 (v3, 2026-11-21 기준)

### 00.1 위치와 git 상태
- 작업 폴더: `C:\Users\PC\Desktop\DGIST\26-2\.etc\makerthon\`
  - `github/` ← **저장소** (remote `https://github.com/lyc0620/makerthon`). 4장의 `hyeonpung-map/` 루트가 곧 이 폴더다.
  - `hyeonpung-map-handoff.md` (이 문서의 복사본), `db-integration.md`, `api-spec-db.md` (DB 담당이 준 문서), `.claude/launch.json` (미리보기 서버 설정)
  - 상위 `makerthon/` 폴더에도 커밋 없는 빈 `.git` 이 하나 있다(사용자가 만든 것, 무시해도 됨).
- 현재 브랜치: **`feat/integration-bus-seminar`** — **모든 작업이 커밋·푸시돼 있다** (2026-11-21, 사용자 요청으로 푸시). 다른 컴퓨터·계정에서는 `git clone` 후 이 브랜치를 체크아웃하면 된다.
  - `67357bd feat: miniature 3D map with campus buildings, stylized roads and region fade` — 3D 지도 전체 + 이 문서 v3
  - `e3f1af4 feat: monorepo skeleton with live bus arrivals and portal seminar crawler` — 백엔드·프론트 뼈대, 버스·세미나 수집
  - 그 뒤에 이 00.1 절만 고친 문서 커밋이 하나 더 있다 ("docs: handoff ..."). `git log --oneline` 으로 확인.
  - `main` 은 `69fcd58 first commit`(README 한 줄)뿐. **PR 은 아직 안 만듦** (`feat/integration-bus-seminar` → `main`).
- **git 에 없는 것 (로컬에만, 새 컴퓨터면 다시 만들어야 함)**: `backend/.env`(00.2), `backend/data/`(DB·포탈 쿠키 — 쿠키는 00.6 절차로 다시 업로드), `backend/.venv`, `frontend/node_modules`, `makerthon/.claude/launch.json`(00.2 참고해 다시 만들기), 상위 폴더의 `db-integration.md`·`api-spec-db.md`(DB 담당 문서 — `origin/feat/db-part` 에도 있음).
- 커밋 전에 `frontend/src/index.css`, `main.tsx` 가 수정으로 잡히면 Prettier 가 줄바꿈만 바꾼 것이라 `git checkout -- frontend/src/index.css frontend/src/main.tsx` 로 되돌린다.
- 원격의 팀원 브랜치 (아직 **합치지 않음** — 사용자가 "나중에 통합할 때 문제 생길 수 있으니 미루자"고 결정, 한 번 합쳤다가 롤백함):
  - `origin/feat/db-part` (bamfiring: 맛집·경찰 제보·밥친구) — 00.7 참고
  - `origin/feat/dohyeon-route` (김도현: 길찾기·러닝·3D 건물 레이어) — 00.7 참고

### 00.2 실행 방법 (Windows)
- 필요: Python 3.13(설치됨), Node 24 / npm 11(설치됨), **uv** — `python -m pip install --user uv` 로 설치했다.
  - Claude 의 Bash 에서는 `python -m uv ...` 가 되지만, **사용자 PowerShell 에서는 `python -m uv` 가 "No module named uv"** 로 실패했다. 사용자 터미널에서는 `backend\.venv\Scripts\python.exe` 를 직접 쓴다.
- 미리보기 서버(Claude 데스크톱 브라우저 패널): `makerthon/.claude/launch.json` 에 `backend`(8000), `frontend`(5173) 가 있다 → `preview_start` 로 이름으로 띄운다.
- 직접 실행:
  ```
  cd github/backend && python -m uv sync && python -m uv run uvicorn app.main:app --port 8000
  cd github/frontend && npm install && npm run dev      # /api 는 8000 으로 프록시
  ```
- 테스트·린트: `cd backend && python -m uv run pytest -q && python -m uv run ruff check . && python -m uv run ruff format .` (현재 **83개 통과**), `cd frontend && npx prettier --write src && npm run lint && npm run build` (통과)
- **로컬 비밀값 (커밋 금지, .gitignore 됨)**
  - `backend/.env`: `BUS_SOURCE=crawl`, `SEMINAR_SOURCE=portal`, `ADMIN_TOKEN=<랜덤 생성값>`, `CORS_ORIGINS=http://localhost:5173`
  - `backend/data/portal_cookies.json`: **사용자 개인 포탈 로그인 세션 쿠키** (12개). 외부로 보내거나 출력하지 말 것.
  - `backend/data/app.db*`: 로컬 SQLite (세미나 33건 수집돼 있음)
- 개발 중 브라우저 콘솔에서 `window.__map` 으로 지도 객체에 접근 가능 (`MapView` 의 `onLoad`, DEV 빌드에서만). 시점 확인용: `window.__map.jumpTo({ center:[128.4545,35.7052], zoom:16.6, pitch:58, bearing:-35 })`

### 00.3 사용자에 대해 / 일하는 방식
- 한국어로 대화. 결과를 브라우저 패널에서 직접 눌러 보며 피드백을 준다(작업 중에 패널을 같이 조작하기도 함 → 시점이 덮어써질 수 있음).
- 커밋·푸시는 사용자가 요청할 때만. 브랜치 이름은 `feat/<이름>-<기능>` 규칙.
- 결정을 맡기면("너가 생각하는 가장 좋은 방식") 추천안으로 진행하고 이유를 짧게 알린다.
- 학교가 크롤링 사전 허가(공문, 2026-11-21)를 받아 둠 → 학교 사이트·공공 사이트 크롤링은 OK. **네이버·카카오·구글 지도/스트리트뷰는 크롤링·이미지 사용 금지** (약관·저작권). 사용자가 구글 스트리트뷰 이미지 사용을 제안했을 때 거절하고 데이터로 그리는 방식으로 대체했다.
- 팀에 Blender 쓸 줄 아는 사람이 없다 → 3D 는 코드로(OSM 윤곽 + 층수 표) 만든다.

### 00.4 지금까지 구현된 것 (요약 — 자세한 건 0장과 코드 주석)
**백엔드 (`github/backend`, FastAPI + SQLModel + SQLite WAL + Alembic + APScheduler)**
- 공통: `app/core/config.py`(Settings, 소문자 필드, `.env` 는 `backend/.env`), `db.py`(`TZDateTime`: UTC 저장·KST 반환), `errors.py`(`ApiError(status, message)` → `{"error":{code,message}}`), `time.py`(`KST`, `now_kst`)
- 라우터(`/api/v1`): `health`, `buildings`, `bus`(stops, arrivals), `seminars`(목록·상세), `admin`(portal-cookies PUT, crawl-status GET, seminar-crawl POST — 헤더 `X-Admin-Token`, `ADMIN_TOKEN` 없으면 403)
- 시작 시(`app/main.py` lifespan): Alembic upgrade → seed 반영(`seed/buildings.json`, `bus_stops.json`; 정류장은 seed 에 없는 것 삭제) → **저장된 세미나 장소 재매핑(`remap_places`)** → 버스 즉시 1회 수집 → 세미나 백그라운드 1회 수집 → 스케줄러 시작
- 스케줄(`app/scheduler.py`): 버스 30초, 세미나 07~23시 10분마다 변경 감지(목록 1페이지, 새 글만 상세), 매일 05시 최근 3페이지 전체 재확인. 세미나 작업은 `asyncio.Lock` 으로 겹치지 않게.
- 버스(`app/services/bus/`): `crawl.py`(대구 버스정보시스템 `realtime/arr2`), `mock.py`, `shuttle.py`(시간표 계산 — `seed/shuttle_timetable.json` 은 현재 비어 있음), `service.py`(메모리 캐시, `is_stale` 3분)
- 세미나(`app/services/seminar/`): `portal.py`(학생포탈 크롤러), `cookies.py`(쿠키 보관·형식 검사), `dates.py`(일시·장소 추출), `mapping.py`(장소 → 건물), `pipeline.py`(수집·upsert·만료 대기·재매핑), `mock.py`
- 도구: `app/tools/upload_cookies.py`(쿠키 업로드 CLI), `scripts/build_campus_buildings.py`(캠퍼스 3D 건물 데이터 생성)
- 테스트: `tests/` 83개 (`conftest.py` 가 개발자 `.env` 값과 섞이지 않게 환경변수를 덮어쓴다)

**프론트 (`github/frontend`, React 19 + Vite 8 + TS + MapLibre 6 + react-map-gl 8 + TanStack Query + Zustand + Tailwind 4)**
- `src/map/MapView.tsx`: 지도 하나. 미니어처 스타일 적용(`useStylizedStyle`), `maxBounds`·`minZoom 12`·`maxPitch 75`, 줌/나침반/내 위치 컨트롤, `Map3DSync`
- `src/map/stylize.ts`: 배경 스타일 변환 (00.5)
- `src/map/Map3DSync.tsx`: 3D 토글 시 기울기(50°)와 지형(DEM) 켜기/끄기
- `src/layers/`: `BusLayer`, `SeminarLayer`(건물별로 묶은 핀), `CampusBuildingsLayer`(캠퍼스 3D)
- `src/sheets/`(BusStopSheet, SeminarSheet), `src/tabs/`(SeminarListTab, BusFavoritesTab), `src/components/`(BottomSheet, LayerToggle(버스·세미나·3D), TabBar, ArrivalList, QueryState)
- `src/store/ui.ts`: 레이어 on/off(`buildings3d` 포함), 선택 항목, 탭, 버스 즐겨찾기(localStorage, `hyeonpung-map-ui`)
- `src/api/`: `client.ts`(에러 형식 처리), `types.ts`(6장 타입), `hooks/`

### 00.5 3D 지도 — 사용자와 정한 디자인 (이번 세션의 마지막 작업)
목표: hanokhana.com(하나고 은평한옥마을 프로젝트) 같은 **low-poly 미니어처(디오라마) 느낌**. 단, 그 사이트는 손으로 만든 glTF 한 장면이고 우리는 실제 지도라서 **지도 스타일을 바꾸는 방식**으로 구현했다.
1. **지역 한정 (원형)**: 중심 `(128.4575, 35.700)`, 반지름 **3.6km** 원 안만 보인다 (캠퍼스 + 현풍읍 + 유가읍/테크노폴리스 + 주변 산지). 원 밖은 회색 가림막, 가장자리 **1.3km 를 16단계 고리로 점점 흐리게(제곱 곡선, "크레센도")**. 화면 이동(`VIEW_BOUNDS`)과 벡터·고도 타일 요청(`SOURCE_BOUNDS`)도 원을 감싸는 사각형으로 제한 → 리소스 절약. 상수는 `stylize.ts` 맨 위 `REGION_CENTER`, `REGION_RADIUS_KM`, `FADE_KM`, `FADE_STEPS`.
   - 주의: 다각형 구멍은 **시계 방향**이어야 MapLibre 가 구멍으로 인식한다 (`holeOf`). 반대로 하면 가림막이 안 보인다(실제로 겪음).
2. **건물**: **캠퍼스 건물만 3D**. 배경 지도의 건물 레이어(평면·3D)는 모두 제거하고, 캠퍼스 밖 건물은 **위에서 본 윤곽(연한 면 + 테두리선, z14 부터)** 으로만 그린다 (`building-footprint*`). 아파트도 윤곽만.
   - 캠퍼스 건물 데이터: `scripts/build_campus_buildings.py` 가 Overpass(OSM)에서 받아 `frontend/public/data/campus-buildings.geojson` 생성. 중심점이 `CAMPUS_AREA = (35.7000, 128.4485, 35.7100, 128.4600)` 안인 건물만 → **9동** (강의동(E1~E7 이 OSM 에서 한 덩어리, 6층), E8 학술정보관(6층), R2, R3, R4(OSM 이름이 층수 칸에 잘못 들어가 있어 보정), 연구행정동, 창업지원센터, 이름 없는 2동).
   - **동쪽 원형 공원 건너편 생활관(dormitory) 7동은 사용자 확인으로 캠퍼스 밖 → 제외**.
   - 층수: OSM 값 → 없으면 `LEVELS` 표 → 없으면 추정(연구동 4, 상업 2). 높이 = 층수 × 3.6m. **대부분 추정값이라 실제 층수 확인 필요** (`LEVELS` 에 이름/OSM id 로 적고 스크립트 재실행).
   - 모양(`CampusBuildingsLayer.tsx`): 층마다 벽 띠(1.3m, `#60646c`) + 창문 띠(`#3e4a59`) 를 번갈아 쌓음, 지붕 = 밝은 난간벽 고리(`#7a7f88`, 바깥 고리 − 중심 쪽 86% 축소 고리) + 안쪽 지붕 판(`#454950`), 바닥 그림자(남동쪽으로 민 반투명 면), 이름표(z15~, "대구경북과학기술원 " 접두어 제거). 색은 사용자 요청으로 **진한 회색** 계열.
   - 알려진 흠: 강의동처럼 오목한 다각형은 "중심 쪽 축소"로 만든 지붕 테두리가 조금 어색하다.
3. **도로**: 배경 도로 레이어를 걷어내고 직접 그림. 실제 폭(m) 기준 (`ROAD_WIDTH_M`: 간선 22, primary 17, secondary 13, tertiary 10, minor 6.5, service 4, track 3, 기타 2.5), 픽셀 변환은 `metersToPx` (512px 타일, 위도 35.7°: 1m = 2^z / 63565 px).
   - 보도(연회색, 양쪽 +2.5m) → 아스팔트(큰길 `#4d5158`, 작은 길 `#62666e`) → 흰 가장자리선(`line-gap-width` 로 양쪽 두 줄, z15.5~) → 노란 중앙선(z15~) → 흰 점선 차선(z16~) → 작은 길 가운데 흰 점선(z16.5~). 보행로는 연한 점선.
   - 횡단보도는 OpenMapTiles 데이터에 없어서 못 그림 (필요하면 OSM `highway=crossing` 을 따로 받아야 함).
4. **내천·다리**: 배경의 waterway 선 레이어 제거 후 직접: 연두 둑(`waterway-bank`, 실제 폭 18~45m) + 물길(`waterway-stream`, 강 25/운하 10/하천 8/기타 3m). 다리(`brunnel=bridge`)는 그림자(남동 오프셋, 블러) + 밝은 상판 + 아스팔트 + 흰 난간(`line-gap-width`). 현풍천 위 다리 4곳 확인.
5. **바닥·자연·하늘**: 바닥 `#f4f3f0`, 녹지 연두, 숲 진한 연두, 물 하늘색, 지형 음영(hillshade, AWS Terrarium DEM `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, CORS 허용·키 불필요), 3D 모드에서 지형 과장 1.4. 하늘·안개(`SKY`) 는 넣었지만 세로 화면에선 75°까지 기울여도 지평선이 거의 안 보인다.
6. **3D 토글**: 상단 "3D" 버튼 → 기울기 50° + 지형 켜기 + 나침반 표시. 캠퍼스 건물은 토글과 무관하게 항상 그린다(위에서 보면 평면처럼 보임).
   - react-map-gl 의 컨트롤은 생성 시 옵션만 읽어서 `key={is3d ? ... }` 로 다시 만든다 (줌·내 위치 버튼 둘 다 — 순서 유지).
7. 원래 길찾기 담당의 `Buildings3DLayer`(배경 건물 전체를 세움)를 한때 그대로 가져왔다가, "캠퍼스만 3D" 결정 후 **빼고 우리 레이어로 대체**했다. 3D 는 이제 사용자(나) 담당.

### 00.6 세미나 크롤링 운영 (중요)
- 학생포탈은 로그인 필요 + 사용자 계정 **2차 인증을 끌 수 없음** → 서버 자동 로그인 불가 → **브라우저 쿠키를 서버에 넣는 방식**.
- 쿠키 넣기: 크롬에서 포탈 로그인 → `https://stuecm.dgist.ac.kr/s/potal_board/_0002/listBbs.do` → F12 Network → `listBbs.do` → Request Headers `cookie:` 값 복사 →
  `cd backend; .\.venv\Scripts\python.exe -m app.tools.upload_cookies` (배포 서버면 `--url https://서버`) → 입력창에 붙여넣기(화면에 안 보임) → 수집 결과(success/auth_expired)를 보여 줌.
  - 실제로 있었던 실수: 쿠키 복사 후 명령어를 복사해 클립보드가 덮어써져 명령어 텍스트가 업로드됨 → 이제 쿠키 형식이 아니면 400 으로 거부한다.
  - Claude 의 브라우저 패널에서는 세션 쿠키가 HttpOnly 라 꺼낼 수 없다 → 쿠키는 사용자가 직접 넣어야 한다.
- 세션 만료되면 `crawl_logs.status=auth_expired`, 새 쿠키가 들어올 때까지 재시도 안 함(SSO 반복 요청·계정 잠금 방지). `DISCORD_WEBHOOK_URL` 이 있으면 알림. **세션이 며칠 유지되는지는 아직 모름.**
- 파서 고친 뒤 기존 글 다시 파싱: `POST /api/v1/admin/seminar-crawl?pages=3&full=true` (헤더 `X-Admin-Token`). 일시를 못 찾게 된 글은 이때 DB 에서 지워진다.
- 상태 확인: `GET /api/v1/admin/crawl-status`.
- 현재 로컬 DB 에 실제 세미나 33건 (모두 건물 매핑됨, 이번 주 핀은 6개 건물).

### 00.6.1 DB 파트 통합 완료 (2026-11-21, 브랜치 `feat/lyc0620-integration`)
`origin/feat/db-part`(291c5a7 까지)를 머지했다. 아래 00.7 의 db-part 메모대로 처리했고, 결정은 사용자와 정했다.
- 백엔드: Settings 는 우리 소문자 필드 + 대문자 `@property` 별칭. 에러는 그쪽 `AppError` 기반, 우리 `ApiError(status, msg)` 는 하위 클래스. Alembic 은 `17adb2052d3f.down_revision = 499aea6d3d2f` 로 한 줄. 목록 응답은 모두 `count`(이번 개수)+`total`(전체). conftest 는 그쪽 픽스처(`db_url/engine/app/client/clock`, `login` 등) + 마이그레이션 경유. 백그라운드 루프(`cleanup_loop`, `reminder_loop`)는 `scheduler_enabled` 일 때만. **로컬 `.env` 에 `APP_ENV=dev` 필수**(없으면 JWT 기본값 때문에 서버가 안 켜짐).
- 서비스 지역: 중심 = 지도 지역 원 중심(35.700, 128.4575), 반경 **3km**(원 가장자리 구름 밖은 안 보이므로). 테스트는 그쪽 좌표·8km 그대로.
- 로그인: 시연까지 **닉네임 개발 로그인 유지**(`AccountButton`, 오른쪽 위). 이메일 인증(6.7)은 배포 뒤.
- 프론트: 하단 탭 **지도·맛집·밥친구·세미나·버스**, 경찰 제보는 지도 왼쪽 아래 "🚨 제보" 버튼(`tab='report'`). 패널은 `components/DbPanel.tsx`(지도 아래쪽, 위치 찍기 중엔 안내 띠). 선택 상태는 `store/ui.ts` 하나 — `store/db.ts` 의 `useSelectionStore` 는 그걸 보여 주는 창구. `openCreate` 는 밥친구 탭으로 전환. `src/dev/` 는 버림(닉네임 추천만 `lib/nicknames.ts` 로).
- 핀: 버스·세미나·제보와 맛집/밥약속의 "작은 점"은 공통 `MapPin`(색은 `PIN_COLORS`). 맛집·밥약속 **이름표 말풍선과 겹침 피하기는 그쪽 것 그대로**.
- 지도 div 에 `isolation: isolate` (마커가 패널 위로 올라오던 문제).
- 예시 데이터: `uv run python -m seed.db_sample` (모두 "[예시]"). 예시 제보는 만료된 기록뿐이라 지도엔 안 뜸.
- 남은 것: 그쪽 파일의 oxlint 경고 9개(동작 문제 없음), 루프·웹소켓 다중 워커 불가(워커 1개 전제 유지), `feat/dohyeon-route` 통합.

### 00.7 팀원 브랜치 통합 메모 (다음에 합칠 때 그대로 쓰기)
**`feat/dohyeon-route` (김도현)** — 우리와 겹치는 파일은 빈 `__init__.py` 와 README 뿐, 거의 그대로 합쳐진다(한 번 해 봤음).
- 백엔드: `app/routers/route.py`(`GET /route`, `GET /running-routes`), `app/services/route/graph.py`(표준 라이브러리 Dijkstra), `seed/walk_graph.json`(노드 6,233), `scripts/build_walk_graph.py`, `tests/test_route.py`. main 에서 `app.include_router(route.router, prefix="/api/v1")`.
- 프론트: `layers/RouteLayer.tsx`, `RunningLayer.tsx`, `Buildings3DLayer.tsx`(→ **우리는 안 씀**, `CampusBuildingsLayer` 로 대체), `sheets/RoutePanel.tsx`, `store/route.ts`, `api/routeTypes.ts`, `api/hooks/useRoute.ts`(자체 fetch → 우리 `api/client.ts` 로 교체 TODO).
- RouteLayer 와 RunningLayer 는 둘 다 지도 클릭을 쓰므로 토글을 서로 배타로. 기울기(DEM) 미구현(`ascent_m` null).
- 루트에 `hyeonpung-map-handoff.md`(v2 원본)를 추가하는데 우리 `docs/handoff.md` 와 중복 → 합칠 때 정리.

**`feat/db-part` (bamfiring)** — 문서: `makerthon/db-integration.md`, `makerthon/api-spec-db.md`. 겹치는 파일이 많아 **24개 파일 충돌**(add/add): `.gitignore`, `backend/alembic.ini`, `alembic/env.py`, `script.py.mako`, `app/core/config.py`, `db.py`, `errors.py`, `app/main.py`, `models/__init__.py`, `schemas/__init__.py`, `pyproject.toml`, `uv.lock`, `tests/conftest.py`, `tests/test_common.py`, 프론트 `.gitignore`, `index.html`, `package(-lock).json`, `src/index.css`, `main.tsx`, `tsconfig*.json`, `vite.config.ts`.
- 그쪽 core 는 "통합 담당 파일로 교체할 임시 대역"이라고 적혀 있지만 이름 규칙이 다르다:
  - 설정: 그쪽은 대문자 필드(`DATABASE_URL`, `JWT_SECRET`, `APP_ENV`, `KAKAO_REST_API_KEY`, `CAMPUS_LAT`, `CAMPUS_LNG`, `SERVICE_RADIUS_M`, `CORS_ORIGINS`) + `is_dev`, `cors_origin_list`, `DEV_JWT_SECRET`. `APP_ENV != dev` 인데 `JWT_SECRET` 이 기본값/빈 값이면 **`get_settings()` 가 RuntimeError** (서버가 안 켜짐) → 합치면 우리 `.env` 에 `APP_ENV=dev` 필요.
    - 권장: 우리 Settings(소문자)에 필드를 추가하고 대문자 이름은 `@property` 별칭으로 제공 (pydantic-settings 는 환경변수 대소문자 무시라 같은 이름의 필드를 둘 두면 안 됨).
  - 에러: 그쪽 `AppError(code, status, message, details)` + 헬퍼 `not_found/forbidden/conflict/validation` + `install_error_handlers`, 422 는 `details.fields` 포함, 409 `CONFLICT`·429 `RATE_LIMITED` 추가. 권장: 그쪽 errors.py 를 기반으로 우리 `ApiError(status, msg)` 를 `AppError` 하위 클래스로, `register_error_handlers = install_error_handlers` 별칭.
  - db: 그쪽은 `create_db_and_tables()` 가 필요(테스트·dev). 우리 db.py 에 추가하면 됨. 그쪽 시간 타입은 `models/types.py` 의 `UTCDateTime`(UTC 로 돌려줌) — 우리 `TZDateTime`(KST 로 돌려줌)과 공존 가능.
  - main: 우리 lifespan + 그쪽 `cleanup_loop()`, `reminder_loop()`(create_task, 종료 시 cancel) + 웹소켓 `/api/v1/ws` + 라우터(`restaurants, reports, meetups, presence`, dev 일 때 `dev_auth`) — 그쪽 라우터는 경로에 `/api/v1` 을 이미 포함(prefix 없이 include). 그쪽 health 는 우리 것으로.
  - **Alembic 두 갈래**: 우리 `499aea6d3d2f_initial_tables` 와 그쪽 `17adb2052d3f_initial_db_part_tables`(+ `a1c3e5f70b21`) 둘 다 `down_revision=None` → head 두 개. 그쪽 17adb 의 `down_revision` 을 `'499aea6d3d2f'` 로 바꿔 한 줄로 잇는다. `script.py.mako` 는 `import sqlmodel`, `import app.core.db`, `import app.models.types` 모두 포함.
  - 목록 응답: 그쪽은 `count`=이번 응답 개수, `total`=전체(`schemas/common.py` 의 `Page`, `make_page`). **우리 세미나는 `count` 에 전체 수를 넣고 있음 → 그쪽 방식으로 맞추기로 권장**(테스트 `assert_page` 가 `{items,count,total,updated_at}` 정확히 검사).
  - 테스트: 그쪽 conftest 는 `db_url/engine/app/client/clock` 픽스처 + `login`, `restaurant_body`, `assert_error`, `assert_page` 헬퍼, `create_db_and_tables` 로 테이블 생성, `dependency_overrides[get_session]`. 우리 conftest(마이그레이션까지 거친 `client`, `session`)와 합쳐야 함. pyproject 에 `pyjwt`, `tzdata` 추가, ruff line-length 그쪽 120 / 우리 100.
  - `users` 테이블은 "통합 담당 소유"(id 정수, email_hash UNIQUE null 허용, nickname UNIQUE, created_at). JWT: HS256, `sub`=사용자 정수 id. 우리 이메일 인증이 이걸 발급해야 함(아직 미구현, 그쪽은 dev-login 으로 대체 중).
  - 프론트: 레이어가 `{ visible, onSelect }` 를 받음(onSelect 에 store 의 select 를 넘기면 됨), `SelectedItem` 에 `meetup`, `presence` 추가, 바텀시트에 `RestaurantSheet/ReportSheet/MeetupSheet/PresenceSheet`, 패널(`RestaurantPanel`, `ReportPanel`, `MeetupPanel`)을 탭에, 앱에서 한 번 `useRealtime()` + `<DbToaster/>` + `<InviteToast/>`, 지도 클릭을 `usePickStore.getState().handleClick({lng,lat})` 에도 연결(지금 우리는 클릭 = 바텀시트 닫기), 지도 감싼 div 에 `isolate`, Vite 프록시에 `ws: true`, `index.css` 의 `@theme` 색 토큰(`brand-*`, `sun-*`) 이전. `src/dev/` 는 버림.
  - 그쪽 캠퍼스 중심 `35.7033, 128.4557` vs 우리 지도 중심 `35.7012, 128.4565`(지역 원 중심 `35.700, 128.4575`).
  - 그쪽 문서에 "메인 지도(dohyun님)" 라고 적혀 있으나 실제 MapView 는 통합 담당(나) 소유.

### 00.8 남은 일 (우선순위)
1. ~~3D 작업 커밋·푸시~~ — 완료 (`67357bd`). 다음은 `feat/integration-bus-seminar` → `main` PR 을 만들지 사용자에게 묻기.
2. 캠퍼스 건물 **실제 층수 확인** → `build_campus_buildings.py` 의 `LEVELS` 수정 후 재실행. E1~E7 을 개별 건물로 나누려면 OSM 윤곽이 없으니 직접 다각형을 만들어야 함(구글·네이버에서 따오지 말 것).
3. 3D 다듬기 후보: 오목한 건물 지붕 테두리, 캠퍼스 나무·잔디 같은 소품, 횡단보도(OSM crossing), 하늘이 보이게 기본 시점 조정.
4. 버스 정류장 마커 겹침: 유가읍행정복지센터 앞/건너가 20m 거리라 핀이 겹친다 → 방향 화살표나 오프셋 필요.
5. 팀원 브랜치 통합 (00.7) — 사용자가 시점을 정하면.
6. 이메일 인증 + JWT (`users` 테이블, 6.7장) — DB 파트가 기다리는 부분.
7. 배포: Dockerfile + docker-compose(backend + caddy) + Caddyfile, 영구 디스크, HTTPS. 배포 서버에 쿠키 다시 업로드.
8. PWA(manifest, 아이콘), 셔틀 시간표(`seed/shuttle_timetable.json` 비어 있음), 버스 첫차·막차(`/busInfo/schedule`, 미사용).
9. 세미나 레이어 토글 상태가 localStorage 에 저장돼 "꺼진 채로" 열릴 수 있음 — 처음 보는 사람이 헷갈림. (확인 중 브라우저 패널의 localStorage 를 한 번 지웠음)

### 00.9 이번 세션에서 배운 함정
- **Git Bash heredoc 이 한글·백슬래시를 망가뜨림** (`\b` 가 백스페이스 문자로, `"\n"` 이 실제 줄바꿈으로 들어감) → 파일 내용은 Write/Edit 도구로 쓰고, 셸 heredoc 은 순수 ASCII 일 때만.
- `npx prettier --write src` 는 다른 사람 파일도 다시 포맷한다(팀원 파일을 그대로 두려면 `.prettierignore`). 또 `index.css`, `main.tsx` 를 줄바꿈만 바꿔 수정으로 표시함.
- maplibre-gl v6 워커: Vite dev 에서 기본 경로가 깨짐 → `setWorkerUrl(import ...maplibre-gl-worker.mjs?worker&url)` + `optimizeDeps.exclude: ['maplibre-gl']` (MapView.tsx, vite.config.ts).
- 대구 버스정보시스템: User-Agent 없으면 400, 사이트 언어 설정에 따라 노선명이 영어 → routeId 로 구분, 좌표계 EPSG:5187.
- 학생포탈: 비로그인 요청은 `/sso/business.jsp` → `isign.dgist.ac.kr` 로 넘어감(이걸로 만료 감지). 목록 `a.selectListTitle[href*=NOTIWR_NO]`, 상세 `table.boardView` / `th strong b`(제목, 없을 수 있음) / `#cntn_kor_view td.boardViewBody`.
- 세미나 일시 추출: 신청 마감 문장("~까지 신청")을 행사 일시로 착각하지 않게 라벨 없는 본문 검색에서는 신청·마감 줄을 뺀다. 끝 시각은 `12:00~13:30` 처럼 범위일 때만.
- 장소 매칭: 별칭 길이가 같으면 먼저 나온 건물 ("E7 236호 및 E5 1층" → E7).
- OSM `building:levels` 칸에 이름이 들어간 데이터가 있음(R4).
- 테스트는 `tests/conftest.py` 에서 `ADMIN_TOKEN=""`, `SEMINAR_SOURCE=mock`, `BUS_SOURCE=mock` 등을 환경변수로 덮어 개발자 `.env` 의 영향을 막는다.

---

## 0. 변경 사항 (v2.1, 2026-11-21)

- **저장소**: https://github.com/lyc0620/makerthon — 저장소 루트가 곧 4장의 `hyeonpung-map/` 루트다.
- **수집 방식 → 크롤링 우선**: 학교가 크롤링 사전 허가를 받아 두었고, 대부분의 크롤링이 가능하다는 공문을 받았다. 세미나는 포탈 크롤링으로 확정. 버스도 공공데이터 API 신청 대기 대신 **공개 웹 페이지 크롤링을 기본안**으로 한다(후보: 대구광역시 버스정보시스템 businfo.daegu.go.kr).
  - 학교 공문은 학교 사이트에 대한 허가다. 네이버·카카오 등 민간 지도 서비스는 여전히 크롤링하지 않는다(2장 원칙 유지).
  - 버스 수집기는 `BusSource` 인터페이스 뒤에 숨긴다. `mock` / `crawl`(웹) / `api`(공공데이터) 중 `.env`의 `BUS_SOURCE`로 고른다. 크롤링이 막히면 API 구현으로 갈아끼운다.
  - 요청 간격·주기 원칙(30초 캐시, 세미나 1초 간격·하루 4회)은 그대로.
- **버스 수집 확정 (구현 완료)**: 대구 버스정보시스템 지도 화면이 쓰는 JSON 엔드포인트 `GET https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/arr2/{bsId}` 를 호출한다(`app/services/bus/crawl.py`).
  - 대상 노선: 직행2(`5000002000`), 급행8(`1000008004`), 급행8-1(`1000008101`) — 이름이 아니라 routeId로 구분
  - 대상 정류장: 유가읍행정복지센터앞(`7111067000`), 유가읍행정복지센터건너(`7111067100`), 중흥S클래스앞(`7111076500`)
  - `moveDir` 0 = 테크노폴리스 방면, 1 = 대구 시내 방면 (실시간 데이터로 확인, `seed/bus_stops.json`의 `routes`에서 수정)
  - User-Agent를 지정하지 않으면 400. 정류장 좌표는 사이트의 EPSG:5187 값을 변환해 seed에 넣었다
  - 노선별 첫차/막차·배차는 `/busInfo/schedule?routeNo=&svcDt=YYYYMMDD`, 정류장별은 `/busInfo/gapList?routeNo=&bsId=` (아직 미사용)
- **세미나 수집 확정 (구현 완료)**: 학생포탈 "세미나 공지" 게시판 `https://stuecm.dgist.ac.kr/s/potal_board/_0002/listBbs.do?BOARD_ID=BD000254` (정적 HTML, 글 ID = `NOTIWR_NO`).
  - 로그인 필요 + 계정 2차 인증 → 서버 자동 로그인 불가. **브라우저 쿠키를 관리자 API(`PUT /api/v1/admin/portal-cookies`)로 넣는 방식** (README 참고)
  - 하루 4회 전체 수집 → **10분마다 변경 감지(새 글만 상세) + 매일 05시 최근 3페이지 재확인**으로 변경
  - 세션 만료 시 `auth_expired` 기록 후 새 쿠키가 올 때까지 대기, 디스코드 웹훅 알림(선택)
  - 일시·장소는 본문의 "일시/Date/시간", "장소/Venue" 라벨 → 제목 → 본문 순으로 추출 (`app/services/seminar/dates.py`). 일시를 못 찾은 글은 저장하지 않음
  - 건물 좌표: 사용자가 `seed/buildings.json` 에 E2~E8, R1~R3 를 채웠다 (별칭에 학과명도 넣어 둠 — 장소가 학과명으로만 적히면 오매칭 가능성 있음). 수정 후 서버 재시작하면 저장된 세미나도 다시 매핑된다
  - 관리자 API는 `ADMIN_TOKEN`(헤더 `X-Admin-Token`)이 설정돼야 켜진다
- **스케줄러 위치**: `backend/scheduler.py` → `backend/app/scheduler.py` (패키지 안에서 import하기 위함).
- **배경 지도 기본값**: `VITE_MAP_STYLE_URL`이 비어 있으면 OpenFreeMap(키 불필요, OSM)을 쓴다. MapTiler 키가 생기면 `.env`만 바꾼다. OpenFreeMap에서도 현풍 일대 도로명이 한글로 표시되는 것을 확인했다.
- **프론트 린트**: Vite 템플릿 기본값인 oxlint를 그대로 쓴다(ESLint 대신, 규칙 호환). 포맷은 Prettier.
- **프론트 폴더 추가**: 하단 탭 화면은 `src/tabs/`(SeminarListTab, BusFavoritesTab), 공용 포맷 함수는 `src/lib/`.
- **세미나 `source_id`**: DB에는 `"<수집처>:<게시글 ID>"`, API `id`는 `sem_<수집처>_<게시글 ID>` 형식이다. 수집처가 여러 개여도 겹치지 않게 하기 위함.

---

## 1. 프로젝트 개요

현풍(대구 달성군) 캠퍼스와 주변 생활권 정보를 **지도 하나에 모아 보여주는 모바일 웹 서비스**입니다.
흩어진 정보(버스, 교내 세미나, 맛집 등)를 한곳에서 보게 하는 것이 핵심 가치입니다.

### 기획된 기능

| 기능 | 구현 방향 | 담당 |
|---|---|---|
| 3D 지도 | MapLibre 위에 2.5D 건물 돌출 + 캠퍼스 주요 건물만 glTF 모델. **2D로 기능 먼저, 3D는 나중** | 팀원 |
| 최단거리 길찾기 | OpenStreetMap 보행로 + 경로 엔진(GraphHopper/Valhalla 등). 기울기는 DEM으로 보정 | 팀원 |
| 러닝 루트 추천 | 목표 거리 루프 생성. 신호등 + 기울기 반영. MVP는 GPX 업로드 + 필터 | 팀원 |
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
│   │       └── seminar/         # 크롤러(fetch_list, parse_detail), 장소 매핑
│   ├── scheduler.py
│   ├── seed/
│   │   ├── buildings.json
│   │   ├── bus_stops.json
│   │   └── shuttle_timetable.json
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── map/MapView.tsx      # 지도 하나 (통합 담당 관리)
│   │   ├── layers/              # BusLayer, SeminarLayer, RestaurantLayer, RouteLayer, ReportLayer
│   │   ├── sheets/              # 바텀시트 내용 (타입별 상세 화면)
│   │   ├── components/          # BottomSheet, LayerToggle, TabBar 등 공통 UI
│   │   ├── api/
│   │   │   ├── client.ts        # fetch 래퍼 (에러 형식 처리)
│   │   │   ├── types.ts         # 6장 규격의 TS 타입
│   │   │   └── hooks/           # useBusArrivals, useSeminars ... (TanStack Query)
│   │   ├── store/ui.ts          # Zustand: 레이어 on/off, 선택된 항목
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
- 갱신 주기 (TanStack Query `refetchInterval`): 버스 30초, 제보 60초, 세미나·맛집은 자동 갱신 없음(staleTime 10분)
- 화면 구성: 전체 화면 지도 + 상단 레이어 토글 + 하단 탭(지도 / 세미나 목록 / 버스 즐겨찾기) + 바텀시트
- 버스 즐겨찾기 정류장은 브라우저 localStorage에 저장 (로그인 불필요)

---

## 9. 환경변수 (`.env.example`)

```
# backend
DATABASE_URL=sqlite:///./data/app.db
BUS_SOURCE=mock          # mock | crawl | api
BUS_API_KEY=
SEMINAR_SOURCE=mock      # mock | portal
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

## 10. 내 To-do 리스트 (2026-11-21 진행 상황 반영)

### 0. 공통 준비
- [x] 기술 스택·API 규격 확정 (이 문서)
- [ ] **[높음]** 이 문서의 5~8장을 팀에 공유하고 맛집·길찾기·제보 담당자에게 초안 확인받기 — DB 파트는 `api-spec-db.md` 로 회신 옴(00.7)
- [x] **[높음]** 모노레포 뼈대 생성 (4장 구조, `.env.example`, README) — `deploy/` 는 아직 없음
- [x] **[높음]** 수집 대상 이용 규정 확인 — 학교 공문으로 크롤링 허가

### 1. 버스
- [x] 대상 정류장·노선 확정 (유가읍행정복지센터앞/건너, 중흥S클래스앞 / 직행2, 급행8, 급행8-1)
- [x] ~~공공데이터 API 신청~~ → 대구 버스정보시스템 JSON 크롤링으로 대체
- [x] `seed/bus_stops.json` (정류장명 ↔ bsId ↔ 좌표, 노선 routeId ↔ 이름·방향)
- [x] 호출·응답 파싱 (`app/services/bus/crawl.py`, 실제 응답 샘플 `tests/fixtures/businfo_arr2_*.json`)
- [x] 메모리 캐시 + 30초 갱신 + `is_stale`
- [ ] **[중간]** `seed/shuttle_timetable.json` 채우기 (형식만 있음, 계산 로직은 완료)
- [x] `GET /bus/stops`, `GET /bus/arrivals` + 테스트
- [ ] **[낮음]** 첫차·막차·배차 (`/busInfo/schedule`, `/busInfo/gapList`) 활용
- [ ] **[중간]** 앞/건너 정류장 마커 겹침 해결

### 2. 세미나
- [x] 포탈 구조 파악 (로그인 필요, 정적 HTML, `currentPage` 페이지 넘김)
- [x] 학교 허가 (공문)
- [x] 수집 대상: 학생포탈 "세미나 공지" 게시판 (`_0002`, BD000254)
- [x] 크롤러 (`fetch_list`, `parse_detail`), 요청 간격 1초, 쿠키 방식 로그인
- [x] 일시·장소 추출 (실제 표기 30여 개로 테스트)
- [x] `seed/buildings.json` (사용자가 E2~E8, R1~R3 좌표 채움) + 장소 매칭 + 서버 시작 시 재매핑
- [x] `source_id` 기준 upsert, 일시 못 찾은 글 삭제
- [x] 스케줄(10분 변경 감지 + 매일 05시 재확인) + `crawl_logs`
- [x] `GET /seminars`, `GET /seminars/{id}` + 테스트
- [ ] **[중간]** 목록 응답 `count`/`total` 을 DB 파트 규격으로 맞추기 (00.7)
- [ ] **[낮음]** 매핑 실패·일시 추출 실패 글 확인 화면

### 3. 백엔드 통합
- [x] 공통 설정: config, DB(WAL), 에러 형식, CORS, health
- [x] Alembic 초기 마이그레이션 + seed 로더
- [x] 스케줄러를 lifespan 에 연결 (워커 1개 전제)
- [ ] **[중간]** 이메일 인증 + JWT (`users` 테이블은 통합 담당 소유, DB 파트가 기다림)
- [ ] **[중간]** 팀원 브랜치 머지 (00.7 — 사용자가 시점 결정)
- [x] 크롤러 실패 알림 (디스코드 웹훅, `DISCORD_WEBHOOK_URL`)
- [x] 관리자 API (쿠키 업로드, 수집 상태, 수동 재수집)

### 4. 프론트엔드
- [x] Vite + React + TS + Tailwind + TanStack Query + Zustand, `/api` 프록시
- [x] `MapView` + 배경 지도 (OpenFreeMap, 한글 표기 OK) → 미니어처 스타일로 변환
- [x] `api/types.ts`, `client.ts`
- [x] 공통 UI: `LayerToggle`(버스·세미나·3D), `BottomSheet`, 하단 탭
- [x] `BusLayer` + 버스 시트 + 즐겨찾기
- [x] `SeminarLayer` + 세미나 목록 탭 + 상세 시트 ("종일" 표시 포함)
- [x] 내 위치 (GeolocateControl)
- [x] **3D 지도** (00.5) — 커밋·푸시 완료 (`67357bd`)
- [ ] **[중간]** 팀원 레이어(맛집·길찾기·제보·밥친구) 연결
- [ ] **[중간]** PWA 설정 (아이콘, manifest)

### 5. 배포·마무리
- [ ] **[중간]** Dockerfile + docker-compose + Caddyfile
- [ ] **[중간]** 서버 배포 (영구 디스크, HTTPS) + 포탈 쿠키 재업로드
- [ ] **[중간]** 실제 데이터로 통합 테스트 (폰에서 확인)
- [x] README: 실행 방법, 쿠키 넣기, 수집 소스 바꾸기

---

## 11. 아직 정해지지 않은 것

- 배포 서버 (학교 서버 vs 클라우드 VM)
- 제보 기능 최종 방향 (DB 파트는 `police` 우선, `dark_road`/`hazard` 예비로 구현함)
- 팀원 브랜치를 언제 합칠지 (사용자가 미뤄 둠)
- 포탈 세션 쿠키가 얼마나 유지되는지 (운영해 봐야 앎), 장기 운영 시 크롤링 전용 계정 필요 여부
- 캠퍼스 건물 실제 층수

## 12. 다음 Claude 세션에게 — 첫 작업 순서

1. 이 문서 00장을 읽는다. `cd github && git status && git log --oneline -3` 으로 작업 트리가 깨끗하고 00.1 의 커밋이 맞는지 확인한다. 새 컴퓨터라면 00.1 의 "git 에 없는 것"부터 다시 만든다.
2. 미리보기 서버(`backend`, `frontend`)를 띄우고 브라우저 패널에서 지도를 연다. 3D 토글·확대해서 00.5 의 모습이 나오는지 확인한다.
3. 사용자에게 `main` 으로 PR 을 만들지 묻는다 (00.8-1). 커밋·푸시는 끝나 있다.
4. 이후 00.8 의 우선순위대로. 3D 는 사용자 피드백을 받으며 다듬는 중이었다 (마지막 요청: 원형 경계·캠퍼스 밖 건물 윤곽만·캠퍼스 예쁘게·내천과 다리 → 모두 반영 완료, 다음 피드백 대기).
