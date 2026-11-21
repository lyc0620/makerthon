// "맛집 추천" 폼이에요. (RestaurantPanel 안에서 열려요)
// 1단계: 카카오 장소 검색(서버 프록시)으로 가게를 고르고,
//        검색이 안 되면(UPSTREAM_ERROR) 지도에서 직접 위치를 찍어요.
// 2단계: 첫 후기(별점·내용·태그)를 쓰고 등록해요.
// 이미 있는 가게면(409 CONFLICT) 그 가게를 열어서 후기를 남기도록 안내해요.
import { useDeferredValue, useState } from "react";
import { errorMessage, isApiError } from "../api/clientDb";
import { useCreateRestaurant, usePlaceSearch } from "../api/hooks/db";
import { RESTAURANT_CATEGORIES, RESTAURANT_TAGS } from "../api/types.db";
import type { PlaceSearchItem, RestaurantCategory, RestaurantTag } from "../api/types.db";
import { Button, Chip, ErrorBox, Field, Notice, Spinner, StarInput, cx, inputClass } from "../components/db/ui";
import { describeFromCampus, guessCategory } from "../lib/dbFormat";
import { toast, useAuthStore, useCancelPickOnUnmount, usePickStore } from "../store/db";

interface Draft {
  name: string;
  category: RestaurantCategory;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  kakao_place_id: string | null;
  description: string;
}

const EMPTY: Draft = {
  name: "",
  category: "한식",
  lat: null,
  lng: null,
  address: null,
  phone: null,
  kakao_place_id: null,
  description: "",
};

export function RecommendForm({
  onCancel,
  onDone,
  onOpenExisting,
}: {
  onCancel: () => void;
  onDone: (id: string) => void;
  onOpenExisting: (id: string) => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [step, setStep] = useState<"search" | "details">("search");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<RestaurantTag[]>([]);
  const create = useCreateRestaurant();
  const pick = usePickStore();
  useCancelPickOnUnmount();

  if (!token) {
    return (
      <div className="space-y-3">
        <BackHeader title="맛집 추천" onBack={onCancel} />
        <Notice>맛집을 추천하려면 위쪽에서 닉네임으로 먼저 로그인해 주세요.</Notice>
      </div>
    );
  }

  const choosePlace = (p: PlaceSearchItem) => {
    if (p.already_registered_id) return onOpenExisting(p.already_registered_id);
    setDraft({
      ...EMPTY,
      name: p.name.slice(0, 40), // 서버는 가게 이름을 40자까지 받아요
      category: guessCategory(p.category_hint),
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      phone: p.phone,
      kakao_place_id: p.kakao_place_id,
    });
    setStep("details");
  };

  const pickOnMap = () => {
    pick.start("가게 위치를 지도에서 눌러 주세요", (pt) => {
      setDraft((d) => ({ ...d, lat: pt.lat, lng: pt.lng }));
      setStep("details");
    });
  };

  const manual = () => {
    setDraft(EMPTY);
    setStep("details");
  };

  const conflictId =
    isApiError(create.error) && create.error.code === "CONFLICT"
      ? (create.error.details?.restaurant_id as string | undefined)
      : undefined;

  const valid =
    draft.name.trim().length > 0 &&
    draft.lat !== null &&
    draft.lng !== null &&
    rating >= 1 &&
    content.trim().length >= 5 &&
    content.trim().length <= 500;

  const submit = () => {
    if (draft.lat === null || draft.lng === null) return;
    create.mutate(
      {
        name: draft.name.trim(),
        category: draft.category,
        lat: draft.lat,
        lng: draft.lng,
        address: draft.address,
        phone: draft.phone,
        kakao_place_id: draft.kakao_place_id,
        description: draft.description.trim() || null,
        first_review: { rating, content: content.trim(), tags },
      },
      {
        onSuccess: (r) => {
          toast(`'${r.name}'을(를) 추천했어요. 고마워요!`, "success");
          onDone(r.id);
        },
      },
    );
  };

  if (step === "search") {
    return (
      <div className="space-y-3">
        <BackHeader title="맛집 추천 · 가게 찾기" onBack={onCancel} />
        <PlaceSearch onChoose={choosePlace} onPickOnMap={pickOnMap} onManual={manual} />
        {pick.label && <Notice tone="yellow">🗺️ {pick.label} (지도를 눌러요)</Notice>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackHeader title="맛집 추천 · 첫 후기" onBack={() => setStep("search")} />

      <Field label="가게 이름">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={40}
          placeholder="예) 든든국밥"
          className={inputClass}
        />
      </Field>

      <Field label="종류">
        <div className="flex flex-wrap gap-1.5">
          {RESTAURANT_CATEGORIES.map((c) => (
            <Chip key={c} active={draft.category === c} onClick={() => setDraft({ ...draft, category: c })}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="위치">
        <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
          <span className="flex-1 text-sm text-slate-700">
            {draft.lat !== null && draft.lng !== null ? (
              <>📍 {draft.address ?? describeFromCampus({ lat: draft.lat, lng: draft.lng })}</>
            ) : (
              <span className="text-slate-400">아직 위치를 고르지 않았어요</span>
            )}
          </span>
          <Button size="sm" variant="outline" onClick={pickOnMap}>
            {pick.label ? "지도를 눌러요…" : "지도에서 찍기"}
          </Button>
        </div>
      </Field>

      <Field label="한 줄 소개 (선택)">
        <input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          maxLength={200}
          placeholder="예) 정문에서 걸어서 5분, 혼밥하기 좋아요"
          className={inputClass}
        />
      </Field>

      <div className="space-y-3 rounded-2xl bg-brand-50/60 p-3 ring-1 ring-inset ring-brand-100">
        <p className="text-sm font-semibold text-brand-900">첫 후기 (꼭 남겨 주세요)</p>
        <StarInput value={rating} onChange={setRating} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="5자 이상 적어 주세요"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-1.5">
          {RESTAURANT_TAGS.map((t) => (
            <Chip
              key={t}
              active={tags.includes(t)}
              onClick={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
            >
              #{t}
            </Chip>
          ))}
        </div>
      </div>

      {conflictId ? (
        <div className="space-y-2 rounded-2xl bg-sun-50 p-3 ring-1 ring-sun-300">
          <p className="text-sm font-semibold text-amber-900">이미 등록된 가게예요. 그 가게에 후기를 남겨 주세요!</p>
          <Button variant="accent" className="w-full" onClick={() => onOpenExisting(conflictId)}>
            등록된 가게 열기
          </Button>
        </div>
      ) : (
        create.error && <ErrorBox message={errorMessage(create.error)} />
      )}

      <Button size="lg" className="w-full" disabled={!valid} loading={create.isPending} onClick={submit}>
        추천 올리기
      </Button>
    </div>
  );
}

function PlaceSearch({
  onChoose,
  onPickOnMap,
  onManual,
}: {
  onChoose: (p: PlaceSearchItem) => void;
  onPickOnMap: () => void;
  onManual: () => void;
}) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const { data, error, isFetching, refetch } = usePlaceSearch(deferred);
  const upstreamDown = isApiError(error) && error.code === "UPSTREAM_ERROR";

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="가게 이름을 검색해요 (예: 국밥)"
          aria-label="가게 검색"
          className={inputClass}
        />
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-brand-500" />}
      </div>

      {upstreamDown && (
        <div className="space-y-2 rounded-2xl bg-sun-50 p-3 ring-1 ring-sun-300">
          <p className="text-sm text-amber-900">
            지금은 장소 검색을 쓸 수 없어요. 지도에서 가게 위치를 직접 찍어 주세요.
          </p>
          <Button variant="accent" className="w-full" onClick={onPickOnMap}>
            🗺️ 지도에서 직접 찍기
          </Button>
        </div>
      )}
      {error && !upstreamDown && <ErrorBox message={errorMessage(error)} onRetry={() => refetch()} />}

      {data && data.items.length === 0 && (
        <p className="py-2 text-center text-sm text-slate-500">검색 결과가 없어요.</p>
      )}
      <ul className="space-y-1.5">
        {data?.items.map((p) => (
          <li key={p.kakao_place_id}>
            <button
              type="button"
              onClick={() => onChoose(p)}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-white p-3 text-left ring-1 ring-slate-100 hover:ring-brand-300"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{p.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[p.category_hint, p.address].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span
                className={cx(
                  "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
                  p.already_registered_id ? "bg-sun-100 text-amber-900" : "bg-brand-50 text-brand-700",
                )}
              >
                {p.already_registered_id ? "이미 있어요 → 후기" : "선택"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!upstreamDown && (
        <button type="button" onClick={onManual} className="w-full py-2 text-center text-sm font-semibold text-brand-700 hover:underline">
          목록에 없어요 · 직접 입력하고 지도에서 찍을게요
        </button>
      )}
    </div>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
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
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
    </div>
  );
}
