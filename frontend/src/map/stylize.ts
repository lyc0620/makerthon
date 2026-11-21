/**
 * 배경 지도(OpenFreeMap liberty 등 OpenMapTiles 스키마)를 low-poly 미니어처(디오라마) 느낌으로 바꾼다.
 *  - 지역(캠퍼스·현풍읍·유가읍·주변 산지)만: 밖은 가림막, 경계는 점점 흐려지게(페이드), 타일도 지역 안만 요청
 *  - 건물: 배경 건물은 그리지 않는다 (캠퍼스 건물만 CampusBuildingsLayer 가 3D 로)
 *  - 도로: 실제 폭(m)대로 아스팔트 + 보도(연회색 테두리) + 흰 가장자리선 + 중앙선(노란 실선 / 흰 점선)
 *  - 흰 바닥, 연두 녹지, 하늘색 물, 지형 음영, 하늘·안개
 * 스타일 JSON 을 받아 바꾸므로 같은 스키마(OpenMapTiles)의 다른 배경 지도에도 그대로 적용된다.
 */
import type { Feature, FeatureCollection } from 'geojson'
import type {
  ExpressionSpecification,
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl'

import { cloudData } from './clouds'

export const PALETTE = {
  ground: '#f4f3f0',
  residential: '#f1efea',
  school: '#efedf4',
  grass: '#bfe0a0',
  wood: '#9ccd88',
  water: '#8fcbef',
  asphalt: '#4d5158',
  asphaltMinor: '#62666e',
  sidewalk: '#d3d5da',
  edgeLine: '#ffffff',
  centerLine: '#f2c64a', // 중앙선 (노란 실선)
  laneLine: '#ffffff', // 차선 (흰 점선)
  path: '#dcd6ca',
  footprint: '#ebe8e2', // 캠퍼스 밖 건물: 위에서 본 윤곽 (평면)
  footprintLine: '#c3beb4',
  bank: '#cde6b3', // 물가 둑
  bridgeDeck: '#e3e4e7', // 다리 상판 가장자리
  bridgeRail: '#ffffff', // 다리 난간
  campusWall: '#60646c', // 캠퍼스 건물 벽: 진한 회색
  campusWindow: '#3e4a59', // 창문 띠: 푸른빛 도는 짙은 회색
  campusRoof: '#454950', // 지붕 판
  campusParapet: '#7a7f88', // 지붕 테두리(난간벽): 살짝 밝게
  campusShadow: '#2a2d33',
  outside: '#e9e7e2', // 지역 밖 (가림막)
  cloudBase: '#e6edf4', // 구름 밑단: 살짝 푸른 회색
  cloudMid: '#f4f8fb',
  cloudTop: '#ffffff',
  cloudShadow: '#5d7183', // 땅에 드리운 구름 그림자
  sky: '#8ec5f4',
  horizon: '#dceffc',
  fog: '#eef6fb',
} as const

/**
 * 지도 범위: 캠퍼스 + 현풍읍 + 유가읍(테크노폴리스) + 주변 산지를 담는 원.
 * 원 밖은 가림막으로 덮고, 가장자리 FADE_KM 구간은 바깥으로 갈수록 점점 흐려진다.
 * 화면 이동(maxBounds)과 타일 요청(source bounds)도 이 원을 감싸는 사각형으로 제한한다.
 */
export const REGION_CENTER = { lng: 128.4575, lat: 35.7 }
const REGION_RADIUS_KM = 3.6
const FADE_KM = 0.7 // 경계는 구름(clouds.ts)이 가리므로 흐림 구간은 짧게
const FADE_STEPS = 16

const KM_PER_DEG_LAT = 111.32
const KM_PER_DEG_LNG = 111.32 * Math.cos((REGION_CENTER.lat * Math.PI) / 180)
const squareAround = (km: number): [number, number, number, number] => [
  REGION_CENTER.lng - km / KM_PER_DEG_LNG,
  REGION_CENTER.lat - km / KM_PER_DEG_LAT,
  REGION_CENTER.lng + km / KM_PER_DEG_LNG,
  REGION_CENTER.lat + km / KM_PER_DEG_LAT,
]
// 화면 이동 한계: 원보다 조금 넓게 (흐려지는 가장자리가 보이도록) [서, 남, 동, 북]
export const VIEW_BOUNDS = squareAround(REGION_RADIUS_KM + 0.4)
const SOURCE_BOUNDS = squareAround(REGION_RADIUS_KM + 0.8)

// 무료 고도 타일 (AWS Open Data, terrarium 인코딩, CORS 허용)
export const DEM_SOURCE_ID = 'terrain-dem'
const HILLSHADE_SOURCE_ID = 'hillshade-dem'
const demSource = (): SourceSpecification => ({
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  bounds: SOURCE_BOUNDS, // 지역 밖 고도 타일은 요청하지 않는다
  attribution: 'Terrain: Mapzen',
})

export const SKY: SkySpecification = {
  'sky-color': PALETTE.sky,
  'horizon-color': PALETTE.horizon,
  'fog-color': PALETTE.fog,
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.75, // 멀리 있는 땅은 안개에 묻힌다
  'atmosphere-blend': 0,
}

type Paint = Record<string, unknown>

function setPaint(layer: LayerSpecification, paint: Paint) {
  ;(layer as { paint?: Paint }).paint = { ...((layer as { paint?: Paint }).paint ?? {}), ...paint }
}

function recolor(layer: LayerSpecification) {
  const id = layer.id
  if (layer.type === 'background') setPaint(layer, { 'background-color': PALETTE.ground })
  if (layer.type !== 'fill') return
  if (id === 'water') setPaint(layer, { 'fill-color': PALETTE.water })
  else if (id === 'landcover_wood')
    setPaint(layer, { 'fill-color': PALETTE.wood, 'fill-opacity': 1 })
  else if (/park|grass|pitch|cemetery/.test(id))
    setPaint(layer, { 'fill-color': PALETTE.grass, 'fill-opacity': 1 })
  else if (id === 'landuse_residential')
    setPaint(layer, { 'fill-color': PALETTE.residential, 'fill-opacity': 1 })
  else if (id === 'landuse_school') setPaint(layer, { 'fill-color': PALETTE.school })
  else if (id === 'road_area_pattern') setPaint(layer, { 'fill-color': PALETTE.sidewalk })
}

// ───────── 도로 ─────────
// 실제 폭(m). 줌에 따라 화면 픽셀로 바꾼다 (MapLibre 512px 타일, 위도 35.7° 기준 1m = 2^z / 63565 px)
const ROAD_WIDTH_M: ExpressionSpecification = [
  'match',
  ['get', 'class'],
  ['motorway', 'trunk'],
  22,
  'primary',
  17,
  'secondary',
  13,
  'tertiary',
  10,
  'minor',
  6.5,
  'service',
  4,
  'track',
  3,
  2.5,
]
const metersToPx = (
  meters: ExpressionSpecification | number,
  extra = 0,
): ExpressionSpecification => [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  10,
  ['+', ['*', meters, 1024 / 63565], extra * 0.2],
  20,
  ['+', ['*', meters, 1048576 / 63565], extra * 2],
]

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
const VEHICLE = [...MAJOR, 'minor', 'service', 'track']

const roadFilter = (classes: string[]): ExpressionSpecification => [
  'all',
  ['==', ['geometry-type'], 'LineString'],
  ['match', ['get', 'class'], classes, true, false],
  ['!=', ['get', 'brunnel'], 'tunnel'],
]

function roadLayers(source: string): LayerSpecification[] {
  const base = { source, 'source-layer': 'transportation' } as const
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const
  return [
    // 보행로·산책로: 연한 점선
    {
      ...base,
      id: 'road-path',
      type: 'line',
      minzoom: 14,
      filter: roadFilter(['path']),
      layout: round,
      paint: {
        'line-color': PALETTE.path,
        'line-width': metersToPx(2),
        'line-dasharray': [1.5, 1],
      },
    },
    // 보도(연회색 테두리) — 아스팔트보다 양쪽 2.5m씩 넓게
    {
      ...base,
      id: 'road-sidewalk',
      type: 'line',
      minzoom: 12,
      filter: roadFilter(VEHICLE),
      layout: round,
      paint: { 'line-color': PALETTE.sidewalk, 'line-width': metersToPx(['+', ROAD_WIDTH_M, 5]) },
    },
    // 아스팔트
    {
      ...base,
      id: 'road-asphalt',
      type: 'line',
      filter: roadFilter(VEHICLE),
      layout: round,
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          MAJOR,
          PALETTE.asphalt,
          PALETTE.asphaltMinor,
        ] as ExpressionSpecification,
        'line-width': metersToPx(ROAD_WIDTH_M, 0.6),
      },
    },
    // 흰 가장자리선: 선 사이 간격(gap)을 도로 폭으로 줘서 양쪽 끝에 두 줄을 긋는다
    {
      ...base,
      id: 'road-edge-lines',
      type: 'line',
      minzoom: 15.5,
      filter: roadFilter(MAJOR),
      paint: {
        'line-color': PALETTE.edgeLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15.5, 0.5, 19, 1.6],
        'line-gap-width': metersToPx(['-', ROAD_WIDTH_M, 1.6]),
        'line-opacity': 0.85,
      },
    },
    // 중앙선: 큰 도로는 노란 실선
    {
      ...base,
      id: 'road-center-line',
      type: 'line',
      minzoom: 15,
      filter: roadFilter(MAJOR),
      paint: {
        'line-color': PALETTE.centerLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 19, 2.4],
      },
    },
    // 차선: 큰 도로는 중앙선 양옆 흰 점선 (gap 으로 두 줄)
    {
      ...base,
      id: 'road-lane-lines',
      type: 'line',
      minzoom: 16,
      filter: ['all', roadFilter(['motorway', 'trunk', 'primary', 'secondary'])],
      paint: {
        'line-color': PALETTE.laneLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.6, 19, 1.4],
        'line-gap-width': metersToPx(['/', ROAD_WIDTH_M, 2]),
        'line-dasharray': [5, 5],
        'line-opacity': 0.9,
      },
    },
    // 작은 길: 가운데 흰 점선
    {
      ...base,
      id: 'road-minor-center',
      type: 'line',
      minzoom: 16.5,
      filter: roadFilter(['minor']),
      paint: {
        'line-color': PALETTE.laneLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 16.5, 0.6, 19, 1.2],
        'line-dasharray': [4, 4],
        'line-opacity': 0.8,
      },
    },
  ] as LayerSpecification[]
}

const hillshadeLayer = (): LayerSpecification => ({
  id: 'terrain-hillshade',
  type: 'hillshade',
  source: HILLSHADE_SOURCE_ID,
  paint: {
    'hillshade-exaggeration': 0.35,
    'hillshade-shadow-color': '#7fa77a',
    'hillshade-highlight-color': '#ffffff',
    'hillshade-accent-color': '#9fc79a',
  },
})

// ───────── 지역 밖 가림막 + 경계 페이드 ─────────
type Ring = [number, number][]
// 바깥 테두리는 반시계, 구멍은 시계 방향이어야 MapLibre 가 구멍으로 인식한다
const worldRing: Ring = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
]
/** 중심에서 반지름 km 인 원 (반시계 방향, 96각형) */
function circle(km: number): Ring {
  const ring: Ring = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI
    ring.push([
      REGION_CENTER.lng + (km / KM_PER_DEG_LNG) * Math.cos(a),
      REGION_CENTER.lat + (km / KM_PER_DEG_LAT) * Math.sin(a),
    ])
  }
  return ring
}
const holeOf = (ring: Ring): Ring => [...ring].reverse()

/**
 * 원 가장자리에서 안쪽으로 FADE_KM 만큼, FADE_STEPS 개의 고리(도넛)를 만든다.
 * 바깥 고리일수록 진하게(불투명), 안쪽일수록 투명하게 → 지도가 뚝 끊기지 않고 점점 흐려진다.
 * 원 밖 전체는 완전히 덮는다.
 */
function maskData(): FeatureCollection {
  const features: Feature[] = [
    {
      type: 'Feature',
      properties: { opacity: 1 },
      geometry: { type: 'Polygon', coordinates: [worldRing, holeOf(circle(REGION_RADIUS_KM))] },
    },
  ]
  for (let k = 0; k < FADE_STEPS; k++) {
    const outerKm = REGION_RADIUS_KM - (FADE_KM * k) / FADE_STEPS
    const innerKm = REGION_RADIUS_KM - (FADE_KM * (k + 1)) / FADE_STEPS
    // 바깥(k=0)일수록 진하게. 제곱 곡선으로 안쪽은 빠르게 투명해진다 (크레센도)
    const opacity = Math.pow(1 - (k + 0.5) / FADE_STEPS, 2)
    features.push({
      type: 'Feature',
      properties: { opacity: Math.round(opacity * 1000) / 1000 },
      geometry: { type: 'Polygon', coordinates: [circle(outerKm), holeOf(circle(innerKm))] },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ───────── 캠퍼스 밖 건물: 위에서 본 윤곽(평면) ─────────
const footprintLayers = (source: string): LayerSpecification[] => [
  {
    id: 'building-footprint',
    type: 'fill',
    source,
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-color': PALETTE.footprint,
      'fill-outline-color': PALETTE.footprintLine,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1],
    },
  },
  {
    id: 'building-footprint-line',
    type: 'line',
    source,
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'line-color': PALETTE.footprintLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 18, 1.2],
    },
  },
]

// ───────── 내천 ─────────
const waterwayLayer = (source: string): LayerSpecification => ({
  id: 'waterway-stream',
  type: 'line',
  source,
  'source-layer': 'waterway',
  filter: ['!=', ['get', 'brunnel'], 'tunnel'],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': PALETTE.water,
    // 실제 폭: 강 25m, 하천 8m, 도랑 3m
    'line-width': metersToPx(['match', ['get', 'class'], 'river', 25, 'canal', 10, 'stream', 8, 3]),
  },
})
// 물가 둑(풀): 물길보다 넓게 연두색으로 깔아 강변 느낌
const waterbankLayer = (source: string): LayerSpecification => ({
  id: 'waterway-bank',
  type: 'line',
  source,
  'source-layer': 'waterway',
  minzoom: 13,
  filter: [
    'all',
    ['!=', ['get', 'brunnel'], 'tunnel'],
    ['match', ['get', 'class'], ['river', 'stream', 'canal'], true, false],
  ],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': PALETTE.bank,
    'line-width': metersToPx(['match', ['get', 'class'], 'river', 45, 'canal', 20, 18]),
  },
})

// ───────── 다리 ─────────
// 물 위를 지나는 도로(brunnel=bridge): 그림자 + 밝은 상판 + 흰 난간
function bridgeLayers(source: string): LayerSpecification[] {
  const base = { source, 'source-layer': 'transportation' } as const
  const filter: ExpressionSpecification = [
    'all',
    ['==', ['get', 'brunnel'], 'bridge'],
    ['match', ['get', 'class'], [...VEHICLE, 'path'], true, false],
  ]
  const width: ExpressionSpecification = ['match', ['get', 'class'], 'path', 3, ROAD_WIDTH_M]
  return [
    {
      ...base,
      id: 'bridge-shadow',
      type: 'line',
      minzoom: 13,
      filter,
      paint: {
        'line-color': '#1f3b4d',
        'line-opacity': 0.25,
        'line-width': metersToPx(['+', width, 6]),
        'line-translate': [3, 4],
        'line-blur': 2,
      },
    },
    {
      ...base,
      id: 'bridge-deck',
      type: 'line',
      minzoom: 13,
      filter,
      paint: { 'line-color': PALETTE.bridgeDeck, 'line-width': metersToPx(['+', width, 4]) },
    },
    {
      ...base,
      id: 'bridge-asphalt',
      type: 'line',
      minzoom: 13,
      filter: ['all', filter, ['!=', ['get', 'class'], 'path']],
      paint: { 'line-color': PALETTE.asphalt, 'line-width': metersToPx(width) },
    },
    {
      ...base,
      id: 'bridge-rail',
      type: 'line',
      minzoom: 15,
      filter,
      paint: {
        'line-color': PALETTE.bridgeRail,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 19, 2.2],
        'line-gap-width': metersToPx(['+', width, 3.2]),
      },
    },
  ] as LayerSpecification[]
}

// ───────── 캠퍼스 물길(E7~E8 사이)의 끊긴 곳 ─────────
// OSM 에서 물길이 여러 조각으로 나뉘어 있고 그 틈으로 길이 지난다.
// 좁은 틈 = 다리, 넓은 틈 = 도로 (public/data/campus-water.geojson ← backend/scripts/build_campus_water.py)
const CAMPUS_WATER_SOURCE = 'campus-water'
const campusWaterData = () =>
  typeof location === 'undefined'
    ? '/data/campus-water.geojson'
    : new URL('/data/campus-water.geojson', location.origin).href // 워커는 상대 경로를 못 푼다
const kindIs = (kind: string): ExpressionSpecification => ['==', ['get', 'kind'], kind]
const widthOf: ExpressionSpecification = ['get', 'width_m']

// 틈 메우기: 다리 밑은 물로(물길이 이어져 흐르게), 도로가 지나는 틈은 보도 포장으로
const campusGapLayers = (): LayerSpecification[] => [
  {
    id: 'campus-gap-water',
    type: 'fill',
    source: CAMPUS_WATER_SOURCE,
    filter: kindIs('gap_water'),
    paint: { 'fill-color': PALETTE.water },
  },
  {
    id: 'campus-gap-paved',
    type: 'fill',
    source: CAMPUS_WATER_SOURCE,
    filter: kindIs('gap_paved'),
    paint: { 'fill-color': PALETTE.sidewalk },
  },
]

// 넓은 틈을 지나는 길: 다른 작은 길과 같은 모양 (보도 → 아스팔트 → 가운데 흰 점선)
const campusRoadLayers = (): LayerSpecification[] => {
  const base = { source: CAMPUS_WATER_SOURCE, filter: kindIs('road') } as const
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const
  return [
    {
      ...base,
      id: 'campus-road-sidewalk',
      type: 'line',
      layout: round,
      paint: { 'line-color': PALETTE.sidewalk, 'line-width': metersToPx(['+', widthOf, 5]) },
    },
    {
      ...base,
      id: 'campus-road-asphalt',
      type: 'line',
      layout: round,
      paint: { 'line-color': PALETTE.asphaltMinor, 'line-width': metersToPx(widthOf, 0.6) },
    },
    {
      ...base,
      id: 'campus-road-center',
      type: 'line',
      minzoom: 16.5,
      paint: {
        'line-color': PALETTE.laneLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 16.5, 0.6, 19, 1.2],
        'line-dasharray': [4, 4],
        'line-opacity': 0.8,
      },
    },
  ]
}

// 좁은 틈의 보행 다리: 다른 보행 다리와 같은 모양 (그림자 + 밝은 상판 + 흰 난간)
const campusBridgeLayers = (): LayerSpecification[] => {
  const base = { source: CAMPUS_WATER_SOURCE, filter: kindIs('bridge') } as const
  return [
    {
      ...base,
      id: 'campus-bridge-shadow',
      type: 'line',
      paint: {
        'line-color': '#1f3b4d',
        'line-opacity': 0.25,
        'line-width': metersToPx(['+', widthOf, 2]),
        'line-translate': [3, 4],
        'line-blur': 2,
      },
    },
    {
      ...base,
      id: 'campus-bridge-deck',
      type: 'line',
      paint: { 'line-color': PALETTE.bridgeDeck, 'line-width': metersToPx(widthOf) },
    },
    {
      ...base,
      id: 'campus-bridge-rail',
      type: 'line',
      minzoom: 15,
      paint: {
        'line-color': PALETTE.bridgeRail,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 19, 2.2],
        'line-gap-width': metersToPx(['-', widthOf, 0.8]),
      },
    },
  ]
}

// ───────── 경계 구름 ─────────
const CLOUD_SOURCE = 'region-clouds'
// 땅 위 그림자: 꼭대기 단은 빼고(겹쳐 진해지지 않게) 남동쪽으로 밀어 흐리게
const cloudShadowLayer = (): LayerSpecification => ({
  id: 'region-cloud-shadow',
  type: 'fill',
  source: CLOUD_SOURCE,
  filter: ['==', ['get', 'tier'], 0],
  paint: {
    'fill-color': PALETTE.cloudShadow,
    'fill-opacity': 0.1,
    'fill-translate': [18, 24],
    'fill-translate-anchor': 'map',
    'fill-antialias': false,
  },
})
const cloudLayer = (): LayerSpecification => ({
  id: 'region-clouds',
  type: 'fill-extrusion',
  source: CLOUD_SOURCE,
  paint: {
    'fill-extrusion-color': [
      'match',
      ['get', 'tier'],
      0,
      PALETTE.cloudBase,
      1,
      PALETTE.cloudMid,
      PALETTE.cloudTop,
    ],
    'fill-extrusion-base': ['get', 'base'],
    'fill-extrusion-height': ['get', 'top'],
    'fill-extrusion-opacity': 1,
    'fill-extrusion-vertical-gradient': true, // 아래쪽 면이 살짝 어두워져 입체감
  },
})

const maskLayer = (): LayerSpecification => ({
  id: 'region-mask',
  type: 'fill',
  source: 'region-mask',
  paint: {
    'fill-color': PALETTE.outside,
    'fill-opacity': ['get', 'opacity'],
    'fill-antialias': false,
  },
})

// ───────── 조립 ─────────
const isLiberyRoad = (l: LayerSpecification) =>
  l.type === 'line' && /^(road|bridge|tunnel)_/.test(l.id) && !/rail/.test(l.id)
const sourceLayer = (l: LayerSpecification) => (l as { 'source-layer'?: string })['source-layer']

export function stylize(style: StyleSpecification): StyleSpecification {
  const s = structuredClone(style)
  s.layers.forEach(recolor)
  // 배경 건물(평면·3D 모두)·도로·물길은 걷어내고 아래에서 직접 그린다
  // (건물: 캠퍼스는 CampusBuildingsLayer 가 3D 로, 그 밖은 위에서 본 윤곽만)
  s.layers = s.layers.filter(
    (l) =>
      sourceLayer(l) !== 'building' &&
      !(l.type === 'line' && sourceLayer(l) === 'waterway') &&
      !isLiberyRoad(l) &&
      l.type !== 'raster',
  )

  const vectorSource = Object.keys(s.sources).find((k) => s.sources[k].type === 'vector')
  if (vectorSource) {
    // 지역 밖 벡터 타일은 요청하지 않는다 (TileJSON 의 bounds 대신 우리 범위를 쓴다)
    ;(s.sources[vectorSource] as { bounds?: number[] }).bounds = SOURCE_BOUNDS
  }
  s.sources[DEM_SOURCE_ID] = demSource()
  s.sources[HILLSHADE_SOURCE_ID] = demSource() // 지형과 음영은 소스를 따로 쓰는 게 MapLibre 권장
  s.sources['region-mask'] = { type: 'geojson', data: maskData() }
  s.sources[CAMPUS_WATER_SOURCE] = { type: 'geojson', data: campusWaterData() }

  const firstSymbol = s.layers.findIndex((l) => l.type === 'symbol')
  const at = firstSymbol >= 0 ? firstSymbol : s.layers.length
  // 지면 위(녹지·물 다음), 글자 아래에: 음영 → 물가·내천(+캠퍼스 물길 틈) → 건물 윤곽 → 도로 → 다리
  s.layers.splice(
    at,
    0,
    hillshadeLayer(),
    ...(vectorSource
      ? [
          waterbankLayer(vectorSource),
          waterwayLayer(vectorSource),
          ...campusGapLayers(),
          ...footprintLayers(vectorSource),
          ...roadLayers(vectorSource),
          ...campusRoadLayers(),
          ...bridgeLayers(vectorSource),
          ...campusBridgeLayers(),
        ]
      : []),
  )
  // 가림막은 맨 위 (지역 밖 지명 글자까지 덮는다). 앱 레이어(캠퍼스 건물 등)는 그 뒤에 추가된다
  // 구름: 그림자는 가림막 아래(지역 안 땅에만 보이게), 구름 본체는 가림막 위에 띄운다
  s.sources[CLOUD_SOURCE] = {
    type: 'geojson',
    data: cloudData({
      ...REGION_CENTER,
      radiusKm: REGION_RADIUS_KM,
      kmPerDegLng: KM_PER_DEG_LNG,
      kmPerDegLat: KM_PER_DEG_LAT,
    }),
  }
  s.layers.push(cloudShadowLayer(), maskLayer(), cloudLayer())
  s.sky = SKY
  return s
}

export async function loadStylizedStyle(url: string): Promise<StyleSpecification> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`style ${res.status}`)
  return stylize((await res.json()) as StyleSpecification)
}
