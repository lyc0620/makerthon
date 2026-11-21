// 길찾기 / 러닝 루트 TanStack Query 훅 (담당: 김도현)
import { useQuery } from "@tanstack/react-query";
import type { LatLng, ListResponse, RouteMode, RouteResult, RunningRoute } from "../routeTypes";

// TODO(통합): api/client.ts가 생기면 그쪽 fetch 래퍼로 교체
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `요청 실패 (${res.status})`);
  }
  return body as T;
}

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
