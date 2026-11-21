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

## 통합 담당에게

백엔드 `main.py`:
```python
from app.routers import route
app.include_router(route.router, prefix="/api/v1")
```
- 에러는 라우터가 직접 `{"error": {"code", "message"}}` 형식으로 반환한다. 쿼리 검증 실패(422)는 전역 핸들러가 바꿔 주면 된다.
- 그래프는 첫 요청 때 메모리에 올라간다 (0.01초). 경로 `WALK_GRAPH_PATH` 환경변수로 변경 가능.

프론트 `MapView` 안:
```tsx
<RouteLayer visible={layers.route} />
<RunningLayer visible={layers.running} />
<Buildings3DLayer visible={layers.buildings3d} />
```
- **`RouteLayer`와 `RunningLayer`는 둘 다 지도 클릭을 쓰므로 동시에 켜지 않게** (토글을 서로 배타로) 해 주세요.
- `RoutePanel` / `RunningPanel`은 바텀시트나 탭 안에 넣으면 됩니다.
- 훅은 임시로 자체 `fetch`를 씁니다. `api/client.ts`가 생기면 교체 (`useRoute.ts`의 TODO).

## 단독 실행 (통합 전 확인용)

```
cd backend
python -m uvicorn scripts.dev_route_server:app --port 8000
```
브라우저에서 http://localhost:8000/ → 길찾기 / 러닝 코스 / 3D 건물 확인

테스트:
```
cd backend
python -m pytest tests/test_route.py
```

## 아직 안 된 것
- 기울기(DEM): `ascent_m`, `descent_m`은 `null`, `slope` 파라미터는 무시
- 캠퍼스 내부 일부 길이 OSM에 없을 수 있음 → 확인 후 `walk_graph.json`에 수동 보강
- 프론트 TSX는 Node가 없는 환경에서 작성해 **아직 컴파일 확인 전**
