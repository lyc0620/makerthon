import 'maplibre-gl/dist/maplibre-gl.css'

import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { StyleSpecification } from 'maplibre-gl'
import { type ReactNode, useEffect, useState } from 'react'
import { GeolocateControl, Map, NavigationControl } from 'react-map-gl/maplibre'

import { useUi } from '../store/ui'
import { DEM_SOURCE_ID, loadStylizedStyle, PALETTE, VIEW_BOUNDS } from './stylize'

const PITCH_3D = 50

/** 배경 스타일을 받아 미니어처 색으로 바꾼다. 실패하면 원래 스타일 URL 을 그대로 쓴다. */
function useStylizedStyle(url: string): StyleSpecification | string | null {
  const [style, setStyle] = useState<StyleSpecification | string | null>(null)
  useEffect(() => {
    let alive = true
    loadStylizedStyle(url)
      .then((s) => alive && setStyle(s))
      .catch(() => alive && setStyle(url))
    return () => {
      alive = false
    }
  }, [url])
  return style
}

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
  const mapStyle = useStylizedStyle(STYLE_URL)

  if (!mapStyle) return <div className="absolute inset-0" style={{ background: PALETTE.ground }} />

  return (
    <Map
      mapStyle={mapStyle}
      initialViewState={{
        latitude: CAMPUS_CENTER.lat,
        longitude: CAMPUS_CENTER.lng,
        zoom: 14.6,
        pitch: PITCH_3D,
      }}
      // 지도는 항상 3D: 기울인 시점 + 지형(산). 3D 켜기/끄기 버튼은 없앴다 (2026-11-21 사용자 결정)
      // (스타일 변환에 실패해 원본 URL 을 쓰는 경우엔 고도 소스가 없으므로 지형 없이)
      terrain={
        typeof mapStyle === 'string' ? undefined : { source: DEM_SOURCE_ID, exaggeration: 1.4 }
      }
      style={{ position: 'absolute', inset: 0 }}
      attributionControl={{ compact: true }}
      maxPitch={75} // 많이 기울이면 뒤쪽 산과 하늘이 보인다
      maxBounds={VIEW_BOUNDS} // 캠퍼스·현풍읍·유가읍·주변 산지 밖으로는 이동하지 않는다
      minZoom={12} // 원형 지역 전체가 한 화면에 들어오는 정도까지
      onLoad={(e) => {
        // 개발 중 콘솔에서 시점을 조정해 볼 수 있게 (window.__map.jumpTo({ pitch: 60 }))
        if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = e.target
      }}
      onClick={() => select(null)} // 빈 곳을 누르면 바텀시트 닫기 (마커는 이벤트 전파를 막는다)
    >
      {/* 항상 3D: 회전·기울기가 있으므로 나침반(누르면 북쪽·수평으로 복귀)을 보여 준다 */}
      <NavigationControl
        position="top-right"
        showCompass
        visualizePitch
        style={{ marginTop: 64 }}
      />
      <GeolocateControl position="top-right" trackUserLocation showAccuracyCircle />
      {children}
    </Map>
  )
}
