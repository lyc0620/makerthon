// 러닝 코스 레이어 (담당: 김도현). 후보 최대 3개를 색을 달리해 그리고, 선택한 코스만 강조.
import { useEffect, useMemo } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { useRunningRoutes } from "../api/hooks/useRoute";
import { useRouteStore } from "../store/route";

type LayerProps = { visible: boolean };

export const RUN_COLORS = ["#2563eb", "#16a34a", "#ea580c"];

export function RunningLayer({ visible }: LayerProps) {
  const { current: map } = useMap();
  const { runStart, distanceKm, selectedRunId, setRunStart } = useRouteStore();
  const { data } = useRunningRoutes(distanceKm, runStart);

  // 지도 클릭으로 출발점 변경
  useEffect(() => {
    if (!map || !visible) return;
    const onClick = (e: MapLayerMouseEvent) => setRunStart({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, visible, setRunStart]);

  const fc = useMemo(() => {
    const items = data?.items ?? [];
    const sel = selectedRunId ?? items[0]?.id ?? null;
    return {
      type: "FeatureCollection" as const,
      features: items.map((r, i) => ({
        type: "Feature" as const,
        properties: { color: RUN_COLORS[i % RUN_COLORS.length], sel: r.id === sel },
        geometry: r.geometry,
      })),
    };
  }, [data, selectedRunId]);

  if (!visible) return null;
  return (
    <>
      <Source id="running" type="geojson" data={fc}>
        <Layer
          id="running-line"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "sel"], 6, 3],
            "line-opacity": ["case", ["get", "sel"], 1, 0.5],
          }}
        />
      </Source>
      <Marker longitude={runStart.lng} latitude={runStart.lat} color="#111111" />
    </>
  );
}
