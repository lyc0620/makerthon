// ⚡ 번개 약속 카드 + 추천 약속 목록 (6.11)
// - 번개 약속: ① 언제 칩 ② 장소 칩을 누르면 바로 만들어져요. 제목은 서버가 "⚡ 번개 · 12:30 든든국밥"처럼 지어 줘요.
// - 추천 약속: 2시간 안에 시작하고 가까운 약속을 한 번에 참여해요.
import { forwardRef, useState } from "react";
import { errorMessage } from "../api/clientDb";
import { useJoinMeetup, useMeetupSuggestions, useQuickMeetup } from "../api/hooks/db";
import type { Meetup, MeetupSuggestion, QuickWhen } from "../api/types.db";
import { PlaceChips, WhenChips, useQuickPlaces } from "../components/db/QuickPick";
import type { QuickPlace } from "../components/db/QuickPick";
import { Button, SectionTitle, Tag } from "../components/db/ui";
import { CAMPUS, formatDistance, minutesUntil, shortMealTime } from "../lib/dbFormat";
import { toast, useAuthStore, usePresenceStore } from "../store/db";

/**
 * 내 위치를 공유 중이면 그 근처, 아니면 캠퍼스 중심 기준으로 찾아요.
 * ⚠️ 정확한 GPS 좌표(point)가 아니라 서버가 약 50m로 흐린 내 좌표(me)를 써요.
 * 주소(쿼리 문자열)는 서버 접속 기록에 남을 수 있어서, 정확한 위치를 실으면 안 돼요.
 */
function useNearPoint() {
  const me = usePresenceStore((s) => s.me);
  return me ? { lat: me.lat, lng: me.lng } : CAMPUS;
}

/** 밖에서 ref로 이 카드에 스크롤·포커스를 옮길 수 있어요. (밥약속이 없을 때 "번개 약속 만들기" 버튼) */
export const QuickMeetupCard = forwardRef<HTMLElement, { onCreated: (m: Meetup) => void }>(function QuickMeetupCard(
  { onCreated },
  ref,
) {
  const token = useAuthStore((s) => s.token);
  const near = useNearPoint();
  const [when, setWhen] = useState<QuickWhen>("now");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const quick = useQuickMeetup();
  const { places, isLoading } = useQuickPlaces(near);

  const create = (place: QuickPlace) => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    setPendingKey(place.key);
    quick.mutate(
      { when, restaurant_id: place.restaurant_id, place_name: place.place_name },
      {
        onSuccess: (m) => {
          toast(`⚡ ${shortMealTime(m.meal_time)} ${m.place_name} 번개 약속을 만들었어요!`, "success");
          onCreated(m);
        },
        onError: (e) => toast(errorMessage(e), "error"),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="quick-meetup-title"
      className="scroll-mt-4 space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <div>
        <h3 id="quick-meetup-title" className="text-base font-extrabold text-slate-900">
          ⚡ 번개 약속
        </h3>
        <p className="text-xs font-medium text-balance text-slate-500">제목 안 써도 돼요. 두 번만 누르면 약속이 생겨요</p>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-500">① 언제</p>
        <WhenChips value={when} onChange={setWhen} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-500">② 어디서 — 누르면 바로 만들어져요</p>
        <PlaceChips places={places} onPick={create} pendingKey={pendingKey} disabled={quick.isPending} loading={isLoading} />
      </div>
    </section>
  );
});

export function SuggestedMeetups({ onOpen }: { onOpen: (m: Meetup) => void }) {
  const token = useAuthStore((s) => s.token);
  const near = useNearPoint();
  const { data } = useMeetupSuggestions(near.lat, near.lng);
  const join = useJoinMeetup();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const onJoin = (m: MeetupSuggestion) => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    setJoiningId(m.id);
    join.mutate(m.id, {
      onSuccess: (joined) => {
        toast("참여했어요! 채팅으로 인사해 보세요 👋", "success");
        onOpen(joined);
      },
      onError: (e) => toast(errorMessage(e), "error"),
      onSettled: () => setJoiningId(null),
    });
  };

  return (
    <section aria-label="추천 약속">
      <SectionTitle right={<span className="text-xs text-slate-500">2시간 안 · 가까운 순</span>}>✨ 추천 약속</SectionTitle>
      <ul className="flex flex-col gap-3">
        {items.map((m) => {
          const until = minutesUntil(m.meal_time);
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
              <button
                type="button"
                onClick={() => onOpen(m)}
                className="press flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-sun-300 py-1.5 text-brand-900">
                  <span className="text-[10px] font-semibold">{until <= 0 ? "진행 중" : `${until}분 뒤`}</span>
                  <span className="text-sm font-extrabold">{shortMealTime(m.meal_time)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold text-slate-900">{m.title}</span>
                  <span className="block truncate text-xs text-slate-500">
                    📍 {m.place_name}
                    {m.distance_m !== null ? ` · ${formatDistance(m.distance_m)}` : ""}
                  </span>
                  <span className="mt-0.5 block">
                    <Tag>
                      {m.member_count}/{m.max_people}명
                    </Tag>
                  </span>
                </span>
              </button>
              {m.joined ? (
                <Tag tone="yellow">참여 중</Tag>
              ) : (
                <Button size="sm" loading={joiningId === m.id} disabled={join.isPending} onClick={() => onJoin(m)}>
                  참여
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
