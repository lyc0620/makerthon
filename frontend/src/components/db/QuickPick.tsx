// 번개 약속·"같이 먹자"에서 같이 쓰는 칩 두 줄이에요.
// 1) 언제: 지금 / 30분 뒤 / 1시간 뒤 / 점심 12시 / 저녁 6시 (몇 시가 될지 미리 보여 줘요)
// 2) 어디서: 학생식당 + 가까운 맛집 3곳 (+ 필요하면 "그 사람 근처")
import { useRestaurants } from "../../api/hooks/db";
import type { QuickWhen } from "../../api/types.db";
import { CATEGORY_EMOJI, QUICK_WHEN_OPTIONS, formatDistance, formatTime, quickWhenLabel, quickWhenTime } from "../../lib/dbFormat";
import { Spinner, cx } from "./ui";

export function WhenChips({ value, onChange }: { value: QuickWhen; onChange: (v: QuickWhen) => void }) {
  const now = new Date();
  return (
    <div role="radiogroup" aria-label="언제 먹을까요" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
      {QUICK_WHEN_OPTIONS.map((o) => {
        const active = value === o.key;
        const time = formatTime(quickWhenTime(o.key, now).toISOString());
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={cx(
              "flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 transition",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              active
                ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-brand-50 hover:ring-brand-200",
            )}
          >
            <span className="text-sm font-bold whitespace-nowrap">{quickWhenLabel(o.key, now)}</span>
            <span className={cx("text-[11px] font-medium", active ? "text-brand-100" : "text-slate-500")}>{time}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 장소 칩 하나. restaurant_id가 있으면 가게, 없으면 place_name으로 보내요. */
export interface QuickPlace {
  key: string;
  emoji: string;
  label: string;
  sub?: string;
  restaurant_id: string | null;
  place_name: string | null;
}

const CAFETERIA: QuickPlace = { key: "cafeteria", emoji: "🏫", label: "학생식당", restaurant_id: null, place_name: "학생식당" };

/**
 * near 근처 맛집 3곳 + 학생식당으로 장소 칩 목록을 만들어요.
 * extra를 주면 맨 뒤에 붙여요. (예: "그 사람 근처")
 */
export function useQuickPlaces(near: { lat: number; lng: number }, extra?: QuickPlace) {
  const { data, isLoading } = useRestaurants({
    lat: Number(near.lat.toFixed(3)), // 약 100m 단위로 줄여서 GPS가 조금 흔들려도 다시 안 불러요
    lng: Number(near.lng.toFixed(3)),
    sort: "distance",
    limit: 4,
  });
  const nearby: QuickPlace[] = (data?.items ?? [])
    .filter((r) => r.name !== CAFETERIA.label) // 학생식당이 가게로도 있으면 한 번만 보여요
    .slice(0, 3)
    .map((r) => ({
      key: r.id,
      emoji: CATEGORY_EMOJI[r.category] ?? "🍽️",
      label: r.name,
      sub: formatDistance(r.distance_m),
      restaurant_id: r.id,
      place_name: null,
    }));
  return { places: [CAFETERIA, ...nearby, ...(extra ? [extra] : [])], isLoading };
}

export function PlaceChips({
  places,
  onPick,
  pendingKey,
  disabled,
  loading,
}: {
  places: QuickPlace[];
  onPick: (p: QuickPlace) => void;
  /** 보내는 중인 칩 (스피너를 보여 줘요) */
  pendingKey?: string | null;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5" aria-busy={loading || Boolean(pendingKey) || undefined}>
      {places.map((p) => {
        const pending = pendingKey === p.key;
        // 하나를 만드는 중이면 나머지는 잠깐 잠가요. (두 번 눌러 약속이 두 개 생기지 않게)
        const locked = disabled || Boolean(pendingKey);
        return (
          <button
            key={p.key}
            type="button"
            disabled={locked}
            aria-busy={pending || undefined}
            onClick={() => onPick(p)}
            aria-label={pending ? `${p.label}에서 약속 만드는 중` : `${p.label}에서 바로 약속 잡기`}
            className={cx(
              "flex min-w-0 items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-left ring-1 ring-inset transition",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              pending
                ? "cursor-progress bg-brand-50 ring-2 ring-brand-500"
                : "ring-slate-200 hover:bg-sun-50 hover:ring-sun-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sun-100 text-base" aria-hidden>
              {pending ? <Spinner className="size-4 text-brand-600" /> : p.emoji}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-slate-800">{p.label}</span>
              {pending ? (
                <span className="block truncate text-[11px] font-semibold text-brand-700">만드는 중이에요…</span>
              ) : (
                p.sub && <span className="block truncate text-[11px] text-slate-500">{p.sub}</span>
              )}
            </span>
          </button>
        );
      })}
      {loading && (
        <span role="status" className="col-span-2 flex items-center gap-1.5 px-1 text-xs text-slate-500">
          <Spinner className="size-3" /> 가까운 맛집을 찾는 중이에요…
        </span>
      )}
    </div>
  );
}
