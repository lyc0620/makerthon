// 지금 밥 먹을 사람 상세 시트 (6.10) — 누가, 언제까지, 뭘 먹고 싶은지 보고 "🍚 같이 먹자"를 보내요.
// 같이 먹자 → 시간 칩 하나 고르고 → 장소 칩을 누르면 바로 제안이 가요. (번개 약속을 만들고 상대에게 알림)
import { useState } from "react";
import { inviteErrorMessage, useInvite, usePresenceList, useSharePresence, useStopPresence } from "../api/hooks/db";
import type { Meetup, Presence, QuickWhen, SelectedDbItem } from "../api/types.db";
import { PersonAvatar } from "../components/db/Avatar";
import { PlaceChips, WhenChips, useQuickPlaces } from "../components/db/QuickPick";
import type { QuickPlace } from "../components/db/QuickPick";
import { EmptyState, ErrorState, SheetSkeleton } from "../components/db/StateViews";
import { Button, Notice, Tag } from "../components/db/ui";
import { errorMessage } from "../api/clientDb";
import {
  CATEGORY_EMOJI,
  foodLabel,
  formatDistance,
  formatTime,
  remainingLabel,
  shortMealTime,
  timeAgo,
} from "../lib/dbFormat";
import { toast, useAuthStore, useSelectionStore } from "../store/db";

export function PresenceSheet({ id, onSelect }: { id: string; onSelect?: (item: SelectedDbItem) => void }) {
  const token = useAuthStore((s) => s.token);
  const { data, isLoading, isFetching, error, refetch } = usePresenceList();
  const select = onSelect ?? useSelectionStore.getState().select;
  const { share, isPending: sharePending } = useSharePresence();

  if (!token) return <Notice>지금 밥 먹을 사람은 로그인한 학생만 볼 수 있어요. 위쪽에서 닉네임으로 로그인해 주세요.</Notice>;
  if (isLoading) return <SheetSkeleton label="불러오는 중이에요…" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  const p = data?.items.find((x) => x.user_id === id);
  if (!p) {
    return <EmptyState icon="👋" title="이제 위치 공유가 꺼졌어요" hint="시간이 다 됐거나 그 사람이 직접 껐어요." />;
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <PersonAvatar nickname={p.nickname} size="lg" ring={p.is_me ? "ring-sun-400" : "ring-brand-100"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              지금 밥 찾는 중
            </span>
            {p.is_me && <Tag tone="yellow">나</Tag>}
          </div>
          <h2 className="truncate text-xl font-extrabold text-slate-900">{p.nickname}</h2>
          <p className="text-sm font-semibold text-brand-700">
            {formatTime(p.until)}까지 · {p.food_pref ? `${CATEGORY_EMOJI[p.food_pref]} ` : ""}
            {foodLabel(p.food_pref)}
          </p>
        </div>
      </header>

      {p.message && (
        <p className="relative rounded-2xl rounded-tl-sm bg-sun-50 px-4 py-3 text-base font-medium text-slate-800 ring-1 ring-sun-200">
          “{p.message}”
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-2xl bg-white p-2.5 ring-1 ring-slate-100">
          <dt className="text-[11px] text-slate-500">거리</dt>
          {p.is_me || p.distance_m !== null ? (
            <dd className="font-bold text-slate-900">{p.is_me ? "여기" : `약 ${formatDistance(p.distance_m)}`}</dd>
          ) : (
            // 내 위치가 꺼져 있으면 거리를 알 수 없어요. 맨 "—" 대신 이유와 켜는 방법을 보여 줘요.
            <dd className="flex flex-col items-center leading-tight">
              <span className="text-xs font-bold text-slate-600">내 위치 꺼짐</span>
              <button
                type="button"
                onClick={() => void share()}
                disabled={sharePending}
                className="mt-0.5 rounded text-[11px] font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:opacity-60"
              >
                {sharePending ? "켜는 중…" : "내 위치 켜기"}
              </button>
            </dd>
          )}
        </div>
        <div className="rounded-2xl bg-white p-2.5 ring-1 ring-slate-100">
          <dt className="text-[11px] text-slate-500">남은 시간</dt>
          <dd className="font-bold text-slate-900">{remainingLabel(p.until).replace(" 남았어요", "")}</dd>
        </div>
        <div className="rounded-2xl bg-white p-2.5 ring-1 ring-slate-100">
          <dt className="text-[11px] text-slate-500">마지막 신호</dt>
          <dd className="font-bold text-slate-900">{timeAgo(p.updated_at)}</dd>
        </div>
      </dl>
      <p className="-mt-3 text-xs text-slate-500">
        🔒 위치는 약 50m 범위로 흐리게 보여요.{!p.is_me && p.distance_m === null ? " 내 위치도 켜면 거리가 보여요." : ""}
      </p>

      {p.is_me ? <MyPresenceActions /> : <InviteComposer target={p} onOpenMeetup={(m) => select({ type: "meetup", id: m.id })} />}
    </div>
  );
}

function MyPresenceActions() {
  const stop = useStopPresence();
  return (
    <div className="space-y-2">
      <Notice>이건 내 점이에요. 다른 학생에게도 이렇게 보여요.</Notice>
      <Button variant="danger" size="lg" className="w-full" loading={stop.isPending} onClick={() => stop.mutate()}>
        위치 공유 끄기
      </Button>
    </div>
  );
}

function InviteComposer({ target, onOpenMeetup }: { target: Presence; onOpenMeetup: (m: Meetup) => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<QuickWhen>("now");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [sent, setSent] = useState<Meetup | null>(null);
  const invite = useInvite();

  // "그 사람 근처" — 장소 이름만 보내요. (좌표는 흐린 값이라 약속 핀은 따로 안 찍어요)
  const nearThem: QuickPlace = {
    key: "near-them",
    emoji: "📍",
    label: `${target.nickname}님 근처`,
    sub: "만나서 정해요",
    restaurant_id: null,
    place_name: `${target.nickname}님 근처`.slice(0, 40),
  };
  const { places, isLoading } = useQuickPlaces(target, nearThem);

  if (sent) {
    return (
      <div className="space-y-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200" role="status">
        <p className="text-base font-extrabold text-brand-900">📨 {target.nickname}님에게 보냈어요!</p>
        <p className="text-sm text-brand-800">
          {shortMealTime(sent.meal_time)} · {sent.place_name}. 상대가 참여하면 약속 채팅에서 이야기할 수 있어요.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onOpenMeetup(sent)}>
            약속 보기 →
          </Button>
          <Button variant="outline" onClick={() => setSent(null)}>
            닫기
          </Button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant="accent"
        size="lg"
        className="h-14 w-full text-lg"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        🍚 같이 먹자
      </Button>
    );
  }

  const send = (place: QuickPlace) => {
    setPendingKey(place.key);
    invite.mutate(
      { userId: target.user_id, when, restaurant_id: place.restaurant_id, place_name: place.place_name },
      {
        onSuccess: (m) => {
          toast(`${target.nickname}님에게 같이 먹자고 보냈어요! 🍚`, "success");
          setSent(m);
          setOpen(false);
        },
        onError: (e) => toast(inviteErrorMessage(e), "error"),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  return (
    <section aria-label="같이 먹자 보내기" className="space-y-3 rounded-2xl bg-white p-3 ring-2 ring-sun-300">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900">🍚 {target.nickname}님과 같이 먹기</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          접기
        </button>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-500">① 언제</p>
        <WhenChips value={when} onChange={setWhen} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-500">② 어디서 — 누르면 바로 보내요</p>
        <PlaceChips places={places} onPick={send} pendingKey={pendingKey} disabled={invite.isPending} loading={isLoading} />
      </div>
    </section>
  );
}

export default PresenceSheet;
