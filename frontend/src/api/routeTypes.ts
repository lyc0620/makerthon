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

// 명세 6.8 강의실 검색
export type FloorPlanRef = {
  id: string;
  image_url: string; // /api/v1/campus/floor-plans/{id}/image (백엔드 중계)
  source_image_url: string;
  width: number;
  height: number;
  source_url: string;
};

export type CampusSearchItem = {
  type: "room" | "building";
  id: string;
  code: string | null;
  name: string | null;
  floor: string | null;
  floor_label: string | null;
  building: { id: string; name: string; lat: number; lng: number };
  plan: FloorPlanRef | null;
  x: number | null; // 안내도 이미지 안의 픽셀 위치
  y: number | null;
  // 영상으로 복원한 3D 스캔 (splat: 가우시안 스플래팅, points: 점 구름)
  scans: { id: string; title: string; viewer: "splat" | "points"; viewer_url: string }[];
};
