// 강의실 검색 결과 레이어 (담당: 김도현). 선택한 강의실의 건물에 핀을 찍고 그쪽으로 이동.
import { useEffect } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import MapPin from "../components/MapPin";
import { useRouteStore } from "../store/route";

type LayerProps = { visible: boolean };

export function RoomLayer({ visible }: LayerProps) {
  const { current: map } = useMap();
  const room = useRouteStore((s) => s.selectedRoom);

  useEffect(() => {
    if (map && visible && room) {
      map.flyTo({ center: [room.building.lng, room.building.lat], zoom: 17.5 });
    }
  }, [map, visible, room]);

  if (!visible || !room) return null;
  return (
    <Marker longitude={room.building.lng} latitude={room.building.lat} anchor="bottom">
      <MapPin icon="🏫" color="#dc2626" activeColor="#b91c1c" active label={room.building.name} />
    </Marker>
  );
}
