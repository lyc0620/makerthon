# 김도현 작업 정리 (2026-11-21 메이커톤)

현풍 지도 프로젝트에서 **지도 · 길찾기 · 러닝 · 강의실 · 3D** 담당으로 만든 것 전체를 정리한 문서입니다.
명세는 `hyeonpung-map-handoff.md` 6.5장(길찾기·러닝·3D)과 6.8장(강의실 검색), 파일별 요약은 `docs/route-module.md`를 함께 보세요.

> **통합 후 (2026-11-21, `feat/lyc0620-integration`)**: 단독 데모 페이지(`scripts/route_demo.html`, `dev_route_server.py`)와 `Buildings3DLayer` 는 지웠다 — 지도는 팀 `MapView` 하나로 간다.
> 길찾기·러닝·강의실은 지도 위 "🧭 길찾기" 버튼 → 패널(`components/NavPanel.tsx`)에서 쓴다. E7 상세 모델·E 단지 분리는 데모 페이지에만 있었으므로 지금은 없다(캠퍼스 3D 는 `CampusBuildingsLayer`).
> `seed/buildings.json` 은 이 문서의 `build_campus_seed.py` 가 만들고, 세미나 장소 매칭·지도 건물 핀도 같은 파일을 쓴다(좌표 E2~E8·R1~R3 는 세미나 담당 값).

- 브랜치: `feat/dohyeon-route` → PR [lyc0620/makerthon#1](https://github.com/lyc0620/makerthon/pull/1)
- 테스트: 백엔드 `pytest` 29개 통과, 프론트 TSX 타입 검사(TypeScript strict) 통과

---

## 한눈에 보기

| 기능 | 사용자가 하는 것 | 결과 |
|---|---|---|
| 길찾기 | 지도에서 출발·도착 클릭 | 보행로 따라 최단 경로, 거리, 걷기/달리기 시간 |
| 러닝 코스 추천 | 목표 km 입력 | 출발점으로 돌아오는 순환 코스 최대 3개 (신호등 개수 포함) |
| 강의실 검색 | `L21`, `E7 233`, `멀티미디어`, `도서관`, `해동창의마루` 검색 | 건물 위치, 층, 층별 안내도 위 강의실 위치, 정문에서 길찾기 |
| 3D 실내 스캔 | 검색 결과의 "3D" 버튼 | 영상으로 만든 사실적인 3D 공간을 걸어 다니며 보기 |
| 3D 건물 | 지도 기울이기 | E7 컨실리언스홀 상세 모델 + E1~E6 실제 높이 |

데모: `backend` 폴더에서 `python -m uvicorn scripts.dev_route_server:app --port 8000` → http://localhost:8000/

---

## 1. 길찾기 · 러닝 코스 (명세 6.5)

### 데이터
- `backend/scripts/build_walk_graph.py`: OpenStreetMap(Overpass API)에서 현풍·DGIST·테크노폴리스 일대의 걸을 수 있는 길(footway, path, steps, residential 등)을 받아 그래프로 변환
- `backend/seed/walk_graph.json`: 노드 6,233개, 간선 6,734개, 총 287km, 신호등 10개. 끊어진 작은 조각은 제거해 스냅한 두 점 사이에 항상 경로가 있음

### 알고리즘 (`backend/app/services/route/graph.py`, 표준 라이브러리만 사용)
- **좌표 스냅**: 입력 좌표를 가장 가까운 노드로. 300m 넘게 멀면 400 에러
- **최단경로**: Dijkstra. 걷기 1.3m/s, 달리기 2.8m/s(약 6분/km)로 소요 시간 계산
- **순환 코스**: 출발점 → 경유지1 → 경유지2 → 출발점
  1. 출발점에서 목표 거리의 20~40% 떨어진 노드를 12개 방향별로 하나씩 경유지1 후보로
  2. 경유지2는 경유지1과 40~110도 벌어진 방향에서 예상 총거리가 목표에 가까운 2곳
  3. 이미 지난 길의 가중치를 3배로 올려 같은 길 왕복을 피함
  4. 목표 ±15% 이내만, 서로 70% 넘게 겹치는 코스는 하나만 남겨 최대 3개
- 성능: 3·5·10km 모두 목표와 거의 같은 거리, 약 0.2초

### API (`backend/app/routers/route.py`)
- `GET /api/v1/route?from=lat,lng&to=lat,lng&mode=walk|run`
- `GET /api/v1/running-routes?distance_km=5&lat=&lng=` (기본 출발점 DGIST 정문)
- 에러는 명세 5장 형식 `{"error": {"code", "message"}}`

### 프론트 (react-map-gl/maplibre)
- `RouteLayer`(클릭 1번째 출발, 2번째 도착), `RunningLayer`(후보 3개 색 구분), `RoutePanel` / `RunningPanel`, `store/route.ts`(Zustand), `useRoute` / `useRunningRoutes` 훅

---

## 2. 강의실 검색 (명세 6.8)

### 데이터 (`backend/scripts/build_campus_seed.py` → `backend/seed/`)
| 파일 | 내용 | 출처 |
|---|---|---|
| `buildings.json` | 건물 21곳(E1~E8, R1~R7, 국제관, 비슬빌리지, 체육관 등), 좌표, 별칭 | [DGIST 사이버 투어](https://www.dgist.ac.kr/cyber/tour/) `data.json` |
| `floor_plans.json` | 층별 안내도 12장 (E2~E6 2층, E3 3층, E7 G·L·2층) | [DGIST 학부 School Facilities](https://www.dgist.ac.kr/en_college/sub05_02.do) |
| `rooms.json` | 실 254개 (번호, 이름, 층, 안내도 위 x·y 픽셀) | 같은 페이지의 실 목록 + 안내도를 보고 위치 수작업 지정 |
| `scans.json` | 3D 실내 스캔 목록 | 직접 촬영·복원 |

- `buildings.json`은 세미나 담당 팀원도 장소 텍스트 매칭(`aliases`)에 그대로 쓸 수 있음

### 검색 (`backend/app/services/campus/`)
- `E7 L21`, `e7-233`, `L21`(L·G 번호는 E7), `216`(여러 건물), `220A` 같은 실 번호
- `멀티미디어`, `이준석` 같은 실 이름, `도서관`, `컨실` 같은 건물 별칭
- `해동창의마루` 같은 3D 스캔 공간 이름 → 그 건물·층
- 안내도에 없는 실(`R2 301`)은 건물 위치 + 번호 첫 자리로 추정한 층

### API (`backend/app/routers/campus.py`)
- `GET /api/v1/campus/search?q=` → 건물, 층, 안내도, 실 위치, 3D 스캔 목록
- `GET /api/v1/campus/floor-plans/{id}/image` → 안내도 이미지 중계
  - 학교 서버가 `Cross-Origin-Resource-Policy: same-site`라 브라우저에서 직접 못 띄워서 백엔드가 받아 전달 (등록된 12장만 허용, 메모리 캐시)

### 프론트
- `RoomSearchPanel`(검색 → 안내도에 빨간 원으로 위치 강조 → "여기까지 길찾기" → "3D" 버튼), `RoomLayer`(건물 핀 + 이동)

---

## 3. 3D 실내 스캔 (영상 → 3D 가우시안 스플래팅)

### 파이프라인
```
휴대폰 영상 (2분, 1080×1920)
 → ffmpeg 프레임 추출 (초당 5장, 원본 해상도)
 → COLMAP 4.2.1 (CUDA): 특징점 → 순차 매칭(앞뒤 40장) + 루프·넓은 범위 매칭 → 카메라 위치 계산
 → 가장 큰 조각 선택 → 왜곡 보정
 → gsplat 1.5.3 학습 (train_gsplat.py, 10,000~15,000단계)
 → ply_to_splat.py: 웹용 .splat (불투명도 0.05 미만 제거, 154MB → 14MB 수준)
 → 브라우저 뷰어
```

### 도구 (로컬 설치, 저장소 밖)
- COLMAP 4.2.1 CUDA 버전: `C:\Users\dohyeonKim\tools\colmap`
- gsplat 환경: `C:\Users\dohyeonKim\tools\gsplat_env` (Python 3.10 + PyTorch 2.4.1 cu124 + gsplat 1.5.3 미리 빌드된 Windows 휠, CUDA 컴파일러 불필요)
- GPU: RTX 3060 Laptop 6GB

### 스크립트 (`backend/scripts/`)
| 파일 | 역할 |
|---|---|
| `train_gsplat.py` | gsplat 학습. 공식 예제가 쓰는 `fused-ssim`(컴파일 필요) 대신 SSIM을 PyTorch로 구현. 사진은 CPU에 두고 한 장씩 GPU로. `--max-splats`로 가우시안 수 상한(GPU 메모리 보호). 뷰어용 위쪽 방향·시작 시점을 `.json`으로 저장 |
| `ply_to_splat.py` | 3DGS PLY → `.splat`(가우시안당 32바이트), 크고 진한 것부터 정렬해 점진 로딩이 자연스럽게 |
| `prepare_scan.py` | COLMAP 점 구름 → 뷰어용 PLY (중력 방향 정렬, 잡음 제거, 다운샘플) |

### 결과
| 스캔 | 구간 | 가우시안 | 파일 | 품질(학습 뷰 PSNR) |
|---|---|---|---|---|
| E8 학술정보관 3층 · 아트리움 → 유리벽 복도 | 영상 2~67초, 325장 | 43만 개 | 13.8MB | 약 26.7dB |
| E7 컨실리언스홀 L층 · 해동창의마루 (중심 홀) | 영상 63~100초, 188장 | 35만 개 | 11.1MB | 약 25~27dB |

### 겪은 문제와 해결
| 문제 | 원인 | 해결 |
|---|---|---|
| E8 영상이 7조각으로 끊김 | 반사되는 바닥, 유리벽, 흰 벽 | 프레임 2배·원본 해상도 → 가장 큰 조각 60장 → 325장 |
| E8 67~86초 복원 불가 | 좌우가 모두 유리인 복도 | 제외 (재촬영 요령 정리) |
| E8 안쪽 복도(B) 품질 낮음 | 일부 프레임 위치가 잘못 잡힘 | 제외 |
| E7 해동창의마루 3조각 | 같은 간격 나무 루버 반복, 루버에 붙어 찍은 장면 | 넓은 범위 매칭 시도 중 시간 부족 → 가장 큰 중심 홀 사용 |
| GPU 메모리 부족 | 6GB에서 매칭·학습 동시 실행, 가우시안 80만 개 이상 증식 | 단계별 순차 실행, `--max-splats 500000`, 720px |
| 특징점 매칭 실패 | 프레임당 특징점 2만 개 → GPU 메모리 초과 | 특징점 8,192개, 매칭 16,384개로 제한 |
| 154MB 결과 파일 | 브라우저에 너무 무거움 | `.splat` 변환으로 10분의 1 |

### 서비스 연결 (`backend/app/routers/scans.py`)
- `GET /api/v1/scans/splat-viewer?scan={id}` → 스플랫 뷰어 (`backend/static/viewers/splat.html`)
- `GET /api/v1/scans/points-viewer?scan={id}` → 점 구름 뷰어
- `GET /api/v1/scans/files/{name}` → `.splat` / `.ply` / `.json` (파일 이름만 허용, `.json`은 캐시 안 함)
- 운영에서 Caddy가 `/api`만 백엔드로 넘기므로 뷰어 페이지도 `/api/v1` 아래

### 뷰어 조작 (걷기 모드 기본)
- W A S D·방향키: 이동 (바닥과 나란히) · Q/E: 아래/위 · Shift: 빠르게 · 드래그: 둘러보기 · 휠: 앞뒤
- 오른쪽 아래 이동 버튼 (휴대폰) · "둘러보기 모드"로 바꾸면 한 점 중심 회전 + 확대

### 재촬영 요령 (다음에 더 잘 나오게)
- 0.5배 초광각 + 가로 모드, FHD 60fps, 노출·초점 잠금, 줌·HDR 끄기
- 천천히 걷고, 카메라는 진행 방향에서 45도쯤 옆벽 쪽. 방향 전환은 천천히
- 바깥벽 보며 한 바퀴 → 출발점에서 천천히 180도 돌아 다시 왼쪽 보며 반대 방향으로 한 바퀴 (= 안쪽 벽)
- 시작점을 5~10초 더 지나 끝내기 (루프 닫기)
- 유리 구간은 바닥 위주로 30~45도 아래, 유리 프레임을 화면에, 가능하면 무늬 있는 임시 표식
- 반복 무늬(루버) 벽에 붙지 말고 1.5~2m 떨어져 주변 가구·창이 같이 보이게

---

## 4. 3D 건물 (지도)

### E7 컨실리언스홀 상세 모델 (데모 페이지, three.js 커스텀 레이어)
- 참고: [행림건축 DGIST 학위과정시설](https://haenglim.com/app/projects/2c9480838bf00d91018cccf007ed0039) 사진
- 아래 두 층: 녹색빛 유리 커튼월 + 약 3m 간격 세로 멀리언 + 층 슬래브 띠
- 위층: 은회색 금속 패널 + 0.8m 간격 짙은 가로 루버
- 지붕 처마, "E7" 사인, 높이 16.5m

### E 단지 분리
- OSM에는 E1~E7이 빗 모양 다각형 하나(id 15700286740)라 배경 지도가 22m 덩어리로 세우고 있었음
- 손으로 나눠 E1 42m(10층), E2~E6 날개 동 30m(7층), E7 몸체는 위 상세 모델
- 배경 스타일의 `building-3d`와 우리 `buildings-3d` 모두에서 단지 제외 (식 문법 `["id"]` 필터가 fill-extrusion에서 안 먹어 레거시 `$id` 문법 사용)

### 팀 프론트용
- `Buildings3DLayer`: 배경 벡터 타일 건물을 `fill-extrusion`으로 돌출, 켜면 지도 45도 기울임
- E7 상세 모델과 E 단지 분리는 아직 데모 페이지(`backend/scripts/route_demo.html`)에만 있음

---

## 5. 파일 구조 (내가 만든 것)

```
backend/
  app/
    routers/route.py, campus.py, scans.py
    services/route/ (graph.py), services/campus/
  scripts/
    build_walk_graph.py, build_campus_seed.py
    train_gsplat.py, ply_to_splat.py, prepare_scan.py
    dev_route_server.py, route_demo.html          # 단독 데모
  seed/
    walk_graph.json, buildings.json, floor_plans.json, rooms.json, scans.json
  static/
    scans/  e8_3f_gs.splat(.json), e7_haedong_gs.splat(.json)
    viewers/ splat.html, points.html
  tests/ test_route.py, test_campus.py, test_scans.py
frontend/src/
  api/routeTypes.ts, api/hooks/useRoute.ts
  store/route.ts
  layers/RouteLayer.tsx, RunningLayer.tsx, Buildings3DLayer.tsx, RoomLayer.tsx
  sheets/RoutePanel.tsx, RoomSearchPanel.tsx
docs/
  route-module.md, dohyeon-work-summary.md (이 문서)
```

---

## 6. 통합 담당에게

백엔드 `main.py`:
```python
from app.routers import campus, route, scans
app.include_router(route.router, prefix="/api/v1")
app.include_router(campus.router, prefix="/api/v1")
app.include_router(scans.router, prefix="/api/v1")
```

프론트 `MapView`:
```tsx
<RouteLayer visible={layers.route} />
<RunningLayer visible={layers.running} />
<Buildings3DLayer visible={layers.buildings3d} />
<RoomLayer visible={layers.room} />
```
- `RouteLayer`와 `RunningLayer`는 둘 다 지도 클릭을 쓰므로 토글을 서로 배타로
- `RoutePanel`, `RunningPanel`, `RoomSearchPanel`은 탭이나 바텀시트에
- 훅은 임시로 자체 `fetch` 사용 → `api/client.ts`가 생기면 교체

---

## 7. 한계와 다음 할 일

- 기울기(DEM) 미반영: `ascent_m`, `descent_m`은 `null`
- 캠퍼스 내부 보행로 일부가 OSM에 없을 수 있음 → 확인 후 `walk_graph.json` 보강
- 강의실 위치는 안내도를 보고 정한 근사값. 안내도 없는 층·R동·기숙사는 건물 위치와 추정 층만
- 해동창의마루는 중심 홀만. 나머지 두 조각(0~25초, 24~54초) 연결 시도용 매칭 결과는 `C:\Users\dohyeonKim\tools\e7_recon\v2\database.db`에 저장
- E8 3층 67~119초 구간, 다른 건물 실내 스캔은 재촬영 필요
- E7 상세 모델·E 단지 분리를 팀 프론트 레이어 컴포넌트로 옮기기
- 실제 Vite 빌드와 화면 확인은 통합 프론트에서
- 스캔 파일(약 25MB)이 저장소에 포함됨

---

## 8. 커밋 이력 (PR #1)

| 커밋 | 내용 |
|---|---|
| `88c6680` | 길찾기, 러닝 코스 추천, 3D 건물 레이어 (명세 6.5) |
| `8f19144` | 프론트 TSX 타입 검사 통과 반영 |
| `6351cce` | 데모 페이지를 파일로 직접 열어도 API를 부르도록 수정 |
| `a3624a4` | DGIST 강의실 검색과 E8 3층 3D 실내 스캔 |
| `88f1849` | 3D 스캔 뷰어·파일 경로를 팀 백엔드용 라우터로 이동 |
| (이번 커밋) | E7 외관 모델, 해동창의마루 스캔, 걷기 모드, 작업 정리 문서 |
