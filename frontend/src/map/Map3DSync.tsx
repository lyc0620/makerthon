import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'

import { DEM_SOURCE_ID } from './stylize'

const PITCH_3D = 50

/**
 * 3D 모드 전환: 지도 기울이기 + 지형(산) 켜기/끄기.
 * 평면 모드에서는 지형이 필요 없고 모바일 성능에도 부담이라 3D 일 때만 켠다.
 * (캠퍼스 건물 박스는 모드와 상관없이 항상 그린다 — 위에서 보면 평면처럼 보인다)
 */
export default function Map3DSync({ enabled3d }: { enabled3d: boolean }) {
  const { current: ref } = useMap()

  useEffect(() => {
    const map = ref?.getMap()
    if (!map) return
    const apply = () => {
      if (!map.getSource(DEM_SOURCE_ID)) return
      const on = !!map.getTerrain()
      if (enabled3d && !on) map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1.4 })
      if (!enabled3d && on) map.setTerrain(null)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    map.easeTo({
      pitch: enabled3d ? PITCH_3D : 0,
      bearing: enabled3d ? map.getBearing() : 0,
      duration: 600,
    })
  }, [ref, enabled3d])

  return null
}
