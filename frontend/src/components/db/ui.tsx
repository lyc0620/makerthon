// DB 파트 화면(패널·시트)에서 같이 쓰는 작은 UI 조각이에요.
// 통합 때 공통 컴포넌트(src/components/)가 생기면 그쪽으로 바꿔도 돼요.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

type Variant = "primary" | "accent" | "ghost" | "outline" | "danger";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-100",
  accent:
    "bg-sun-400 text-brand-900 hover:bg-sun-500 shadow-sm shadow-sun-500/30 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-100",
  ghost: "bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-slate-400 disabled:hover:bg-transparent",
  outline:
    "bg-white text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:ring-slate-200 disabled:hover:bg-slate-50",
  danger:
    "bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:ring-slate-200 disabled:hover:bg-slate-50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 motion-reduce:active:scale-100",
        sizes[size],
        VARIANT[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium whitespace-nowrap transition duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-brand-50 hover:ring-brand-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "yellow" | "gray" }) {
  const tones = {
    blue: "bg-brand-50 text-brand-700",
    yellow: "bg-sun-100 text-amber-900",
    gray: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Stars({ value, size = "text-sm" }: { value: number | null; size?: string }) {
  const v = value ?? 0;
  return (
    <span role="img" className={cx("inline-flex tracking-tight", size)} aria-label={`별점 ${v.toFixed(1)}점`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(v) ? "text-sun-500" : "text-slate-300"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="별점 고르기">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i}점`}
          onClick={() => onChange(i)}
          className={cx(
            "rounded-md text-3xl leading-none transition duration-150 hover:scale-110 active:scale-95 motion-reduce:hover:scale-100",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
            i <= value ? "text-sun-500" : "text-slate-300",
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <span
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      aria-hidden
    />
  );
}

export function Loading({ label = "불러오는 중이에요…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
      <Spinner className="size-4 text-brand-500" />
      {label}
    </div>
  );
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  /** 빈 화면에서 바로 할 수 있는 일 (예: "첫 리뷰 남기기") */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-slate-50 px-4 py-8 text-center">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="text-balance font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-balance text-sm text-slate-600">{hint}</p>}
      {action && (
        <Button size="sm" className="mt-3" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    // rose-800(#9f1239) on rose-50(#fff1f2) ≈ 7.8:1 이라 글자가 잘 읽혀요.
    <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
      <span aria-hidden>⚠️</span>
      <div className="min-w-0 flex-1">{message}</div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <span aria-hidden>↻</span>
          다시 시도
        </Button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "yellow" }) {
  return (
    <div
      className={cx(
        "rounded-xl px-3 py-2.5 text-sm",
        tone === "blue" ? "bg-brand-50 text-brand-800" : "bg-sun-50 text-amber-900 ring-1 ring-inset ring-sun-300",
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-bold text-slate-800">{children}</h3>
      {right}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none";

/** 0~1 신뢰도 막대 */
export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = pct >= 66 ? "bg-brand-600" : pct >= 40 ? "bg-sun-400" : "bg-slate-400";
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
