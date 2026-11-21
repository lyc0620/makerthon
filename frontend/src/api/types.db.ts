// DB 파트(맛집 · 제보 · 밥친구) API 타입이에요.
// 기준: docs/api-spec-db.md — 필드 이름은 서버와 똑같이 snake_case로 두고 변환하지 않아요.
// 값이 없을 수 있는 필드는 `T | null`이에요. (서버가 필드를 빼지 않고 null로 보내요)

/** 서울 오프셋이 붙은 ISO 8601 문자열이에요. 예: "2026-12-01T18:00:00+09:00" */
export type IsoDateTime = string;

// ───────────────────────── 공통 ─────────────────────────

/** 목록 응답 공통 형식이에요. */
export interface ListResponse<T> {
  items: T[];
  /** 이번 응답에 담긴 개수 */
  count: number;
  /** 전체 개수 (페이지 넘김 표시용) */
  total: number;
  /** 가장 최근 변경 시각 (없으면 null) */
  updated_at: IsoDateTime | null;
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

/** 에러 응답 본문이에요. `details`는 있을 때만 와요. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | (string & {});
    message: string;
    details?: Record<string, unknown>;
  };
}

/** 페이지 쿼리 */
export interface PageQuery {
  limit?: number;
  offset?: number;
}

// ───────────────────────── 인증 (개발용) ─────────────────────────

export interface DevLoginRequest {
  nickname: string;
}

/** 6.7 인증과 같은 모양의 토큰 응답이에요. */
export interface TokenResponse {
  access_token: string;
  token_type: "bearer" | (string & {});
  expires_in: number;
}

// ───────────────────────── 6.4 맛집 ─────────────────────────

export const RESTAURANT_CATEGORIES = [
  "한식",
  "중식",
  "일식",
  "양식",
  "분식",
  "카페",
  "술집",
  "패스트푸드",
  "학식",
  "기타",
] as const;
export type RestaurantCategory = (typeof RESTAURANT_CATEGORIES)[number];

export const RESTAURANT_TAGS = [
  "혼밥가능",
  "가성비",
  "양많음",
  "분위기",
  "늦게까지",
  "배달",
  "단체석",
  "학생할인",
] as const;
export type RestaurantTag = (typeof RESTAURANT_TAGS)[number];

export interface Restaurant {
  id: string; // "rst_12"
  name: string;
  category: RestaurantCategory;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  kakao_place_id: string | null;
  /** 후기가 없으면 null */
  rating_avg: number | null;
  review_count: number;
  /** 베이지안 평균 추천 점수 */
  score: number;
  top_tags: RestaurantTag[];
  /** 요청에 lat,lng가 있을 때만 숫자(m) */
  distance_m: number | null;
  created_at: IsoDateTime;
}

/** 가게 상세에 붙는 "다가오는 밥약속" 요약이에요. */
export interface MeetupSummary {
  id: string; // "mtp_3"
  title: string;
  meal_time: IsoDateTime;
  member_count: number;
  max_people: number;
  status: MeetupStatus;
}

export interface RestaurantDetail extends Restaurant {
  description: string | null;
  rating_distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  tag_counts: Partial<Record<RestaurantTag, number>>;
  upcoming_meetups: MeetupSummary[];
}

export interface Review {
  id: string; // "rev_40"
  restaurant_id: string;
  rating: number; // 1~5
  content: string;
  tags: RestaurantTag[];
  author_nickname: string;
  like_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  created_at: IsoDateTime;
}

export interface RestaurantMeta {
  categories: RestaurantCategory[];
  tags: RestaurantTag[];
}

export type RestaurantSort = "score" | "distance" | "recent" | "reviews";

/** GET /restaurants 쿼리 */
export interface RestaurantFilters extends PageQuery {
  category?: RestaurantCategory;
  tag?: RestaurantTag;
  q?: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
  sort?: RestaurantSort;
}

export type ReviewSort = "helpful" | "recent";

export interface ReviewInput {
  rating: number;
  content: string; // 5~500자
  tags: RestaurantTag[];
}

export interface CreateRestaurantRequest {
  name: string;
  category: RestaurantCategory;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  kakao_place_id: string | null;
  description: string | null;
  first_review: ReviewInput;
}

export interface LikeResponse {
  liked: boolean;
  like_count: number;
}

/** 카카오 로컬 검색 프록시 결과 한 줄 */
export interface PlaceSearchItem {
  kakao_place_id: string;
  name: string;
  category_hint: string | null;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  already_registered_id: string | null;
}

// ───────────────────────── 6.6 제보 ─────────────────────────

export type ReportType = "police" | "dark_road" | "hazard";
export type VoteValue = "confirm" | "deny";

export interface Report {
  id: string; // "rpt_7"
  type: ReportType;
  lat: number;
  lng: number;
  description: string | null;
  created_at: IsoDateTime;
  last_confirmed_at: IsoDateTime;
  expires_at: IsoDateTime;
  confirm_count: number;
  deny_count: number;
  /** 0~1 */
  confidence: number;
  is_active: boolean;
  my_vote: VoteValue | null;
}

/** POST /reports 응답은 Report + merged 예요. */
export interface CreateReportResponse extends Report {
  merged: boolean;
}

export interface CreateReportRequest {
  type: ReportType;
  lat: number;
  lng: number;
  description: string | null;
}

export type Weekday = "월" | "화" | "수" | "목" | "금" | "토" | "일";

export interface Hotspot {
  lat: number;
  lng: number;
  count: number;
  /** 0~23 (서울 시각) */
  peak_hour: number;
  peak_weekday: Weekday;
}

/** [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];

// ───────────────────────── 6.8 밥친구 ─────────────────────────

export type MeetupStatus = "open" | "full" | "cancelled";

export interface Meetup {
  id: string; // "mtp_3"
  title: string;
  place_name: string;
  restaurant_id: string | null;
  lat: number | null;
  lng: number | null;
  meal_time: IsoDateTime;
  max_people: number;
  member_count: number;
  members: string[];
  host_nickname: string;
  note: string | null;
  status: MeetupStatus;
  joined: boolean;
  is_host: boolean;
  created_at: IsoDateTime;
}

export interface CreateMeetupRequest {
  title: string;
  place_name: string;
  meal_time: IsoDateTime;
  max_people: number; // 2~10
  restaurant_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}

export interface MeetupMessage {
  id: string; // "msg_1"
  nickname: string;
  content: string;
  created_at: IsoDateTime;
}

export interface MeetupQuery {
  within_hours?: number; // 1~168
  include_full?: boolean;
}

// ───────────────────────── 6.10 지금 밥 먹을 사람 (실시간 위치) ─────────────────────────

/** 위치 공유 시간으로 고를 수 있는 값(분)이에요. */
export const PRESENCE_MINUTES = [30, 60, 120] as const;
export type PresenceMinutes = (typeof PRESENCE_MINUTES)[number];

/**
 * "지금 밥 먹을래요"를 켠 사람이에요.
 * lat, lng는 서버가 약 50m 격자로 흐린 좌표예요. (정확한 위치는 응답에 절대 안 와요)
 */
export interface Presence {
  user_id: string; // "usr_3"
  nickname: string;
  lat: number;
  lng: number;
  /** 이 시각이 지나면 자동으로 사라져요 */
  until: IsoDateTime;
  /** null이면 "아무거나" */
  food_pref: RestaurantCategory | null;
  message: string | null;
  /** 내 위치도 켜져 있을 때만 숫자(m) */
  distance_m: number | null;
  updated_at: IsoDateTime;
  is_me: boolean;
}

/**
 * PUT /presence/me 본문이에요.
 * minutes는 처음 켤 때만 보내요. heartbeat 때 빼고 보내면 끝나는 시각(until)이 그대로 유지돼요.
 */
export interface PresenceUpsert {
  lat: number;
  lng: number;
  minutes?: PresenceMinutes;
  food_pref: RestaurantCategory | null;
  /** 0~40자 */
  message: string | null;
}

// ───────────────────────── 6.11 번개 약속 ─────────────────────────

/** 번개 약속 시간: 지금(+10분) / 30분 뒤 / 1시간 뒤 / 점심 12시 / 저녁 6시 */
export type QuickWhen = "now" | "in_30" | "in_60" | "lunch" | "dinner";

/** POST /meetups/quick 본문이에요. 장소를 안 주면 서버가 "학생식당"으로 정해요. */
export interface QuickMeetupRequest {
  when: QuickWhen;
  restaurant_id?: string | null;
  place_name?: string | null;
  max_people?: number; // 기본 4
  note?: string | null;
}

/** POST /presence/{user_id}/invite 본문은 번개 약속과 같아요. */
export type InviteRequest = QuickMeetupRequest;

/** GET /meetups/suggestions 의 한 줄 — Meetup에 거리(m)가 붙어요. */
export type MeetupSuggestion = Meetup & { distance_m: number | null };

/** "같이 먹자" 알림 (WebSocket invite.received) 이에요. */
export interface InviteReceived {
  meetup: Meetup;
  from_nickname: string;
}

// ───────────────────────── 6.9 실시간 ─────────────────────────

/**
 * WebSocket으로 오는 밥약속 데이터예요. 모두에게 똑같이 보내니까 개인 필드(joined, is_host)는 빠져 있어요.
 * (화면에 그대로 쓰지 말고, 받은 뒤 쿼리를 다시 불러오는 신호로만 써 주세요)
 */
export type MeetupPublic = Omit<Meetup, "joined" | "is_host">;

/** 실시간 이벤트예요. 제보 data의 my_vote는 방송이라 항상 null이에요. */
export type RealtimeEvent =
  | { type: "report.created" | "report.updated"; data: Report }
  | { type: "report.removed"; data: { id: string } }
  | { type: "restaurant.created" | "restaurant.updated"; data: Restaurant }
  | { type: "meetup.created" | "meetup.updated" | "meetup.cancelled"; data: MeetupPublic }
  | { type: "meetup.message"; data: { meetup_id: string; message_id: string } }
  | { type: "online.count"; data: { count: number } }
  // 6.11 추가: 로그인한 연결(?token=)만 받아요.
  | { type: "presence.updated"; data: PresencePublic }
  | { type: "presence.removed"; data: { user_id: string } }
  | { type: "invite.received"; data: InviteReceived }
  // 밥약속 멤버에게만 오는 알림 (참여·마감·나감·취소·채팅·곧 시작)
  | { type: "meetup.notice"; data: MeetupNotice };

export type MeetupNoticeKind = "joined" | "left" | "full" | "cancelled" | "message" | "reminder";

/** "meetup.notice" 이벤트 내용이에요. 로그인한 멤버 연결에만 와요. */
export interface MeetupNotice {
  kind: MeetupNoticeKind;
  /** "mtp_…" */
  meetup_id: string;
  title: string;
  /** ISO 8601 (+09:00) */
  meal_time: string;
  /** 가게와 이어져 있으면 가게 이름, 아니면 place_name */
  place_name: string | null;
  member_count: number;
  max_people: number;
  /** 참여·나감·취소·채팅한 사람. reminder면 null */
  actor_nickname: string | null;
  /** kind가 message일 때만: 내용 앞 40자 (잘리면 끝에 "…") */
  preview: string | null;
}

/** 방송용 Presence예요. 사람마다 다른 distance_m, is_me는 빠져 있어요. */
export type PresencePublic = Omit<Presence, "distance_m" | "is_me">;

// ───────────────────────── 선택 상태 ─────────────────────────

/**
 * 인수인계 8장의 SelectedItem 중 DB 파트가 쓰는 부분이에요.
 * 통합 담당의 src/store/ui.ts SelectedItem에 `meetup`, `presence`를 추가해 달라고 요청했어요. (임시로 정한 것 4번)
 * presence의 id는 사용자 id("usr_3")예요.
 */
export type SelectedDbItem =
  | { type: "restaurant"; id: string }
  | { type: "report"; id: string }
  | { type: "meetup"; id: string }
  | { type: "presence"; id: string };
