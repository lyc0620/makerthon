// 맛집 레이어 — 지도 위에 가게 핀을 그려요.
// 통합 MapView 안에 <RestaurantLayer visible={...} onSelect={select} /> 로 끼우면 돼요.
// onSelect를 안 넘기면 개발용 선택 스토어(src/store/db.ts)의 select를 불러요.
//
// - 멀리서 볼 때(줌 15.5 미만)는 이모지 점 + 작은 별점 배지만 보여 주고,
//   지금 고른 곳과 추천 상위 3곳만 이름표를 달아요.
// - 가까이 보면 모든 가게에 이름표를 달되, 서로 겹치면 자리를 옮기거나(labelPlacement.ts) 점으로 접어요.
// - 이 가게에서 잡힌 밥약속이 있으면 이름표 오른쪽 끝에 노란 "🍚 13:22 · 1/3" 배지를 붙여요.
//   (밥약속 레이어는 그 약속을 따로 그리지 않아요)
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { useMeetups, useRestaurants } from "../api/hooks/db";
import type { Meetup, Restaurant, SelectedDbItem } from "../api/types.db";
import { cx } from "../components/db/ui";
import { CATEGORY_EMOJI, formatMealTime, shortMealTime } from "../lib/dbFormat";
import { useSelectionStore } from "../store/db";
import {
  ANCHOR_FLEX,
  ARROW_MARGIN,
  type LabelItem,
  type Obstacle,
  type Placement,
  placeLabels,
} from "./labelPlacement";
import { useMapObstacles, usePublishObstacles } from "./mapObstacles";
import { useMapMoveTick, useMapZoom } from "./useMapZoom";

export interface RestaurantLayerProps {
  visible: boolean;
  onSelect?: (item: SelectedDbItem) => void;
  /** 강조할 가게 id (안 넘기면 개발용 선택 스토어를 봐요) */
  selectedId?: string | null;
}

/** 이 줌보다 멀면 이름표 대신 점으로 보여 줘요. */
const LABEL_ZOOM = 15.5;
/** 접힌 점 지름(px) */
const DOT = 28;
/** 남의 이름표가 피해야 할 점 한가운데 크기(px). 점 전체(28)를 다 피하게 하면 이름표가 너무 많이 접혀요. */
const DOT_CORE = 18;

const markerFocus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** 오늘 약속이면 true ("12:30"처럼 날짜 없이 나와요) */
export function isTodayMeal(iso: string) {
  return !shortMealTime(iso).includes(" ");
}

/** 글자 폭 어림값(px) — 한글은 넓고 영문·숫자는 좁아요. */
function textWidth(s: string, wide = 12, narrow = 7) {
  let w = 0;
  for (const ch of s) w += /[ㄱ-힝]/.test(ch) ? wide : narrow;
  return w;
}

function badgeText(m: Meetup) {
  return `🍚 ${shortMealTime(m.meal_time)} · ${m.member_count}/${m.max_people}`;
}

function restaurantLabel(r: Restaurant, meetup?: Meetup) {
  const rating = r.rating_avg !== null ? `별점 ${r.rating_avg.toFixed(1)}` : "아직 별점 없음";
  const reviews = r.review_count > 0 ? `후기 ${r.review_count}개` : "후기 없음";
  const extra = meetup ? `, 밥약속 ${formatMealTime(meetup.meal_time)}` : "";
  return `${r.name}, ${r.category}, ${rating}, ${reviews}${extra}`;
}

export function RestaurantLayer({ visible, onSelect, selectedId }: RestaurantLayerProps) {
  const { data } = useRestaurants({ limit: 200 });
  const meetups = useMeetups();
  const devSelected = useSelectionStore((s) => s.selected);
  const select = onSelect ?? useSelectionStore.getState().select;
  const activeId =
    selectedId !== undefined ? selectedId : devSelected?.type === "restaurant" ? devSelected.id : null;

  const { current: map } = useMap();
  const zoom = useMapZoom();
  const tick = useMapMoveTick(100);
  const reportObs = useMapObstacles((s) => s.obstacles.report);
  const presenceObs = useMapObstacles((s) => s.obstacles.presence);
  const meetupVisible = useMapObstacles((s) => s.meetupVisible);
  const setShownIds = useMapObstacles((s) => s.setShownRestaurantIds);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const items = useMemo(() => (visible && data ? data.items : []), [visible, data]);

  // 지금 보여 주는 가게 id를 밥약속 레이어에 알려 줘요.
  const shownKey = items.map((r) => r.id).join(",");
  useEffect(() => {
    setShownIds(shownKey ? shownKey.split(",") : []);
  }, [shownKey, setShownIds]);
  useEffect(() => () => setShownIds([]), [setShownIds]);

  // 가게별 가장 빠른 밥약속 (+ 그 가게 약속 개수)
  const meetupByRestaurant = useMemo(() => {
    const byId = new Map<string, { first: Meetup; count: number }>();
    if (!meetupVisible) return byId;
    const list = [...(meetups.data?.items ?? [])]
      .filter((m) => m.restaurant_id && m.status !== "cancelled")
      .sort((a, b) => a.meal_time.localeCompare(b.meal_time));
    for (const m of list) {
      const cur = byId.get(m.restaurant_id!);
      if (cur) cur.count += 1;
      else byId.set(m.restaurant_id!, { first: m, count: 1 });
    }
    return byId;
  }, [meetups.data, meetupVisible]);

  // 추천 점수 상위 3곳 (후기가 있는 곳만)
  const top3 = useMemo(
    () =>
      new Set(
        [...items]
          .filter((r) => r.review_count > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((r) => r.id),
      ),
    [items],
  );

  const lowZoom = zoom < LABEL_ZOOM;

  // 이름표 자리 계산 — 지도가 멈출 때(moveend + 100ms)마다 다시 해요.
  const placement = useMemo(() => {
    const result = new Map<string, Placement>();
    if (!map || items.length === 0) return result;
    const candidates = items.filter((r) => !lowZoom || r.id === activeId || top3.has(r.id));
    const labelItems: LabelItem[] = candidates.map((r) => ({
      id: r.id,
      lng: r.lng,
      lat: r.lat,
      force: r.id === activeId,
      rank: [
        r.id === activeId ? 1 : 0,
        meetupByRestaurant.has(r.id) ? 1 : 0,
        top3.has(r.id) ? 1 : 0,
        r.score,
        r.review_count,
      ],
    }));
    const byId = new Map(items.map((r) => [r.id, r]));
    const sizeOf = (it: LabelItem) => {
      const r = byId.get(it.id)!;
      const mt = meetupByRestaurant.get(r.id);
      const name = Math.min(96, textWidth(r.name));
      const rating = r.rating_avg !== null ? 34 : 0;
      const badge = mt ? textWidth(badgeText(mt.first), 11, 6.5) + 18 + (mt.count > 1 ? 18 : 0) : 0;
      return { w: 2 + 24 + 4 + name + 4 + rating + 10 + badge, h: 32 };
    };
    const project = (lng: number, lat: number) => {
      const p = map.project([lng, lat]);
      return { x: p.x, y: p.y };
    };
    // 다른 가게 점도 가리지 않게, 모든 가게 자리를 작은 점 장애물로 같이 넘겨요.
    const dotObstacles: Obstacle[] = items
      .filter((r) => !candidates.includes(r))
      .map((r) => ({ lng: r.lng, lat: r.lat, w: DOT_CORE, h: DOT_CORE }));
    const placed = placeLabels(labelItems, project, sizeOf, [...reportObs, ...presenceObs, ...dotObstacles], DOT_CORE);
    for (const [id, p] of placed) result.set(id, p);
    return result;
    // tick: 지도 이동이 끝날 때마다 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, items, lowZoom, activeId, top3, meetupByRestaurant, reportObs, presenceObs, tick]);

  // 정한 이름표 상자를 밥약속 레이어가 피할 수 있게 올려 둬요.
  const publish = useMemo(() => {
    if (!map) return [] as Obstacle[];
    const list: Obstacle[] = [];
    for (const r of items) {
      const p = placement.get(r.id);
      if (p?.box) {
        const pt = map.project([r.lng, r.lat]);
        list.push({
          lng: r.lng,
          lat: r.lat,
          w: Math.round(p.box.x2 - p.box.x1),
          h: Math.round(p.box.y2 - p.box.y1),
          dx: Math.round((p.box.x1 + p.box.x2) / 2 - pt.x),
          dy: Math.round((p.box.y1 + p.box.y2) / 2 - pt.y),
        });
      } else {
        list.push({ lng: r.lng, lat: r.lat, w: DOT, h: DOT });
      }
    }
    return list;
  }, [map, items, placement]);
  usePublishObstacles("restaurantLabels", publish);

  if (!visible || !data) return null;

  return (
    <>
      {items.map((r) => {
        const active = r.id === activeId;
        const isTop = top3.has(r.id);
        const focused = focusedId === r.id;
        const mt = meetupByRestaurant.get(r.id);
        const anchor = placement.get(r.id)?.anchor ?? null;
        const emoji = CATEGORY_EMOJI[r.category] ?? "🍽️";
        const zIndex = focused ? 50 : active ? 30 : isTop ? 20 : anchor ? 12 : 8;
        const focusHandlers = {
          onFocus: () => setFocusedId(r.id),
          onBlur: () => setFocusedId((f) => (f === r.id ? null : f)),
        };
        const onPick = (e: MouseEvent) => {
          e.stopPropagation();
          select({ type: "restaurant", id: r.id });
        };

        // ── 접힌 점: 이모지 + 작은 별점 배지 ──
        if (!anchor) {
          return (
            <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor="center" style={{ zIndex }}>
              <div className={cx("marker-enter", active && "marker-selected")} {...focusHandlers}>
                <button
                  type="button"
                  aria-label={restaurantLabel(r, mt?.first)}
                  aria-pressed={active}
                  title={r.name}
                  onClick={onPick}
                  className={cx(
                    "marker-pop relative flex size-7 items-center justify-center rounded-full bg-white text-sm shadow-md ring-2",
                    isTop ? "ring-sun-400" : "ring-white",
                    markerFocus,
                  )}
                >
                  <span aria-hidden>{emoji}</span>
                  {r.rating_avg !== null && (
                    <span
                      aria-hidden
                      className="absolute -right-2.5 -bottom-1 rounded-full bg-brand-600 px-1 text-[9px] leading-3.5 font-extrabold text-white ring-2 ring-white"
                    >
                      {r.rating_avg.toFixed(1)}
                    </span>
                  )}
                  {mt && (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-1 size-2.5 rounded-full bg-sun-400 ring-2 ring-white"
                    />
                  )}
                </button>
              </div>
            </Marker>
          );
        }

        // ── 이름표 ──
        const today = mt ? isTodayMeal(mt.first.meal_time) : true;
        const full = mt?.first.status === "full";
        return (
          <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor={anchor} style={{ zIndex }}>
            <div
              className={cx("marker-enter flex items-center", ANCHOR_FLEX[anchor], active && "marker-selected")}
              {...focusHandlers}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={restaurantLabel(r, mt?.first)}
                  aria-pressed={active}
                  title={r.name}
                  onClick={onPick}
                  className={cx(
                    "marker-pop flex items-center gap-1 rounded-full bg-white py-0.5 pr-2 pl-0.5 text-xs font-bold transition-shadow",
                    active
                      ? "-translate-y-0.5 shadow-lg shadow-brand-900/25 ring-[3px] ring-brand-600"
                      : cx("shadow-md ring-2", isTop ? "ring-sun-400" : "ring-white"),
                    markerFocus,
                  )}
                >
                  <span
                    className={cx(
                      "flex size-6 items-center justify-center rounded-full text-sm",
                      isTop ? "bg-sun-100" : "bg-brand-50",
                    )}
                    aria-hidden
                  >
                    {emoji}
                  </span>
                  <span className="max-w-24 truncate text-slate-800">{r.name}</span>
                  {r.rating_avg !== null && (
                    <span className="text-brand-700" aria-hidden>
                      ★{r.rating_avg.toFixed(1)}
                    </span>
                  )}
                </button>
                {mt && (
                  <button
                    type="button"
                    aria-label={`이 가게 밥약속 ${mt.first.title}, ${formatMealTime(mt.first.meal_time)}, ${mt.first.member_count}/${mt.first.max_people}명${mt.count > 1 ? `, 외 ${mt.count - 1}개` : ""}`}
                    title={mt.first.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      select({ type: "meetup", id: mt.first.id });
                    }}
                    className={cx(
                      "marker-pop relative -ml-2 flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-2 text-[11px] font-bold whitespace-nowrap shadow-md ring-2 ring-white",
                      full ? "bg-slate-100 text-slate-600" : "bg-sun-300 text-brand-900",
                      !today && "opacity-70",
                      markerFocus,
                    )}
                  >
                    <span aria-hidden>{badgeText(mt.first)}</span>
                    {full && <span className="font-medium">마감</span>}
                    {mt.count > 1 && (
                      <span aria-hidden className="rounded-full bg-brand-600 px-1 text-[10px] text-white">
                        +{mt.count - 1}
                      </span>
                    )}
                  </button>
                )}
              </div>
              <span
                className={cx("size-2 shrink-0 rotate-45", ARROW_MARGIN[anchor], active ? "bg-brand-600" : "bg-white")}
                aria-hidden
              />
            </div>
          </Marker>
        );
      })}
    </>
  );
}

export default RestaurantLayer;
