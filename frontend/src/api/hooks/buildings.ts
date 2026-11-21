import { useQuery } from '@tanstack/react-query'

import { apiGet } from '../client'
import type { Building, ListResponse } from '../types'

export function useBuildings() {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: ({ signal }) => apiGet<ListResponse<Building>>('/buildings', undefined, signal),
    staleTime: Infinity,
  })
}
