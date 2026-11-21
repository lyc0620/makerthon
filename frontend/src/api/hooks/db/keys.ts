// TanStack Query 키를 한곳에 모아 둬요.
// 실시간(WebSocket) 이벤트가 오면 이 키들 앞부분으로 한꺼번에 무효화해요.
import type { BBox, MeetupQuery, RestaurantFilters, ReportType, ReviewSort } from "../../types.db";

export const dbKeys = {
  all: ["db"] as const,

  restaurants: ["db", "restaurants"] as const,
  restaurantList: (f: RestaurantFilters) => ["db", "restaurants", "list", f] as const,
  restaurantDetails: ["db", "restaurants", "detail"] as const,
  restaurant: (id: string) => ["db", "restaurants", "detail", id] as const,
  reviewsOf: (id: string) => ["db", "restaurants", "reviews", id] as const,
  reviews: (id: string, sort: ReviewSort) => ["db", "restaurants", "reviews", id, sort] as const,
  restaurantMeta: ["db", "restaurant-meta"] as const,
  placeSearch: (q: string) => ["db", "place-search", q] as const,

  reports: ["db", "reports"] as const,
  reportLists: ["db", "reports", "list"] as const,
  reportList: (bbox: BBox | undefined, type: ReportType | undefined) =>
    ["db", "reports", "list", bbox ?? null, type ?? null] as const,
  report: (id: string) => ["db", "reports", "detail", id] as const,
  hotspots: (type: ReportType, days: number) => ["db", "reports", "hotspots", type, days] as const,

  meetups: ["db", "meetups"] as const,
  meetupLists: ["db", "meetups", "list"] as const,
  meetupList: (q: MeetupQuery) => ["db", "meetups", "list", q] as const,
  meetup: (id: string) => ["db", "meetups", "detail", id] as const,
  meetupMessages: (id: string) => ["db", "meetup-messages", id] as const,
  /** 추천 약속. 좌표는 소수 셋째 자리(약 100m)로 줄여서 키가 너무 자주 바뀌지 않게 해요. */
  meetupSuggestions: (lat: number, lng: number) =>
    ["db", "meetups", "suggestions", lat.toFixed(3), lng.toFixed(3)] as const,
  meetupSuggestionLists: ["db", "meetups", "suggestions"] as const,

  // 6.10 실시간 위치 — 로그인한 사람만 볼 수 있어서, 로그아웃하면 통째로 지워요.
  presence: ["db", "presence"] as const,
  presenceList: ["db", "presence", "list"] as const,
};
