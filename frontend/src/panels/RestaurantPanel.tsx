// 맛집 패널 — 필터(카테고리·태그·정렬), 순위 목록, "맛집 추천" 폼.
// 통합 때는 하단 탭/바텀시트 안에 <RestaurantPanel onSelect={select} /> 로 넣으면 돼요.
import { useDeferredValue, useState } from "react";
import { useRestaurants } from "../api/hooks/db";
import { RESTAURANT_CATEGORIES, RESTAURANT_TAGS } from "../api/types.db";
import type {
  RestaurantCategory,
  RestaurantSort,
  RestaurantTag,
  SelectedDbItem,
} from "../api/types.db";
import { errorMessage } from "../api/clientDb";
import { FadeRow, Segmented } from "../components/db/Controls";
import { EmptyState, ErrorState, ListSkeleton } from "../components/db/StateViews";
import { Button, Chip, Stars, Tag, cx, inputClass } from "../components/db/ui";
import { CAMPUS, CATEGORY_EMOJI, formatDistance } from "../lib/dbFormat";
import { useDbNavStore, useSelectionStore } from "../store/db";
import { RecommendForm } from "./RecommendForm";

const SORTS: { key: RestaurantSort; label: string }[] = [
  { key: "score", label: "추천순" },
  { key: "distance", label: "가까운순" },
  { key: "reviews", label: "후기 많은순" },
  { key: "recent", label: "새로 생긴순" },
];

export function RestaurantPanel({ onSelect }: { onSelect?: (item: SelectedDbItem) => void }) {
  const [mode, setMode] = useState<"list" | "create">("list");
  const [category, setCategory] = useState<RestaurantCategory | undefined>();
  const [tag, setTag] = useState<RestaurantTag | undefined>();
  const [sort, setSort] = useState<RestaurantSort>("score");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());

  const select = onSelect ?? useSelectionStore.getState().select;
  // 거리는 항상 캠퍼스 중심 기준으로 보여 줘요. (sort=distance는 lat,lng가 꼭 필요해요)
  const { data, isLoading, isFetching, error, refetch } = useRestaurants({
    category,
    tag,
    sort,
    q: deferredQ || undefined,
    lat: CAMPUS.lat,
    lng: CAMPUS.lng,
    limit: 100,
  });

  if (mode === "create") {
    return (
      <RecommendForm
        onCancel={() => setMode("list")}
        onDone={(id) => {
          setMode("list");
          select({ type: "restaurant", id });
        }}
        onOpenExisting={(id) => {
          setMode("list");
          select({ type: "restaurant", id });
        }}
      />
    );
  }

  const filtered = Boolean(category || tag || deferredQ);
  const resetFilters = () => {
    setCategory(undefined);
    setTag(undefined);
    setQ("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">리얼 후기 맛집</h2>
          <p className="text-xs font-medium text-balance text-slate-500">학생들이 직접 남긴 별점으로 순위를 매겨요</p>
        </div>
        <Button variant="accent" size="sm" onClick={() => setMode("create")}>
          ＋ 맛집 추천
        </Button>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="가게 이름으로 찾기"
        aria-label="가게 이름 검색"
        className={inputClass}
      />

      {/* 카테고리 — 오른쪽 끝이 흐리면 옆으로 더 있어요 */}
      <FadeRow label="카테고리">
        <Chip active={!category} onClick={() => setCategory(undefined)}>
          전체
        </Chip>
        {RESTAURANT_CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? undefined : c)}>
            <span aria-hidden>{CATEGORY_EMOJI[c]}</span> {c}
          </Chip>
        ))}
      </FadeRow>

      {/* 태그 */}
      <div>
        <p id="rst-tag-label" className="mb-1 text-[11px] font-semibold text-slate-500">
          이런 점이 좋아요
        </p>
        <FadeRow>
          <div role="group" aria-labelledby="rst-tag-label" className="flex gap-1.5">
            {RESTAURANT_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? undefined : t)}
                className={cx(
                  "press h-7 shrink-0 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
                  tag === t
                    ? "bg-sun-400 text-brand-900 ring-1 ring-sun-500"
                    : "bg-sun-50 text-amber-900 ring-1 ring-inset ring-sun-200 hover:bg-sun-100",
                )}
              >
                #{t}
              </button>
            ))}
          </div>
        </FadeRow>
      </div>

      {/* 정렬 — 하나만 고르는 버튼 묶음 */}
      <Segmented
        label="정렬"
        size="sm"
        value={sort}
        onChange={setSort}
        options={SORTS.map((o) => ({ value: o.key, label: o.label }))}
      />
      <div className="flex min-h-4 items-center justify-between gap-2 text-xs" aria-live="polite">
        <span className="font-medium text-slate-500">
          {sort === "distance" ? "캠퍼스 중심에서 가까운 순서예요" : null}
        </span>
        {data && (
          <span className="shrink-0 font-semibold text-slate-600">
            {isFetching ? (
              "갱신 중…"
            ) : (
              <>
                총 <b className="text-brand-700">{data.total}곳</b>
              </>
            )}
          </span>
        )}
      </div>

      {isLoading && <ListSkeleton rows={4} shape="restaurant" label="맛집 목록을 불러오는 중이에요…" />}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />}
      {data?.items.length === 0 &&
        (filtered ? (
          <EmptyState
            icon="🔍"
            title="조건에 맞는 가게가 없어요"
            hint="필터를 풀면 더 많은 가게가 보여요."
            action={{ label: "필터 초기화", icon: "↺", onClick: resetFilters }}
          />
        ) : (
          <EmptyState
            icon="🍽️"
            title="아직 등록된 맛집이 없어요"
            hint="자주 가는 가게를 첫 번째로 추천해 주세요!"
            action={{ label: "첫 맛집 추천하기", icon: "＋", onClick: () => setMode("create") }}
          />
        ))}

      <ol className="flex flex-col gap-3">
        {data?.items.map((r, i) => {
          const medal = sort === "score" && i < 3;
          const shownTags = r.top_tags.slice(0, 2);
          const moreTags = r.top_tags.length - shownTags.length;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  select({ type: "restaurant", id: r.id });
                  useDbNavStore.getState().focusOn(r);
                }}
                aria-label={`${i + 1}위 ${r.name}, ${r.category}, ${
                  r.rating_avg !== null ? `별점 ${r.rating_avg.toFixed(1)}, 후기 ${r.review_count}개` : "아직 후기 없음"
                }${r.distance_m !== null ? `, ${formatDistance(r.distance_m)}` : ""}`}
                className="press flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-100 transition hover:shadow-sm hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <span
                  aria-hidden
                  className={cx(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
                    medal ? "bg-sun-400 text-brand-900 shadow-sm shadow-sun-500/40" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl"
                  aria-hidden
                >
                  {CATEGORY_EMOJI[r.category] ?? "🍽️"}
                </span>
                <span className="min-w-0 flex-1" aria-hidden>
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-slate-900">{r.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{r.category}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-600">
                    {r.rating_avg !== null ? (
                      <>
                        <Stars value={r.rating_avg} size="text-xs" />
                        <b className="text-slate-800">{r.rating_avg.toFixed(1)}</b>
                        <span className="text-slate-500">({r.review_count})</span>
                      </>
                    ) : (
                      <span className="text-slate-500">아직 후기 없음</span>
                    )}
                    {r.distance_m !== null && <span className="text-slate-500">· {formatDistance(r.distance_m)}</span>}
                  </span>
                  {shownTags.length > 0 && (
                    <span className="mt-1 flex flex-nowrap gap-1 overflow-hidden whitespace-nowrap">
                      {shownTags.map((t) => (
                        <Tag key={t} tone="yellow">
                          #{t}
                        </Tag>
                      ))}
                      {moreTags > 0 && <Tag tone="gray">+{moreTags}</Tag>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default RestaurantPanel;
