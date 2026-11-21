// 받은 "같이 먹자" 제안 카드 (WebSocket invite.received → useInviteStore).
// 작은 토스트가 아니라 눈에 잘 띄는 카드로 보여 주고, 여러 개 오면 위에서부터 쌓아요.
// 통합 때 앱 어딘가에 <InviteToast onSelect={select} /> 하나만 두면 돼요.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, errorMessage, isApiError } from "../../api/clientDb";
import { useJoinMeetup } from "../../api/hooks/db";
import { dbKeys } from "../../api/hooks/db/keys";
import type { Meetup, SelectedDbItem } from "../../api/types.db";
import { shortMealTime } from "../../lib/dbFormat";
import { toast, useAuthStore, useInviteStore, useSelectionStore } from "../../store/db";
import type { InviteCard } from "../../store/db";
import { PersonAvatar } from "./Avatar";
import { Button } from "./ui";

/** 한 번에 보여 줄 카드 수. 나머지는 "+N개 더"로 알려 줘요. */
const MAX_VISIBLE = 3;

/** 사람이 지금 글을 쓰고 있으면 포커스를 뺏지 않아요. */
function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function InviteToast({ onSelect }: { onSelect?: (item: SelectedDbItem) => void }) {
  const invites = useInviteStore((s) => s.invites);
  const token = useAuthStore((s) => s.token);
  // 로그아웃 상태에서는 보이지 않아요. (제안은 로그인한 사람에게 온 거예요)
  if (!token || invites.length === 0) return null;

  // 최근 것이 맨 위
  const ordered = [...invites].reverse();
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  return (
    <div
      aria-live="assertive"
      aria-label="받은 같이 먹자 제안"
      // 모바일: 떠 있는 머리말 아래 / 데스크톱: 지도 오른쪽 아래, 확대·축소 버튼 위 (레이어 토글을 가리지 않아요)
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--hp-header-h,4rem)+0.5rem)] z-40 flex flex-col items-center gap-2 px-3 md:inset-x-auto md:top-auto md:right-4 md:bottom-36 md:w-[22rem] md:px-0"
    >
      {visible.map((card, i) => (
        <InviteCardView key={card.key} card={card} onSelect={onSelect} newest={i === 0} />
      ))}
      {hidden > 0 && (
        <span className="pointer-events-auto rounded-full bg-brand-900/85 px-3 py-1 text-xs font-bold text-white shadow">
          제안 {hidden}개 더 있어요
        </span>
      )}
    </div>
  );
}

function InviteCardView({
  card,
  onSelect,
  newest,
}: {
  card: InviteCard;
  onSelect?: (item: SelectedDbItem) => void;
  newest?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 새 카드가 오면 (입력 중이 아닐 때만) 그 카드로 포커스를 옮겨서 키보드·화면낭독기로 바로 답할 수 있게 해요.
  useEffect(() => {
    if (newest && !isTyping()) ref.current?.focus({ preventScroll: true });
    // 카드가 처음 나타날 때 한 번만
  }, []);
  const dismiss = useInviteStore((s) => s.dismiss);
  const qc = useQueryClient();
  const join = useJoinMeetup();
  const [busy, setBusy] = useState(false);
  const select = onSelect ?? useSelectionStore.getState().select;
  // card.meetup은 제안이 만들어질 때 찍어 둔 모습이라, 나중에 바뀐 joined·status는 모를 수 있어요.
  const m = card.meetup;
  const full = m.status !== "open";

  const openMeetup = () => {
    select({ type: "meetup", id: m.id });
    dismiss(card.key);
  };

  const onJoin = () => {
    setBusy(true);
    join.mutate(m.id, {
      onSuccess: () => {
        setBusy(false);
        toast(`${card.from_nickname}님과 약속이 잡혔어요! 채팅으로 인사해 보세요 👋`, "success");
        openMeetup();
      },
      onError: async (e) => {
        // 409는 "이미 참여 중", "자리가 다 찼어요", "취소된 모임" 셋 다 될 수 있어요.
        // 카드에 있는 옛 모습 말고 약속을 새로 받아서, 이미 참여 중이면 그냥 열어 줘요.
        if (isApiError(e) && e.status === 409) {
          try {
            const fresh = await qc.fetchQuery({
              queryKey: dbKeys.meetup(m.id),
              queryFn: () => apiFetch<Meetup>(`/meetups/${m.id}`),
              staleTime: 0,
            });
            if (fresh.joined) {
              setBusy(false);
              openMeetup();
              return;
            }
          } catch {
            // 새로 못 받아도 아래에서 서버 메시지를 보여 줘요.
          }
        }
        setBusy(false);
        toast(errorMessage(e), "error");
      },
    });
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={`invite-${card.key}`}
      className="invite-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-float ring-2 ring-sun-400 focus:outline-none focus-visible:ring-brand-500"
    >
      <div className="flex items-start gap-3 bg-linear-to-r from-sun-200 to-sun-50 px-4 pt-3.5 pb-3">
        <span className="relative">
          <PersonAvatar nickname={card.from_nickname} size="md" />
          <span className="absolute -right-1 -bottom-1 text-base" aria-hidden>
            🍚
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-amber-900">같이 먹자 제안이 왔어요</p>
          <p id={`invite-${card.key}`} className="text-base leading-snug font-extrabold text-brand-900">
            {card.from_nickname}님이 {shortMealTime(m.meal_time)} {m.place_name} 같이 먹자고 해요
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="line-clamp-2 min-w-0 flex-1 pl-1 text-xs leading-snug font-medium text-slate-600">
          {m.member_count}/{m.max_people}명 · {m.title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismiss(card.key)}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          괜찮아요
        </Button>
        <Button
          size="sm"
          loading={busy}
          disabled={full}
          onClick={onJoin}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {full ? "마감됐어요" : "참여하기"}
        </Button>
      </div>
    </div>
  );
}

export default InviteToast;
