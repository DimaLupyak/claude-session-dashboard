import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionSummary } from '../parsers/types'
import type { ProjectInfo } from './project-scanner'
import type { DataSource } from '../utils/claude-path'

// Mock all external dependencies inline (vi.mock is hoisted)
vi.mock('./project-scanner', () => ({
  scanProjects: vi.fn(),
  scanProjectsFrom: vi.fn(),
}))

vi.mock('../utils/claude-path', () => ({
  getProjectsDir: vi.fn(() => '/mock/projects'),
  getProjectsDirFor: vi.fn((source: { claudeDir: string }) => `${source.claudeDir}/projects`),
  extractSessionId: vi.fn((filename: string) => filename.replace(/\.jsonl$/, '')),
  getDataSources: vi.fn(),
}))

vi.mock('../parsers/session-parser', () => ({
  parseSummary: vi.fn(),
}))

vi.mock('./active-detector', () => ({
  isSessionActive: vi.fn(),
}))

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}))

// Helper to build a SessionSummary fixture
function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'session-abc',
    projectPath: '/Users/user/myproject',
    projectName: 'myproject',
    branch: 'main',
    cwd: '/Users/user/myproject',
    startedAt: '2026-01-01T10:00:00.000Z',
    lastActiveAt: '2026-01-01T11:00:00.000Z',
    durationMs: 3600000,
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    isActive: false,
    model: 'claude-opus-4-6',
    version: '1.0.0',
    fileSizeBytes: 1024,
    ...overrides,
  }
}

function makeProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    dirName: '-Users-user-myproject',
    decodedPath: '/Users/user/myproject',
    projectName: 'myproject',
    sessionFiles: ['session-abc.jsonl'],
    ...overrides,
  }
}

describe('session-scanner', () => {
  // We need fresh module imports on each test to reset the module-level summaryCache
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function importScanner() {
    // Re-import after resetModules to get a fresh summaryCache
    const scanner = await import('./session-scanner')
    const { scanProjects, scanProjectsFrom } = await import('./project-scanner')
    const { parseSummary } = await import('../parsers/session-parser')
    const { isSessionActive } = await import('./active-detector')
    const { getDataSources } = await import('../utils/claude-path')
    const fs = await import('node:fs')
    return {
      scanAllSessions: scanner.scanAllSessions,
      scanAllSessionsWithPaths: scanner.scanAllSessionsWithPaths,
      scanAllSessionsMultiSource: scanner.scanAllSessionsMultiSource,
      scanSessionsFromSource: scanner.scanSessionsFromSource,
      getActiveSessions: scanner.getActiveSessions,
      mockScanProjects: scanProjects as ReturnType<typeof vi.fn>,
      mockScanProjectsFrom: scanProjectsFrom as ReturnType<typeof vi.fn>,
      mockParseSummary: parseSummary as ReturnType<typeof vi.fn>,
      mockIsSessionActive: isSessionActive as ReturnType<typeof vi.fn>,
      mockGetDataSources: getDataSources as ReturnType<typeof vi.fn>,
      mockStat: fs.promises.stat as ReturnType<typeof vi.fn>,
    }
  }

  describe('scanAllSessions', () => {
    it('returns [] when there are no projects', async () => {
      const { scanAllSessions, mockScanProjects } = await importScanner()
      mockScanProjects.mockResolvedValue([])

      const result = await scanAllSessions()

      expect(result).toEqual([])
    })

    it('returns [] when a project has no session files', async () => {
      const { scanAllSessions, mockScanProjects } = await importScanner()
      mockScanProjects.mockResolvedValue([
        makeProject({ sessionFiles: [] }),
      ])

      const result = await scanAllSessions()

      expect(result).toEqual([])
    })

    it('returns a session summary for a single project and single session', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessions()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        sessionId: 'session-abc',
        projectName: 'myproject',
        isActive: false,
      })
      // filePath should be stripped from public API
      expect(result[0]).not.toHaveProperty('filePath')
    })

    it('returns sessions from multiple projects sorted newest-first by lastActiveAt', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const olderSummary = makeSummary({
        sessionId: 'session-old',
        lastActiveAt: '2026-01-01T09:00:00.000Z',
        projectName: 'projectA',
      })
      const newerSummary = makeSummary({
        sessionId: 'session-new',
        lastActiveAt: '2026-01-01T11:00:00.000Z',
        projectName: 'projectB',
      })

      mockScanProjects.mockResolvedValue([
        makeProject({
          dirName: '-Users-user-projectA',
          projectName: 'projectA',
          sessionFiles: ['session-old.jsonl'],
        }),
        makeProject({
          dirName: '-Users-user-projectB',
          projectName: 'projectB',
          sessionFiles: ['session-new.jsonl'],
        }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(olderSummary)
        .mockResolvedValueOnce(newerSummary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessions()

      expect(result).toHaveLength(2)
      expect(result[0].sessionId).toBe('session-new')
      expect(result[1].sessionId).toBe('session-old')
    })

    it('returns multiple sessions from a single project sorted newest-first', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const session1 = makeSummary({
        sessionId: 'session-1',
        lastActiveAt: '2026-01-01T08:00:00.000Z',
      })
      const session2 = makeSummary({
        sessionId: 'session-2',
        lastActiveAt: '2026-01-01T12:00:00.000Z',
      })

      mockScanProjects.mockResolvedValue([
        makeProject({
          sessionFiles: ['session-1.jsonl', 'session-2.jsonl'],
        }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessions()

      expect(result).toHaveLength(2)
      expect(result[0].sessionId).toBe('session-2')
      expect(result[1].sessionId).toBe('session-1')
    })

    it('skips sessions where fs.stat resolves null', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockStat,
      } = await importScanner()

      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue(null)

      const result = await scanAllSessions()

      expect(result).toEqual([])
    })

    it('skips sessions where fs.stat rejects', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockStat,
      } = await importScanner()

      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockRejectedValue(new Error('ENOENT'))

      const result = await scanAllSessions()

      expect(result).toEqual([])
    })

    it('skips sessions where parseSummary returns null', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockStat,
      } = await importScanner()

      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(null)

      const result = await scanAllSessions()

      expect(result).toEqual([])
    })

    it('uses in-memory cache on second call when mtime is unchanged', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 5000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      // First call — should parse
      await scanAllSessions()
      // Second call — same mtime, should use cache
      await scanAllSessions()

      // parseSummary should only be called once (cache hit on second call)
      expect(mockParseSummary).toHaveBeenCalledTimes(1)
    })

    it('refreshes active status from detector even on cache hit', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary({ isActive: false })
      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 5000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      // First call: not active. Second call: active
      mockIsSessionActive.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      const first = await scanAllSessions()
      const second = await scanAllSessions()

      expect(first[0].isActive).toBe(false)
      expect(second[0].isActive).toBe(true)
      // isSessionActive called twice (once per scan), parseSummary only once
      expect(mockIsSessionActive).toHaveBeenCalledTimes(2)
      expect(mockParseSummary).toHaveBeenCalledTimes(1)
    })

    it('re-parses when mtime changes (stale cache)', async () => {
      const {
        scanAllSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjects.mockResolvedValue([makeProject()])
      // First call: mtime=1000, second call: mtime=2000 (file changed)
      mockStat
        .mockResolvedValueOnce({ mtimeMs: 1000, size: 1024 })
        .mockResolvedValueOnce({ mtimeMs: 2000, size: 2048 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      await scanAllSessions()
      await scanAllSessions()

      // parseSummary called twice because cache was stale on second call
      expect(mockParseSummary).toHaveBeenCalledTimes(2)
    })
  })

  describe('scanAllSessionsWithPaths', () => {
    it('returns sessions with filePath included', async () => {
      const {
        scanAllSessionsWithPaths,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessionsWithPaths()

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('filePath')
      expect(result[0].filePath).toContain('session-abc.jsonl')
    })

    it('returns [] when there are no projects', async () => {
      const { scanAllSessionsWithPaths, mockScanProjects } = await importScanner()
      mockScanProjects.mockResolvedValue([])

      const result = await scanAllSessionsWithPaths()

      expect(result).toEqual([])
    })

    it('filePath contains the project dirName and session filename', async () => {
      const {
        scanAllSessionsWithPaths,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjects.mockResolvedValue([
        makeProject({ dirName: '-Users-user-myproject', sessionFiles: ['session-abc.jsonl'] }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessionsWithPaths()

      expect(result[0].filePath).toContain('-Users-user-myproject')
      expect(result[0].filePath).toContain('session-abc.jsonl')
    })
  })

  describe('getActiveSessions', () => {
    it('returns [] when there are no sessions', async () => {
      const { getActiveSessions, mockScanProjects } = await importScanner()
      mockScanProjects.mockResolvedValue([])

      const result = await getActiveSessions()

      expect(result).toEqual([])
    })

    it('returns all sessions when all are active', async () => {
      const {
        getActiveSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const session1 = makeSummary({ sessionId: 'session-1', lastActiveAt: '2026-01-01T11:00:00.000Z' })
      const session2 = makeSummary({ sessionId: 'session-2', lastActiveAt: '2026-01-01T10:00:00.000Z' })

      mockScanProjects.mockResolvedValue([
        makeProject({ sessionFiles: ['session-1.jsonl', 'session-2.jsonl'] }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2)
      mockIsSessionActive.mockResolvedValue(true)

      const result = await getActiveSessions()

      expect(result).toHaveLength(2)
      expect(result.every((s) => s.isActive)).toBe(true)
    })

    it('filters out inactive sessions', async () => {
      const {
        getActiveSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const activeSession = makeSummary({
        sessionId: 'session-active',
        lastActiveAt: '2026-01-01T11:00:00.000Z',
      })
      const inactiveSession = makeSummary({
        sessionId: 'session-inactive',
        lastActiveAt: '2026-01-01T10:00:00.000Z',
      })

      mockScanProjects.mockResolvedValue([
        makeProject({
          sessionFiles: ['session-active.jsonl', 'session-inactive.jsonl'],
        }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(activeSession)
        .mockResolvedValueOnce(inactiveSession)
      // First session active, second not
      mockIsSessionActive
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const result = await getActiveSessions()

      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('session-active')
      expect(result[0].isActive).toBe(true)
    })

    it('returns [] when all sessions are inactive', async () => {
      const {
        getActiveSessions,
        mockScanProjects,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary({ isActive: false })
      mockScanProjects.mockResolvedValue([makeProject()])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await getActiveSessions()

      expect(result).toEqual([])
    })
  })

  describe('scanSessionsFromSource', () => {
    const macSource: DataSource = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/user/.claude',
      platform: 'macos',
      available: true,
    }

    it('returns sessions with sourceId and sourceLabel set from the source', async () => {
      const {
        scanSessionsFromSource,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjectsFrom.mockResolvedValue([
        makeProject({ sourceId: 'primary', sourceLabel: 'macOS' }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanSessionsFromSource(macSource)

      expect(result).toHaveLength(1)
      expect(result[0].sourceId).toBe('primary')
      expect(result[0].sourceLabel).toBe('macOS')
    })

    it('passes projectsDirOverride to isSessionActive for non-primary sources', async () => {
      const wslSource: DataSource = {
        id: 'wsl-ubuntu-user',
        label: 'WSL - Ubuntu',
        claudeDir: '\\\\wsl$\\Ubuntu\\home\\user\\.claude',
        platform: 'wsl',
        available: true,
      }

      const {
        scanSessionsFromSource,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjectsFrom.mockResolvedValue([
        makeProject({ sourceId: 'wsl-ubuntu-user', sourceLabel: 'WSL - Ubuntu' }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      await scanSessionsFromSource(wslSource)

      expect(mockIsSessionActive).toHaveBeenCalledWith(
        '-Users-user-myproject',
        'session-abc',
        '\\\\wsl$\\Ubuntu\\home\\user\\.claude/projects',
      )
    })

    it('does not pass projectsDirOverride to isSessionActive for primary source', async () => {
      const {
        scanSessionsFromSource,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const summary = makeSummary()
      mockScanProjectsFrom.mockResolvedValue([
        makeProject({ sourceId: 'primary', sourceLabel: 'macOS' }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(summary)
      mockIsSessionActive.mockResolvedValue(false)

      await scanSessionsFromSource(macSource)

      expect(mockIsSessionActive).toHaveBeenCalledWith(
        '-Users-user-myproject',
        'session-abc',
        undefined,
      )
    })

    it('returns [] when source has no projects', async () => {
      const {
        scanSessionsFromSource,
        mockScanProjectsFrom,
      } = await importScanner()

      mockScanProjectsFrom.mockResolvedValue([])

      const result = await scanSessionsFromSource(macSource)

      expect(result).toEqual([])
    })
  })

  describe('scanAllSessionsMultiSource', () => {
    const macSource: DataSource = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/user/.claude',
      platform: 'macos',
      available: true,
    }

    const wslSource: DataSource = {
      id: 'wsl-ubuntu-user',
      label: 'WSL - Ubuntu',
      claudeDir: '\\\\wsl$\\Ubuntu\\home\\user\\.claude',
      platform: 'wsl',
      available: true,
    }

    it('returns sessions from all available sources with sourceId/sourceLabel set', async () => {
      const {
        scanAllSessionsMultiSource,
        mockGetDataSources,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const macSummary = makeSummary({
        sessionId: 'session-mac',
        lastActiveAt: '2026-01-01T11:00:00.000Z',
      })
      const wslSummary = makeSummary({
        sessionId: 'session-wsl',
        lastActiveAt: '2026-01-01T10:00:00.000Z',
      })

      mockGetDataSources.mockResolvedValue([macSource, wslSource])
      mockScanProjectsFrom
        .mockResolvedValueOnce([
          makeProject({
            sessionFiles: ['session-mac.jsonl'],
            sourceId: 'primary',
            sourceLabel: 'macOS',
          }),
        ])
        .mockResolvedValueOnce([
          makeProject({
            sessionFiles: ['session-wsl.jsonl'],
            sourceId: 'wsl-ubuntu-user',
            sourceLabel: 'WSL - Ubuntu',
          }),
        ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(macSummary)
        .mockResolvedValueOnce(wslSummary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessionsMultiSource()

      expect(result).toHaveLength(2)
      // Sorted by lastActiveAt descending
      expect(result[0].sessionId).toBe('session-mac')
      expect(result[0].sourceId).toBe('primary')
      expect(result[0].sourceLabel).toBe('macOS')
      expect(result[1].sessionId).toBe('session-wsl')
      expect(result[1].sourceId).toBe('wsl-ubuntu-user')
      expect(result[1].sourceLabel).toBe('WSL - Ubuntu')
    })

    it('skips unavailable sources', async () => {
      const {
        scanAllSessionsMultiSource,
        mockGetDataSources,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const unavailableSource: DataSource = {
        ...wslSource,
        available: false,
      }

      const macSummary = makeSummary({ sessionId: 'session-mac' })
      mockGetDataSources.mockResolvedValue([macSource, unavailableSource])
      mockScanProjectsFrom.mockResolvedValue([
        makeProject({
          sessionFiles: ['session-mac.jsonl'],
          sourceId: 'primary',
          sourceLabel: 'macOS',
        }),
      ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary.mockResolvedValue(macSummary)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessionsMultiSource()

      expect(result).toHaveLength(1)
      expect(result[0].sourceId).toBe('primary')
      // scanProjectsFrom should only be called once (for the available source)
      expect(mockScanProjectsFrom).toHaveBeenCalledTimes(1)
    })

    it('deduplicates sessions with the same sessionId across sources', async () => {
      const {
        scanAllSessionsMultiSource,
        mockGetDataSources,
        mockScanProjectsFrom,
        mockParseSummary,
        mockIsSessionActive,
        mockStat,
      } = await importScanner()

      const olderDupe = makeSummary({
        sessionId: 'session-dupe',
        lastActiveAt: '2026-01-01T09:00:00.000Z',
      })
      const newerDupe = makeSummary({
        sessionId: 'session-dupe',
        lastActiveAt: '2026-01-01T11:00:00.000Z',
      })

      mockGetDataSources.mockResolvedValue([macSource, wslSource])
      mockScanProjectsFrom
        .mockResolvedValueOnce([
          makeProject({
            sessionFiles: ['session-dupe.jsonl'],
            sourceId: 'primary',
            sourceLabel: 'macOS',
          }),
        ])
        .mockResolvedValueOnce([
          makeProject({
            sessionFiles: ['session-dupe.jsonl'],
            sourceId: 'wsl-ubuntu-user',
            sourceLabel: 'WSL - Ubuntu',
          }),
        ])
      mockStat.mockResolvedValue({ mtimeMs: 1000, size: 1024 })
      mockParseSummary
        .mockResolvedValueOnce(olderDupe)
        .mockResolvedValueOnce(newerDupe)
      mockIsSessionActive.mockResolvedValue(false)

      const result = await scanAllSessionsMultiSource()

      // Should only include the newer version of the duplicated session
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('session-dupe')
      expect(result[0].lastActiveAt).toBe('2026-01-01T11:00:00.000Z')
    })

    it('returns [] when no sources are available', async () => {
      const {
        scanAllSessionsMultiSource,
        mockGetDataSources,
      } = await importScanner()

      mockGetDataSources.mockResolvedValue([
        { ...macSource, available: false },
      ])

      const result = await scanAllSessionsMultiSource()

      expect(result).toEqual([])
    })
  })
})
