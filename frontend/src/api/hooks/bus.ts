import { useQuery } from '@tanstack/react-query'

import { apiGet } from '../client'
import type { BusArrivalsResponse, BusStop, ListResponse } from '../types'

export function useBusStops() {
  return useQuery({
    queryKey: ['bus', 'stops'],
    queryFn: ({ signal }) => apiGet<ListResponse<BusStop>>('/bus/stops', undefined, signal),
    staleTime: Infinity, // seed 데이터
  })
}

export function useBusArrivals(stopIds: string[]) {
  const ids = [...stopIds].sort().slice(0, 10)
  return useQuery({
    queryKey: ['bus', 'arrivals', ids],
    queryFn: ({ signal }) =>
      apiGet<BusArrivalsResponse>('/bus/arrivals', { stop_ids: ids.join(',') }, signal),
    enabled: ids.length > 0,
    refetchInterval: 30_000,
  })
}
