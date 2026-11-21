// 실시간 알림 (6.9). WebSocket으로 이벤트를 받으면 맞는 Query 키를 무효화만 해요.
// 연결이 끊기면 1초 → 2초 → 4초 … 최대 30초 간격으로 다시 붙어요.
// WebSocket이 없어도 polling(제보 60초, 밥친구 30초)만으로 다 동작해요.
// 로그인했으면 ?token=을 붙여서 나에게만 오는 알림(같이 먹자 제안)과 실시간 위치도 받아요 (6.11).
// 밥약속 멤버면 "meetup.notice"(참여·마감·나감·취소·채팅·곧 시작)를 받아 토스트로 알려 줘요.
// 다른 탭을 보고 있고 브라우저 알림을 허락했으면 브라우저 알림도 같이 띄워요 (lib/notify.ts).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "../../clientDb";
import type { MeetupNotice, RealtimeEvent } from "../../types.db";
import { toast, useAuthStore, useInviteStore, usePresenceStore, useSelectionStore } from "../../../store/db";
import { NOTICE_TONE, meetupNoticeText, showBrowserNotice } from "../../../lib/notify";
import { dbKeys } from "./keys";
import { removePresence, upsertPresence } from "./presence";

export type RealtimeStatus = "connecting" | "open" | "closed";

/** 밥약속 알림을 토스트(+ 필요하면 브라우저 알림)로 보여 줘요. */
function announceMeetupNotice(n: MeetupNotice) {
  const open = () => useSelectionStore.getState().select({ type: "meetup", id: n.meetup_id });
  if (n.kind === "message") {
    // 그 약속 시트를 이미 보고 있으면 채팅이 바로 보이니까 토스트는 건너뛰어요.
    const sel = useSelectionStore.getState().selected;
    const viewing = sel?.type === "meetup" && sel.id === n.meetup_id;
    if (viewing && !document.hidden) return;
    if (!viewing) toast(meetupNoticeText(n), NOTICE_TONE[n.kind], { label: "보기", onClick: open });
  } else {
    toast(meetupNoticeText(n), NOTICE_TONE[n.kind], { label: "보기", onClick: open });
  }
  showBrowserNotice(n, open);
}

function wsUrl(token: string | null) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}${API_BASE}/ws${query}`;
}

/** 앱에서 한 번만 불러 주세요. 접속자 수(online)와 연결 상태(status)를 돌려줘요. */
export function useRealtime(enabled = true) {
  const qc = useQueryClient();
  const [online, setOnline] = useState<number | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // 토큰이 바뀌면(로그인·로그아웃) 새 주소로 다시 연결해요.
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let stopped = false;

    const handle = (ev: RealtimeEvent) => {
      if (ev.type === "online.count") {
        setOnline(ev.data.count);
      } else if (ev.type === "presence.updated") {
        // 목록을 다시 안 불러도 지도 점이 바로 움직여요.
        upsertPresence(qc, ev.data);
      } else if (ev.type === "presence.removed") {
        removePresence(qc, ev.data.user_id);
        // 내 공유가 서버에서 끝났으면(시간 끝·신호 끊김) 화면에서도 꺼요.
        const mine = usePresenceStore.getState();
        if (mine.sharing && mine.me?.user_id === ev.data.user_id) {
          mine.stopped();
          toast("위치 공유가 끝났어요. 다시 켤 수 있어요.", "info");
        }
      } else if (ev.type === "invite.received") {
        useInviteStore.getState().push(ev.data);
        qc.invalidateQueries({ queryKey: dbKeys.meetups });
      } else if (ev.type === "meetup.notice") {
        qc.invalidateQueries({ queryKey: dbKeys.meetups });
        qc.invalidateQueries({ queryKey: dbKeys.restaurantDetails });
        if (ev.data.kind === "message") {
          qc.invalidateQueries({ queryKey: dbKeys.meetupMessages(ev.data.meetup_id) });
        }
        announceMeetupNotice(ev.data);
      } else if (ev.type === "meetup.message") {
        qc.invalidateQueries({ queryKey: dbKeys.meetupMessages(ev.data.meetup_id) });
      } else if (ev.type.startsWith("report.")) {
        qc.invalidateQueries({ queryKey: dbKeys.reports });
      } else if (ev.type.startsWith("restaurant.")) {
        qc.invalidateQueries({ queryKey: dbKeys.restaurants });
      } else if (ev.type.startsWith("meetup.")) {
        qc.invalidateQueries({ queryKey: dbKeys.meetups });
        // 가게 상세의 "다가오는 밥약속"도 바뀌었을 수 있어요.
        qc.invalidateQueries({ queryKey: dbKeys.restaurantDetails });
      }
    };

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      timer = window.setTimeout(connect, delay);
    };

    function connect() {
      if (stopped) return;
      setStatus("connecting");
      try {
        ws = new WebSocket(wsUrl(token));
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        setStatus("open");
      };
      ws.onmessage = (msg) => {
        try {
          handle(JSON.parse(String(msg.data)) as RealtimeEvent);
        } catch {
          // 모르는 형식은 그냥 넘어가요.
        }
      };
      ws.onclose = () => {
        setStatus("closed");
        setOnline(null);
        schedule();
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [enabled, qc, token]);

  return { online, status };
}
