// 밥친구 레이어 — 위치가 있는 밥약속만 핀으로 보여 줘요.
// - 맛집 레이어에 보이는 가게에서 잡힌 약속은 그 가게 이름표 오른쪽에 노란 배지로 붙어서 나와요.
//   그래서 여기서는 따로 그리지 않아요. (같은 useMeetups() 데이터를 써요)
// - 같은 자리(약 10m 안)에 약속이 여러 개면 핀 하나로 묶고, 누르면 그 자리 약속 목록이 펼쳐져요.
// - 멀리서 볼 때(줌 15 미만)는 "🍚 n" 작은 점으로 줄여요.
// - 가게 이름표·제보 핀·사람 점과 겹치면 다른 쪽으로 자리를 옮기고, 다 막히면 점으로 접어요.
import { useEffect, useMemo, useState } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { useMeetups } from "../api/hooks/db";
import type { Meetup, SelectedDbItem } from "../api/types.db";
import MapPin, { PIN_COLORS } from "../components/MapPin";
import { cx } from "../components/db/ui";
import { formatMealTime, shortMealTime } from "../lib/dbFormat";
import { useSelectionStore } from "../store/db";
import { ANCHOR_FLEX, ARROW_MARGIN, type LabelItem, type Placement, placeLabels } from "./labelPlacement";
import { useMapObstacles } from "./mapObstacles";
import { useMapMoveTick, useMapZoom } from "./useMapZoom";

export interface MeetupLayerProps {
  visible: boolean;
  onSelect?: (item: SelectedDbItem) => void;
  selectedId?: string | null;
}

interface MeetupGroup {
  key: string;
  lat: number;
  lng: number;
  items: Meetup[]; // meal_time 빠른 순
}

/** 이 줌보다 멀면 "🍚 n" 점으로 줄여요. */
const PILL_ZOOM = 15;

const markerFocus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** 소수 넷째 자리(약 10m)로 반올림한 좌표가 같으면 같은 자리로 봐요. */
function groupByPlace(meetups: Meetup[]): MeetupGroup[] {
  const groups = new Map<string, MeetupGroup>();
  for (const m of meetups) {
    if (m.lat === null || m.lng === null || m.status === "cancelled") continue;
    const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.items.push(m);
    else groups.set(key, { key, lat: m.lat, lng: m.lng, items: [m] });
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.meal_time.localeCompare(b.meal_time));
  return [...groups.values()];
}

/** 오늘 약속이면 true ("12:30"처럼 날짜 없이 나와요) */
function isToday(iso: string) {
  return !shortMealTime(iso).includes(" ");
}

function meetupLabel(m: Meetup) {
  return `밥약속 ${m.title}, ${formatMealTime(m.meal_time)}, ${m.member_count}/${m.max_people}명${m.status === "full" ? ", 마감" : ""}`;
}

function MeetupPill({ m, active, compact }: { m: Meetup; active: boolean; compact?: boolean }) {
  const full = m.status === "full";
  return (
    <span
      className={cx(
        "flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-xs font-bold whitespace-nowrap ring-2 transition-shadow",
        full ? "bg-slate-100 text-slate-600" : "bg-sun-300 text-brand-900",
        active ? "-translate-y-0.5 shadow-lg shadow-brand-900/25 ring-brand-600" : "shadow-md ring-white",
        !isToday(m.meal_time) && "opacity-70",
      )}
    >
      <span aria-hidden>🍚</span>
      {/* 오늘이 아니면 "내일 18:00"처럼 날짜를 붙여요. (지도와 목록이 같은 말을 하게) */}
      {shortMealTime(m.meal_time)}
      <span className={cx("rounded-full px-1", full ? "bg-slate-200" : "bg-white/70")}>
        {m.member_count}/{m.max_people}
      </span>
      {compact ? null : full ? <span className="font-medium">마감</span> : null}
    </span>
  );
}

function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += /[ㄱ-힝]/.test(ch) ? 12 : 7;
  return w;
}

export function MeetupLayer({ visible, onSelect, selectedId }: MeetupLayerProps) {
  const { data } = useMeetups();
  const devSelected = useSelectionStore((s) => s.selected);
  const select = onSelect ?? useSelectionStore.getState().select;
  const activeId = selectedId !== undefined ? selectedId : devSelected?.type === "meetup" ? devSelected.id : null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const { current: map } = useMap();
  const zoom = useMapZoom();
  const tick = useMapMoveTick(100);
  const shownRestaurantIds = useMapObstacles((s) => s.shownRestaurantIds);
  const reportObs = useMapObstacles((s) => s.obstacles.report);
  const presenceObs = useMapObstacles((s) => s.obstacles.presence);
  const restaurantObs = useMapObstacles((s) => s.obstacles.restaurantLabels);
  const setMeetupVisible = useMapObstacles((s) => s.setMeetupVisible);

  // 맛집 레이어가 이 레이어가 켜져 있는지 알 수 있게 알려 줘요.
  useEffect(() => {
    setMeetupVisible(visible);
  }, [visible, setMeetupVisible]);
  useEffect(() => () => setMeetupVisible(false), [setMeetupVisible]);

  // 가게 이름표에 붙어 나오는 약속은 빼고 묶어요.
  const groups = useMemo(() => {
    if (!visible || !data) return [];
    const shown = new Set(shownRestaurantIds);
    return groupByPlace(data.items.filter((m) => !(m.restaurant_id && shown.has(m.restaurant_id))));
  }, [visible, data, shownRestaurantIds]);

  const small = zoom < PILL_ZOOM;

  // 이름표 자리 계산 — 지도가 멈출 때(moveend + 100ms)마다 다시 해요.
  const placement = useMemo(() => {
    const result = new Map<string, Placement>();
    if (!map || small || groups.length === 0) return result;
    const items: LabelItem[] = groups.map((g) => {
      const active = g.items.some((m) => m.id === activeId);
      return {
        id: g.key,
        lng: g.lng,
        lat: g.lat,
        force: active,
        rank: [active ? 1 : 0, g.items.length, -new Date(g.items[0].meal_time).getTime()],
      };
    });
    const byKey = new Map(groups.map((g) => [g.key, g]));
    const sizeOf = (it: LabelItem) => {
      const g = byKey.get(it.id)!;
      const m = g.items[0];
      const extra = g.items.length > 1 ? 30 : m.status === "full" ? 26 : 0;
      return { w: 26 + textWidth(shortMealTime(m.meal_time)) + 30 + extra, h: 26 };
    };
    const project = (lng: number, lat: number) => {
      const p = map.project([lng, lat]);
      return { x: p.x, y: p.y };
    };
    for (const [k, p] of placeLabels(items, project, sizeOf, [...reportObs, ...presenceObs, ...restaurantObs]))
      result.set(k, p);
    return result;
    // tick: 지도 이동이 끝날 때마다 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, small, groups, activeId, reportObs, presenceObs, restaurantObs, tick]);

  if (!visible || !data) return null;

  return (
    <>
      {groups.map((g) => {
        const first = g.items[0];
        const many = g.items.length > 1;
        const open = many && openKey === g.key;
        const groupActive = g.items.some((m) => m.id === activeId);
        const focused = focusedKey === g.key;
        const zIndex = focused || open ? 50 : groupActive ? 30 : 25;
        const focusHandlers = {
          onFocus: () => setFocusedKey(g.key),
          onBlur: () => setFocusedKey((f) => (f === g.key ? null : f)),
        };
        const anchor = placement.get(g.key)?.anchor ?? null;
        const rootClass = cx("marker-enter", groupActive && "marker-selected");

        // ── 펼친 목록 ──
        if (open) {
          return (
            <Marker key={g.key} longitude={g.lng} latitude={g.lat} anchor="bottom" style={{ zIndex }}>
              <div
                className={cx(rootClass, "marker-pop flex flex-col items-center gap-1")}
                role="list"
                aria-label="이 자리의 밥약속"
                {...focusHandlers}
              >
                {g.items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="listitem"
                    aria-label={meetupLabel(m)}
                    aria-current={m.id === activeId ? "true" : undefined}
                    title={m.title}
                    className={cx("rounded-full", markerFocus)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenKey(null);
                      select({ type: "meetup", id: m.id });
                    }}
                  >
                    <MeetupPill m={m} active={m.id === activeId} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenKey(null);
                  }}
                  className={cx(
                    "rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-brand-700 shadow ring-1 ring-brand-200",
                    markerFocus,
                  )}
                >
                  접기
                </button>
              </div>
            </Marker>
          );
        }

        const label = many
          ? `이 자리 밥약속 ${g.items.length}개, 가장 빠른 약속 ${first.title} ${formatMealTime(first.meal_time)}`
          : meetupLabel(first);
        const onClick = (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          if (many) setOpenKey(g.key);
          else select({ type: "meetup", id: first.id });
        };

        // ── 작은 점: 멀리서 볼 때 또는 자리가 모두 막혔을 때 → 공통 맵핀 ──
        if (small || !anchor) {
          return (
            <Marker key={g.key} longitude={g.lng} latitude={g.lat} anchor="bottom" style={{ zIndex }}>
              <div className={rootClass}>
                <MapPin
                  icon="🍚"
                  color={first.status === "full" ? "#94a3b8" : PIN_COLORS.meetup[0]}
                  activeColor={PIN_COLORS.meetup[1]}
                  active={groupActive}
                  count={g.items.length}
                  dim={isToday(first.meal_time) ? undefined : 0.7}
                  label={label}
                  title={first.title}
                  onClick={onClick}
                  {...focusHandlers}
                />
              </div>
            </Marker>
          );
        }

        // ── 이름표 ──
        return (
          <Marker key={g.key} longitude={g.lng} latitude={g.lat} anchor={anchor} style={{ zIndex }}>
            <div className={cx(rootClass, "flex items-center", ANCHOR_FLEX[anchor])} {...focusHandlers}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={groupActive}
                aria-expanded={many ? false : undefined}
                className={cx("marker-pop relative flex flex-col items-center rounded-full", markerFocus)}
                onClick={onClick}
              >
                {many && (
                  // 뒤에 카드가 한 장 더 겹쳐 있는 느낌
                  <span
                    aria-hidden
                    className="absolute inset-0 translate-x-1 -translate-y-1 rounded-full bg-sun-200 ring-2 ring-white"
                  />
                )}
                <span className="relative flex items-center gap-1">
                  <MeetupPill m={first} active={groupActive} compact={many} />
                  {many && (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow ring-2 ring-white">
                      +{g.items.length - 1}
                    </span>
                  )}
                </span>
              </button>
              <span
                aria-hidden
                className={cx(
                  "size-2 shrink-0 rotate-45",
                  ARROW_MARGIN[anchor],
                  groupActive ? "bg-brand-600" : first.status === "full" ? "bg-slate-100" : "bg-sun-300",
                )}
              />
            </div>
          </Marker>
        );
      })}
    </>
  );
}

export default MeetupLayer;
