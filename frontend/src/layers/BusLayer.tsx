import { Marker } from 'react-map-gl/maplibre'

import { useBusStops } from '../api/hooks/bus'
import MapPin, { PIN_COLORS } from '../components/MapPin'
import { useUi } from '../store/ui'
import type { LayerProps } from './types'

export default function BusLayer({ visible }: LayerProps) {
  const { data } = useBusStops()
  const select = useUi((s) => s.select)
  const selected = useUi((s) => s.selected)

  if (!visible || !data) return null

  return data.items.map((stop) => {
    const active = selected?.type === 'bus_stop' && selected.id === stop.id
    return (
      <Marker
        key={stop.id}
        latitude={stop.lat}
        longitude={stop.lng}
        anchor="bottom"
        onClick={(e) => {
          e.originalEvent.stopPropagation()
          select({ type: 'bus_stop', id: stop.id })
        }}
      >
        <MapPin
          icon="🚌"
          color={PIN_COLORS.bus[0]}
          activeColor={PIN_COLORS.bus[1]}
          active={active}
          label={`${stop.name} 정류장`}
        />
      </Marker>
    )
  })
}
