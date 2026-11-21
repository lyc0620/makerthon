# 길찾기 · 러닝 · 3D 모듈 (담당: 김도현)

명세: `hyeonpung-map-handoff.md` 6.5장

## 파일

| 위치 | 내용 |
|---|---|
| `backend/scripts/build_walk_graph.py` | OSM 보행로 → `backend/seed/walk_graph.json` (이미 생성됨, 다시 받을 때만 실행) |
| `backend/seed/walk_graph.json` | 현풍·DGIST·테크노폴리스 일대, 노드 6,233개 / 287km / 신호등 10개 |
| `backend/app/services/route/` | 그래프 로드, 좌표 스냅, Dijkstra, 순환 코스 생성 (표준 라이브러리만 사용) |
| `backend/app/routers/route.py` | `GET /route`, `GET /running-routes` |
| `backend/tests/test_route.py` | 알고리즘 + API 테스트 10개 |
| `backend/scripts/dev_route_server.py`, `route_demo.html` | 통합 전 단독 데모 (Node 없이 브라우저로 확인) |
| `frontend/src/api/routeTypes.ts` | 6.5 TS 타입 |
| `frontend/src/api/hooks/useRoute.ts` | `useRoute`, `useRunningRoutes` |
| `frontend/src/store/route.ts` | Zustand: 출발/도착, 러닝 거리·출발점·선택 코스, 3D on/off |
| `frontend/src/layers/RouteLayer.tsx` | 길찾기 선 + 출발/도착 마커 |
| `frontend/src/layers/RunningLayer.tsx` | 러닝 코스 후보 3개 |
| `frontend/src/layers/Buildings3DLayer.tsx` | 건물 돌출 + 지도 45도 기울임 |
| `frontend/src/sheets/RoutePanel.tsx` | `RoutePanel`, `RunningPanel` 입력 UI |
| `backend/scripts/build_campus_seed.py` | DGIST 건물·층별 안내도·강의실 seed 생성 (출처·수작업 좌표 포함) |
| `backend/seed/buildings.json`, `floor_plans.json`, `rooms.json` | 건물 21곳, 안내도 12장, 실 254개 |
| `backend/app/services/campus/`, `backend/app/routers/campus.py` | `GET /campus/search`, 안내도 이미지 중계 (명세 6.8) |
| `backend/tests/test_campus.py` | 강의실 검색 테스트 11개 |
| `frontend/src/layers/RoomLayer.tsx` | 선택한 강의실 건물 핀 + 이동 |
| `frontend/src/sheets/RoomSearchPanel.tsx` | 강의실 검색 + 안내도에 위치 강조 + 길찾기 버튼 |

## 통합 담당에게

백엔드 `main.py`:
```python
from app.routers import campus, route, scans
app.include_router(route.router, prefix="/api/v1")
app.include_router(campus.router, prefix="/api/v1")
app.include_router(scans.router, prefix="/api/v1")  # 3D 스캔 뷰어 페이지 + 파일
```
- 데모 서버(`scripts/dev_route_server.py`)도 이 세 라우터를 그대로 쓰고, 데모 지도 페이지(`/`)만 따로 가집니다.
- 세미나 담당: `seed/buildings.json`의 `aliases`로 장소 텍스트를 매칭하면 됩니다 (명세 6.1).
- 에러는 라우터가 직접 `{"error": {"code", "message"}}` 형식으로 반환한다. 쿼리 검증 실패(422)는 전역 핸들러가 바꿔 주면 된다.
- 그래프는 첫 요청 때 메모리에 올라간다 (0.01초). 경로 `WALK_GRAPH_PATH` 환경변수로 변경 가능.

프론트 `MapView` 안:
```tsx
<RouteLayer visible={layers.route} />
<RunningLayer visible={layers.running} />
<Buildings3DLayer visible={layers.buildings3d} />
<RoomLayer visible={layers.room} />
```
- `RoomSearchPanel`은 탭이나 바텀시트에 넣으면 됩니다. "여기까지 길찾기"는 `RouteLayer`가 선을 그립니다.
- **`RouteLayer`와 `RunningLayer`는 둘 다 지도 클릭을 쓰므로 동시에 켜지 않게** (토글을 서로 배타로) 해 주세요.
- `RoutePanel` / `RunningPanel`은 바텀시트나 탭 안에 넣으면 됩니다.
- 훅은 임시로 자체 `fetch`를 씁니다. `api/client.ts`가 생기면 교체 (`useRoute.ts`의 TODO).

## 단독 실행 (통합 전 확인용)

```
cd backend
python -m uvicorn scripts.dev_route_server:app --port 8000
```
브라우저에서 http://localhost:8000/ → 길찾기 / 러닝 코스 / 강의실 / 3D 건물 확인

테스트:
```
cd backend
python -m pytest tests/
```

## 아직 안 된 것
- 기울기(DEM): `ascent_m`, `descent_m`은 `null`, `slope` 파라미터는 무시
- 캠퍼스 내부 일부 길이 OSM에 없을 수 있음 → 확인 후 `walk_graph.json`에 수동 보강
- 프론트 TSX 타입 검사는 통과 (TypeScript strict, react 19, react-map-gl 8, maplibre-gl 6, zustand 5, TanStack Query 5). 실제 Vite 빌드·화면 확인은 통합 프론트에서 필요
- 강의실 위치(x, y)는 안내도를 보고 지정한 근사값. 안내도가 없는 층(E2~E6의 1·3층 등)과 R동·기숙사는 건물 위치와 추정 층만 표시
- 강의실 번호 체계(첫 자리 = 층)는 안내도에서 확인한 E2~E7 기준. R동은 실제와 다를 수 있음

## 3D 실내 스캔 (E8 3층)

영상(2분, 루프 촬영) → COLMAP 카메라 위치 → gsplat 학습 → 웹용 `.splat` 변환 → 뷰어.

| 위치 | 내용 |
|---|---|
| `backend/scripts/train_gsplat.py` | gsplat 학습 (fused-ssim 대신 PyTorch SSIM). gsplat 1.5.3 + torch 2.4.1 cu124 Windows 휠 사용 |
| `backend/scripts/ply_to_splat.py` | 3DGS PLY → `.splat` (불투명도 0.05 미만 제거, 154MB → 13.8MB) |
| `backend/scripts/prepare_scan.py` | COLMAP 점 구름 → 뷰어용 PLY (중력 방향 정렬, 다운샘플) |
| `backend/app/routers/scans.py` | 뷰어 페이지 `/api/v1/scans/splat-viewer`, `/points-viewer`, 파일 `/api/v1/scans/files/{name}` |
| `backend/static/viewers/splat.html`, `points.html` | 스플랫 / 점 구름 뷰어 페이지 |
| `backend/seed/scans.json`, `backend/static/scans/` | 스캔 목록과 파일 (`e8_3f_gs.splat` 13.8MB) |

- 결과: E8 3층 아트리움 → 유리벽 복도 (영상 2~67초, 325장). 학습 뷰 PSNR 약 26.7dB
- 빠진 구간: 67~86초 좌우 유리벽 복도(복원 불가), 86~119초 안쪽 복도(별도 복원했으나 품질 낮아 제외)
- 재촬영 요령: 0.5배 초광각 가로, FHD 60fps, 노출·초점 잠금, 옆벽 45도, 유리 구간은 바닥 위주 + 임시 표식, 시작점 5~10초 겹치기, 바깥벽/안쪽벽 두 바퀴
