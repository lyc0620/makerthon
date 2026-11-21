// ⚠️ 임시(THROWAWAY) 개발용 지도예요. 통합 때 버려요!
// 진짜 지도는 dohyun님의 src/map/MapView.tsx 예요.
// 통합 MapView가 해 줘야 하는 일은 이 파일에 다 들어 있어요:
//   1) 레이어 4개(맛집·제보·밥친구·사람)를 <Map> 안에 끼우기
//   2) onClick에서 usePickStore.getState().handleClick(e.lngLat) 부르기 (위치 찍기 모드)
//   3) useDbNavStore의 focus를 구독해서 flyTo 하기 (선택, 모바일은 시트 높이만큼 아래 여백)
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Map, { GeolocateControl, Marker, NavigationControl } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MeetupLayer } from "../layers/MeetupLayer";
import { PresenceLayer } from "../layers/PresenceLayer";
import { ReportLayer } from "../layers/ReportLayer";
import { RestaurantLayer } from "../layers/RestaurantLayer";
import { CAMPUS } from "../lib/dbFormat";
import { cx } from "../components/db/ui";
import { useDbNavStore, usePickStore } from "../store/db";

const MAP_STYLE =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || "https://tiles.openfreemap.org/styles/liberty";

const LAYER_ITEMS = [
  ["restaurant", "🍜", "맛집"],
  ["report", "🚨", "제보"],
  ["meetup", "🍚", "밥친구"],
  ["presence", "🙋", "사람"],
] as const;

type LayerKey = (typeof LAYER_ITEMS)[number][0];

export function DevMap({
  mobile = false,
  sheetHeight = 0,
  peekHeight = 0,
}: {
  mobile?: boolean;
  /** 모바일 바텀시트가 지금 차지하는 높이(px). 고른 곳이 시트 뒤에 숨지 않게 써요. */
  sheetHeight?: number;
  /** 모바일 바텀시트의 가장 낮은 높이(px, 아래 안전 영역 빼고). 확대·내 위치 버튼을 그 위로 올려요. */
  peekHeight?: number;
}) {
  const mapRef = useRef<MapRef>(null);
  const pickLabel = usePickStore((s) => s.label);
  const lastPoint = usePickStore((s) => s.lastPoint);
  const stopPick = usePickStore((s) => s.stop);
  const showHotspots = useDbNavStore((s) => s.showHotspots);
  const focus = useDbNavStore((s) => s.focus);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    restaurant: true,
    report: true,
    meetup: true,
    presence: true,
  });
  const sheetRef = useRef(sheetHeight);
  sheetRef.current = sheetHeight;

  // 목록에서 고른 곳으로 지도를 옮겨요. 모바일은 시트에 가리지 않게 아래 여백을 줘요.
  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !map) return;
    const bottom = mobile ? Math.max(0, Math.min(sheetRef.current, window.innerHeight * 0.7)) : 0;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 700,
      padding: { top: 0, left: 0, right: 0, bottom },
    });
  }, [focus]);

  const onClick = (e: MapLayerMouseEvent) => {
    usePickStore.getState().handleClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  };

  const toggle = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    // isolate: 마커 z-index가 지도 밖(바텀시트·헤더) 위로 올라가지 않게 지도 안에 가둬요.
    // 통합 때 MapView 바깥 div에도 같은 처리가 필요해요.
    <div
      className={cx(
        "relative isolate h-full w-full",
        // 모바일: 확대·내 위치 버튼을 가장 낮은 시트 높이 위로 올려요.
        mobile && "hp-map-mobile",
      )}
      style={{ "--hp-ctrl-bottom": `calc(${peekHeight}px + env(safe-area-inset-bottom))` } as CSSProperties}
    >
      <Map
        ref={mapRef}
        initialViewState={{ latitude: CAMPUS.lat, longitude: CAMPUS.lng, zoom: 15 }}
        mapStyle={MAP_STYLE}
        onClick={onClick}
        cursor={pickLabel ? "crosshair" : undefined}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <GeolocateControl position="bottom-right" />

        {/* 캠퍼스 중심 표시: 작은 아이콘 배지라 다른 마커를 가리지 않고, 가장 아래에 깔려요. */}
        <Marker longitude={CAMPUS.lng} latitude={CAMPUS.lat} anchor="center" style={{ zIndex: 5 }}>
          <div
            role="img"
            aria-label="캠퍼스 중심"
            title="캠퍼스 중심"
            className="flex size-7 items-center justify-center rounded-full bg-white text-sm shadow ring-2 ring-brand-300"
          >
            <span aria-hidden>🎓</span>
          </div>
        </Marker>

        <RestaurantLayer visible={layers.restaurant} />
        <MeetupLayer visible={layers.meetup} />
        <ReportLayer visible={layers.report} showHotspots={showHotspots} />
        <PresenceLayer visible={layers.presence} />

        {/* 방금 찍은 위치 미리보기 */}
        {lastPoint && (
          <Marker longitude={lastPoint.lng} latitude={lastPoint.lat} anchor="bottom" style={{ zIndex: 50 }}>
            <div className="text-3xl drop-shadow" role="img" aria-label="찍은 위치">
              📍
            </div>
          </Marker>
        )}
      </Map>

      {/* 레이어 켜고 끄기 (통합 땐 lyc0620님의 LayerToggle이 대신해요) */}
      {mobile ? (
        <MobileLayerMenu layers={layers} onToggle={toggle} />
      ) : (
        <div
          role="group"
          aria-label="지도 레이어"
          className="absolute top-3 right-3 z-40 flex gap-1 rounded-2xl bg-white p-1 shadow-float ring-1 ring-slate-200"
        >
          {LAYER_ITEMS.map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => toggle(key)}
              className={cx(
                "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition duration-150 active:scale-[0.98]",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
                layers[key] ? "bg-brand-50 text-brand-800" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              <span aria-hidden className={cx(!layers[key] && "opacity-40 grayscale")}>
                {icon}
              </span>
              <span className={cx(!layers[key] && "line-through")}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 위치 찍기 안내: 레이어 버튼과 겹치지 않게 아래쪽(모바일은 시트 바로 위)에 둬요. */}
      {pickLabel && (
        <div
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: mobile ? sheetHeight + 12 : 24 }}
        >
          <div
            role="status"
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-sun-400 py-2 pr-2 pl-4 text-sm font-bold text-brand-900 shadow-float"
          >
            <span className="min-w-0">
              <span aria-hidden>🗺️ </span>
              {pickLabel}
            </span>
            <button
              type="button"
              onClick={stopPick}
              className="shrink-0 rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-brand-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 모바일: 레이어 버튼 하나만 두고, 누르면 작은 세로 메뉴가 열려요. 바깥을 누르거나 Esc로 닫혀요. */
function MobileLayerMenu({
  layers,
  onToggle,
}: {
  layers: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const off = LAYER_ITEMS.filter(([k]) => !layers[k]).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={boxRef}
      className="absolute top-[calc(var(--hp-header-h,4rem)+0.5rem)] right-3 z-40 flex flex-col items-end gap-1.5"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="dev-layer-menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-brand-800 shadow-float ring-1 ring-slate-200 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span aria-hidden>🗂️</span>
        레이어
        {off > 0 && (
          <span className="rounded-full bg-sun-300 px-1.5 text-[11px] font-semibold text-brand-900">{off}개 꺼짐</span>
        )}
      </button>
      {open && (
        <div
          id="dev-layer-menu"
          role="group"
          aria-label="지도 레이어"
          className="sheet-fade flex w-36 flex-col gap-0.5 rounded-2xl bg-white p-1 shadow-float ring-1 ring-slate-200"
        >
          {LAYER_ITEMS.map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => onToggle(key)}
              className={cx(
                "flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold transition",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
                layers[key] ? "text-brand-800 hover:bg-brand-50" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              <span aria-hidden className={cx(!layers[key] && "opacity-40 grayscale")}>
                {icon}
              </span>
              <span className="flex-1 text-left">{label}</span>
              <span
                aria-hidden
                className={cx(
                  "flex size-5 items-center justify-center rounded-md text-[11px] font-black",
                  layers[key] ? "bg-brand-600 text-white" : "bg-slate-100 text-transparent ring-1 ring-slate-300",
                )}
              >
                ✓
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
