import { queryOptions } from '@tanstack/react-query'
import { getStats } from './stats.api'

export const statsQuery = queryOptions({
  queryKey: ['stats'],
  queryFn: () => getStats(),
  refetchInterval: 60_000,
})
