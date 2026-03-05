import { createServerFn } from '@tanstack/react-start'
import { scanAllSessions } from '@/lib/scanner/session-scanner'
import type { SessionSummary } from '@/lib/parsers/types'

export interface ProjectAnalytics {
  projectPath: string
  projectName: string
  totalSessions: number
  activeSessions: number
  totalMessages: number
  totalDurationMs: number
  firstSessionAt: string
  lastSessionAt: string
}

export interface ProjectAnalyticsResult {
  projects: ProjectAnalytics[]
}

/**
 * Pure business logic for aggregating project analytics from sessions.
 * Exported for testing purposes.
 */
export function aggregateProjectAnalytics(
  allSessions: SessionSummary[],
): ProjectAnalyticsResult {
  // Group sessions by projectPath
  const projectMap = new Map<string, SessionSummary[]>()
  for (const session of allSessions) {
    const existing = projectMap.get(session.projectPath) ?? []
    existing.push(session)
    projectMap.set(session.projectPath, existing)
  }

  // Aggregate per project
  const projects: ProjectAnalytics[] = []
  for (const [projectPath, sessions] of projectMap) {
    if (sessions.length === 0) continue

    const firstSession = sessions[0]
    projects.push({
      projectPath,
      projectName: firstSession.projectName ?? projectPath.split('/').pop() ?? 'Unknown',
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.isActive).length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      totalDurationMs: sessions.reduce((sum, s) => sum + s.durationMs, 0),
      firstSessionAt: sessions.reduce(
        (min, s) => (s.startedAt < min ? s.startedAt : min),
        firstSession.startedAt,
      ),
      lastSessionAt: sessions.reduce(
        (max, s) => (s.lastActiveAt > max ? s.lastActiveAt : max),
        firstSession.lastActiveAt,
      ),
    })
  }

  // Sort by most recently active first
  projects.sort((a, b) => b.lastSessionAt.localeCompare(a.lastSessionAt))

  return { projects }
}

export const getProjectAnalytics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProjectAnalyticsResult> => {
    const allSessions = await scanAllSessions()
    return aggregateProjectAnalytics(allSessions)
  },
)
