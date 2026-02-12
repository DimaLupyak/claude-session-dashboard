import { queryOptions } from '@tanstack/react-query'
import { getSessionDetail } from './session-detail.server'

export function sessionDetailQuery(sessionId: string, projectPath: string) {
  return queryOptions({
    queryKey: ['session', 'detail', sessionId],
    queryFn: () => getSessionDetail({ data: { sessionId, projectPath } }),
    staleTime: 30_000,
  })
}

