// 밥약속 상세 시트 — 정보, 멤버, 참여/나가기/취소, 참여자 전용 채팅.
// - 인원은 칸 막대(4칸 중 2칸)로, 빈자리는 점선 동그라미(+)로 보여 줘요.
// - "나가기"는 조용한 테두리 버튼이고, 누르면 바로 아래에 "정말 나갈까요?" 확인 줄이 떠요. (브라우저 confirm 창 안 써요)
// - 채팅 입력칸은 스크롤해도 아래에 붙어 있어요.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../api/clientDb";
import {
  useJoinMeetup,
  useLeaveMeetup,
  useMeetup,
  useMeetupMessages,
  useSendMessage,
} from "../api/hooks/db";
import type { Meetup, SelectedDbItem } from "../api/types.db";
import { ChatSkeleton, ErrorState, SheetSkeleton } from "../components/db/StateViews";
import { Button, Notice, SectionTitle, Tag, cx, inputClass } from "../components/db/ui";
import { formatMealTime, formatTime, minutesUntil } from "../lib/dbFormat";
import { notifyPermission, requestNotifyPermission } from "../lib/notify";
import { toast, useAuthStore, useSelectionStore } from "../store/db";

const STATUS: Record<Meetup["status"], { label: string; tone: "blue" | "yellow" | "gray" }> = {
  open: { label: "모집 중", tone: "blue" },
  full: { label: "정원 마감", tone: "yellow" },
  cancelled: { label: "취소됨", tone: "gray" },
};

export function MeetupSheet({ id, onSelect }: { id: string; onSelect?: (item: SelectedDbItem) => void }) {
  const { data: m, isLoading, isFetching, error, refetch } = useMeetup(id);
  const join = useJoinMeetup();
  const leave = useLeaveMeetup();
  const token = useAuthStore((s) => s.token);
  const select = onSelect ?? useSelectionStore.getState().select;
  /** 나가기 확인 줄을 띄운 약속 id */
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null);

  if (isLoading) return <SheetSkeleton label="밥약속을 불러오는 중이에요…" />;
  if (error || !m)
    return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  const until = minutesUntil(m.meal_time);
  const st = STATUS[m.status];

  const onJoin = () => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    join.mutate(m.id, {
      onSuccess: () => toast("참여했어요! 채팅으로 인사해 보세요 👋", "success"),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  };
  const confirming = confirmLeaveId === m.id;
  const onLeave = () => {
    leave.mutate(m.id, {
      onSuccess: () => {
        setConfirmLeaveId(null);
        toast(m.is_host ? "모임을 취소했어요." : "나왔어요.", "success");
      },
      onError: (e) => toast(errorMessage(e), "error"),
    });
  };
  const emptySlots = Math.max(0, m.max_people - m.member_count);

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sun-300 text-2xl" aria-hidden>
          🍚
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Tag tone={st.tone}>{st.label}</Tag>
            {m.joined && <Tag tone="yellow">참여 중</Tag>}
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">{m.title}</h2>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">언제</dt>
          <dd className="font-bold text-slate-900">{formatMealTime(m.meal_time)}</dd>
          <dd className="text-xs text-brand-700">
            {until > 0 ? (until < 60 ? `${until}분 뒤` : `${Math.floor(until / 60)}시간 ${until % 60}분 뒤`) : "지금 먹는 중"}
          </dd>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-xs text-slate-500">어디서</dt>
          <dd className="truncate font-bold text-slate-900">{m.place_name}</dd>
          {m.restaurant_id && (
            <dd>
              <button
                type="button"
                onClick={() => select({ type: "restaurant", id: m.restaurant_id as string })}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                가게 정보 보기 →
              </button>
            </dd>
          )}
        </div>
      </dl>

      {m.note && <p className="rounded-2xl bg-sun-50 p-3 text-sm text-slate-800 ring-1 ring-sun-200">📝 {m.note}</p>}

      <section>
        <SectionTitle
          right={
            <span className="text-xs font-semibold text-slate-600">
              {m.member_count}/{m.max_people}명{emptySlots > 0 ? ` · ${emptySlots}자리 남았어요` : ""}
            </span>
          }
        >
          함께하는 사람
        </SectionTitle>
        {/* 칸 막대: 정원만큼 칸을 나누고, 찬 칸만 파랗게 */}
        <div
          role="img"
          aria-label={`정원 ${m.max_people}명 중 ${m.member_count}명이 모였어요`}
          className="mb-3 flex gap-1"
        >
          {Array.from({ length: m.max_people }, (_, i) => (
            <span
              key={i}
              className={cx(
                "h-2 flex-1 rounded-full transition-colors",
                i < m.member_count ? (m.status === "full" ? "bg-sun-400" : "bg-brand-600") : "bg-slate-200",
              )}
            />
          ))}
        </div>
        <ul className="flex flex-wrap items-center gap-1.5">
          {m.members.map((name) => (
            <li
              key={name}
              className={cx(
                "rounded-full px-2.5 py-1 text-sm font-medium",
                name === m.host_nickname ? "bg-sun-200 text-amber-900" : "bg-brand-50 text-brand-800",
              )}
            >
              {name === m.host_nickname && <span aria-label="방장">👑 </span>}
              {name}
            </li>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <li
              key={`empty-${i}`}
              aria-label="빈자리"
              title="빈자리"
              className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-brand-200 text-base font-bold text-brand-400"
            >
              <span aria-hidden>+</span>
            </li>
          ))}
        </ul>
      </section>

      {m.status !== "cancelled" && !m.joined && (
        <Button size="lg" className="w-full" onClick={onJoin} disabled={m.status === "full"} loading={join.isPending}>
          {m.status === "full" ? "정원이 다 찼어요" : "🙋 나도 갈래요"}
        </Button>
      )}

      {m.joined && m.status !== "cancelled" && <NotifyAsk />}

      <section>
        <SectionTitle>💬 채팅</SectionTitle>
        {m.joined ? (
          <Chat meetupId={m.id} disabled={m.status === "cancelled"} />
        ) : (
          <Notice>참여하면 멤버끼리 채팅할 수 있어요. 만날 장소를 정해 보세요!</Notice>
        )}
      </section>

      {/* 나가기 — 조용한 버튼 + 바로 아래 확인 줄 */}
      {m.status !== "cancelled" && m.joined && (
        <div className="space-y-2">
          {confirming ? (
            <div
              role="alertdialog"
              aria-labelledby="leave-confirm-text"
              className="flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200"
            >
              <p id="leave-confirm-text" className="min-w-0 flex-1 text-sm font-semibold text-rose-900">
                {m.is_host ? "방장이 나가면 모임이 취소돼요. 정말 취소할까요?" : "이 밥약속에서 나갈까요?"}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" autoFocus onClick={() => setConfirmLeaveId(null)}>
                  아니요
                </Button>
                <Button size="sm" variant="danger" loading={leave.isPending} onClick={onLeave}>
                  {m.is_host ? "네, 취소할게요" : "네, 나갈게요"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                className="text-slate-600 ring-slate-200 hover:bg-slate-50"
                onClick={() => setConfirmLeaveId(m.id)}
              >
                {m.is_host ? "모임 취소하기" : "나가기"}
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

const NOTIFY_ASK_KEY = "hp-notify-ask-v1";

function loadAskDismissed() {
  try {
    return localStorage.getItem(NOTIFY_ASK_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/**
 * 멤버에게만 보이는 "브라우저 알림 받기" 줄이에요.
 * 권한을 아직 안 정했을 때(default)만 보이고, 버튼을 눌러야만 권한을 물어요. 닫으면 다시 안 보여요.
 */
function NotifyAsk() {
  const [perm, setPerm] = useState(notifyPermission);
  const [dismissed, setDismissed] = useState(loadAskDismissed);
  if (perm !== "default" || dismissed) return null;

  const onAsk = async () => {
    const next = await requestNotifyPermission();
    setPerm(next);
    if (next === "granted") toast("이제 다른 탭에 있어도 약속 알림이 와요 🔔", "success");
  };
  const onDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(NOTIFY_ASK_KEY, "dismissed");
    } catch {
      // 저장이 안 되면 이번에만 숨겨요.
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-sun-50 py-2 pr-1.5 pl-3 text-sm ring-1 ring-sun-200">
      <p className="min-w-0 flex-1 font-semibold text-brand-900">🔔 다른 탭을 보고 있어도 약속 알림 받기</p>
      <Button size="sm" onClick={onAsk}>
        알림 켜기
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="알림 받기 안내 닫기"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-slate-600 transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}

function Chat({ meetupId, disabled }: { meetupId: string; disabled: boolean }) {
  const { data, isLoading, isFetching, error, refetch } = useMeetupMessages(meetupId, true);
  const send = useSendMessage(meetupId);
  const me = useAuthStore((s) => s.nickname);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 메시지가 오면 맨 아래로 내려요.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.items.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    send.mutate(content, {
      onSuccess: () => setText(""),
      onError: (err) => toast(errorMessage(err), "error"),
    });
  };

  return (
    // overflow-hidden을 쓰지 않아야 아래 입력칸이 sticky로 붙어 있어요.
    <div className="rounded-2xl bg-white ring-1 ring-slate-100">
      <div
        ref={listRef}
        aria-live="polite"
        className="max-h-64 min-h-32 space-y-2 overflow-y-auto rounded-t-2xl bg-slate-50/60 p-3"
      >
        {isLoading && <ChatSkeleton />}
        {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />}
        {data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <p className="text-sm font-semibold text-slate-600">첫 인사를 남겨 보세요 🙌</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.focus()}
              className="press rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
            >
              ✍️ 인사 쓰기
            </button>
          </div>
        )}
        {data?.items.map((msg) => {
          const mine = msg.nickname === me;
          return (
            <div key={msg.id} className={cx("flex flex-col", mine ? "items-end" : "items-start")}>
              {!mine && <span className="mb-0.5 text-xs font-semibold text-slate-500">{msg.nickname}</span>}
              <div className="flex items-end gap-1">
                {mine && <span className="text-[10px] text-slate-500">{formatTime(msg.created_at)}</span>}
                <p
                  className={cx(
                    "max-w-[15rem] rounded-2xl px-3 py-1.5 text-sm break-words",
                    mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200",
                  )}
                >
                  {msg.content}
                </p>
                {!mine && <span className="text-[10px] text-slate-500">{formatTime(msg.created_at)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={submit}
        className="sticky bottom-0 z-10 flex gap-2 rounded-b-2xl border-t border-slate-100 bg-white/95 p-2 backdrop-blur"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          disabled={disabled}
          placeholder={disabled ? "취소된 모임이에요" : "메시지를 입력해요"}
          aria-label="채팅 메시지"
          className={inputClass}
        />
        <Button type="submit" disabled={disabled || !text.trim()} loading={send.isPending}>
          보내기
        </Button>
      </form>
    </div>
  );
}

export default MeetupSheet;
