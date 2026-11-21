// 명세 6.5 길찾기 / 러닝 루트 타입 (담당: 김도현)
// 통합 시 api/types.ts로 옮겨도 됨. 필드는 snake_case 그대로.

export type LineString = {
  type: "LineString";
  coordinates: [number, number][]; // [lng, lat]
};

export type RouteMode = "walk" | "run";

export type RouteResult = {
  distance_m: number;
  duration_s: number;
  ascent_m: number | null;
  descent_m: number | null;
  geometry: LineString;
};

export type RunningRoute = {
  id: string;
  name: string;
  distance_m: number;
  ascent_m: number | null;
  signal_count: number | null;
  geometry: LineString;
};

export type ListResponse<T> = {
  items: T[];
  count: number;
  updated_at: string | null;
};

export type LatLng = { lat: number; lng: number };
