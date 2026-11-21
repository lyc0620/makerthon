// DB 파트에서 쓰는 Zustand 상태예요.
//
// 1) useAuthStore  — 로그인 토큰과 닉네임 (localStorage에 저장)
// 2) useSelectionStore — 지금 고른 항목. (통합) 실제 상태는 src/store/ui.ts 의 selected 하나뿐이고,
//    이건 그걸 DB 파트 모양(selected/select/clear)으로 보여 주는 창구예요.
// 3) usePickStore — "지도에서 위치 찍기" 모드. 지도 클릭을 받아서 콜백에 넘겨줘요.
//    통합 담당의 MapView도 onClick에서 usePickStore.getState().handleClick(lngLat)을 불러 주면 돼요.
// 4) usePresenceStore — "지금 밥 먹을래요" 위치 공유 상태 (메모리에만 있어요. 새로고침하면 꺼져요)
// 5) useInviteStore — 받은 "같이 먹자" 제안 카드 목록

import { useEffect } from "react";
import { create } from "zustand";
import { useUi } from "./ui";
import type {
  InviteReceived,
  Presence,
  PresenceMinutes,
  RestaurantCategory,
  SelectedDbItem,
} from "../api/types.db";

// ───────────── localStorage 안전하게 쓰기 (사생활 보호 모드 등에서 실패할 수 있어요) ─────────────

const AUTH_KEY = "hp-map.db.auth";

function loadAuth(): { token: string | null; nickname: string | null } {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return { token: null, nickname: null };
    const parsed = JSON.parse(raw) as { token?: unknown; nickname?: unknown };
    return {
      token: typeof parsed.token === "string" ? parsed.token : null,
      nickname: typeof parsed.nickname === "string" ? parsed.nickname : null,
    };
  } catch {
    return { token: null, nickname: null };
  }
}

function saveAuth(token: string | null, nickname: string | null) {
  try {
    if (token) localStorage.setItem(AUTH_KEY, JSON.stringify({ token, nickname }));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    // 저장이 안 돼도 이번 탭에서는 계속 쓸 수 있어요.
  }
}

// ───────────── 1) 인증 ─────────────

interface AuthState {
  token: string | null;
  nickname: string | null;
  setAuth: (token: string, nickname: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadAuth(),
  setAuth: (token, nickname) => {
    saveAuth(token, nickname);
    set({ token, nickname });
  },
  logout: () => {
    saveAuth(null, null);
    set({ token: null, nickname: null });
  },
}));

/** fetch 래퍼처럼 React 바깥에서 토큰을 꺼낼 때 써요. */
export const getAuthToken = () => useAuthStore.getState().token;

// ───────────── 2) 선택 (개발용 임시) ─────────────

interface SelectionState {
  selected: SelectedDbItem | null;
  select: (item: SelectedDbItem) => void;
  clear: () => void;
}

const DB_TYPES = new Set(["restaurant", "report", "meetup", "presence"]);
// 버스·세미나가 선택돼 있으면 DB 파트 입장에서는 "고른 것 없음"
const asDb = (s: ReturnType<typeof useUi.getState>["selected"]): SelectedDbItem | null =>
  s && DB_TYPES.has(s.type) ? (s as SelectedDbItem) : null;
// 함수는 한 번만 만들어 두어야 선택자(selector)가 매번 같은 값을 돌려줘요
const selectDb = (item: SelectedDbItem) => useUi.getState().select(item);
const clearSelection = () => useUi.getState().select(null);
const selectionOf = (s: ReturnType<typeof useUi.getState>): SelectionState => ({
  selected: asDb(s.selected),
  select: selectDb,
  clear: clearSelection,
});

/** 예전 API 그대로: useSelectionStore((s) => s.selected), useSelectionStore.getState().select(...) */
export function useSelectionStore<T>(selector: (s: SelectionState) => T): T {
  return useUi((s) => selector(selectionOf(s)));
}
useSelectionStore.getState = (): SelectionState => selectionOf(useUi.getState());

// ───────────── 3) 지도에서 위치 찍기 ─────────────

export interface LngLatLike {
  lng: number;
  lat: number;
}

interface PickState {
  /** 찍기 모드일 때 지도 위에 띄울 안내 문구 (아니면 null) */
  label: string | null;
  callback: ((p: LngLatLike) => void) | null;
  /** 마지막으로 찍은 점 (미리보기 핀용) */
  lastPoint: LngLatLike | null;
  start: (label: string, cb: (p: LngLatLike) => void) => void;
  stop: () => void;
  /** 찍기를 끝내고 미리보기 핀까지 지워요. 폼이 닫힐 때 써요. */
  cancel: () => void;
  /** 지도 onClick에서 불러 주세요. 찍기 모드면 true를 돌려줘요(다른 클릭 처리를 건너뛰면 돼요). */
  handleClick: (p: LngLatLike) => boolean;
}

export const usePickStore = create<PickState>((set, get) => ({
  label: null,
  callback: null,
  lastPoint: null,
  start: (label, cb) => set({ label, callback: cb, lastPoint: null }),
  stop: () => set({ label: null, callback: null }),
  cancel: () => set({ label: null, callback: null, lastPoint: null }),
  handleClick: (p) => {
    const cb = get().callback;
    if (!cb) return false;
    set({ label: null, callback: null, lastPoint: p });
    cb(p);
    return true;
  },
}));

/**
 * 찍기를 시작하는 폼에서 불러 주세요.
 * 뒤로가기·취소·탭 전환으로 폼이 사라지면 찍기 모드도 같이 꺼져요.
 * (안 그러면 다음 지도 클릭을 이미 닫힌 폼이 가져가 버려요.)
 */
export function useCancelPickOnUnmount() {
  useEffect(() => () => usePickStore.getState().cancel(), []);
}

// ───────────── 토스트 (작은 알림) ─────────────

export interface ToastAction {
  /** 버튼 글자 (예: "보기") */
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  /** 있으면 토스트 안에 작은 버튼을 보여 줘요. 누르면 onClick 뒤에 토스트가 닫혀요. */
  action?: ToastAction;
  /** 자동으로 닫히기까지 걸리는 시간(ms) */
  ms: number;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: Toast["tone"], action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

/** 그냥 토스트는 3.5초, 버튼이 있는 토스트는 누를 시간을 주려고 6초 동안 보여요. */
export const TOAST_MS = 3500;
export const TOAST_ACTION_MS = 6000;

/**
 * 패널·시트에서 "합쳐졌어요" 같은 알림을 띄울 때 써요.
 * 통합 때 공통 토스트가 생기면 show만 그쪽으로 연결하면 돼요.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = "info", action) => {
    const id = ++toastSeq;
    const ms = action ? TOAST_ACTION_MS : TOAST_MS;
    set({ toasts: [...get().toasts, { id, message, tone, action, ms }].slice(-3) });
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, tone?: Toast["tone"], action?: ToastAction) =>
  useToastStore.getState().show(message, tone, action);

// ───────────── 패널 간 이동 (가게 → 밥약속 만들기) ─────────────

interface MeetupDraftState {
  /** 가게 상세에서 "같이 먹을 사람 구하기"를 누르면 채워져요. */
  draft: { restaurant_id: string; place_name: string; lat: number; lng: number } | null;
  openCreate: (draft: NonNullable<MeetupDraftState["draft"]>) => void;
  clearDraft: () => void;

  /** 단속 다발 구역(hotspot) 원을 지도에 보일지. ReportLayer의 showHotspots에 넘겨 주세요. */
  showHotspots: boolean;
  setShowHotspots: (v: boolean) => void;

  /**
   * 목록에서 항목을 누르면 지도를 그 위치로 옮겨 달라는 요청이에요.
   * 지도 쪽(dev 하네스, 통합 MapView)이 구독해서 flyTo 하면 돼요. seq는 같은 곳을 다시 눌러도 반응하게 하려고 둬요.
   */
  focus: { lat: number; lng: number; seq: number } | null;
  focusOn: (p: { lat: number; lng: number }) => void;
}

let focusSeq = 0;

export const useDbNavStore = create<MeetupDraftState>((set) => ({
  draft: null,
  // 가게 상세에서 "같이 먹을 사람 구하기" → 밥친구 탭으로 (탭 상태는 ui.ts 하나)
  openCreate: (draft) => {
    set({ draft });
    useUi.getState().select(null);
    useUi.getState().setTab("meetup");
  },
  clearDraft: () => set({ draft: null }),
  showHotspots: false,
  setShowHotspots: (v) => set({ showHotspots: v }),
  focus: null,
  focusOn: (p) => set({ focus: { ...p, seq: ++focusSeq } }),
}));

// ───────────── 4) 지금 밥 먹을래요 (내 위치 공유) ─────────────
//
// ⚠️ 개인정보: 내 정확한 위치(point)는 이 탭의 메모리에만 있어요.
// localStorage에 저장하지 않고, 새로고침하거나 탭을 닫으면 사라져요.
// 서버에 보낸 뒤 다른 사람에게는 약 50m로 흐린 좌표만 보여요.

export type PresenceSource = "gps" | "map";

export interface PresenceOptions {
  minutes: PresenceMinutes;
  food_pref: RestaurantCategory | null;
  message: string;
}

interface PresenceState {
  /** 지금 공유 중인지 */
  sharing: boolean;
  /** 공유를 켜는 중(위치 찾는 중·지도에서 고르는 중) */
  starting: boolean;
  /** 서버가 정해 준 끝나는 시각 */
  until: string | null;
  /** 위치를 어디서 얻었는지: 브라우저 GPS / 지도에서 고름 */
  source: PresenceSource | null;
  /** 내 정확한 위치 (서버에 보낼 때만 써요) */
  point: LngLatLike | null;
  /** 서버가 돌려준 내 Presence (흐린 좌표) */
  me: Presence | null;
  /** 켤 때 고르는 값 (시간·음식·한마디) */
  options: PresenceOptions;
  setOptions: (patch: Partial<PresenceOptions>) => void;
  setStarting: (v: boolean) => void;
  started: (me: Presence, point: LngLatLike, source: PresenceSource) => void;
  setPoint: (point: LngLatLike, source: PresenceSource) => void;
  setMe: (me: Presence) => void;
  /** 화면에서 공유 상태를 지워요. (서버 DELETE는 훅에서 따로 불러요) */
  stopped: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  sharing: false,
  starting: false,
  until: null,
  source: null,
  point: null,
  me: null,
  options: { minutes: 60, food_pref: null, message: "" },
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
  setStarting: (v) => set({ starting: v }),
  started: (me, point, source) => set({ sharing: true, starting: false, until: me.until, me, point, source }),
  setPoint: (point, source) => set({ point, source }),
  setMe: (me) => set({ me, until: me.until }),
  stopped: () => set({ sharing: false, starting: false, until: null, source: null, point: null, me: null }),
}));

// ───────────── 5) 받은 "같이 먹자" 제안 ─────────────

export interface InviteCard extends InviteReceived {
  /** 화면용 번호 (같은 약속이 두 번 와도 구분해요) */
  key: number;
  received_at: number;
}

interface InviteState {
  invites: InviteCard[];
  push: (invite: InviteReceived) => void;
  dismiss: (key: number) => void;
  /** 로그아웃할 때 다 지워요. (다른 사람이 같은 탭에서 로그인해도 안 보이게) */
  clear: () => void;
}

let inviteSeq = 0;

export const useInviteStore = create<InviteState>((set, get) => ({
  invites: [],
  push: (invite) => {
    // 같은 약속 제안이 또 오면 예전 카드는 빼고 새 카드로 올려요. 너무 많이 쌓이지 않게 최근 5개만 둬요.
    const rest = get().invites.filter((c) => c.meetup.id !== invite.meetup.id);
    set({ invites: [...rest, { ...invite, key: ++inviteSeq, received_at: Date.now() }].slice(-5) });
  },
  dismiss: (key) => set({ invites: get().invites.filter((c) => c.key !== key) }),
  clear: () => set({ invites: [] }),
}));
