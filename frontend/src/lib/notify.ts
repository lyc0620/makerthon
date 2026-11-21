// 밥약속 알림 문구와 브라우저 알림(Notification) 도우미예요.
// - 권한은 절대 자동으로 묻지 않아요. 사용자가 버튼을 눌렀을 때만 requestPermission을 불러요.
// - 지원 안 하는 브라우저, http(보안 아님) 주소, 사생활 보호 모드에서도 터지지 않게 전부 try/catch로 감쌌어요.
import type { MeetupNotice, MeetupNoticeKind } from "../api/types.db";
import { formatTime } from "./dbFormat";

export type NotifyPermission = NotificationPermission | "unsupported";

/** 지금 브라우저 알림 권한 상태예요. 못 쓰는 환경이면 "unsupported". */
export function notifyPermission(): NotifyPermission {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (window.isSecureContext === false) return "unsupported";
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/** 버튼 클릭 안에서만 불러 주세요. 결과 권한을 돌려줘요. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  try {
    if (notifyPermission() === "unsupported") return "unsupported";
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}

/** 토스트 말투: 마감·곧 시작은 축하/주목(success), 나머지는 info예요. */
export const NOTICE_TONE: Record<MeetupNoticeKind, "info" | "success"> = {
  joined: "info",
  left: "info",
  full: "success",
  cancelled: "info",
  message: "info",
  reminder: "success",
};

/** 알림 한 줄 문구를 만들어요. 토스트와 브라우저 알림이 같이 써요. */
export function meetupNoticeText(n: MeetupNotice): string {
  const actor = n.actor_nickname ?? "누군가";
  const time = safeTime(n.meal_time);
  switch (n.kind) {
    case "joined":
      return `🙋 ${actor}님이 '${n.title}'에 참여했어요 (${n.member_count}/${n.max_people})`;
    case "full":
      return `🎉 '${n.title}' 다 모였어요! ${time} 약속 확정이에요`;
    case "left":
      return `${actor}님이 '${n.title}'에서 나갔어요`;
    case "cancelled":
      return `😢 방장이 '${n.title}' 약속을 취소했어요`;
    case "message":
      return `💬 ${actor}: ${n.preview ?? ""}`;
    case "reminder":
      return `⏰ 곧 밥 먹을 시간! ${time}${n.place_name ? ` ${n.place_name}` : ""}`;
    default:
      return `🍚 '${n.title}' 밥약속에 새 소식이 있어요`;
  }
}

function safeTime(iso: string) {
  try {
    return formatTime(iso);
  } catch {
    return "";
  }
}

/**
 * 다른 탭을 보고 있을 때(document.hidden)만, 권한이 이미 "granted"면 브라우저 알림도 띄워요.
 * 같은 약속 알림은 tag가 같아서 하나로 합쳐져요. 알림을 누르면 이 탭으로 돌아와 onClick을 불러요.
 */
export function showBrowserNotice(n: MeetupNotice, onClick: () => void) {
  try {
    if (!document.hidden) return;
    if (notifyPermission() !== "granted") return;
    const note = new Notification(n.kind === "message" ? `💬 ${n.title}` : "🍚 현풍 밥약속", {
      body: meetupNoticeText(n),
      tag: n.meetup_id,
    });
    note.onclick = () => {
      try {
        window.focus();
        onClick();
        note.close();
      } catch {
        // 포커스가 안 돼도 괜찮아요.
      }
    };
  } catch {
    // 모바일 크롬처럼 new Notification을 막는 곳도 있어요. 토스트만 보여도 충분해요.
  }
}
