// 가게 상세 시트 — 별점, 분포 막대, 태그, 후기(도움돼요/최신순), 후기 쓰기, 같이 먹을 사람 구하기.
// 통합 BottomSheet에서 selected.type === "restaurant" 일 때 <RestaurantSheet id={selected.id} /> 로 그려요.
// 제목을 지나 아래로 내리면 맨 위에 가게 이름·별점이 담긴 작은 머리줄이 붙어요.
import { useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "../api/clientDb";
import {
  useCreateReview,
  useDeleteReview,
  useRestaurant,
  useReviews,
  useToggleLike,
} from "../api/hooks/db";
import { RESTAURANT_TAGS } from "../api/types.db";
import type { RestaurantDetail, RestaurantTag, Review, ReviewSort, SelectedDbItem } from "../api/types.db";
import { Segmented } from "../components/db/Controls";
import { EmptyState, ErrorState, ListSkeleton, SheetSkeleton } from "../components/db/StateViews";
import {
  Button,
  Chip,
  ErrorBox,
  Notice,
  SectionTitle,
  StarInput,
  Stars,
  Tag,
  cx,
  inputClass,
} from "../components/db/ui";
import { CATEGORY_EMOJI, describeFromCampus, formatMealTime, timeAgo } from "../lib/dbFormat";
import { toast, useAuthStore, useDbNavStore, useSelectionStore } from "../store/db";

export interface RestaurantSheetProps {
  id: string;
  onSelect?: (item: SelectedDbItem) => void;
  /** "여기서 같이 먹을 사람 구하기"를 눌렀을 때. 기본은 밥친구 탭을 열고 가게를 미리 채워요. */
  onCreateMeetup?: (r: RestaurantDetail) => void;
}

export function RestaurantSheet({ id, onSelect, onCreateMeetup }: RestaurantSheetProps) {
  const { data: r, isLoading, isFetching, error, refetch } = useRestaurant(id);
  const select = onSelect ?? useSelectionStore.getState().select;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pastTitle, setPastTitle] = useState(false);

  // 제목이 화면(시트 스크롤 영역) 밖으로 나가면 작은 머리줄을 보여 줘요.
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setPastTitle(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [r?.id]);

  if (isLoading) return <SheetSkeleton label="가게 정보를 불러오는 중이에요…" />;
  if (error || !r)
    return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  const startMeetup = () => {
    if (onCreateMeetup) return onCreateMeetup(r);
    useDbNavStore.getState().openCreate({ restaurant_id: r.id, place_name: r.name, lat: r.lat, lng: r.lng });
    useSelectionStore.getState().clear();
  };

  return (
    <div className="space-y-5">
      {/* 작은 머리줄 — 자리는 차지하지 않고(h-0) 위에 떠 있어요.
          앱 껍데기에 위에 붙은 줄(예: "← 목록으로")이 있으면 --hp-sheet-sticky-top 만큼 아래에 붙어요. */}
      <div className="sticky top-[var(--hp-sheet-sticky-top,0px)] z-20 h-0" aria-hidden={!pastTitle}>
        <div
          className={cx(
            "flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-md ring-1 shadow-slate-900/10 ring-slate-100 backdrop-blur transition duration-200",
            pastTitle ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
          )}
        >
          <span aria-hidden>{CATEGORY_EMOJI[r.category] ?? "🍽️"}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-900">{r.name}</span>
          {r.rating_avg !== null && (
            <span className="shrink-0 text-sm font-bold text-brand-700">★ {r.rating_avg.toFixed(1)}</span>
          )}
          <span className="shrink-0 text-xs text-slate-500">후기 {r.review_count}</span>
        </div>
      </div>

      {/* 머리말 */}
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden>
          {CATEGORY_EMOJI[r.category] ?? "🍽️"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 ref={titleRef} className="text-xl font-extrabold text-balance text-slate-900">
            {r.name}
          </h2>
          <p className="mt-0.5 text-sm font-medium text-slate-500">
            {r.category} · {describeFromCampus(r)}
          </p>
          {r.address && <p className="mt-0.5 truncate text-xs text-slate-500">{r.address}</p>}
          {r.phone && (
            <a href={`tel:${r.phone}`} className="mt-0.5 inline-block text-xs font-semibold text-brand-700">
              📞 {r.phone}
            </a>
          )}
        </div>
      </header>

      {r.description && <p className="text-sm leading-relaxed text-slate-700">{r.description}</p>}

      {/* 별점 요약 */}
      <RatingSummary r={r} />

      {/* 태그 */}
      {Object.keys(r.tag_counts).length > 0 && (
        <section>
          <SectionTitle>이런 점이 좋대요</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(r.tag_counts)
              .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
              .map(([tag, n]) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-800"
                >
                  #{tag} <span className="text-xs font-bold text-brand-600">{n}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      {/* 밥친구 */}
      <section aria-labelledby="rst-meetup-title" className="space-y-3 rounded-2xl bg-sun-50 p-4 ring-1 ring-inset ring-sun-200">
        <div>
          <h3 id="rst-meetup-title" className="text-base font-extrabold text-slate-900">
            🍚 여기서 같이 먹어요
          </h3>
          <p className="text-xs font-medium text-balance text-amber-900">
            {r.upcoming_meetups.length === 0
              ? "아직 잡힌 밥약속이 없어요. 처음으로 만들어 볼까요?"
              : `잡힌 약속 ${r.upcoming_meetups.length}개 — 눌러서 바로 참여해요`}
          </p>
        </div>
        {r.upcoming_meetups.length > 0 && (
          <ul className="flex flex-col gap-2">
            {r.upcoming_meetups.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => select({ type: "meetup", id: m.id })}
                  className="press flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm ring-1 ring-sun-200 transition hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{m.title}</span>
                    <span className="text-xs text-slate-500">{formatMealTime(m.meal_time)}</span>
                  </span>
                  <Tag tone={m.status === "open" ? "blue" : "gray"}>
                    {m.member_count}/{m.max_people}명
                  </Tag>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="primary" size="lg" className="w-full" onClick={startMeetup}>
          🙋 여기서 같이 먹을 사람 구하기
        </Button>
      </section>

      <ReviewSection restaurantId={r.id} />
    </div>
  );
}

function RatingSummary({ r }: { r: RestaurantDetail }) {
  const total = Object.values(r.rating_distribution).reduce((a, b) => a + b, 0);
  return (
    <section className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="flex w-24 shrink-0 flex-col items-center justify-center">
        <div className="text-4xl font-extrabold text-slate-900">
          {r.rating_avg !== null ? r.rating_avg.toFixed(1) : "–"}
        </div>
        <Stars value={r.rating_avg} />
        <div className="mt-1 text-xs text-slate-500">후기 {r.review_count}개</div>
        <div className="mt-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
          추천점수 {r.score.toFixed(2)}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1">
        {(["5", "4", "3", "2", "1"] as const).map((k) => {
          const n = r.rating_distribution[k] ?? 0;
          const pct = total ? (n / total) * 100 : 0;
          return (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-right font-semibold text-slate-600">{k}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-sun-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-5 text-right text-slate-500">{n}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewSection({ restaurantId }: { restaurantId: string }) {
  const [sort, setSort] = useState<ReviewSort>("helpful");
  const { data, isLoading, isFetching, error, refetch } = useReviews(restaurantId, sort);
  const formRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.token);
  const alreadyWrote = data?.items.some((rv) => rv.is_mine) ?? false;

  return (
    <section>
      <SectionTitle
        right={
          <Segmented
            label="후기 정렬"
            size="sm"
            fit
            value={sort}
            onChange={setSort}
            options={[
              { value: "helpful", label: "도움돼요순" },
              { value: "recent", label: "최신순" },
            ]}
          />
        }
      >
        후기 {data ? data.total : ""}
      </SectionTitle>

      {token && !alreadyWrote && (
        <div ref={formRef}>
          <ReviewForm restaurantId={restaurantId} />
        </div>
      )}
      {!token && <Notice>닉네임으로 로그인하면 후기를 남기고 &lsquo;도움돼요&rsquo;를 누를 수 있어요.</Notice>}

      <div className="mt-3 flex flex-col gap-3">
        {isLoading && <ListSkeleton rows={2} shape="report" label="후기를 불러오는 중이에요…" />}
        {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />}
        {data?.items.length === 0 && (
          <EmptyState
            icon="✍️"
            title="아직 후기가 없어요"
            hint="첫 후기를 남기면 이 가게 순위가 올라가요."
            action={
              token && !alreadyWrote
                ? {
                    label: "첫 후기 쓰기",
                    onClick: () => {
                      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      formRef.current?.querySelector<HTMLElement>("textarea, button")?.focus({ preventScroll: true });
                    },
                  }
                : undefined
            }
          />
        )}
        {data?.items.map((rv) => <ReviewItem key={rv.id} review={rv} restaurantId={restaurantId} />)}
      </div>
    </section>
  );
}

function ReviewItem({ review, restaurantId }: { review: Review; restaurantId: string }) {
  const like = useToggleLike(restaurantId);
  const del = useDeleteReview(restaurantId);
  const token = useAuthStore((s) => s.token);

  const onLike = () => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    like.mutate(review.id, { onError: (e) => toast(errorMessage(e), "error") });
  };
  const onDelete = () => {
    if (!window.confirm("내 후기를 지울까요? 지우면 되돌릴 수 없어요.")) return;
    del.mutate(review.id, {
      onSuccess: () => toast("후기를 지웠어요.", "success"),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  };

  return (
    <article
      className={cx(
        "space-y-1.5 rounded-2xl bg-white p-4 shadow-sm ring-1",
        review.is_mine ? "ring-brand-200" : "ring-slate-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-slate-800">{review.author_nickname}</span>
          {review.is_mine && <Tag>내 후기</Tag>}
        </div>
        <span className="text-xs text-slate-500">{timeAgo(review.created_at)}</span>
      </div>
      <Stars value={review.rating} />
      <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{review.content}</p>
      {review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {review.tags.map((t) => (
            <Tag key={t} tone="yellow">
              #{t}
            </Tag>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onLike}
          disabled={review.is_mine || like.isPending}
          aria-pressed={review.liked_by_me}
          title={review.is_mine ? "내 후기에는 누를 수 없어요" : undefined}
          className={cx(
            "press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
            review.liked_by_me ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-brand-50",
          )}
        >
          👍 도움돼요 {review.like_count}
        </button>
        {review.is_mine && (
          <button
            type="button"
            onClick={onDelete}
            disabled={del.isPending}
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            삭제
          </button>
        )}
      </div>
    </article>
  );
}

function ReviewForm({ restaurantId }: { restaurantId: string }) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<RestaurantTag[]>([]);
  const create = useCreateReview(restaurantId);

  const valid = rating >= 1 && content.trim().length >= 5 && content.trim().length <= 500;
  const toggle = (t: RestaurantTag) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = () => {
    create.mutate(
      { rating, content: content.trim(), tags },
      {
        onSuccess: () => {
          toast("후기를 남겼어요. 고마워요!", "success");
          setRating(0);
          setContent("");
          setTags([]);
        },
      },
    );
  };

  const err = create.error;
  return (
    <div className="space-y-3 rounded-2xl bg-brand-50/60 p-3 ring-1 ring-inset ring-brand-100">
      <p className="text-sm font-semibold text-brand-900">후기 남기기</p>
      <StarInput value={rating} onChange={setRating} />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="어땠는지 5자 이상 적어 주세요. 예) 시험기간 밤에 가기 좋아요"
        className={inputClass}
      />
      <div className="no-scrollbar flex flex-wrap gap-1.5">
        {RESTAURANT_TAGS.map((t) => (
          <Chip key={t} active={tags.includes(t)} onClick={() => toggle(t)}>
            #{t}
          </Chip>
        ))}
      </div>
      {err && (
        <ErrorBox
          message={isApiError(err) && err.code === "CONFLICT" ? "이 가게에는 이미 후기를 남겼어요." : errorMessage(err)}
        />
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{content.trim().length}/500</span>
        <Button onClick={submit} disabled={!valid} loading={create.isPending}>
          후기 올리기
        </Button>
      </div>
    </div>
  );
}

export default RestaurantSheet;
