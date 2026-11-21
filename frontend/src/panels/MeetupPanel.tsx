// 밥친구 패널 — 위에서부터
//   1) 🙋 지금 밥 먹을래요 (위치 공유 + 근처 사람들)  → PresenceHero.tsx
//   2) ⚡ 번개 약속 (칩 두 번으로 만들기)            → QuickMeetup.tsx
//   3) ✨ 추천 약속 (한 번에 참여)                    → QuickMeetup.tsx
//   4) 다가오는 밥약속 목록("지금~1시간 / 오늘 / 내일 이후")
// "직접 만들기"를 누르면 제목·시간·인원을 다 고르는 원래 폼이 열려요.
// 가게 상세에서 "여기서 같이 먹을 사람 구하기"를 누르면 useDbNavStore.draft가 채워져서 폼이 바로 열려요.
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/clientDb";
import { useCreateMeetup, useMeetups } from "../api/hooks/db";
import type { Meetup, SelectedDbItem } from "../api/types.db";
import { EmptyState, ErrorState, ListSkeleton } from "../components/db/StateViews";
import { Button, ErrorBox, Field, Notice, Tag, cx, inputClass } from "../components/db/ui";
import {
  MEETUP_GROUP_LABEL,
  defaultMealInput,
  describeFromCampus,
  formatMealTime,
  groupMeetups,
  localInputToSeoulIso,
  minutesUntil,
  toSeoulInputValue,
} from "../lib/dbFormat";
import type { MeetupGroupKey } from "../lib/dbFormat";
import { toast, useAuthStore, useCancelPickOnUnmount, useDbNavStore, usePickStore, useSelectionStore } from "../store/db";
import { PresenceHero } from "./PresenceHero";
import { QuickMeetupCard, SuggestedMeetups } from "./QuickMeetup";

export function MeetupPanel({ onSelect }: { onSelect?: (item: SelectedDbItem) => void }) {
  const select = onSelect ?? useSelectionStore.getState().select;
  const draft = useDbNavStore((s) => s.draft);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useMeetups();
  const quickRef = useRef<HTMLElement>(null);

  // 가게에서 넘어온 초안이 있으면 만들기 폼을 열어요.
  useEffect(() => {
    if (draft) setCreating(true);
  }, [draft]);

  if (creating) {
    return (
      <CreateMeetupForm
        onClose={(createdId) => {
          setCreating(false);
          useDbNavStore.getState().clearDraft();
          if (createdId) select({ type: "meetup", id: createdId });
        }}
      />
    );
  }

  const items = (data?.items ?? []).filter((m) => m.status !== "cancelled");
  const groups = groupMeetups(items);

  /** 약속을 열고, 위치가 있으면 지도도 그쪽으로 옮겨요. */
  const openMeetup = (m: Meetup) => {
    select({ type: "meetup", id: m.id });
    if (m.lat !== null && m.lng !== null) useDbNavStore.getState().focusOn({ lat: m.lat, lng: m.lng });
  };

  /** 빈 목록에서 "번개 약속 만들기"를 누르면 번개 약속 카드로 데려가요. */
  const goToQuick = () => {
    quickRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    quickRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">밥친구</h2>
          <p className="text-xs font-medium text-balance text-slate-500">혼밥 말고, 같이 먹을 사람을 찾아요</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          ✏️ 직접 만들기
        </Button>
      </div>

      <PresenceHero onSelect={select} />
      <QuickMeetupCard ref={quickRef} onCreated={openMeetup} />
      <SuggestedMeetups onOpen={openMeetup} />

      <h3 className="pt-1 text-base font-extrabold text-slate-900">다가오는 밥약속</h3>

      {isLoading && <ListSkeleton rows={3} shape="meetup" label="밥약속을 불러오는 중이에요…" />}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />}
      {data && items.length === 0 && (
        <EmptyState
          icon="🍚"
          title="아직 잡힌 밥약속이 없어요"
          hint="두 번만 누르면 첫 약속이 생겨요."
          action={{ label: "번개 약속 만들기", icon: "⚡", onClick: goToQuick }}
        />
      )}

      {(Object.keys(groups) as MeetupGroupKey[]).map((key) =>
        groups[key].length === 0 ? null : (
          <section key={key}>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              {key === "soon" && <span className="size-2 animate-pulse rounded-full bg-sun-500" aria-hidden />}
              {MEETUP_GROUP_LABEL[key]}
              <span className="text-xs font-semibold text-slate-500">{groups[key].length}</span>
            </h3>
            <ul className="flex flex-col gap-3">
              {groups[key].map((m) => (
                <li key={m.id}>
                  <MeetupCard m={m} onClick={() => openMeetup(m)} />
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function MeetupCard({ m, onClick }: { m: Meetup; onClick: () => void }) {
  const full = m.status === "full";
  const until = minutesUntil(m.meal_time);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "press flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 transition hover:shadow-sm",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        m.joined ? "ring-brand-300" : "ring-slate-100 hover:ring-brand-300",
      )}
    >
      <span
        className={cx(
          "flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5",
          full ? "bg-slate-100 text-slate-500" : "bg-sun-300 text-brand-900",
        )}
      >
        <span className="text-[10px] font-semibold">
          {until <= 0 ? "진행 중" : until < 60 ? `${until}분 뒤` : formatMealTime(m.meal_time).split(" ")[0]}
        </span>
        <span className="text-sm font-extrabold">{formatMealTime(m.meal_time).split(" ").pop()}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-slate-900">{m.title}</span>
        <span className="block truncate text-xs text-slate-500">
          📍 {m.place_name} · {formatMealTime(m.meal_time)}
        </span>
        <span className="mt-1 flex items-center gap-1">
          <Tag tone={full ? "gray" : "blue"}>
            {m.member_count}/{m.max_people}명{full ? " · 마감" : ""}
          </Tag>
          {m.joined && <Tag tone="yellow">{m.is_host ? "내가 방장" : "참여 중"}</Tag>}
        </span>
      </span>
    </button>
  );
}

function CreateMeetupForm({ onClose }: { onClose: (createdId?: string) => void }) {
  const token = useAuthStore((s) => s.token);
  const draft = useDbNavStore((s) => s.draft);
  const pick = usePickStore();
  useCancelPickOnUnmount();
  const create = useCreateMeetup();

  const [title, setTitle] = useState(draft ? `${draft.place_name}에서 같이 먹어요` : "");
  const [place, setPlace] = useState(draft?.place_name ?? "");
  const [time, setTime] = useState(defaultMealInput());
  const [maxPeople, setMaxPeople] = useState(4);
  const [note, setNote] = useState("");
  const [restaurant, setRestaurant] = useState(draft);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);

  if (!token) {
    return (
      <div className="space-y-3">
        <FormHeader onBack={() => onClose()} />
        <Notice>밥약속을 만들려면 위쪽에서 닉네임으로 먼저 로그인해 주세요.</Notice>
      </div>
    );
  }

  const valid = title.trim().length >= 2 && place.trim().length >= 1 && !!time;

  const submit = () => {
    create.mutate(
      {
        title: title.trim(),
        place_name: place.trim(),
        meal_time: localInputToSeoulIso(time), // 입력값을 서울 시간으로 보고 +09:00을 붙여요
        max_people: maxPeople,
        restaurant_id: restaurant?.restaurant_id ?? null,
        // 가게를 고르면 서버가 가게 좌표를 넣어 줘요. 아니면 찍은 위치를 보내요.
        lat: restaurant ? null : (point?.lat ?? null),
        lng: restaurant ? null : (point?.lng ?? null),
        note: note.trim() || null,
      },
      {
        onSuccess: (m) => {
          toast("밥약속을 만들었어요! 사람들이 오면 채팅으로 이야기해요 🍚", "success");
          onClose(m.id);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <FormHeader onBack={() => onClose()} />

      {restaurant && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <span className="text-brand-800">
            🍽️ <b>{restaurant.place_name}</b>에서 만나요
          </span>
          <button type="button" onClick={() => setRestaurant(null)} className="text-xs font-semibold text-slate-500 hover:underline">
            가게 빼기
          </button>
        </div>
      )}

      <Field label="제목">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          placeholder="예) 오늘 저녁 학식 같이 드실 분"
          className={inputClass}
        />
      </Field>

      <Field label="장소">
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={40}
          placeholder="예) 학생식당"
          className={inputClass}
        />
      </Field>

      {!restaurant && (
        <Field label="지도 위치 (선택)" hint="찍어 두면 지도에도 핀이 보여요">
          <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <span className="flex-1 text-sm text-slate-700">
              {point ? `📍 ${describeFromCampus(point)}` : <span className="text-slate-400">위치 없음</span>}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => pick.start("만날 곳을 지도에서 눌러 주세요", (p) => setPoint(p))}
            >
              {pick.label ? "지도를 눌러요…" : "지도에서 찍기"}
            </Button>
          </div>
        </Field>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="언제">
          <input
            type="datetime-local"
            value={time}
            min={toSeoulInputValue(new Date())}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="인원">
          <div className="flex h-[42px] items-center rounded-xl bg-white ring-1 ring-slate-200">
            <button
              type="button"
              aria-label="한 명 줄이기"
              onClick={() => setMaxPeople((n) => Math.max(2, n - 1))}
              className="h-full w-9 text-lg font-bold text-brand-700 disabled:opacity-30"
              disabled={maxPeople <= 2}
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-bold">{maxPeople}명</span>
            <button
              type="button"
              aria-label="한 명 늘리기"
              onClick={() => setMaxPeople((n) => Math.min(10, n + 1))}
              className="h-full w-9 text-lg font-bold text-brand-700 disabled:opacity-30"
              disabled={maxPeople >= 10}
            >
              ＋
            </button>
          </div>
        </Field>
      </div>

      <Field label="한마디 (선택)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="예) 정문 앞에서 만나요. 처음 오셔도 환영!"
          className={inputClass}
        />
      </Field>

      {create.error && <ErrorBox message={errorMessage(create.error)} />}

      <Button size="lg" className="w-full" disabled={!valid} loading={create.isPending} onClick={submit}>
        밥약속 만들기
      </Button>
    </div>
  );
}

function FormHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로"
        className="flex size-8 items-center justify-center rounded-full text-lg text-slate-600 hover:bg-slate-100"
      >
        ←
      </button>
      <h2 className="text-lg font-extrabold text-slate-900">밥친구 구하기</h2>
    </div>
  );
}

export default MeetupPanel;
