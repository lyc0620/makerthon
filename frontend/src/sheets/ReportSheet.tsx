// 제보 상세 시트 — 설명, 몇 분 전, 신뢰도 막대, "아직 있어요 / 없어졌어요" 투표.
// 투표하면 버튼이 눌린 모양으로 바뀌고, 아래에 "고마워요" 한 줄이 떠요.
import { useState } from "react";
import { errorMessage } from "../api/clientDb";
import { useReport, useVoteReport } from "../api/hooks/db";
import type { VoteValue } from "../api/types.db";
import { ErrorState, SheetSkeleton } from "../components/db/StateViews";
import { ConfidenceBar, Notice, Spinner, cx } from "../components/db/ui";
import { describeFromCampus, formatTime, minutesUntil, timeAgo } from "../lib/dbFormat";
import { toast, useAuthStore } from "../store/db";

const TYPE_LABEL = { police: "경찰 단속·순찰", dark_road: "어두운 길", hazard: "공사·위험" } as const;

export function ReportSheet({ id }: { id: string }) {
  const { data: r, isLoading, isFetching, error, refetch } = useReport(id);
  const vote = useVoteReport();
  const token = useAuthStore((s) => s.token);
  /** 이번에 막 투표했는지 (고마워요 문구용) */
  const [thankedId, setThankedId] = useState<string | null>(null);

  if (isLoading) return <SheetSkeleton label="제보를 불러오는 중이에요…" />;
  if (error || !r)
    return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  const left = minutesUntil(r.expires_at);
  const thanked = thankedId === r.id;
  const onVote = (v: VoteValue) => {
    if (!token) return toast("먼저 닉네임으로 로그인해 주세요.", "info");
    vote.mutate(
      { id: r.id, vote: v },
      {
        onSuccess: (res) => {
          setThankedId(r.id);
          toast(
            v === "confirm"
              ? "확인해 줘서 고마워요! 15분 더 보여요."
              : res.is_active
                ? "알려 줘서 고마워요."
                : "제보를 내렸어요. 고마워요!",
            "success",
          );
        },
        onError: (e) => toast(errorMessage(e), "error"),
      },
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl" aria-hidden>
          🚨
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-slate-900">{TYPE_LABEL[r.type]}</h2>
          <p className="mt-0.5 text-sm font-medium text-balance text-slate-500">
            {timeAgo(r.created_at)} 제보 · {describeFromCampus(r)}
          </p>
        </div>
      </header>

      <p className={cx("rounded-2xl p-3 text-sm leading-relaxed", r.description ? "bg-white text-slate-800 ring-1 ring-slate-100" : "bg-slate-50 text-slate-500")}>
        {r.description ?? "설명 없이 올라온 제보예요."}
      </p>

      {!r.is_active && <Notice tone="yellow">이미 내려간 제보예요. (시간이 지났거나 &lsquo;없어졌어요&rsquo;가 많았어요)</Notice>}

      <section className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-slate-800">믿을 만한 정도</span>
          <span className="text-2xl font-extrabold text-brand-700">{Math.round(r.confidence * 100)}%</span>
        </div>
        <ConfidenceBar value={r.confidence} className="h-3" />
        <dl className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
          <div className="rounded-xl bg-brand-50 py-2">
            <dt className="text-slate-500">아직 있어요</dt>
            <dd className="text-lg font-bold text-brand-700">{r.confirm_count}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 py-2">
            <dt className="text-slate-500">없어졌어요</dt>
            <dd className="text-lg font-bold text-slate-700">{r.deny_count}</dd>
          </div>
          <div className="rounded-xl bg-sun-50 py-2">
            <dt className="text-slate-500">마지막 확인</dt>
            <dd className="text-sm font-bold text-slate-800">{timeAgo(r.last_confirmed_at)}</dd>
          </div>
        </dl>
        {r.is_active && (
          <p className="text-xs text-slate-500">
            {left > 0 ? `${left}분 뒤(${formatTime(r.expires_at)})에 자동으로 사라져요.` : "곧 사라져요."}
          </p>
        )}
      </section>

      {r.is_active && (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate-700">지금도 그 자리에 있나요?</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["confirm", "👀", "아직 있어요", "bg-brand-600 text-white shadow-inner shadow-brand-900/30"],
                ["deny", "👋", "없어졌어요", "bg-sun-400 text-brand-900 shadow-inner shadow-sun-600/30"],
              ] as const
            ).map(([v, icon, label, onCls]) => {
              const voted = r.my_vote === v;
              const busy = vote.isPending && vote.variables?.vote === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={voted}
                  aria-disabled={voted || vote.isPending || undefined}
                  onClick={() => {
                    if (!voted && !vote.isPending) onVote(v);
                  }}
                  className={cx(
                    "press flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold transition",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                    voted
                      ? onCls
                      : "bg-white text-brand-700 ring-2 ring-inset ring-brand-200 hover:bg-brand-50 hover:ring-brand-400",
                  )}
                >
                  {busy ? (
                    <Spinner className="size-5" />
                  ) : (
                    <span
                      aria-hidden
                      className={cx(
                        "flex size-8 items-center justify-center rounded-full text-lg",
                        voted ? "bg-white/30" : "bg-brand-50",
                      )}
                    >
                      {voted ? "✅" : icon}
                    </span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          <p
            aria-live="polite"
            className={cx(
              "mt-2 text-center text-xs",
              thanked || r.my_vote ? "font-semibold text-brand-700" : "text-slate-500",
            )}
          >
            {thanked
              ? "고마워요! 덕분에 다른 친구들이 안전하게 다녀요 🙌"
              : r.my_vote
                ? `내 표: ${r.my_vote === "confirm" ? "아직 있어요" : "없어졌어요"} · 다른 쪽을 누르면 바꿀 수 있어요`
                : "'아직 있어요'는 15분 더 보이게, '없어졌어요'가 많으면 바로 내려가요."}
          </p>
        </section>
      )}

      <p className="text-center text-xs text-slate-500">제보한 사람은 공개되지 않아요. 안전 운행이 먼저예요 🛴</p>
    </div>
  );
}

export default ReportSheet;
