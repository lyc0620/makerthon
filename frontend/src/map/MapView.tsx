import 'maplibre-gl/dist/maplibre-gl.css'

import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ReactNode } from 'react'
import { GeolocateControl, Map, NavigationControl } from 'react-map-gl/maplibre'

import { useUi } from '../store/ui'

// 비어 있으면 OpenFreeMap(키 불필요, OSM 기반). MapTiler·브이월드로 바꿀 땐 .env 만 수정
const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'

// maplibre v6 워커를 Vite 가 따로 번들하도록 경로를 직접 지정 (기본 경로는 dev 서버에서 깨짐)
setWorkerUrl(workerUrl)

// 캠퍼스(북쪽)와 유가읍 정류장(남쪽)이 한 화면에 들어오는 위치
const CAMPUS_CENTER = { lat: 35.7012, lng: 128.4565 }

type Props = { children?: ReactNode }

/** 앱 전체에 지도는 이것 하나. 기능별 레이어는 children 으로 끼운다. */
export default function MapView({ children }: Props) {
  const select = useUi((s) => s.select)

  return (
    <Map
      initialViewState={{
        latitude: CAMPUS_CENTER.lat,
        longitude: CAMPUS_CENTER.lng,
        zoom: 14.6,
      }}
      mapStyle={STYLE_URL}
      style={{ position: 'absolute', inset: 0 }}
      attributionControl={{ compact: true }}
      onClick={() => select(null)} // 빈 곳을 누르면 바텀시트 닫기 (마커는 이벤트 전파를 막는다)
    >
      <NavigationControl position="top-right" showCompass={false} style={{ marginTop: 64 }} />
      <GeolocateControl position="top-right" trackUserLocation showAccuracyCircle />
      {children}
    </Map>
  )
}
