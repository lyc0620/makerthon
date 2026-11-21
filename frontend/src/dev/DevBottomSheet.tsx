// ⚠️ 임시(THROWAWAY) 개발용 바텀시트예요. 통합 때 버려요!
// 진짜 바텀시트는 lyc0620님의 src/components/BottomSheet 예요.
// 손잡이나 탭 줄(header)을 위아래로 끌면 낮게 / 중간 / 높게 세 단계로 멈춰요.
// 빠르게 휙 밀면 한 단계만 움직이고, 손잡이를 누르면 다음 단계로 바뀌어요.
// 키보드: ↑/↓ 한 단계, Home 낮게, End 높게.
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cx } from "../components/db/ui";

const SNAP_LABELS = ["낮게", "중간", "높게"] as const;
/** 낮게 = 탭 줄 + 한 줄 정도 보이는 높이 (아래 안전 영역은 따로 더해요) */
export const PEEK_PX = 132;
/** 이만큼 빨리(px/ms) 밀면 가까운 단계 대신 한 단계 움직여요. */
const FLICK_SPEED = 0.5;
const DRAG_START_PX = 6;

/** 화면 높이를 계속 따라가요. (돌리기·주소창·키보드) */
function useViewportHeight() {
  const read = () => (typeof window === "undefined" ? 800 : (window.visualViewport?.height ?? window.innerHeight));
  const [vh, setVh] = useState(read);
  useEffect(() => {
    const on = () => setVh(read());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    window.visualViewport?.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
      window.visualViewport?.removeEventListener("resize", on);
    };
  }, []);
  return vh;
}

/** env(safe-area-inset-bottom)를 px로 읽어요. */
function useSafeBottom() {
  const [px, setPx] = useState(0);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    setPx(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    probe.remove();
  }, []);
  return px;
}

export function DevBottomSheet({
  children,
  header,
  snap,
  onSnapChange,
  onHeightChange,
  topInset = 64,
}: {
  children: ReactNode;
  /** 시트 위쪽에 붙어 있는 영역(예: 탭 줄). 여기서도 끌어서 높이를 바꿀 수 있어요. */
  header?: ReactNode;
  snap: number;
  onSnapChange: (i: number) => void;
  /** 멈춘 시트 높이(px)가 바뀌면 알려 줘요. 지도가 시트에 가리지 않게 여백을 줄 때 써요. */
  onHeightChange?: (px: number) => void;
  /** 떠 있는 머리말 높이(px). 높게 올려도 머리말을 덮지 않아요. */
  topInset?: number;
}) {
  const vh = useViewportHeight();
  const safeBottom = useSafeBottom();
  const peek = PEEK_PX + safeBottom;
  const full = Math.max(peek + 80, vh - topInset - 8);
  const snaps = [peek, Math.min(full, Math.max(peek + 40, vh * 0.5)), full];

  const [dragH, setDragH] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const drag = useRef<{
    y: number;
    h: number;
    snap: number;
    moved: boolean;
    captured: boolean;
    lastY: number;
    lastT: number;
    v: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const current = Math.min(Math.max(snap, 0), snaps.length - 1);
  const baseH = snaps[current];
  const height = dragH ?? baseH;

  useEffect(() => {
    onHeightChange?.(Math.round(baseH));
    // onHeightChange는 보통 setState라 매번 같아요. 높이가 바뀔 때만 알려요.
  }, [baseH]);

  const setSnap = (i: number) => onSnapChange(Math.max(0, Math.min(snaps.length - 1, i)));

  const begin = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = {
      y: e.clientY,
      h: baseH,
      snap: current,
      moved: false,
      captured: false,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
    };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY; // 위로 끌면 +
    if (!d.moved && Math.abs(dy) < DRAG_START_PX) return;
    if (!d.captured) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      d.captured = true;
    }
    d.moved = true;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragH(Math.min(full + 16, Math.max(peek - 40, d.h + dy)));
  };
  const end = (e: ReactPointerEvent, tapCycles: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // 손잡이를 그냥 누르면 다음 단계로 (탭 줄은 버튼을 누른 거라 그대로 둬요)
      if (tapCycles) setSnap((current + 1) % snaps.length);
      return;
    }
    suppressClick.current = true;
    const h = dragH ?? d.h + (d.y - e.clientY);
    if (Math.abs(d.v) > FLICK_SPEED) {
      setSnap(d.snap + (d.v > 0 ? 1 : -1));
    } else {
      let best = 0;
      snaps.forEach((v, i) => {
        if (Math.abs(v - h) < Math.abs(snaps[best] - h)) best = i;
      });
      setSnap(best);
    }
    setDragH(null);
  };
  const cancel = () => {
    drag.current = null;
    setDragH(null);
  };
  // 끌고 난 뒤 손을 뗀 자리의 버튼이 눌리지 않게 막아요.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className={cx(
        "fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-[#f8fafe] shadow-[0_-8px_30px_rgba(13,42,85,0.15)]",
        dragH === null && "transition-[height] duration-[250ms] ease-out motion-reduce:transition-none",
      )}
      style={{ height }}
    >
      <div
        className={cx(
          "relative z-10 shrink-0 rounded-t-3xl bg-[#f8fafe] transition-shadow",
          scrolled && "shadow-[0_6px_12px_-8px_rgba(13,42,85,0.25)]",
        )}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="시트 높이"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={snaps.length - 1}
          aria-valuenow={current}
          aria-valuetext={SNAP_LABELS[current]}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={(e) => end(e, true)}
          onPointerCancel={cancel}
          onKeyDown={(e) => {
            const keys: Record<string, number> = {
              ArrowUp: current + 1,
              ArrowRight: current + 1,
              ArrowDown: current - 1,
              ArrowLeft: current - 1,
              Home: 0,
              End: snaps.length - 1,
              Enter: (current + 1) % snaps.length,
              " ": (current + 1) % snaps.length,
            };
            if (e.key in keys) {
              e.preventDefault();
              setSnap(keys[e.key]);
            }
          }}
          className="flex cursor-grab touch-none justify-center rounded-t-3xl pt-2.5 pb-2 active:cursor-grabbing focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
        </div>
        {header && (
          <div
            className="touch-none px-4 pb-2"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={(e) => end(e, false)}
            onPointerCancel={cancel}
            onClickCapture={onClickCapture}
          >
            {header}
          </div>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
      >
        {children}
      </div>
    </div>
  );
}
