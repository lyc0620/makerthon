// 길찾기 / 러닝 루트 TanStack Query 훅 (담당: 김도현)
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";
import type { CampusSearchItem, LatLng, ListResponse, RouteMode, RouteResult, RunningRoute } from "../routeTypes";

// 통합: 공통 fetch 래퍼(api/client.ts) 사용 — 에러는 ApiError(message 포함)로 던진다
const getJson = <T,>(path: string): Promise<T> => apiGet<T>(path);

const pt = (p: LatLng) => `${p.lat},${p.lng}`;

export function useRoute(from: LatLng | null, to: LatLng | null, mode: RouteMode = "walk") {
  return useQuery({
    queryKey: ["route", from, to, mode],
    queryFn: () => getJson<RouteResult>(`/route?from=${pt(from!)}&to=${pt(to!)}&mode=${mode}`),
    enabled: !!from && !!to,
    staleTime: Infinity, // 같은 입력이면 다시 부르지 않음
    retry: false, // 400(보행로에서 멂)·404는 재시도해도 같음
  });
}

export function useCampusSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ["campus-search", query],
    queryFn: () => getJson<ListResponse<CampusSearchItem>>(`/campus/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: Infinity, // seed 데이터라 바뀌지 않음
    retry: false,
  });
}

export function useRunningRoutes(distanceKm: number | null, start: LatLng | null) {
  return useQuery({
    queryKey: ["running-routes", distanceKm, start],
    queryFn: () => {
      const q = new URLSearchParams({ distance_km: String(distanceKm) });
      if (start) {
        q.set("lat", String(start.lat));
        q.set("lng", String(start.lng));
      }
      return getJson<ListResponse<RunningRoute>>(`/running-routes?${q}`);
    },
    enabled: distanceKm !== null,
    staleTime: Infinity,
    retry: false,
  });
}
