// ⚠️ 임시(THROWAWAY) 개발용 첫 소개 카드예요. 통합 때 앱 껍데기 쪽으로 옮기거나 버려요.
// 처음 들어오면 맛집 · 경찰 제보 · 밥친구를 3장으로 소개해요.
// 모바일은 아래 카드, 데스크톱은 가운데 창이에요. 밀기(스와이프)·화살표 키로 넘기고, Esc로 닫아요.
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Button, cx } from "../components/db/ui";
import { useDbNavStore } from "../store/db";

const STORAGE_KEY = "hp-onboarding-v1";

const CARDS = [
  {
    tab: "restaurant",
    icon: "🍜",
    title: "맛집",
    body: "학생들이 직접 남긴 별점으로 순위를 매겨요",
    tint: "from-brand-100 to-brand-50",
  },
  {
    tab: "report",
    icon: "🚨",
    title: "경찰 제보",
    body: "킥보드 타기 전에 단속 구역을 확인해요",
    tint: "from-sun-200 to-sun-50",
  },
  {
    tab: "meetup",
    icon: "🍚",
    title: "밥친구",
    body: "지금 밥 먹을 사람을 지도에서 찾아요",
    tint: "from-brand-100 to-sun-50",
  },
] as const;

/** 이미 소개를 봤는지. 저장소를 못 쓰면(사생활 보호 모드 등) 안 본 걸로 쳐요. */
export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // 저장이 안 돼도 소개는 잘 닫혀요. 다음에 다시 보일 뿐이에요.
  }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const setTab = useDbNavStore((s) => s.setTab);
  const dialogRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const card = CARDS[index];
  const last = index === CARDS.length - 1;

  // 열 때 누르던 버튼을 기억했다가, 닫으면 그 버튼으로 포커스를 돌려줘요.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const close = () => {
    markSeen();
    onClose();
  };
  const go = (i: number) => setIndex(Math.max(0, Math.min(CARDS.length - 1, i)));
  const next = () => {
    if (last) {
      setTab(card.tab);
      close();
    } else go(index + 1);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Tab") {
      // 포커스가 소개 창 밖으로 나가지 않게 가둬요.
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-brand-900/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:items-center md:p-6"
      onPointerDown={(e) => {
        // 바깥(어두운 곳)을 누르면 닫아요.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
        className="sheet-fade w-full max-w-sm overflow-hidden rounded-card bg-white shadow-float"
      >
        <div
          className={cx("touch-pan-y bg-linear-to-b px-6 pt-8 pb-6 text-center select-none", card.tint)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          <p className="text-[11px] font-semibold text-brand-700">
            현풍 지도 둘러보기 · {index + 1}/{CARDS.length}
          </p>
          <div key={index} className="sheet-fade">
            <div className="mt-4 text-6xl" aria-hidden>
              {card.icon}
            </div>
            <h2 id={titleId} className="mt-4 text-lg font-extrabold text-brand-900">
              {card.title}
            </h2>
            <p id={bodyId} className="text-balance mt-1.5 text-sm font-medium text-slate-700">
              {card.body}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 pt-4" role="group" aria-label="소개 카드 고르기">
          {CARDS.map((c, i) => (
            <button
              key={c.tab}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1}번째 소개: ${c.title}`}
              aria-current={i === index ? "step" : undefined}
              className={cx(
                "h-2 rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                i === index ? "w-6 bg-brand-600" : "w-2 bg-brand-200 hover:bg-brand-300",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 px-4 pt-4 pb-4">
          <Button variant="ghost" onClick={close} className="text-slate-600">
            건너뛰기
          </Button>
          <Button data-autofocus variant={last ? "accent" : "primary"} className="ml-auto min-w-28" onClick={next}>
            {last ? "시작하기" : "다음"}
          </Button>
        </div>
      </div>
    </div>
  );
}
