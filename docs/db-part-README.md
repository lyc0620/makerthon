# 현풍 지도 — DB 파트 (맛집 · 경찰 제보 · 밥친구)

팀 인수인계 v2(`hyeonpung-map-handoff.md`)의 폴더 구조·기술 스택·API 규칙에 맞춰 만든 **DB 파트 작업물**이에요.
통합 때 `backend/`, `frontend/` 안의 내 파일만 팀 저장소로 옮기면 돼요.

| 문서 | 내용 |
|---|---|
| [docs/api-spec-db.md](docs/api-spec-db.md) | 내 파트 API 규격 (팀원은 이것만 보면 돼요) + **팀 합의 필요 7가지** |
| [backend/README.md](backend/README.md) | 백엔드 실행·테스트 방법 |
| [frontend/README.md](frontend/README.md) | 프론트 실행 방법, 통합 때 MapView·BottomSheet에 끼우는 법 |

## 30초 실행 (Windows PowerShell)

```powershell
cd backend; uv sync; Copy-Item .env.example .env; uv run alembic upgrade head; uv run python -m seed.db_sample
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
```powershell
cd frontend; npm install; npm run dev
```
→ http://localhost:5173 (API 문서는 http://127.0.0.1:8000/docs)

## 누가 어떤 파일을 갖나

- **내 파일 (DB 파트)**: `backend/app/models|schemas|routers|services` 의 맛집·제보·밥친구, `frontend/src/layers`, `sheets`, `panels`, `api/types.db.ts`, `api/hooks/db/`
- **통합 담당(lyc0620) 자리의 임시 대역**: `backend/app/main.py`, `backend/app/core/*`, `models/user.py`, 개발용 로그인 — 통합 때 그쪽 파일로 바뀌어요
- **버릴 파일**: `frontend/src/dev/` (메인 지도는 dohyun님 MapView로 바뀌어요)
- 예전 프로토타입은 `archive/prototype-v1/` 에 보관
