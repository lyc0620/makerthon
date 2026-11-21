// 지금 밥 먹을 사람 레이어 (6.10) — "지금 밥 먹을래요"를 켠 사람을 동그란 점으로 보여 줘요.
// - 좌표는 서버가 약 50m로 흐린 값이라, 같은 칸에 여러 명이면 점을 동그랗게 살짝 벌려서 겹치지 않게 해요.
// - 내 점은 노란 테두리 + "나" 이름표, 먹고 싶은 음식은 작은 이모지 배지로 보여 줘요.
// - 로그인한 사람만 목록을 받아요. (로그아웃 상태면 아무것도 안 그려요)
// - 사람 점 자리는 44px 장애물로 알려서, 가게 이름표가 가려지지 않고 옆으로 비켜 가게 해요.
// - 멀리서 볼 때(줌 15 미만)는 점을 작게(sm) 그리고 음식 이모지 배지는 숨겨요.
import { useMemo, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { usePresenceList } from "../api/hooks/db";
import type { Presence, SelectedDbItem } from "../api/types.db";
import { PersonAvatar } from "../components/db/Avatar";
import { cx } from "../components/db/ui";
import { CATEGORY_EMOJI, foodLabel, formatTime } from "../lib/dbFormat";
import { useSelectionStore } from "../store/db";
import { FIXED_OBSTACLE, usePublishObstacles } from "./mapObstacles";
import { useMapZoom } from "./useMapZoom";

/** 이 줌보다 멀면 점을 작게 그려요. */
const SMALL_ZOOM = 15;

export interface PresenceLayerProps {
  visible: boolean;
  onSelect?: (item: SelectedDbItem) => void;
  /** 고른 사람의 user_id (안 주면 개발용 선택 스토어를 봐요) */
  selectedId?: string | null;
}

/** 같은 격자(소수 넷째 자리)에 있는 사람끼리 묶어서, 화면에서 몇 px씩 벌릴지 정해요. */
function spreadOffsets(items: Presence[]) {
  const groups = new Map<string, Presence[]>();
  for (const p of items) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const offsets = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      offsets.set(group[0].user_id, [0, 0]);
      continue;
    }
    const radius = 18 + group.length * 2;
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      offsets.set(p.user_id, [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
    });
  }
  return offsets;
}

export function PresenceLayer({ visible, onSelect, selectedId }: PresenceLayerProps) {
  const { data } = usePresenceList();
  const devSelected = useSelectionStore((s) => s.selected);
  const select = onSelect ?? useSelectionStore.getState().select;
  const activeId =
    selectedId !== undefined ? selectedId : devSelected?.type === "presence" ? devSelected.id : null;

  const zoom = useMapZoom();
  const small = zoom < SMALL_ZOOM;
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const items = useMemo(() => (visible && data ? data.items : []), [visible, data]);
  const offsets = useMemo(() => spreadOffsets(items), [items]);
  usePublishObstacles(
    "presence",
    items.map((p) => {
      const [dx, dy] = offsets.get(p.user_id) ?? [0, 0];
      return { lng: p.lng, lat: p.lat, w: FIXED_OBSTACLE, h: FIXED_OBSTACLE + (p.is_me ? 14 : 0), dx, dy };
    }),
  );

  if (!visible || !data) return null;

  return (
    <>
      {data.items.map((p) => {
        const active = p.user_id === activeId;
        const emoji = !small && p.food_pref ? CATEGORY_EMOJI[p.food_pref] : null;
        const focused = focusedId === p.user_id;
        return (
          <Marker
            key={p.user_id}
            longitude={p.lng}
            latitude={p.lat}
            anchor="center"
            offset={offsets.get(p.user_id) ?? [0, 0]}
            // 맛집(10~30)보다 위, 제보(35~40)보다는 아래. 고른 사람만 맨 위로 올려요.
            style={{ zIndex: focused ? 50 : active ? 42 : p.is_me ? 28 : 22 }}
          >
            <div className={cx("marker-enter", active && "marker-selected")}>
            <button
              type="button"
              aria-label={
                p.is_me
                  ? `나, ${formatTime(p.until)}까지 위치 공유 중`
                  : `${p.nickname}, ${foodLabel(p.food_pref)}, ${formatTime(p.until)}까지${p.message ? `, "${p.message}"` : ""}`
              }
              aria-pressed={active}
              title={p.message ?? p.nickname}
              onFocus={() => setFocusedId(p.user_id)}
              onBlur={() => setFocusedId((f) => (f === p.user_id ? null : f))}
              onClick={(e) => {
                e.stopPropagation();
                select({ type: "presence", id: p.user_id });
              }}
              className="marker-pop relative flex flex-col items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {/* 퍼지는 동그라미 — "지금 여기 있어요" 느낌 */}
              <span
                aria-hidden
                className={cx(
                  "presence-pulse pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-full",
                  small ? "size-8" : "size-10",
                  p.is_me ? "bg-sun-400/60" : "bg-brand-400/45",
                )}
              />
              <span className="relative">
                <PersonAvatar
                  nickname={p.nickname}
                  size={small ? "sm" : "md"}
                  ring={cx(active ? "ring-brand-600 ring-4" : p.is_me ? "ring-sun-400 ring-[3px]" : "ring-white")}
                  className={cx("transition-shadow", active ? "shadow-xl shadow-brand-900/30" : "shadow-lg")}
                />
                {emoji && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -bottom-1 flex size-5 items-center justify-center rounded-full bg-white text-[11px] shadow ring-1 ring-slate-200"
                  >
                    {emoji}
                  </span>
                )}
              </span>
              {p.is_me && (
                <span className="relative mt-0.5 rounded-full bg-sun-400 px-1.5 text-[10px] leading-4 font-extrabold text-brand-900 shadow">
                  나
                </span>
              )}
            </button>
            </div>
          </Marker>
        );
      })}
    </>
  );
}

export default PresenceLayer;
