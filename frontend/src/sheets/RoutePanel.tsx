// 길찾기 / 러닝 입력 패널 (담당: 김도현). 통합 담당이 바텀시트나 탭 안에 배치.
import { useState } from "react";
import { useRoute, useRunningRoutes } from "../api/hooks/useRoute";
import { RUN_COLORS } from "../layers/RunningLayer";
import { useRouteStore } from "../store/route";

export function RoutePanel() {
  const { from, to, mode, setMode, clearRoute } = useRouteStore();
  const { data, error, isFetching } = useRoute(from, to, mode);

  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex gap-2">
        {(["walk", "run"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg border px-3 py-2 ${mode === m ? "border-blue-600 bg-blue-600 text-white" : "bg-gray-50"}`}
          >
            {m === "walk" ? "걷기" : "달리기"}
          </button>
        ))}
        <button onClick={clearRoute} className="rounded-lg border bg-gray-50 px-3 py-2">
          초기화
        </button>
      </div>
      <p>
        {!from && "지도에서 출발지를 누르세요."}
        {from && !to && "도착지를 누르세요."}
        {isFetching && "경로 계산 중..."}
        {error && `⚠ ${(error as Error).message}`}
        {data && !isFetching && (
          <>
            <b>{(data.distance_m / 1000).toFixed(2)}km</b> · 약 <b>{Math.round(data.duration_s / 60)}분</b>
          </>
        )}
      </p>
    </div>
  );
}

export function RunningPanel() {
  const { runStart, distanceKm, selectedRunId, requestRuns, selectRun } = useRouteStore();
  const [km, setKm] = useState(5);
  const { data, error, isFetching } = useRunningRoutes(distanceKm, runStart);
  const items = data?.items ?? [];
  const sel = selectedRunId ?? items[0]?.id;

  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex items-center gap-2">
        목표
        <input
          type="number"
          min={1}
          max={21}
          step={0.5}
          value={km}
          onChange={(e) => setKm(Number(e.target.value))}
          className="w-20 rounded border px-2 py-1"
        />
        km
        <button onClick={() => requestRuns(km)} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-white">
          코스 추천
        </button>
      </div>
      <p className="text-gray-500">지도를 눌러 출발점을 바꿀 수 있어요 (기본: DGIST 정문)</p>
      {isFetching && <p>코스 찾는 중...</p>}
      {error && <p>⚠ {(error as Error).message}</p>}
      {data && !isFetching && items.length === 0 && <p>조건에 맞는 코스가 없어요. 거리를 바꿔 보세요.</p>}
      {items.map((r, i) => (
        <button
          key={r.id}
          onClick={() => selectRun(r.id)}
          className={`block w-full rounded border-l-8 px-3 py-2 text-left ${r.id === sel ? "bg-blue-50" : "bg-gray-50"}`}
          style={{ borderColor: RUN_COLORS[i % RUN_COLORS.length] }}
        >
          <b>{r.name}</b> · {(r.distance_m / 1000).toFixed(2)}km · 신호등 {r.signal_count ?? "-"}개
        </button>
      ))}
    </div>
  );
}
