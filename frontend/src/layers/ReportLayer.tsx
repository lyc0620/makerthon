// 제보(경찰) 레이어 — 올라온 지 10분 안 된 제보만 두근두근 퍼지고, 나머지는 은은한 테두리만 남겨요.
// 오래될수록(신뢰도가 낮을수록) 흐려져요. 제보 핀은 줌과 상관없이 늘 보여요.
// 핀 자리는 다른 레이어 이름표가 피해 가도록 44px 장애물로 알려 줘요.
// showHotspots를 켜면 지난 30일 단속 다발 구역을 노란 원으로 깔아요.
import { useEffect, useMemo, useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
// geojson 타입은 maplibre-gl이 함께 설치해 줘요 (@types/geojson)
import type { FeatureCollection } from "geojson";
import { useHotspots, useReports } from "../api/hooks/db";
import type { SelectedDbItem } from "../api/types.db";
import MapPin, { PIN_COLORS } from "../components/MapPin";
import { cx } from "../components/db/ui";
import { timeAgo } from "../lib/dbFormat";
import { useSelectionStore } from "../store/db";
import { FIXED_OBSTACLE, usePublishObstacles } from "./mapObstacles";

/** 이 시간(ms)보다 새 제보만 두근두근 퍼져요. */
const FRESH_MS = 10 * 60_000;

export interface ReportLayerProps {
  visible: boolean;
  onSelect?: (item: SelectedDbItem) => void;
  /** 단속 다발 구역 원 보이기 */
  showHotspots?: boolean;
  selectedId?: string | null;
}

const hotspotCircle: LayerProps = {
  id: "db-report-hotspots",
  type: "circle",
  paint: {
    // 건수가 많을수록 크게
    "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 14, 5, 26, 20, 44],
    "circle-color": "#ffc83d",
    "circle-opacity": 0.35,
    "circle-stroke-color": "#1f5fbf",
    "circle-stroke-width": 1.5,
    "circle-stroke-opacity": 0.6,
  },
};

const hotspotLabel: LayerProps = {
  id: "db-report-hotspots-label",
  type: "symbol",
  layout: {
    "text-field": ["concat", ["to-string", ["get", "count"]], "건"],
    "text-size": 12,
    "text-allow-overlap": true,
  },
  paint: { "text-color": "#0d2a55", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
};

export function ReportLayer({ visible, onSelect, showHotspots = false, selectedId }: ReportLayerProps) {
  const { data } = useReports(undefined, "police");
  const hotspots = useHotspots("police", 30, visible && showHotspots);
  const devSelected = useSelectionStore((s) => s.selected);
  const select = onSelect ?? useSelectionStore.getState().select;
  const activeId = selectedId !== undefined ? selectedId : devSelected?.type === "report" ? devSelected.id : null;

  const [now, setNow] = useState(() => Date.now());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // 1분마다 시계를 넘겨서 10분이 지난 제보의 두근거림을 멈춰요.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => (visible ? (data?.items ?? []).filter((r) => r.is_active) : []), [visible, data]);
  usePublishObstacles(
    "report",
    active.map((r) => ({ lng: r.lng, lat: r.lat, w: FIXED_OBSTACLE, h: FIXED_OBSTACLE })),
  );

  if (!visible) return null;

  const hotspotGeojson: FeatureCollection = {
    type: "FeatureCollection",
    features: (hotspots.data?.items ?? []).map((h) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [h.lng, h.lat] }, // GeoJSON은 [lng, lat] 순서예요
      properties: { count: h.count, peak_hour: h.peak_hour, peak_weekday: h.peak_weekday },
    })),
  };

  return (
    <>
      {showHotspots && (
        <Source id="db-report-hotspots-src" type="geojson" data={hotspotGeojson}>
          <Layer {...hotspotCircle} />
          <Layer {...hotspotLabel} />
        </Source>
      )}

      {active.map((r) => {
          const isActive = r.id === activeId;
          const fresh = now - new Date(r.created_at).getTime() < FRESH_MS;
          const focused = focusedId === r.id;
          const pct = Math.round(r.confidence * 100);
          // 신뢰도 0 → 35% 불투명, 1 → 100% (고르거나 포커스하면 또렷하게)
          const opacity = isActive || focused ? 1 : 0.35 + 0.65 * Math.max(0, Math.min(1, r.confidence));
          return (
            <Marker
              key={r.id}
              longitude={r.lng}
              latitude={r.lat}
              anchor="bottom"
              style={{ zIndex: focused ? 50 : isActive ? 40 : 35 }}
            >
              <div className={cx("marker-enter", isActive && "marker-selected")}>
                <MapPin
                  icon="🚨"
                  color={PIN_COLORS.report[0]}
                  activeColor={PIN_COLORS.report[1]}
                  active={isActive}
                  dim={focused ? 1 : opacity}
                  pulse={fresh}
                  label={`경찰 제보, ${timeAgo(r.created_at, now)}, 신뢰도 ${pct}%, 맞아요 ${r.confirm_count}명`}
                  title={`경찰 제보 · ${timeAgo(r.created_at, now)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    select({ type: "report", id: r.id });
                  }}
                  onFocus={() => setFocusedId(r.id)}
                  onBlur={() => setFocusedId((f) => (f === r.id ? null : f))}
                />
              </div>
            </Marker>
          );
        })}
    </>
  );
}

export default ReportLayer;
