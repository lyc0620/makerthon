// 패널에서 같이 쓰는 입력 조각이에요.
// - Segmented: 하나만 고르는 버튼 묶음 (role=radiogroup, 화살표 키로 옮겨 다닐 수 있어요)
// - FadeRow: 옆으로 밀리는 칩 줄. 오른쪽에 더 있으면 끝을 흐리게 해서 "밀어 보세요"를 알려 줘요.
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** 화면 읽기 프로그램용 이름 (label이 글자가 아닐 때) */
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
  size = "md",
  fit = false,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  /** 묶음 이름 (예: "정렬") */
  label: string;
  className?: string;
  size?: "sm" | "md";
  /** true면 내용 폭만큼만 차지해요 (기본은 줄 전체) */
  fit?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | null = null;
    if (e.key in keys) next = (idx + keys[e.key] + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cx(fit ? "w-fit" : "w-full", "flex gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/70", className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex flex-1 items-center justify-center gap-1 rounded-lg font-semibold whitespace-nowrap transition",
              size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              on ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const FADE = 28;

/** 가로로 밀리는 줄. 오른쪽(또는 왼쪽)에 더 있으면 가장자리를 흐리게 해요. */
export function FadeRow({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** 줄 이름 (예: "카테고리") */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  const left = edges.left ? `transparent, black ${FADE}px` : "black, black";
  const right = edges.right ? `black calc(100% - ${FADE}px), transparent` : "black, black";
  const mask = `linear-gradient(to right, ${left}, ${right})`;
  const style: CSSProperties = { maskImage: mask, WebkitMaskImage: mask };

  return (
    <div
      ref={ref}
      role={label ? "group" : undefined}
      aria-label={label}
      style={style}
      className={cx("no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5", className)}
    >
      {children}
    </div>
  );
}
