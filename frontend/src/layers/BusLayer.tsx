import { Marker } from 'react-map-gl/maplibre'

import { useBusStops } from '../api/hooks/bus'
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
        <button
          type="button"
          aria-label={`${stop.name} 정류장`}
          className={`flex items-center gap-1 rounded-full border-2 border-white px-2 py-1 text-xs font-semibold text-white shadow-md transition ${
            active ? 'scale-110 bg-sky-700' : 'bg-sky-500'
          }`}
        >
          <span aria-hidden>🚌</span>
          <span className="max-w-24 truncate">{stop.name}</span>
        </button>
      </Marker>
    )
  })
}
