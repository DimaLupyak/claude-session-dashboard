import { describe, it, expect } from 'vitest'
import type { SessionSummary } from '@/lib/parsers/types'
import { aggregateProjectAnalytics } from './project-analytics.server'

describe('project-analytics', () => {
  const createMockSession = (
    overrides: Partial<SessionSummary> = {},
  ): SessionSummary => ({
    sessionId: `session-${Math.random()}`,
    projectPath: '/path/to/project',
    projectName: 'test-project',
    branch: 'main',
    cwd: '/path/to/project',
    startedAt: '2026-01-01T10:00:00Z',
    lastActiveAt: '2026-01-01T11:00:00Z',
    durationMs: 3600000,
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    isActive: false,
    model: 'claude-opus-4-6',
    version: '1.0.0',
    fileSizeBytes: 1024,
    ...overrides,
  })

  describe('aggregateProjectAnalytics', () => {
    it('should group sessions by projectPath correctly', () => {
      const sessions = [
        createMockSession({ projectPath: '/project-a', projectName: 'project-a' }),
        createMockSession({ projectPath: '/project-b', projectName: 'project-b' }),
        createMockSession({ projectPath: '/project-a', projectName: 'project-a' }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(2)
      const projectA = result.projects.find((p) => p.projectPath === '/project-a')
      const projectB = result.projects.find((p) => p.projectPath === '/project-b')

      expect(projectA?.totalSessions).toBe(2)
      expect(projectB?.totalSessions).toBe(1)
    })

    it('should count active sessions correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: true,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: true,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: false,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].activeSessions).toBe(2)
      expect(result.projects[0].totalSessions).toBe(3)
    })

    it('should sum messages correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 20,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 30,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].totalMessages).toBe(60)
    })

    it('should sum duration correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 1000,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 2000,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 3000,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].totalDurationMs).toBe(6000)
    })

    it('should find first session timestamp correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-03T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-01T00:00:00Z', // Earliest
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].firstSessionAt).toBe('2026-01-01T00:00:00Z')
    })

    it('should find last session timestamp correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-01T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-03T00:00:00Z', // Latest
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].lastSessionAt).toBe('2026-01-03T00:00:00Z')
    })

    it('should sort projects by most recent activity first', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-01T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-b',
          projectName: 'project-b',
          lastActiveAt: '2026-01-03T00:00:00Z', // Most recent
        }),
        createMockSession({
          projectPath: '/project-c',
          projectName: 'project-c',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(3)
      expect(result.projects[0].projectPath).toBe('/project-b')
      expect(result.projects[1].projectPath).toBe('/project-c')
      expect(result.projects[2].projectPath).toBe('/project-a')
    })

    it('should use projectName from first session in group', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'ProjectA',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'ProjectA', // Same name
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].projectName).toBe('ProjectA')
    })

    it('should handle no sessions', () => {
      const result = aggregateProjectAnalytics([])

      expect(result.projects).toHaveLength(0)
    })

    it('should handle single project with single session', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
          durationMs: 1000,
          isActive: true,
          startedAt: '2026-01-01T00:00:00Z',
          lastActiveAt: '2026-01-01T01:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toEqual({
        projectPath: '/project-a',
        projectName: 'project-a',
        totalSessions: 1,
        activeSessions: 1,
        totalMessages: 10,
        totalDurationMs: 1000,
        firstSessionAt: '2026-01-01T00:00:00Z',
        lastSessionAt: '2026-01-01T01:00:00Z',
      })
    })

    it('should aggregate multiple projects correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
          durationMs: 1000,
          isActive: true,
          startedAt: '2026-01-01T00:00:00Z',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 20,
          durationMs: 2000,
          isActive: false,
          startedAt: '2026-01-02T00:00:00Z',
          lastActiveAt: '2026-01-03T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-b',
          projectName: 'project-b',
          messageCount: 5,
          durationMs: 500,
          isActive: true,
          startedAt: '2026-01-04T00:00:00Z',
          lastActiveAt: '2026-01-05T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(2)

      // project-b should be first (most recent)
      expect(result.projects[0]).toEqual({
        projectPath: '/project-b',
        projectName: 'project-b',
        totalSessions: 1,
        activeSessions: 1,
        totalMessages: 5,
        totalDurationMs: 500,
        firstSessionAt: '2026-01-04T00:00:00Z',
        lastSessionAt: '2026-01-05T00:00:00Z',
      })

      // project-a should be second
      expect(result.projects[1]).toEqual({
        projectPath: '/project-a',
        projectName: 'project-a',
        totalSessions: 2,
        activeSessions: 1,
        totalMessages: 30,
        totalDurationMs: 3000,
        firstSessionAt: '2026-01-01T00:00:00Z',
        lastSessionAt: '2026-01-03T00:00:00Z',
      })
    })
  })
})
