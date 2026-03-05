import { queryOptions, keepPreviousData } from '@tanstack/react-query'
import { getSessionList, getActiveSessionList, getPaginatedSessions } from './sessions.api'

export const sessionListQuery = queryOptions({
  queryKey: ['sessions', 'list'],
  queryFn: () => getSessionList(),
  refetchInterval: 30_000,
})

export const activeSessionsQuery = queryOptions({
  queryKey: ['sessions', 'active'],
  queryFn: () => getActiveSessionList(),
  refetchInterval: 3_000,
})

interface PaginatedSessionParams {
  page: number
  pageSize: number
  search: string
  status: 'all' | 'active' | 'completed'
  project: string
}

export function paginatedSessionListQuery(params: PaginatedSessionParams) {
  return queryOptions({
    queryKey: ['sessions', 'paginated', params],
    queryFn: () => getPaginatedSessions({ data: params }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
}
