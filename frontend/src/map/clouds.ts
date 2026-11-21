/**
 * 지역 경계를 두르는 low-poly 뭉게구름.
 * 원 가장자리를 따라 구름 덩어리(cluster)를 놓고, 덩어리마다 '퍼프'(낮은 각기둥) 몇 개를 겹친다.
 * 퍼프는 3단(넓은 밑단 → 좁은 가운데 → 작은 꼭대기)으로 쌓아 둥근 지붕처럼 보이게 한다.
 * 텍스처·모델 없이 fill-extrusion 만 쓰므로 캠퍼스 건물과 같은 방식이고 가볍다.
 * 난수는 시드 고정 → 새로고침해도 구름 모양이 같다.
 */
import type { Feature, FeatureCollection, Polygon } from 'geojson'

type Region = {
  lng: number
  lat: number
  radiusKm: number
  kmPerDegLng: number
  kmPerDegLat: number
}

const CLUSTERS = 72 // 구름 덩어리 수 (안쪽·바깥쪽 고리에 반씩)
const PUFFS = [5, 8] // 덩어리당 퍼프 수 (최소, 최대)
const PUFF_RADIUS_KM = [0.13, 0.3]
const SIDES = 9 // 각기둥 면 수 (적을수록 low-poly)
const BASE_M = 140 // 구름 밑면 높이
// 단별: [반지름 비율, 밑면부터 높이 비율 시작, 끝] — 퍼프 반지름(m) × 비율 = 높이
const TIERS: [number, number, number][] = [
  [1, 0, 0.32],
  [0.74, 0.32, 0.55],
  [0.42, 0.55, 0.72],
]

/** 시드 고정 난수 (mulberry32) */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function cloudData(region: Region): FeatureCollection<Polygon> {
  const rand = rng(20261121)
  const between = ([a, b]: number[]) => a + (b - a) * rand()
  const features: Feature<Polygon>[] = []

  const polygon = (cx: number, cy: number, rKm: number, rot: number) => {
    const ring: [number, number][] = []
    for (let i = 0; i <= SIDES; i++) {
      const a = rot + ((i % SIDES) / SIDES) * 2 * Math.PI
      ring.push([
        region.lng + (cx + rKm * Math.cos(a)) / region.kmPerDegLng,
        region.lat + (cy + rKm * Math.sin(a)) / region.kmPerDegLat,
      ])
    }
    return [ring]
  }

  for (let c = 0; c < CLUSTERS; c++) {
    // 덩어리 중심: 원 위, 각도·반지름을 조금씩 흔든다 (안쪽으로 살짝 더 들어오게)
    // 고리 두 겹(안쪽·바깥쪽)을 반 칸씩 어긋나게 놓아 빈틈 없이 두른다
    const ring = c % 2
    const angle = ((c / 2 + ring * 0.5 + rand() * 0.4) / (CLUSTERS / 2)) * 2 * Math.PI
    const dist = region.radiusKm + (ring ? 0.3 : -0.25) + between([-0.12, 0.12])
    const ccx = dist * Math.cos(angle)
    const ccy = dist * Math.sin(angle)
    const lift = between([0, 60]) // 덩어리마다 떠 있는 높이 차이
    const n = Math.round(between(PUFFS))
    for (let p = 0; p < n; p++) {
      const r = between(PUFF_RADIUS_KM)
      // 퍼프는 둘레 방향으로 길게 퍼지게 (구름 띠)
      const along = between([-0.45, 0.45])
      const across = between([-0.12, 0.12])
      const cx = ccx - Math.sin(angle) * along + Math.cos(angle) * across
      const cy = ccy + Math.cos(angle) * along + Math.sin(angle) * across
      const rot = rand() * Math.PI
      const heightM = r * 1000 * between([0.75, 1.05])
      TIERS.forEach(([k, from, to], tier) => {
        features.push({
          type: 'Feature',
          properties: {
            tier,
            base: Math.round(BASE_M + lift + heightM * from),
            top: Math.round(BASE_M + lift + heightM * to),
          },
          geometry: { type: 'Polygon', coordinates: polygon(cx, cy, r * k, rot + tier * 0.35) },
        })
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
