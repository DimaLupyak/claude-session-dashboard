import { useQuery } from '@tanstack/react-query'
import { activeSessionsQuery } from './sessions.queries'

export function useIsSessionActive(sessionId: string): boolean {
  const { data: activeSessions } = useQuery(activeSessionsQuery)
  return activeSessions?.some((s) => s.sessionId === sessionId) ?? false
}
