# 현풍 지도 백엔드 — DB 파트 (맛집 · 제보 · 밥친구)

규격은 `../docs/api-spec-db.md`를 따라요. 공통 규칙(에러 형식, 목록 응답, 시간·ID 형식)은 팀 인수인계 v2 5장을 따라요.

## 실행 (Windows PowerShell, `backend` 폴더에서)

```powershell
uv sync                                   # 패키지 설치 (.venv, uv.lock)
uv run alembic upgrade head               # DB 테이블 만들기 (backend/data/app.db)
uv run python -m seed.db_sample           # 예시 데이터 넣기 ("[예시]" 표시, 여러 번 실행해도 안전)
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
uv run pytest                             # 테스트
uv run ruff check .                       # 린트
```

- API 문서: 서버를 켠 뒤 http://127.0.0.1:8000/docs
- 상태 확인: http://127.0.0.1:8000/api/v1/health
- 실시간 알림: `ws://127.0.0.1:8000/api/v1/ws` (로그인한 연결은 `?token=<JWT>`를 붙여요 → 실시간 위치·"같이 먹자" 알림도 받아요)
- 설정은 `.env.example`을 `.env`로 복사해서 채워요. 복사만 해도 `APP_ENV=dev`라서 개발 모드로 돌아가요. `.env`가 없으면 기본값이 운영 모드(prod)라서 개발용 로그인이 꺼지고 JWT_SECRET이 없으면 시작하지 않아요.
- Uvicorn은 **워커 1개**로 실행해요 (WebSocket 허브가 메모리에 있어요).

## 개발용 로그인

이메일 인증(통합 담당)이 붙기 전까지 `APP_ENV=dev`일 때만 켜져요.

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v1/auth/dev-login -H "Content-Type: application/json" -d '{\"nickname\": \"[예시] 익명의 사슴\"}'
```

받은 `access_token`을 `Authorization: Bearer <토큰>` 헤더로 보내면 돼요. 예시 데이터의 닉네임 3개로 로그인하면 예시 후기·모임의 주인으로 보여요.

## 발표용 예시 봇 (지금 밥 먹을 사람)

서버를 켠 채로 **다른 터미널**에서 실행하면 "[예시]" 닉네임 4명이 캠퍼스 근처 지도에 떠요.
1분마다 신호를 보내고, `Ctrl+C`로 끄면 위치 공유를 끄고 끝나요. (APP_ENV=dev 필요)

```powershell
uv run python -m seed.demo_presence
```

실시간 위치는 DB가 아니라 서버 메모리에만 있어요. 서버를 다시 켜면 모두 사라지고, 3분 동안 신호가 없어도 사라져요.

## 폴더

```
backend/
├── app/
│   ├── main.py            # 앱, CORS, 에러 핸들러, 라우터, /api/v1/ws   (통합 담당 영역 임시 대역)
│   ├── core/              # config, db, errors, auth (임시 대역) + timeutil, ids, geo
│   ├── models/            # SQLModel 테이블 (user.py는 통합 담당 영역 임시 대역)
│   ├── schemas/           # 요청/응답 모델 (규격 JSON 그대로)
│   ├── routers/           # restaurants(후기 포함), reports, meetups(번개 약속 포함), presence, dev_auth
│   └── services/          # kakao(장소 검색 프록시), realtime(WebSocket 허브), presence(실시간 위치, 메모리)
├── alembic/               # 마이그레이션 (DATABASE_URL은 앱 설정에서 읽어요)
├── seed/db_sample.py      # 예시 데이터
├── seed/demo_presence.py  # 발표용 실시간 위치 예시 봇
└── tests/                 # pytest (테스트마다 임시 DB, 카카오는 가짜 응답)
```

`# 통합 담당(lyc0620) 영역의 임시 대역` 표시가 있는 파일은 통합할 때 통합 담당 파일로 바꿔요.
DB 파트 라우터는 `app.core.auth`의 `current_user` / `optional_user`, `app.core.db`의 `get_session`,
`app.core.errors`의 `AppError`만 쓰니까, 같은 이름으로 맞춰 주면 그대로 붙어요.

## 테이블을 바꿨을 때

```powershell
uv run alembic revision --autogenerate -m "무엇을 바꿨는지"
uv run alembic upgrade head
```

## 참고

- 시간은 DB에 UTC로 저장하고 응답은 `+09:00`으로 보내요. 요청에 오프셋이 없으면 서울 시간으로 봐요.
- Windows에는 시간대 데이터가 없어서 `tzdata` 패키지를 같이 설치해요.
- `alembic.ini`에는 한글을 쓰지 마세요 (Windows에서 cp949로 읽어서 오류가 나요).
