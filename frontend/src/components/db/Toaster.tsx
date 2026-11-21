// DB 파트 토스트(작은 알림)를 화면 위에 띄워요.
// 통합 때 앱 어딘가에 <DbToaster /> 하나만 두면 돼요.
// 자리: 모바일은 떠 있는 머리말 바로 아래(--hp-header-h), 데스크톱은 왼쪽 패널(420px)을 뺀 지도 영역 위 가운데예요.
// 토스트에 action이 있으면 "보기" 같은 작은 버튼이 붙어요. (닫는 시간은 store가 정하고, 여기선 남은 시간 막대만 그려요)
import { useToastStore } from "../../store/db";
import { cx } from "./ui";

export function DbToaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--hp-header-h,4rem)+0.5rem)] z-50 flex flex-col items-center gap-2 px-4 md:top-4 md:left-[420px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "toast-in pointer-events-auto relative flex max-w-sm items-center gap-2 overflow-hidden rounded-2xl py-2.5 pr-1.5 pl-4 text-sm font-semibold shadow-float ring-1",
            t.tone === "success" && "bg-brand-600 text-white ring-brand-700",
            t.tone === "error" && "bg-white text-rose-800 ring-rose-200",
            t.tone === "info" && "bg-sun-300 text-brand-900 ring-sun-400",
          )}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className={cx(
                "shrink-0 rounded-full px-3 py-1 text-xs font-bold transition",
                "focus-visible:outline-2 focus-visible:outline-offset-1",
                t.tone === "success"
                  ? "bg-white text-brand-700 hover:bg-brand-50 focus-visible:outline-white"
                  : "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-500",
              )}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="닫기"
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none transition",
              "focus-visible:outline-2 focus-visible:outline-offset-1",
              t.tone === "success"
                ? "text-white/85 hover:bg-white/15 focus-visible:outline-white"
                : "text-slate-600 hover:bg-black/5 focus-visible:outline-brand-500",
            )}
          >
            <span aria-hidden>×</span>
          </button>
          <span
            aria-hidden
            className={cx(
              "toast-progress absolute inset-x-0 bottom-0 h-0.5",
              t.tone === "success" ? "bg-white/50" : t.tone === "error" ? "bg-rose-300" : "bg-brand-600/40",
            )}
            style={{ animationDuration: `${t.ms}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
