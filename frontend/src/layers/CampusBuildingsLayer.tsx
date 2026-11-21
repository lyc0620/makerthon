// 캠퍼스 건물만 3D 로 세운다 (캠퍼스 밖 건물은 배경 지도에서 위에서 본 윤곽만).
// 데이터: public/data/campus-buildings.geojson ← backend/scripts/build_campus_buildings.py (OSM 윤곽 + 층수 표)
//
// low-poly 미니어처 느낌:
//  - 층마다 [벽 띠 → 창문 띠] 를 번갈아 쌓는다 (텍스처 없이 색 띠만으로 창문 줄이 보이게)
//  - 지붕: 테두리 난간벽(밝은 회색 고리) + 그 안의 한 단 낮은 지붕 판
//  - 바닥 그림자, 건물 이름표
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson'
import { useEffect, useMemo, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'

import { PALETTE } from '../map/stylize'
import type { LayerProps } from './types'

const FLOOR_M = 3.6
const WALL_BAND_M = 1.3 // 층마다 창문 아래 벽 높이
const PARAPET_M = 1.1 // 난간벽 높이
const ROOF_INSET = 0.86 // 지붕 판을 중심 쪽으로 줄이는 비율 (난간벽 두께)

type BuildingProps = { osm_id: number; name: string | null; levels: number; height: number }
type BuildingFeature = Feature<Polygon, BuildingProps>

/** 짧은 이름표: "대구경북과학기술원 강의동" → "강의동" */
const labelOf = (name: string | null) => name?.replace(/^대구경북과학기술원\s*/, '') ?? null

function centroid(ring: Position[]): Position {
  const pts = ring.slice(0, -1)
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length
  return [x, y]
}

/** 고리를 중심 쪽으로 k 배 줄인다 (볼록에 가까운 건물에서 '안쪽 테두리'를 흉내) */
const shrink = (ring: Position[], k: number): Position[] => {
  const [cx, cy] = centroid(ring)
  return ring.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k])
}

type Band = Feature<
  Polygon,
  { base: number; top: number; kind: 'wall' | 'window' | 'parapet' | 'roof' }
>

function buildBands(buildings: BuildingFeature[]): FeatureCollection<Polygon> {
  const bands: Band[] = []
  for (const b of buildings) {
    const outer = b.geometry.coordinates[0]
    const levels = Math.max(1, b.properties.levels)
    for (let i = 0; i < levels; i++) {
      const floor = i * FLOOR_M
      bands.push(band(outer, floor, floor + WALL_BAND_M, 'wall'))
      bands.push(band(outer, floor + WALL_BAND_M, floor + FLOOR_M, 'window'))
    }
    const top = levels * FLOOR_M
    const inner = shrink(outer, ROOF_INSET)
    // 난간벽: 바깥 고리에 안쪽 고리를 구멍으로 뚫은 도넛
    bands.push({
      type: 'Feature',
      properties: { base: top, top: top + PARAPET_M, kind: 'parapet' },
      geometry: { type: 'Polygon', coordinates: [outer, [...inner].reverse()] },
    })
    bands.push(band(inner, top, top + 0.25, 'roof'))
  }
  return { type: 'FeatureCollection', features: bands }
}

const band = (
  ring: Position[],
  base: number,
  top: number,
  kind: Band['properties']['kind'],
): Band => ({
  type: 'Feature',
  properties: { base, top, kind },
  geometry: { type: 'Polygon', coordinates: [ring] },
})

function useCampusBuildings() {
  const [data, setData] = useState<FeatureCollection<Polygon, BuildingProps> | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/data/campus-buildings.geojson')
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [])
  return data
}

export default function CampusBuildingsLayer({ visible }: LayerProps) {
  const data = useCampusBuildings()

  const { bands, labels } = useMemo(() => {
    const feats = (data?.features ?? []) as BuildingFeature[]
    return {
      bands: buildBands(feats),
      labels: {
        type: 'FeatureCollection',
        features: feats
          .filter((f) => labelOf(f.properties.name))
          .map((f) => ({
            type: 'Feature',
            properties: { label: labelOf(f.properties.name) },
            geometry: { type: 'Point', coordinates: centroid(f.geometry.coordinates[0]) },
          })),
      } as FeatureCollection,
    }
  }, [data])

  if (!visible || !data) return null

  return (
    <>
      {/* 바닥 그림자: 건물 윤곽을 남동쪽으로 살짝 밀어 흐리게 */}
      <Source id="campus-footprints" type="geojson" data={data}>
        <Layer
          id="campus-shadow"
          type="fill"
          paint={{
            'fill-color': PALETTE.campusShadow,
            'fill-opacity': 0.22,
            'fill-translate': [5, 6],
            'fill-translate-anchor': 'map',
            'fill-antialias': false,
          }}
        />
      </Source>

      <Source id="campus-bands" type="geojson" data={bands}>
        <Layer
          id="campus-buildings-3d"
          type="fill-extrusion"
          paint={{
            'fill-extrusion-color': [
              'match',
              ['get', 'kind'],
              'window',
              PALETTE.campusWindow,
              'parapet',
              PALETTE.campusParapet,
              'roof',
              PALETTE.campusRoof,
              PALETTE.campusWall,
            ],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'top'],
            'fill-extrusion-opacity': 1,
            'fill-extrusion-vertical-gradient': false, // 띠 색이 층마다 뚜렷하게
          }}
        />
      </Source>

      <Source id="campus-labels" type="geojson" data={labels}>
        <Layer
          id="campus-labels"
          type="symbol"
          minzoom={15}
          layout={{
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 15],
            'text-offset': [0, -1.2],
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': '#2f3237',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.6,
          }}
        />
      </Source>
    </>
  )
}
