// 레이어끼리 "여기는 가리지 마세요" 정보를 나누는 작은 저장소예요.
// - 제보 핀·사람 점은 늘 보여야 하니까 고정 장애물(44px)로 올려 둬요.
// - 맛집 레이어는 자리를 정한 이름표 상자를 올려 두고, 밥약속 레이어가 그걸 피해요.
// - 맛집 레이어가 지금 보여 주는 가게 id도 올려 둬서, 그 가게의 밥약속은 가게 이름표에 붙여 그려요.
// 서버 API와는 상관없는 화면 전용 상태예요.
import { useEffect } from "react";
import { create } from "zustand";
import type { Obstacle } from "./labelPlacement";

export type ObstacleSource = "report" | "presence" | "restaurantLabels";

interface MapObstacleState {
  obstacles: Record<ObstacleSource, Obstacle[]>;
  /** 맛집 레이어가 지금 그리는 가게 id */
  shownRestaurantIds: string[];
  /** 밥약속 레이어가 켜져 있는지 (꺼져 있으면 가게 이름표에 밥약속 배지를 안 붙여요) */
  meetupVisible: boolean;
  setObstacles: (source: ObstacleSource, list: Obstacle[]) => void;
  setShownRestaurantIds: (ids: string[]) => void;
  setMeetupVisible: (v: boolean) => void;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const useMapObstacles = create<MapObstacleState>((set, get) => ({
  obstacles: { report: [], presence: [], restaurantLabels: [] },
  shownRestaurantIds: [],
  meetupVisible: false,
  setObstacles: (source, list) => {
    // 내용이 같으면 바꾸지 않아요. (다른 레이어가 쓸데없이 다시 계산하지 않게)
    if (sameJson(get().obstacles[source], list)) return;
    set((s) => ({ obstacles: { ...s.obstacles, [source]: list } }));
  },
  setShownRestaurantIds: (ids) => {
    if (sameJson(get().shownRestaurantIds, ids)) return;
    set({ shownRestaurantIds: ids });
  },
  setMeetupVisible: (v) => {
    if (get().meetupVisible !== v) set({ meetupVisible: v });
  },
}));

/** 레이어가 장애물 목록을 올리고, 사라질 때 비워요. */
export function usePublishObstacles(source: ObstacleSource, list: Obstacle[]) {
  const setObstacles = useMapObstacles((s) => s.setObstacles);
  const key = JSON.stringify(list);
  useEffect(() => {
    setObstacles(source, JSON.parse(key) as Obstacle[]);
  }, [source, key, setObstacles]);
  useEffect(() => () => setObstacles(source, []), [source, setObstacles]);
}

/** 제보 핀·사람 점이 차지하는 고정 크기(px) */
export const FIXED_OBSTACLE = 44;
