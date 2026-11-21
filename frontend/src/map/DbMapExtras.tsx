// DB 파트(맛집·제보·밥친구)가 지도에 바라는 것들 — MapView 안에 한 번 끼운다.
//  - 목록에서 항목을 누르면 그 위치로 이동 (useDbNavStore.focus)
//  - "지도에서 위치 찍기" 로 방금 찍은 점 미리보기 핀
//  - 찍기 모드 동안 커서를 십자로
import { useEffect } from 'react'
import { Marker, useMap } from 'react-map-gl/maplibre'

import { useDbNavStore, usePickStore } from '../store/db'

export default function DbMapExtras() {
  const { current: map } = useMap()
  const focus = useDbNavStore((s) => s.focus)
  const lastPoint = usePickStore((s) => s.lastPoint)
  const picking = usePickStore((s) => s.label !== null)

  useEffect(() => {
    if (!focus || !map) return
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 700,
      // 아래쪽 패널에 가리지 않게 화면 위쪽으로
      padding: { top: 0, left: 0, right: 0, bottom: Math.round(window.innerHeight * 0.45) },
    })
  }, [focus, map])

  useEffect(() => {
    const canvas = map?.getCanvas()
    if (!canvas) return
    canvas.style.cursor = picking ? 'crosshair' : ''
  }, [map, picking])

  if (!lastPoint) return null
  return (
    <Marker
      longitude={lastPoint.lng}
      latitude={lastPoint.lat}
      anchor="bottom"
      style={{ zIndex: 50 }}
    >
      <div className="text-3xl drop-shadow" role="img" aria-label="찍은 위치">
        📍
      </div>
    </Marker>
  )
}
