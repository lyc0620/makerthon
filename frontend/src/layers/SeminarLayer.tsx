import { useMemo } from 'react'
import { Marker } from 'react-map-gl/maplibre'

import { useSeminars } from '../api/hooks/seminars'
import type { Seminar } from '../api/types'
import { useUi } from '../store/ui'
import type { LayerProps } from './types'

/** 같은 건물의 세미나는 마커 하나로 묶는다 (가장 빠른 일정이 대표). */
export default function SeminarLayer({ visible }: LayerProps) {
  const { data } = useSeminars()
  const select = useUi((s) => s.select)
  const selected = useUi((s) => s.selected)

  const groups = useMemo(() => {
    const byBuilding = new Map<string, Seminar[]>()
    for (const s of data?.items ?? []) {
      if (!s.building_id || s.lat === null || s.lng === null) continue // 매핑 실패 → 목록에만
      const list = byBuilding.get(s.building_id) ?? []
      list.push(s)
      byBuilding.set(s.building_id, list)
    }
    return [...byBuilding.values()]
  }, [data])

  if (!visible) return null

  return groups.map((list) => {
    const first = list[0]
    const active = selected?.type === 'seminar' && list.some((s) => s.id === selected.id)
    return (
      <Marker
        key={first.building_id}
        latitude={first.lat!}
        longitude={first.lng!}
        anchor="bottom"
        onClick={(e) => {
          e.originalEvent.stopPropagation()
          select({ type: 'seminar', id: first.id })
        }}
      >
        <button
          type="button"
          aria-label={`세미나 ${list.length}건`}
          className={`relative flex size-9 items-center justify-center rounded-full border-2 border-white text-base shadow-md transition ${
            active ? 'scale-110 bg-indigo-700' : 'bg-indigo-500'
          }`}
        >
          <span aria-hidden>🎤</span>
          {list.length > 1 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {list.length}
            </span>
          )}
        </button>
      </Marker>
    )
  })
}
