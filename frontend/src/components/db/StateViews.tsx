// 목록·시트가 "불러오는 중 / 비어 있음 / 실패" 상태일 때 보여 주는 화면이에요.
// - 스켈레톤은 실제 카드와 같은 모양이라, 데이터가 와도 화면이 덜컹거리지 않아요.
//   (.skeleton 반짝임은 index.css에 있어요. 없을 때도 bg-slate-100 회색 상자로 보여요)
// - 빈 화면에는 늘 "다음에 할 일" 버튼을 하나 붙여요.
import type { ReactNode } from "react";
import { cx } from "./ui";

function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block rounded-md bg-slate-100", className)} />;
}

export type SkeletonShape = "restaurant" | "report" | "meetup";

/** 목록 카드 모양 스켈레톤 */
export function ListSkeleton({
  rows = 3,
  shape = "restaurant",
  label = "불러오는 중이에요…",
}: {
  rows?: number;
  shape?: SkeletonShape;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          {shape === "restaurant" && (
            <>
              <Bone className="size-6 rounded-full" />
              <Bone className="size-11 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Bone className="h-4 w-2/3" />
                <Bone className="h-3 w-1/2" />
                <div className="flex gap-1.5">
                  <Bone className="h-4 w-12" />
                  <Bone className="h-4 w-12" />
                  <Bone className="h-4 w-10" />
                </div>
              </div>
            </>
          )}
          {shape === "report" && (
            <>
              <Bone className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex gap-2">
                  <Bone className="h-4 w-1/3" />
                  <Bone className="h-4 w-10" />
                </div>
                <Bone className="h-2 w-full rounded-full" />
                <Bone className="h-3 w-1/2" />
              </div>
            </>
          )}
          {shape === "meetup" && (
            <>
              <Bone className="h-12 w-14 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Bone className="h-4 w-3/4" />
                <Bone className="h-3 w-1/2" />
                <div className="flex -space-x-1.5">
                  <Bone className="size-6 rounded-full ring-2 ring-white" />
                  <Bone className="size-6 rounded-full ring-2 ring-white" />
                  <Bone className="size-6 rounded-full ring-2 ring-white" />
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** 상세 시트 스켈레톤: 머리 + 숫자 줄 + 카드 두 장 */
export function SheetSkeleton({ label = "불러오는 중이에요…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4 p-4">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <Bone className="size-14 rounded-2xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-5 w-2/3" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 rounded-xl bg-white p-3 ring-1 ring-slate-100">
            <Bone className="h-5 w-10" />
            <Bone className="h-3 w-12" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <Bone className="h-4 w-1/3" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** 채팅 말풍선 모양 스켈레톤 */
export function ChatSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2 py-2">
      <span className="sr-only">대화를 불러오는 중이에요…</span>
      <Bone className="h-8 w-2/3 rounded-2xl" />
      <Bone className="ml-auto h-8 w-1/2 rounded-2xl" />
      <Bone className="h-8 w-3/5 rounded-2xl" />
    </div>
  );
}

export interface EmptyAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

/** 비어 있을 때 — 아이콘, 한 줄 제목, 도움말, 그리고 다음에 할 일 버튼 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: EmptyAction;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-1.5 rounded-2xl bg-brand-50/60 px-4 py-7 text-center ring-1 ring-brand-100",
        className,
      )}
    >
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="font-bold text-balance text-slate-800">{title}</p>
      {hint && <p className="text-sm text-balance text-slate-600">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="press mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {action.icon && <span aria-hidden>{action.icon}</span>}
          {action.label}
        </button>
      )}
    </div>
  );
}

/** 불러오기 실패 — 왜 그런지 한 줄 + 다시 시도 버튼 */
export function ErrorState({
  message,
  onRetry,
  retrying,
  className,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx("flex flex-col items-center gap-1.5 rounded-2xl bg-rose-50 px-4 py-6 text-center", className)}
    >
      <div className="text-2xl" aria-hidden>
        😵
      </div>
      <p className="font-bold text-rose-900">{message}</p>
      <p className="text-sm text-balance text-rose-800">서버가 잠깐 쉬고 있어요. 잠시 뒤 다시 눌러 주세요.</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying || undefined}
          className="press mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-rose-800 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
        >
          <span aria-hidden>↻</span>
          {retrying ? "다시 불러오는 중…" : "다시 시도"}
        </button>
      )}
    </div>
  );
}
