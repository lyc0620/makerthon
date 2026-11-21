// 지금 밥 먹을 사람 훅 (6.10) + "같이 먹자" 제안.
//
// ⚠️ 개인정보 원칙 (docs/api-spec-db.md 6.10)
// - 기본은 꺼짐. 사용자가 직접 켜야만 위치를 보내요.
// - 다른 사람에게는 서버가 약 50m로 흐린 좌표만 보여 줘요. 내 정확한 위치는 이 탭의 메모리에만 있어요.
// - 고른 시간(until)이 지나면 자동으로 꺼지고, 탭을 닫으면 바로 끄기 요청을 보내요.
// - 목록은 로그인한 사람만 볼 수 있어요.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { API_BASE, apiFetch, errorMessage, isApiError } from "../../clientDb";
import type {
  InviteRequest,
  ListResponse,
  Meetup,
  Presence,
  PresencePublic,
  PresenceUpsert,
} from "../../types.db";
import { getAuthToken, toast, useAuthStore, usePickStore, usePresenceStore } from "../../../store/db";
import type { LngLatLike, PresenceSource } from "../../../store/db";
import { distanceM } from "../../../lib/dbFormat";
import { dbKeys } from "./keys";
import { useMeetupWriter } from "./meetups";

/** heartbeat 간격. 서버는 3분 동안 신호가 없으면 지워요. */
const HEARTBEAT_MS = 60_000;
/** 서버가 신호 없는 사람을 지우는 시간 (서버 SILENCE_LIMIT와 같아요) */
const SILENCE_MS = 3 * 60_000;

// ───────────── 끄기와 갱신이 겹치지 않게 하는 장치 ─────────────
// - stopSeq: 끌 때마다 1씩 올라가요. 갱신(PUT)을 보낼 때의 번호와 다르면 그 사이에 껐다는 뜻이라 결과를 버려요.
// - putInFlight: 지금 가고 있는 갱신 요청. 끌 때는 이게 끝난 다음에 DELETE를 보내야
//   서버에서 PUT이 DELETE보다 늦게 처리돼 다시 켜지는 일이 없어요.
// - lastOkAt: 마지막으로 서버가 받아 준 시각. 3분 넘게 비었으면 서버에서는 이미 꺼진 거예요.
let stopSeq = 0;
let putInFlight: Promise<unknown> | null = null;
let lastOkAt = 0;

// ───────────── 서버 호출 (훅 밖에서도 쓰려고 함수로 둬요) ─────────────

const putMyPresence = (body: PresenceUpsert) => apiFetch<Presence>("/presence/me", { method: "PUT", body });
const deleteMyPresence = () => apiFetch<void>("/presence/me", { method: "DELETE" });

/** 지금 고른 값으로 PUT 본문을 만들어요. withMinutes=true면 끝나는 시각을 새로 정해요. */
function buildBody(point: LngLatLike, withMinutes: boolean): PresenceUpsert {
  const { options } = usePresenceStore.getState();
  return {
    lat: point.lat,
    lng: point.lng,
    ...(withMinutes ? { minutes: options.minutes } : {}),
    food_pref: options.food_pref,
    message: options.message.trim() || null,
  };
}

/** 브라우저 위치를 한 번 가져와요. 못 가져오면(거절·실패·시간 초과) 에러를 던져요. */
export function getBrowserLocation(timeoutMs = 8000): Promise<LngLatLike> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("이 브라우저는 위치를 쓸 수 없어요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "위치를 가져오지 못했어요.")),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: timeoutMs },
    );
  });
}

// ───────────── 캐시 도우미 (WebSocket 이벤트에서도 써요) ─────────────

/** 가까운 순, 거리를 모르면 뒤로 */
function byDistance(a: Presence, b: Presence) {
  const da = a.distance_m ?? Number.POSITIVE_INFINITY;
  const db = b.distance_m ?? Number.POSITIVE_INFINITY;
  return da - db;
}

/**
 * 목록 캐시에 한 사람을 넣거나 바꿔요.
 * 방송(presence.updated)에는 distance_m·is_me가 없어서, 예전 값이나 내 위치로 채워요.
 */
export function upsertPresence(qc: QueryClient, p: Presence | PresencePublic) {
  const me = usePresenceStore.getState().me;
  const myNickname = useAuthStore.getState().nickname;
  qc.setQueryData<ListResponse<Presence>>(dbKeys.presenceList, (old) => {
    if (!old) return old;
    const prev = old.items.find((x) => x.user_id === p.user_id);
    let next: Presence;
    if ("is_me" in p) {
      next = p;
    } else {
      // 닉네임은 겹치지 않아서(UNIQUE) 나인지 알아볼 수 있어요.
      const isMe = prev?.is_me ?? p.nickname === myNickname;
      // 둘 다 흐린 좌표라서 대략적인 거리예요. 나 자신은 서버 GET과 똑같이 0이에요(맨 앞에 와요).
      const distance = isMe ? 0 : me ? Math.round(distanceM(me, p)) : (prev?.distance_m ?? null);
      next = { ...p, is_me: isMe, distance_m: distance };
    }
    const items = prev
      ? old.items.map((x) => (x.user_id === p.user_id ? next : x))
      : [...old.items, next];
    items.sort(byDistance);
    return { ...old, items, count: items.length, total: items.length, updated_at: next.updated_at };
  });
}

/** 목록 캐시에서 한 사람을 빼요. */
export function removePresence(qc: QueryClient, userId: string) {
  qc.setQueryData<ListResponse<Presence>>(dbKeys.presenceList, (old) => {
    if (!old) return old;
    const items = old.items.filter((x) => x.user_id !== userId);
    return { ...old, items, count: items.length, total: items.length };
  });
}

/** 공유를 끄고(서버 DELETE) 화면 상태도 지워요. 서버 요청이 실패해도 3분 뒤엔 서버에서 사라져요. */
export async function stopSharing(qc: QueryClient, message?: string) {
  const { me, sharing } = usePresenceStore.getState();
  if (!sharing) return;
  stopSeq += 1; // 지금 가고 있는 갱신 결과는 버려요
  // 가고 있는 갱신(PUT)이 있으면 먼저 끝나기를 기다렸다가 DELETE를 보내요.
  if (putInFlight) await putInFlight.catch(() => undefined);
  try {
    await deleteMyPresence();
  } catch {
    // 이미 꺼졌거나 네트워크 문제예요. 화면에서는 그래도 꺼요.
  }
  if (me) removePresence(qc, me.user_id);
  usePresenceStore.getState().stopped();
  if (message) toast(message, "info");
}

/** 처음 켤 때 결과를 기억해요. (useStartPresence) */
function markStarted() {
  lastOkAt = Date.now();
}

/**
 * 켜진 상태에서 위치·한마디를 갱신해요. (heartbeat, 위치 다시 고르기)
 * - 그 사이에 껐으면 null을 돌려줘요. 결과를 화면에 넣지 마세요.
 * - 서버가 새 항목을 만들어 끝나는 시각(until)이 바뀌었으면, 사용자가 고른 시간보다 길어지지 않게 바로 꺼요.
 */
async function putWhileSharing(qc: QueryClient, point: LngLatLike): Promise<Presence | null> {
  const seq = stopSeq;
  const req = putMyPresence(buildBody(point, false));
  putInFlight = req;
  let me: Presence;
  try {
    me = await req;
  } finally {
    if (putInFlight === req) putInFlight = null;
  }
  const state = usePresenceStore.getState();
  if (seq !== stopSeq || !state.sharing) return null; // 기다리는 동안 껐어요
  if (state.until && new Date(me.until).getTime() !== new Date(state.until).getTime()) {
    // 신호가 끊겨(기기 잠자기 등) 서버에서 꺼졌다가 새로 만들어졌어요. 동의 없이 늘어나지 않게 꺼요.
    await stopSharing(qc, "잠깐 연결이 끊겨서 위치 공유를 껐어요. 다시 켤 수 있어요.");
    return null;
  }
  lastOkAt = Date.now();
  return me;
}

/** 탭을 닫을 때 쓰는 끄기 요청이에요. 페이지가 사라져도 요청이 끝까지 가도록 keepalive를 켜요. */
export function sendStopOnExit() {
  const token = getAuthToken();
  if (!token || !usePresenceStore.getState().sharing) return;
  try {
    void fetch(`${API_BASE}/presence/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 닫히는 중이라 실패해도 괜찮아요. 서버가 3분 뒤 지워요.
  }
}

// ───────────── 목록 ─────────────

/** 지금 켜진 사람들 (나 포함, 가까운 순). 로그인했을 때만 불러요. */
export function usePresenceList() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: dbKeys.presenceList,
    queryFn: ({ signal }) => apiFetch<ListResponse<Presence>>("/presence", { signal }),
    enabled: !!token,
    refetchInterval: 30_000,
  });
}

/** 내 공유 상태 (켜짐 여부, 끝나는 시각, 고른 값…) */
export function useMyPresence() {
  return usePresenceStore();
}

// ───────────── 켜기 / 갱신 / 끄기 ─────────────

export function useStartPresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ point, source }: { point: LngLatLike; source: PresenceSource }) => {
      const me = await putMyPresence(buildBody(point, true));
      return { me, point, source };
    },
    onSuccess: ({ me, point, source }) => {
      markStarted();
      usePresenceStore.getState().started(me, point, source);
      upsertPresence(qc, me);
      // 내 위치가 생겼으니 다른 사람과의 거리도 다시 받아요.
      qc.invalidateQueries({ queryKey: dbKeys.presenceList });
    },
    onError: () => usePresenceStore.getState().setStarting(false),
  });
}

/** 위치·메시지만 바꿔요. 끝나는 시각은 그대로예요. (위치 다시 고르기에 써요) */
export function useUpdatePresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ point, source }: { point: LngLatLike; source: PresenceSource }) => {
      const me = await putWhileSharing(qc, point);
      return { me, point, source };
    },
    onSuccess: ({ me, point, source }) => {
      if (!me) return; // 그 사이에 꺼졌어요
      usePresenceStore.getState().setPoint(point, source);
      usePresenceStore.getState().setMe(me);
      upsertPresence(qc, me);
    },
  });
}

export function useStopPresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => stopSharing(qc, "위치 공유를 껐어요. 지도에서 바로 사라졌어요."),
  });
}

/**
 * "켜기" 버튼에서 써요.
 * 1) 브라우저 위치를 먼저 시도하고
 * 2) 못 쓰거나(거절·실패) 서비스 지역 밖(422)이면 지도에서 내 위치를 찍게 해요. (usePickStore)
 */
export function useSharePresence() {
  const start = useStartPresence();

  const pickOnMap = (reason: string) => {
    usePresenceStore.getState().setStarting(false);
    toast(reason, "info");
    usePickStore.getState().start("지금 있는 곳을 지도에서 눌러 주세요", (p) => {
      start.mutate(
        { point: { lat: p.lat, lng: p.lng }, source: "map" },
        {
          onSuccess: () => toast("위치 공유를 켰어요! 근처 사람들에게 내가 보여요 🙋", "success"),
          onError: (e) => toast(errorMessage(e), "error"),
        },
      );
    });
  };

  const share = async () => {
    if (!getAuthToken()) {
      toast("먼저 닉네임으로 로그인해 주세요.", "info");
      return;
    }
    usePresenceStore.getState().setStarting(true);
    let point: LngLatLike;
    try {
      point = await getBrowserLocation();
    } catch {
      pickOnMap("위치를 못 가져왔어요. 지도에서 지금 있는 곳을 눌러 주세요.");
      return;
    }
    try {
      await start.mutateAsync({ point, source: "gps" });
      toast("위치 공유를 켰어요! 근처 사람들에게 내가 보여요 🙋", "success");
    } catch (e) {
      if (isApiError(e) && e.status === 422) {
        pickOnMap("지금 위치가 서비스 지역 밖이에요. 지도에서 있을 곳을 눌러 주세요.");
      } else {
        toast(errorMessage(e), "error");
      }
    }
  };

  return { share, isPending: start.isPending };
}

// ───────────── heartbeat (앱에서 한 번만 불러 주세요) ─────────────

async function beat(qc: QueryClient) {
  const { sharing, point, until } = usePresenceStore.getState();
  if (!sharing || !point) return;
  // 고른 시간이 지났거나, 3분 넘게 서버에 못 보냈으면(기기 잠자기 등) 서버에서는 이미 꺼졌어요.
  // 이때 PUT을 보내면 서버가 새로 켜 버리니까 보내지 않고 꺼요.
  if (until && Date.now() >= new Date(until).getTime()) {
    await stopSharing(qc, "고른 시간이 지나서 위치 공유를 껐어요.");
    return;
  }
  if (lastOkAt && Date.now() - lastOkAt >= SILENCE_MS) {
    await stopSharing(qc, "잠깐 연결이 끊겨서 위치 공유를 껐어요. 다시 켤 수 있어요.");
    return;
  }
  try {
    const me = await putWhileSharing(qc, point);
    if (!me) return; // 그 사이에 꺼졌어요
    usePresenceStore.getState().setMe(me);
    upsertPresence(qc, me);
  } catch (e) {
    if (!isApiError(e) || e.status === 0 || e.status >= 500) return; // 잠깐 끊긴 거면 다음 번에 다시 보내요.
    // 4xx: 서버에서 이미 끝났거나(만료·로그아웃) 서비스 지역을 벗어났어요. 화면에서도 꺼요.
    const msg =
      e.status === 422 ? "서비스 지역을 벗어나서 위치 공유를 껐어요." : "위치 공유가 끝났어요. 다시 켤 수 있어요.";
    await stopSharing(qc, msg);
  }
}

/**
 * 공유가 켜져 있는 동안
 * - 위치를 GPS로 얻었으면 watchPosition으로 따라가요 (지도에서 골랐으면 그 점을 그대로 써요)
 * - 60초마다 PUT으로 살아 있다고 알려요
 * - until이 되면 자동으로 꺼요
 * - 탭을 닫거나 로그아웃하면 꺼요
 */
export function usePresenceHeartbeat() {
  const qc = useQueryClient();
  const sharing = usePresenceStore((s) => s.sharing);
  const source = usePresenceStore((s) => s.source);
  const until = usePresenceStore((s) => s.until);
  const token = useAuthStore((s) => s.token);

  // 1) GPS 따라가기
  useEffect(() => {
    if (!sharing || source !== "gps" || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        usePresenceStore.getState().setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps"),
      () => {
        // 잠깐 못 받아도 마지막 위치로 계속 보내요.
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing, source]);

  // 2) 60초마다 heartbeat
  useEffect(() => {
    if (!sharing) return;
    const timer = window.setInterval(() => void beat(qc), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [sharing, qc]);

  // 3) 고른 시간이 지나면 자동으로 끄기
  useEffect(() => {
    if (!sharing || !until) return;
    const ms = Math.max(0, new Date(until).getTime() - Date.now());
    const timer = window.setTimeout(() => void stopSharing(qc, "고른 시간이 지나서 위치 공유를 껐어요."), ms);
    return () => window.clearTimeout(timer);
  }, [sharing, until, qc]);

  // 4) 로그아웃되면(토큰 만료 포함) 화면 상태도 지워요.
  useEffect(() => {
    if (!token && usePresenceStore.getState().sharing) usePresenceStore.getState().stopped();
  }, [token]);

  // 5) 탭을 닫으면 바로 끄기
  useEffect(() => {
    if (!sharing) return;
    window.addEventListener("pagehide", sendStopOnExit);
    return () => window.removeEventListener("pagehide", sendStopOnExit);
  }, [sharing]);
}

// ───────────── "같이 먹자" 제안 ─────────────

/**
 * 상대에게 번개 약속을 만들어 제안해요. (나 = 방장)
 * 상대는 invite.received 알림을 받아요.
 */
export function useInvite() {
  const qc = useQueryClient();
  const write = useMeetupWriter();
  return useMutation({
    mutationFn: ({ userId, ...body }: InviteRequest & { userId: string }) =>
      apiFetch<Meetup>(`/presence/${userId}/invite`, { method: "POST", body: { max_people: 4, ...body } }),
    onSuccess: write,
    onError: (e, vars) => {
      // 상대가 위치를 껐으면 지도에서도 빼요.
      if (isApiError(e) && e.status === 404) removePresence(qc, vars.userId);
    },
  });
}

/** 제안 실패 이유를 알기 쉽게 바꿔요. */
export function inviteErrorMessage(e: unknown) {
  if (isApiError(e)) {
    if (e.status === 404) return "그 사람이 방금 위치 공유를 껐어요.";
    if (e.status === 429) return "같은 사람에게는 5분 뒤에 다시 보낼 수 있어요.";
  }
  return errorMessage(e);
}
