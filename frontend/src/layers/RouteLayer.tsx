// 길찾기 레이어 (담당: 김도현). 지도 클릭 1번째 = 출발, 2번째 = 도착.
import { useEffect } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { useRoute } from "../api/hooks/useRoute";
import { useRouteStore } from "../store/route";

type LayerProps = { visible: boolean };

export function RouteLayer({ visible }: LayerProps) {
  const { current: map } = useMap();
  const { from, to, mode, clickPoint } = useRouteStore();
  const { data } = useRoute(from, to, mode);

  useEffect(() => {
    if (!map || !visible) return;
    const onClick = (e: MapLayerMouseEvent) => clickPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, visible, clickPoint]);

  if (!visible) return null;
  return (
    <>
      {data && (
        <Source id="route" type="geojson" data={{ type: "Feature", properties: {}, geometry: data.geometry }}>
          <Layer
            id="route-casing"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{ "line-color": "#ffffff", "line-width": 10 }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{ "line-color": "#2563eb", "line-width": 6 }}
          />
        </Source>
      )}
      {from && <Marker longitude={from.lng} latitude={from.lat} color="#16a34a" />}
      {to && <Marker longitude={to.lng} latitude={to.lat} color="#dc2626" />}
    </>
  );
}
