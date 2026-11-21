// 지도 레이어가 지금 지도 상태(확대 정도, 화면 이동)를 읽는 작은 훅이에요.
// <Map> 안에서만 써요. (react-map-gl의 useMap()으로 지도를 읽기만 하고, 지도 설정은 안 바꿔요)
import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";

/** 0.5 단위로 반올림해요. (14.26 → 14.5) — 줌이 조금씩 바뀔 때마다 다시 그리지 않게 해요. */
function roundHalf(z: number) {
  return Math.round(z * 2) / 2;
}

/** 지금 지도 줌을 0.5 단위로 돌려줘요. 확대·축소가 끝났을 때('zoomend')만 바뀌어요. */
export function useMapZoom(fallback = 15) {
  const { current } = useMap();
  const [zoom, setZoom] = useState(() => (current ? roundHalf(current.getZoom()) : fallback));

  useEffect(() => {
    if (!current) return;
    const map = current.getMap();
    const update = () => setZoom(roundHalf(map.getZoom()));
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [current]);

  return zoom;
}

/**
 * 지도 이동·확대가 끝나고 delay(ms) 동안 조용하면 숫자가 1씩 올라가요.
 * 이 숫자를 useMemo 의존성으로 넣으면 "화면이 멈췄을 때만" 이름표 자리를 다시 계산할 수 있어요.
 */
export function useMapMoveTick(delay = 100) {
  const { current } = useMap();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!current) return;
    const map = current.getMap();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), delay);
    };
    map.on("moveend", bump);
    // 지도 스타일이 다 뜬 뒤 한 번 더 계산해요. (처음엔 화면 크기가 0일 수 있어요)
    map.on("load", bump);
    bump();
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend", bump);
      map.off("load", bump);
    };
  }, [current, delay]);

  return tick;
}

/** 경도·위도 → 화면 px 좌표. 지도가 아직 없으면 null을 돌려줘요. */
export function useProjector() {
  const { current } = useMap();
  if (!current) return null;
  return (lng: number, lat: number) => {
    const p = current.project([lng, lat]);
    return { x: p.x, y: p.y };
  };
}
