// 길찾기·러닝 입력 상태 (담당: 김도현). 마커 선택(SelectedItem)과 별개로 관리한다.
import { create } from "zustand";
import type { LatLng, RouteMode } from "../api/routeTypes";

export const DGIST_GATE: LatLng = { lat: 35.7003, lng: 128.4576 };

type RouteState = {
  // 길찾기
  from: LatLng | null;
  to: LatLng | null;
  mode: RouteMode;
  /** 지도 클릭: 1번째 = 출발, 2번째 = 도착, 3번째 = 새 출발 */
  clickPoint: (p: LatLng) => void;
  setMode: (m: RouteMode) => void;
  clearRoute: () => void;

  // 러닝
  runStart: LatLng;
  distanceKm: number | null; // null이면 아직 요청 안 함
  selectedRunId: string | null;
  setRunStart: (p: LatLng) => void;
  requestRuns: (km: number) => void;
  selectRun: (id: string | null) => void;

  // 3D
  buildings3d: boolean;
  setBuildings3d: (on: boolean) => void;
};

export const useRouteStore = create<RouteState>((set, get) => ({
  from: null,
  to: null,
  mode: "walk",
  clickPoint: (p) => {
    const { from, to } = get();
    if (!from || to) set({ from: p, to: null });
    else set({ to: p });
  },
  setMode: (mode) => set({ mode }),
  clearRoute: () => set({ from: null, to: null }),

  runStart: DGIST_GATE,
  distanceKm: null,
  selectedRunId: null,
  setRunStart: (runStart) => set({ runStart, distanceKm: null, selectedRunId: null }),
  requestRuns: (distanceKm) => set({ distanceKm, selectedRunId: null }),
  selectRun: (selectedRunId) => set({ selectedRunId }),

  buildings3d: false,
  setBuildings3d: (buildings3d) => set({ buildings3d }),
}));
