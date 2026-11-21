// ⚠️ 임시(THROWAWAY) 개발용 앱 껍데기예요. 통합 때 버려요!
// 진짜 앱 껍데기(탭·바텀시트·레이어 토글)는 lyc0620님 담당이에요.
// 여기서는 DB 파트 모듈(레이어·패널·시트·훅)이 잘 붙는지 혼자 확인하려고 써요.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { errorMessage } from "../api/clientDb";
import { useDevLogin, useLogout, usePresenceHeartbeat, useRealtime } from "../api/hooks/db";
import { PersonAvatar } from "../components/db/Avatar";
import { InviteToast } from "../components/db/InviteToast";
import { DbToaster } from "../components/db/Toaster";
import { Button, cx, inputClass } from "../components/db/ui";
import { MeetupPanel } from "../panels/MeetupPanel";
import { ReportPanel } from "../panels/ReportPanel";
import { RestaurantPanel } from "../panels/RestaurantPanel";
import { MeetupSheet } from "../sheets/MeetupSheet";
import { PresenceSheet } from "../sheets/PresenceSheet";
import { ReportSheet } from "../sheets/ReportSheet";
import { RestaurantSheet } from "../sheets/RestaurantSheet";
import { toast, useAuthStore, useDbNavStore, usePickStore, useSelectionStore } from "../store/db";
import { DevBottomSheet, PEEK_PX } from "./DevBottomSheet";
import { DevMap } from "./DevMap";
import { randomNickname } from "./nicknames";
import { hasSeenOnboarding, Onboarding } from "./Onboarding";

const TABS = [
  { key: "restaurant", label: "맛집", icon: "🍜" },
  { key: "report", label: "제보", icon: "🚨" },
  { key: "meetup", label: "밥친구", icon: "🍚" },
] as const;

function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/**
 * 모바일 떠 있는 머리말 높이를 재서 CSS 변수 --hp-header-h 로 알려 줘요.
 * 토스트·레이어 버튼·바텀시트가 이 값을 보고 머리말 아래에 자리 잡아요.
 */
function useHeaderHeight(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(64);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!enabled || !el) {
      root.style.removeProperty("--hp-header-h");
      return;
    }
    const update = () => {
      const px = Math.round(el.getBoundingClientRect().height);
      setH(px);
      root.style.setProperty("--hp-header-h", `${px}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--hp-header-h");
    };
  }, [enabled]);
  return { ref, height: h };
}

export function DevApp() {
  const desktop = useIsDesktop();
  const tab = useDbNavStore((s) => s.tab);
  const setTab = useDbNavStore((s) => s.setTab);
  const selected = useSelectionStore((s) => s.selected);
  const clear = useSelectionStore((s) => s.clear);
  const picking = usePickStore((s) => s.label);
  const token = useAuthStore((s) => s.token);
  // 로그인하면 토큰을 붙여 다시 연결해요 (실시간 위치·같이 먹자 알림).
  const { online, status } = useRealtime();
  // "지금 밥 먹을래요"가 켜져 있는 동안 1분마다 위치를 보내고, 시간이 되면 꺼요.
  usePresenceHeartbeat();
  const [snap, setSnap] = useState(1);
  const [sheetH, setSheetH] = useState(0);
  const header = useHeaderHeight(!desktop);
  // 처음 들어온 사람에게만 소개 카드를 보여 줘요. (저장소를 못 쓰면 매번 보여요)
  const [introOpen, setIntroOpen] = useState(() => !hasSeenOnboarding());

  // 무언가 고르면 모바일 시트를 중간 이상으로 올려요.
  useEffect(() => {
    if (selected && snap === 0) setSnap(1);
  }, [selected]);

  // 지도에서 위치를 찍는 동안은 모바일 시트를 낮게 내려서 지도가 보이게 해요.
  const [snapBeforePick, setSnapBeforePick] = useState<number | null>(null);
  useEffect(() => {
    if (picking && snapBeforePick === null) {
      setSnapBeforePick(snap);
      setSnap(0);
    } else if (!picking && snapBeforePick !== null) {
      setSnap(snapBeforePick);
      setSnapBeforePick(null);
    }
  }, [picking]);

  const content: ReactNode = selected ? (
    // --hp-sheet-sticky-top: 상세 시트의 작은 머리줄이 "← 목록으로" 줄을 덮지 않게 그 아래에 붙여요.
    <div style={{ "--hp-sheet-sticky-top": "2.75rem" } as CSSProperties}>
      {/* 길게 내려도 바로 돌아갈 수 있게 위에 붙어 있어요. */}
      <div className="sticky top-0 z-30 -mx-4 mb-3 flex h-11 items-center bg-[#f8fafe]/95 px-4 backdrop-blur">
        <button
          type="button"
          onClick={clear}
          className="press inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
        >
          <span aria-hidden>←</span> 목록으로
        </button>
      </div>
      {selected.type === "restaurant" && <RestaurantSheet id={selected.id} />}
      {selected.type === "report" && <ReportSheet id={selected.id} />}
      {selected.type === "meetup" && <MeetupSheet id={selected.id} />}
      {selected.type === "presence" && <PresenceSheet id={selected.id} />}
    </div>
  ) : (
    <>
      {tab === "restaurant" && <RestaurantPanel />}
      {tab === "report" && <ReportPanel />}
      {tab === "meetup" && <MeetupPanel />}
    </>
  );
  // 탭을 바꾸거나 상세를 열 때마다 살짝 페이드돼요.
  const animated = (
    <div key={`${tab}:${selected ? `${selected.type}-${selected.id}` : "list"}`} className="sheet-fade">
      {content}
    </div>
  );

  const tabBar = (
    <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1" aria-label="기능 탭">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-current={tab === t.key ? "page" : undefined}
          onClick={() => {
            setTab(t.key);
            clear();
          }}
          className={cx(
            "flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-sm font-bold transition duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
            tab === t.key ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-800",
          )}
        >
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-sun-300"
        aria-hidden
      >
        현
      </span>
      <span className="truncate font-extrabold text-brand-900">현풍 지도</span>
      <span className="shrink-0 rounded-md bg-sun-300 px-1.5 py-0.5 text-[10px] font-bold text-brand-900">DEV</span>
    </div>
  );

  const helpButton = (floating: boolean) => (
    <button
      type="button"
      onClick={() => setIntroOpen(true)}
      aria-label="현풍 지도 소개 다시 보기"
      title="소개 다시 보기"
      className={cx(
        "press flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-brand-700 transition hover:bg-brand-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        floating ? "bg-white/95 shadow-float" : "bg-slate-100",
      )}
    >
      ?
    </button>
  );

  const intro = introOpen && <Onboarding onClose={() => setIntroOpen(false)} />;

  // ── 데스크톱: 왼쪽 패널(머리말 + 탭 + 내용) + 오른쪽 지도 ──
  if (desktop) {
    return (
      <div className="flex h-full w-full overflow-hidden">
        <aside className="z-20 flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-[#f8fafe]">
          <header className="space-y-3 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              {brand}
              <span className="ml-auto flex items-center gap-1.5">
                <OnlineBadge online={online} status={status} floating={false} />
                {helpButton(false)}
                {token && <UserMenu floating={false} />}
              </span>
            </div>
            {!token && <LoginBox compact={false} />}
            {tabBar}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {animated}
          </div>
        </aside>
        <main className="relative min-w-0 flex-1">
          <DevMap />
        </main>
        <DbToaster />
        <InviteToast />
        {intro}
      </div>
    );
  }

  // ── 모바일: 전체 화면 지도 + 떠 있는 머리말(한 줄) + 바텀시트 ──
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <DevMap mobile sheetHeight={sheetH} peekHeight={PEEK_PX} />
      </div>
      <header
        ref={header.ref}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 space-y-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div className="flex items-center gap-1.5">
          <div className="pointer-events-auto shrink-0 rounded-2xl bg-white/95 px-3 py-2 shadow-float backdrop-blur">
            {brand}
          </div>
          <span className="pointer-events-auto shrink-0">
            <OnlineBadge online={online} status={status} floating />
          </span>
          <span className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5">
            {helpButton(true)}
            {token && <UserMenu floating />}
          </span>
        </div>
        {!token && (
          <div className="pointer-events-auto">
            <LoginBox compact />
          </div>
        )}
      </header>
      <DevBottomSheet
        snap={snap}
        onSnapChange={setSnap}
        onHeightChange={setSheetH}
        topInset={header.height}
        header={tabBar}
      >
        {animated}
      </DevBottomSheet>
      <DbToaster />
      <InviteToast />
      {intro}
    </div>
  );
}

function OnlineBadge({
  online,
  status,
  floating,
}: {
  online: number | null;
  status: string;
  floating: boolean;
}) {
  const live = status === "open";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        floating ? "bg-white/95 shadow-float" : "bg-slate-100",
        live ? "text-brand-800" : "text-slate-600",
      )}
      title={live ? "실시간 연결됨" : "실시간 연결 안 됨 (자동 새로고침으로 동작해요)"}
    >
      <span
        className={cx("size-2 rounded-full", live ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-slate-400")}
        aria-hidden
      />
      {live ? (
        floating ? (
          // 모바일 한 줄 머리말에서는 짧게 보여 줘요.
          <>
            {online ?? 1}명<span className="sr-only"> 보는 중</span>
          </>
        ) : (
          `${online ?? 1}명 보는 중`
        )
      ) : (
        "오프라인"
      )}
    </span>
  );
}

/** 로그인한 사람: 아바타 + 닉네임 버튼. 누르면 작은 메뉴(로그아웃)가 열려요. */
function UserMenu({ floating }: { floating: boolean }) {
  const nickname = useAuthStore((s) => s.nickname) ?? "나";
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${nickname} 님 메뉴`}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "press flex h-8 max-w-[9rem] items-center gap-1.5 rounded-full py-0.5 pl-0.5 text-sm font-bold text-brand-800 transition hover:bg-brand-50",
          floating ? "pr-0.5" : "pr-2.5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          floating ? "bg-white/95 shadow-float" : "bg-slate-100",
        )}
      >
        <PersonAvatar nickname={nickname} size="sm" ring="ring-sun-400" className="size-7! text-xs!" />
        {/* 모바일은 아바타만, 이름은 메뉴 안에서 보여 줘요. */}
        {!floating && <span className="truncate">{nickname}</span>}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="내 계정"
          className="sheet-fade absolute top-full right-0 z-50 mt-1.5 w-44 rounded-2xl bg-white p-1 shadow-float ring-1 ring-slate-200"
        >
          <p className="truncate px-3 pt-2 pb-1 text-xs font-medium text-slate-600" role="none">
            <b className="text-brand-800">{nickname}</b> 님으로 보는 중
          </p>
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex h-10 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

/** 로그아웃 상태: 닉네임 입력 + 🎲 추천 + 시작. (발표용 개발 로그인) */
function LoginBox({ compact }: { compact: boolean }) {
  const login = useDevLogin();
  // 처음부터 추천 닉네임을 채워 둬서 바로 "시작"만 누르면 돼요.
  const [name, setName] = useState(() => randomNickname());
  const valid = name.trim().length >= 2;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) login.mutate(name, { onError: (err) => toast(errorMessage(err), "error") });
  };

  return (
    <form onSubmit={submit} className={cx(compact && "rounded-2xl bg-white/95 p-1.5 shadow-float backdrop-blur")}>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={16}
          placeholder="닉네임 (2~16자)"
          aria-label="개발용 로그인 닉네임"
          aria-describedby="dev-login-help"
          className={cx(inputClass, "h-9 min-w-0 py-1.5")}
        />
        <button
          type="button"
          onClick={() => setName((prev) => randomNickname(prev))}
          aria-label="아무 닉네임 추천받기"
          title="아무 닉네임 추천받기"
          className="press flex size-9 shrink-0 items-center justify-center rounded-xl bg-sun-100 text-lg ring-1 ring-sun-300 ring-inset transition hover:bg-sun-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span aria-hidden>🎲</span>
        </button>
        <Button type="submit" size="sm" className="h-9" loading={login.isPending} disabled={!valid}>
          시작
        </Button>
      </div>
      <p id="dev-login-help" className="mt-1 px-1 text-[11px] font-semibold text-slate-600">
        발표용 개발 로그인이에요. 아무 이름이나 괜찮아요
      </p>
    </form>
  );
}
