// docs/api-spec.md 규격 그대로 (snake_case 유지, 변환하지 않음)

export type ISODateTime = string // "2026-12-01T16:00:00+09:00"

export type ListResponse<T> = {
  items: T[]
  count: number // 이번 응답의 개수
  total: number // 조건에 맞는 전체 개수
  updated_at: ISODateTime | null
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR'

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string } }

export type Building = {
  id: string
  name: string
  aliases: string[]
  lat: number
  lng: number
}

// ---- 버스 ----
export type BusStop = {
  id: string
  name: string
  lat: number
  lng: number
  external_id: string | null
  routes: string[]
}

export type BusArrival = {
  route: string
  route_type: 'city' | 'shuttle'
  direction: string | null
  eta_min: number
  stops_left: number | null
  departure_time: ISODateTime | null
  source: 'realtime' | 'timetable'
}

export type StopArrivals = { stop_id: string; arrivals: BusArrival[] }

export type BusArrivalsResponse = ListResponse<StopArrivals> & { is_stale: boolean }

// ---- 세미나 ----
export type SeminarCategory = 'seminar' | 'lecture' | 'event' | 'other'

export type Seminar = {
  id: string
  title: string
  category: SeminarCategory
  start_at: ISODateTime
  end_at: ISODateTime | null
  place_raw: string | null
  building_id: string | null
  room: string | null
  lat: number | null
  lng: number | null
  host: string | null
  source_url: string | null
  updated_at: ISODateTime
}

export type SeminarQuery = {
  from?: string // YYYY-MM-DD
  to?: string
  building_id?: string
  category?: SeminarCategory
  q?: string
  limit?: number
  offset?: number
}
