# 현풍 지도 (makerthon)

현풍 캠퍼스와 주변 생활권 정보(버스·세미나·맛집·길찾기 …)를 지도 하나에 모아 보여주는 모바일 웹 서비스.

- 전체 기획·결정 사항: [docs/handoff.md](docs/handoff.md)
- API 규격 (팀 공유용): [docs/api-spec.md](docs/api-spec.md)

## 구조

```
backend/    FastAPI + SQLite(SQLModel/Alembic) + APScheduler
frontend/   React + Vite + TS + MapLibre(react-map-gl) + TanStack Query + Zustand + Tailwind
docs/       기획 문서, API 규격
deploy/     (예정) docker-compose + Caddy
```

## 로컬 실행

### 준비물
- Python 3.12+, [uv](https://docs.astral.sh/uv/) (`pip install uv` 로도 설치 가능)
- Node.js 20+ / npm

### 백엔드 (http://localhost:8000, Swagger: `/docs`)

```bash
cd backend
cp ../.env.example .env      # 필요한 값만 채우기. 기본값은 mock 데이터로 동작
uv sync
uv run uvicorn app.main:app --port 8000
```

시작할 때 자동으로 처리하는 것:
- Alembic 마이그레이션 (`AUTO_MIGRATE=true`)
- `seed/*.json` 을 DB에 반영 (건물·정류장)
- 버스 도착정보 즉시 1회 수집 후 30초마다 갱신 (메모리 캐시)
- 세미나 DB가 비어 있으면 즉시 1회 수집, 이후 하루 4회 (00·06·12·18시)

> 스케줄러와 캐시가 프로세스 안에 있으므로 **Uvicorn 워커는 1개**로 실행한다.

### 프론트엔드 (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev        # /api 요청은 localhost:8000 으로 프록시
```

### 테스트 / 린트

```bash
cd backend  && uv run pytest && uv run ruff check . && uv run ruff format .
cd frontend && npm run lint && npm run format && npm run build
```

## 데이터 수집 소스 바꾸기 (`backend/.env`)

| 변수 | 값 | 설명 |
|---|---|---|
| `BUS_SOURCE` | `crawl` / `mock` / `api` | 버스 도착정보. `crawl` = 대구 버스정보시스템 (기본값) |
| `SEMINAR_SOURCE` | `portal` / `mock` | 세미나. `portal` = 학생포탈 "세미나 공지" 게시판 (쿠키 필요, 아래 참고) |

새 수집기는 `app/services/bus/base.py` 의 `BusSource`, `app/services/seminar/base.py` 의 `SeminarCrawler` 규약만 맞추면 된다.

## 포탈 쿠키 넣기 (세미나 수집)

학생포탈은 로그인이 필요하고 2차 인증 때문에 서버가 직접 로그인할 수 없다. 사람이 브라우저에서 로그인한 뒤 쿠키를 서버에 넣어 준다.

1. 크롬에서 포탈에 로그인하고 https://stuecm.dgist.ac.kr/s/potal_board/_0002/listBbs.do 를 연다
2. F12 → Network 탭 → 새로고침 → `listBbs.do` 요청 클릭 → Headers → Request Headers 의 `cookie:` 값을 통째로 복사
   (또는 Cookie-Editor 확장의 Export → JSON 결과를 복사해도 된다)
3. `backend` 폴더에서 아래를 실행하고, 프롬프트에 쿠키를 붙여넣고 Enter (입력은 화면에 안 보임):

   ```powershell
   uv run python -m app.tools.upload_cookies          # 배포 서버면 --url https://서버주소
   ```

   (uv 가 PATH 에 없으면 `.\.venv\Scripts\python.exe -m app.tools.upload_cookies`)

   > 주의: 쿠키를 복사한 뒤 다른 것을 복사하면 클립보드가 덮어써진다. 쿠키를 복사하고 바로 붙여넣을 것.

4. 업로드 직후 수집이 한 번 돌고, 스크립트가 그 결과(success / auth_expired)를 보여 준다.
   나중에 확인할 땐 `GET /api/v1/admin/crawl-status` (헤더 `X-Admin-Token`)
5. 파서를 고친 뒤 기존 글을 다시 파싱하려면 `POST /api/v1/admin/seminar-crawl?pages=3&full=true` (같은 헤더)

동작 방식
- 07~23시 10분마다 목록 1페이지만 확인하고 **새 글만** 상세를 받는다 (이 요청이 세션 유지 역할도 함). 매일 05시엔 최근 3페이지를 다시 확인해 수정 사항 반영.
- 세션이 끊기면 `crawl_logs.status = auth_expired` 로 남기고, **새 쿠키가 들어올 때까지 재시도하지 않는다** (SSO 반복 요청 방지). `DISCORD_WEBHOOK_URL` 이 있으면 알림.
- 쿠키는 `backend/data/portal_cookies.json` (git 제외)에 저장된다. 개인 계정 세션이므로 서버 접근 권한을 최소로 유지할 것.

## 팀원 모듈 붙이는 법

- **백엔드**: `backend/app/routers/<기능>.py` 에 `APIRouter` 를 만들고 `app/main.py` 의 라우터 목록에 추가. 응답은 `docs/api-spec.md` 형식(목록 `{items, count, updated_at}`, 에러 `{error: {code, message}}` — `app.core.errors.ApiError` 사용).
- **프론트**: `frontend/src/layers/<기능>Layer.tsx` 에 `{ visible }` props 를 받는 레이어를 만들고 `App.tsx` 의 `<MapView>` 안에 끼운다. 데이터는 `src/api/hooks/` 의 TanStack Query 훅으로, 마커 클릭 시 `useUi().select({ type, id })` 만 호출. 상세 화면은 `src/sheets/` 에 만들고 `components/BottomSheet.tsx` 에 연결.
- 브랜치: `feat/<이름>-<기능>` → `main` 으로 PR, 리뷰 1명 이상.
