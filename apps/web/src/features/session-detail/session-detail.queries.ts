import { queryOptions } from '@tanstack/react-query'
import { getSessionDetail } from './session-detail.server'

export function sessionDetailQuery(sessionId: string, projectPath: string, isActive?: boolean) {
  return queryOptions({
    queryKey: ['session', 'detail', sessionId],
    queryFn: () => getSessionDetail({ data: { sessionId, projectPath } }),
    staleTime: isActive ? 2_000 : 30_000,
    refetchInterval: isActive ? 5_000 : undefined,
  })
}

