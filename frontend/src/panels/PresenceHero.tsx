// 밥친구 패널 맨 위 카드 — "지금 밥 먹을래요" 위치 공유 켜기/끄기 + 근처에서 밥 찾는 사람들.
// 개인정보: 기본은 꺼짐, 대략적인 위치(약 50m)만 보이고, 끄거나 시간이 지나면 바로 사라져요.
// 공유 중에는 카드를 짧은 파란 상태 줄("🍚 15:03까지 공유 중 · 끄기")로 접어서 화면을 덜 차지해요.
import { useEffect, useState } from "react";
import { errorMessage } from "../api/clientDb";
import {
  useMyPresence,
  usePresenceList,
  useSharePresence,
  useStopPresence,
  useUpdatePresence,
} from "../api/hooks/db";
import { PRESENCE_MINUTES, RESTAURANT_CATEGORIES } from "../api/types.db";
import type { Presence, SelectedDbItem } from "../api/types.db";
import { PersonAvatar } from "../components/db/Avatar";
import { FadeRow, Segmented } from "../components/db/Controls";
import { Button, Chip, cx, inputClass } from "../components/db/ui";
import { CATEGORY_EMOJI, formatDistance, formatTime, remainingLabel } from "../lib/dbFormat";
import { toast, useAuthStore, useCancelPickOnUnmount, useDbNavStore, usePickStore } from "../store/db";

const MINUTE_LABEL: Record<(typeof PRESENCE_MINUTES)[number], string> = { 30: "30분", 60: "1시간", 120: "2시간" };
// "기타"는 고르는 의미가 적어서 빼요. (아무거나 = null)
const FOODS = RESTAURANT_CATEGORIES.filter((c) => c !== "기타");

/** 남은 시간 표시가 저절로 줄어들게 30초마다 다시 그려요. */
function useTick(ms: number, enabled: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms, enabled]);
}

export function PresenceHero({ onSelect }: { onSelect: (item: SelectedDbItem) => void }) {
  const token = useAuthStore((s) => s.token);
  const { sharing, starting, until, source, options, setOptions } = useMyPresence();
  const { share, isPending } = useSharePresence();
  const stop = useStopPresence();
  const update = useUpdatePresence();
  const pickLabel = usePickStore((s) => s.label);
  const { data } = usePresenceList();
  useCancelPickOnUnmount();
  useTick(30_000, sharing);

  const others = (data?.items ?? []).filter((p) => !p.is_me);
  const busy = starting || isPending || stop.isPending;

  const toggle = () => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    if (sharing) stop.mutate();
    else void share();
  };

  const repick = () =>
    usePickStore.getState().start("지금 있는 곳을 지도에서 눌러 주세요", (p) =>
      update.mutate(
        { point: { lat: p.lat, lng: p.lng }, source: "map" },
        {
          onSuccess: () => toast("내 위치를 옮겼어요.", "success"),
          onError: (e) => toast(errorMessage(e), "error"),
        },
      ),
    );

  const [noteOpen, setNoteOpen] = useState(() => options.message.trim().length > 0);

  // ── 공유 중: 위쪽은 짧은 파란 상태 줄로 접어요 ──
  if (sharing && until) {
    return (
      <section aria-labelledby="presence-hero-title" className="space-y-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-brand-200">
        <div className="flex items-center gap-2 rounded-2xl bg-brand-600 py-2 pr-2 pl-3 text-white">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-sun-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 id="presence-hero-title" className="truncate text-sm font-extrabold">
              🍚 {formatTime(until)}까지 공유 중
            </h3>
            <p className="truncate text-[11px] text-brand-100">
              {remainingLabel(until)} · {source === "gps" ? "📡 내 위치를 따라가요" : "🗺️ 지도에서 고른 위치"}
            </p>
          </div>
          <button
            type="button"
            onClick={repick}
            disabled={update.isPending}
            className="h-8 shrink-0 rounded-lg px-2 text-xs font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300 disabled:opacity-60"
          >
            {pickLabel ? "지도를 눌러요…" : "📍 위치"}
          </button>
          <Button size="sm" variant="accent" loading={stop.isPending} onClick={() => stop.mutate()}>
            끄기
          </Button>
        </div>
        <NearbyStrip others={others} onSelect={onSelect} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="presence-hero-title"
      className="space-y-3 rounded-3xl bg-linear-to-br from-sun-100 via-white to-brand-50 p-4 text-slate-900 shadow-sm ring-1 ring-sun-300"
    >
      {/* 머리: 제목 + 켜기/끄기 스위치 */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-amber-800">🙋 지금 밥 먹을래요</p>
          <h3 id="presence-hero-title" className="text-lg leading-snug font-extrabold text-balance">
            같이 먹을 사람, 지금 바로 찾아봐요
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-600">🔒 대략적인 위치(약 50m)만 · 끄면 바로 사라져요</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={false}
          aria-label="지금 밥 먹을래요 위치 공유"
          disabled={busy}
          onClick={toggle}
          className={cx(
            "relative mt-1 h-8 w-14 shrink-0 rounded-full bg-slate-300 transition disabled:opacity-60",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          )}
        >
          <span aria-hidden className="absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform" />
        </button>
      </div>

      {!token && (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-brand-800 ring-1 ring-brand-100">
          로그인하면 근처에서 밥 찾는 학생을 볼 수 있어요.
        </p>
      )}

      {/* 꺼져 있을 때: 켜기 전에 고르는 값 */}
      {token && (
        <div className="space-y-2.5">
          <Segmented
            label="얼마 동안 보일까요"
            value={options.minutes}
            onChange={(m) => setOptions({ minutes: m })}
            options={PRESENCE_MINUTES.map((m) => ({ value: m, label: MINUTE_LABEL[m] }))}
          />
          <FadeRow label="먹고 싶은 음식">
            <Chip active={options.food_pref === null} onClick={() => setOptions({ food_pref: null })}>
              😋 아무거나
            </Chip>
            {FOODS.map((c) => (
              <Chip key={c} active={options.food_pref === c} onClick={() => setOptions({ food_pref: c })}>
                <span aria-hidden>{CATEGORY_EMOJI[c]}</span> {c}
              </Chip>
            ))}
          </FadeRow>
          {noteOpen ? (
            <input
              autoFocus={options.message.length === 0}
              value={options.message}
              onChange={(e) => setOptions({ message: e.target.value })}
              maxLength={40}
              placeholder="예) 국밥 땡겨요"
              aria-label="한마디 (40자까지)"
              className={inputClass}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-expanded={false}
              className="rounded-lg px-1 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              ＋ 한마디 남기기
            </button>
          )}
          <Button variant="accent" size="lg" className="w-full" loading={busy} onClick={toggle}>
            {pickLabel ? "지도에서 있는 곳을 눌러 주세요…" : starting ? "위치를 찾는 중이에요…" : "🙋 지금 밥 먹을래요 켜기"}
          </Button>
        </div>
      )}

      {token && <NearbyStrip others={others} onSelect={onSelect} onTurnOn={busy ? undefined : toggle} />}
    </section>
  );
}

/** 근처에서 밥 찾는 사람들 줄. 아무도 없으면 "내가 먼저 켜기"를 보여 줘요. */
function NearbyStrip({
  others,
  onSelect,
  onTurnOn,
}: {
  others: Presence[];
  onSelect: (item: SelectedDbItem) => void;
  /** 꺼져 있을 때만 넘겨요 */
  onTurnOn?: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-slate-800">
        지금 근처에서 밥 찾는 사람 <span className="text-brand-600">{others.length}명</span>
      </p>
      {others.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-brand-100">
          <span className="text-xl" aria-hidden>
            🌱
          </span>
          <p className="min-w-0 flex-1 text-xs text-balance text-slate-600">
            아직 아무도 없어요. 먼저 켜 두면 다른 사람이 같이 먹자고 할 수 있어요!
          </p>
          {onTurnOn && (
            <Button size="sm" variant="primary" onClick={onTurnOn}>
              내가 먼저 켜기
            </Button>
          )}
        </div>
      ) : (
        <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pt-1 pb-1" aria-label="근처에서 밥 찾는 사람">
          {others.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                onClick={() => {
                  onSelect({ type: "presence", id: p.user_id });
                  useDbNavStore.getState().focusOn({ lat: p.lat, lng: p.lng });
                }}
                aria-label={`${p.nickname}, ${p.food_pref ? `${p.food_pref} 땡겨요` : "아무거나 좋아요"}${
                  p.distance_m !== null ? `, ${formatDistance(p.distance_m)}` : ""
                } 보기`}
                title={p.nickname}
                className={cx(
                  "press flex w-[72px] flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition hover:bg-white",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
                )}
              >
                <span className="relative">
                  <PersonAvatar nickname={p.nickname} size="md" />
                  {p.food_pref && (
                    <span className="absolute -right-1 -bottom-1 text-xs" aria-hidden>
                      {CATEGORY_EMOJI[p.food_pref]}
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 w-full text-center text-[11px] leading-tight font-semibold break-keep text-slate-800">
                  {p.nickname}
                </span>
                {p.distance_m !== null && (
                  <span className="text-[10px] text-slate-500">{formatDistance(p.distance_m)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PresenceHero;
