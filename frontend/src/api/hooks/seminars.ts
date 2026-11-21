import { useQuery } from '@tanstack/react-query'

import { apiGet } from '../client'
import type { ListResponse, Seminar, SeminarQuery } from '../types'

const TEN_MIN = 10 * 60_000

export function useSeminars(query: SeminarQuery = {}) {
  return useQuery({
    queryKey: ['seminars', query],
    queryFn: ({ signal }) => apiGet<ListResponse<Seminar>>('/seminars', query, signal),
    staleTime: TEN_MIN,
  })
}

export function useSeminar(id: string | null) {
  return useQuery({
    queryKey: ['seminars', 'detail', id],
    queryFn: ({ signal }) => apiGet<Seminar>(`/seminars/${id}`, undefined, signal),
    enabled: !!id,
    staleTime: TEN_MIN,
  })
}
