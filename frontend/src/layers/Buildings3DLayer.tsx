// 3D 건물 레이어 (담당: 김도현). 배경 지도 벡터 타일의 building 레이어를 돌출시킨다.
// MapTiler / OpenFreeMap 등 OpenMapTiles 스키마 스타일에서 동작 (render_height 필드).
import { useEffect, useState } from "react";
import { Layer, useMap } from "react-map-gl/maplibre";

type LayerProps = { visible: boolean };

export function Buildings3DLayer({ visible }: LayerProps) {
  const { current: map } = useMap();
  const [source, setSource] = useState<string | null>(null);

  // 스타일의 벡터 소스 이름 찾기 (MapTiler는 "maptiler_planet", OpenFreeMap은 "openmaptiles")
  useEffect(() => {
    if (!map) return;
    const find = () => {
      const sources = map.getStyle()?.sources ?? {};
      setSource(Object.keys(sources).find((k) => sources[k].type === "vector") ?? null);
    };
    if (map.isStyleLoaded()) find();
    else map.once("load", find);
  }, [map]);

  useEffect(() => {
    map?.easeTo({ pitch: visible ? 45 : 0, duration: 600 });
  }, [map, visible]);

  if (!visible || !source) return null;
  return (
    <Layer
      id="buildings-3d"
      type="fill-extrusion"
      source={source}
      source-layer="building"
      minzoom={14}
      paint={{
        "fill-extrusion-color": "#d6d3d1",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      }}
    />
  );
}
