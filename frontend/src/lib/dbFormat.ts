// DB 파트 화면에서 같이 쓰는 작은 도우미 함수들이에요. (시간·거리 표시, 캠퍼스 좌표 등)
import type { Meetup, QuickWhen, RestaurantCategory } from "../api/types.db";

/** 캠퍼스 중심 — OSM 기준 정문(35.7003,128.4576)과 강의동(35.7063,128.4538)의 중간점. 팀 합의 7번에서 최종 확정 */
export const CAMPUS = { lat: 35.7033, lng: 128.4557 } as const;

export const CATEGORY_EMOJI: Record<RestaurantCategory, string> = {
  한식: "🍚",
  중식: "🥟",
  일식: "🍣",
  양식: "🍝",
  분식: "🍢",
  카페: "☕",
  술집: "🍺",
  패스트푸드: "🍔",
  학식: "🏫",
  기타: "🍽️",
};

const SEOUL = "Asia/Seoul";

/** 서울 기준 날짜 키 "2026-11-21" */
function seoulDateKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SEOUL }).format(d);
}

/** "18:00" */
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "오늘 18:00" / "내일 12:30" / "11월 24일 (월) 18:00" */
export function formatMealTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = seoulDateKey(d);
  const today = seoulDateKey(now);
  const tomorrow = seoulDateKey(new Date(now.getTime() + 86_400_000));
  const time = formatTime(iso);
  if (day === today) return `오늘 ${time}`;
  if (day === tomorrow) return `내일 ${time}`;
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
  return `${date} ${time}`;
}

/** "방금" / "5분 전" / "2시간 전" / "3일 전" */
export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 지금부터 iso까지 남은 분 (지났으면 음수) */
export function minutesUntil(iso: string, now = Date.now()) {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

/** 1234 → "1.2km", 340 → "340m" */
export function formatDistance(m: number | null | undefined) {
  if (m === null || m === undefined) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

/** 두 좌표 사이 거리(m) — 하버사인 공식 */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 캠퍼스 중심에서 본 방향 + 거리 → "캠퍼스 북동쪽 350m" */
export function describeFromCampus(p: { lat: number; lng: number }) {
  const d = distanceM(CAMPUS, p);
  if (d < 80) return "캠퍼스 중심 근처";
  const dy = p.lat - CAMPUS.lat;
  const dx = (p.lng - CAMPUS.lng) * Math.cos((CAMPUS.lat * Math.PI) / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // 북=0, 동=90
  const dirs = ["북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽"];
  const dir = dirs[Math.round(((deg + 360) % 360) / 45) % 8];
  return `캠퍼스 ${dir} ${formatDistance(d)}`;
}

/** 20 → "오후 8시", 9 → "오전 9시" */
export function formatHour(h: number) {
  if (h === 0) return "밤 12시";
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  return `오후 ${h - 12}시`;
}

/**
 * <input type="datetime-local"> 값("2026-11-21T18:00")을 서울 오프셋 ISO로 바꿔요.
 * 사용자는 한국에서 쓰니까 입력값을 서울 시간으로 보고 +09:00을 붙여요.
 */
export function localInputToSeoulIso(value: string) {
  return `${value.length === 16 ? `${value}:00` : value}+09:00`;
}

/** 서울 시각 기준 datetime-local 값 ("2026-11-21T18:30") */
export function toSeoulInputValue(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** 다음 정각/30분에서 30분 뒤 (밥약속 기본 시간) */
export function defaultMealInput(now = new Date()) {
  const t = new Date(now.getTime() + 30 * 60_000);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() <= 30 ? 30 : 60);
  return toSeoulInputValue(t);
}

export type MeetupGroupKey = "soon" | "today" | "later";

export const MEETUP_GROUP_LABEL: Record<MeetupGroupKey, string> = {
  soon: "지금~1시간",
  today: "오늘",
  later: "내일 이후",
};

/** 밥약속을 "지금~1시간 / 오늘 / 내일 이후"로 나눠요. (서버가 meal_time 순으로 보내 줘요) */
export function groupMeetups(items: Meetup[], now = new Date()) {
  const groups: Record<MeetupGroupKey, Meetup[]> = { soon: [], today: [], later: [] };
  const today = seoulDateKey(now);
  for (const m of items) {
    const until = minutesUntil(m.meal_time, now.getTime());
    if (until <= 60) groups.soon.push(m);
    else if (seoulDateKey(new Date(m.meal_time)) === today) groups.today.push(m);
    else groups.later.push(m);
  }
  return groups;
}

/** 카카오 분류 문구("음식점 > 한식 > 국밥")에서 우리 카테고리를 추측해요. */
export function guessCategory(hint: string | null | undefined): RestaurantCategory {
  const h = hint ?? "";
  const rules: [RegExp, RestaurantCategory][] = [
    [/카페|커피|디저트|베이커리/, "카페"],
    [/중식|중국/, "중식"],
    [/일식|일본|초밥|돈까스|라멘/, "일식"],
    [/양식|이탈리|피자|파스타|스테이크/, "양식"],
    [/분식|떡볶이|김밥/, "분식"],
    [/술집|호프|주점|포차|이자카야/, "술집"],
    [/패스트푸드|햄버거|버거|치킨/, "패스트푸드"],
    [/한식|국밥|찌개|고기|백반/, "한식"],
  ];
  for (const [re, cat] of rules) if (re.test(h)) return cat;
  return "기타";
}

// ───────────── 6.10 · 6.11 실시간 위치 · 번개 약속 ─────────────

export const QUICK_WHEN_OPTIONS: { key: QuickWhen; label: string }[] = [
  { key: "now", label: "지금" },
  { key: "in_30", label: "30분 뒤" },
  { key: "in_60", label: "1시간 뒤" },
  { key: "lunch", label: "점심 12시" },
  { key: "dinner", label: "저녁 6시" },
];

/**
 * 번개 약속 시간이 몇 시가 될지 미리 계산해요. (서버 계산과 같은 규칙, 화면 미리보기용)
 * - now=지금+10분, in_30=+30분, in_60=+60분. 이 셋은 5분 단위로 올림.
 * - lunch=오늘 12:00, dinner=오늘 18:00 딱 그 시각 (지났으면 내일). 올림하지 않아요.
 */
export function quickWhenTime(when: QuickWhen, now = new Date()) {
  if (when === "lunch" || when === "dinner") {
    const hour = when === "lunch" ? 12 : 18;
    // 서울 날짜의 그 시각을 +09:00으로 만들어요. (서울은 서머타임이 없어요)
    let t = new Date(`${seoulDateKey(now)}T${String(hour).padStart(2, "0")}:00:00+09:00`);
    if (t.getTime() < now.getTime()) t = new Date(t.getTime() + 86_400_000); // 지났으면 내일
    return t;
  }
  const addMin = { now: 10, in_30: 30, in_60: 60 }[when];
  const t = now.getTime() + addMin * 60_000;
  const five = 5 * 60_000;
  return new Date(Math.ceil(t / five) * five);
}

/** 칩 이름. 점심·저녁이 이미 지났으면 "내일"을 붙여요. */
export function quickWhenLabel(when: QuickWhen, now = new Date()) {
  const base = QUICK_WHEN_OPTIONS.find((o) => o.key === when)?.label ?? when;
  if (when !== "lunch" && when !== "dinner") return base;
  const t = quickWhenTime(when, now);
  return seoulDateKey(t) === seoulDateKey(now) ? base : `내일 ${base}`;
}

/** "한식 땡겨요" / "아무거나 좋아요" */
export function foodLabel(pref: RestaurantCategory | null) {
  return pref ? `${pref} 땡겨요` : "아무거나 좋아요";
}

/** 오늘이면 "12:30", 아니면 "내일 12:30" */
export function shortMealTime(iso: string, now = new Date()) {
  const full = formatMealTime(iso, now);
  return full.startsWith("오늘 ") ? full.slice(3) : full;
}

/** "37분 남았어요" / "1시간 5분 남았어요" */
export function remainingLabel(iso: string, now = Date.now()) {
  const min = Math.max(0, minutesUntil(iso, now));
  if (min < 60) return `${min}분 남았어요`;
  const rest = min % 60;
  return `${Math.floor(min / 60)}시간${rest ? ` ${rest}분` : ""} 남았어요`;
}
