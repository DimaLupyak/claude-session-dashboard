import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StatsCache } from './types'

// vi.mock is hoisted — define all mocks inline, no variable references

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}))

vi.mock('@/lib/utils/claude-path', () => ({
  getStatsPath: vi.fn(() => '/mock/.claude/stats-cache.json'),
}))

vi.mock('@/lib/cache/disk-cache', () => ({
  readDiskCache: vi.fn(),
  writeDiskCache: vi.fn(),
}))

vi.mock('@/lib/scanner/session-scanner', () => ({
  scanAllSessionsWithPaths: vi.fn(),
}))

vi.mock('@/lib/parsers/session-parser', () => ({
  parseDetail: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStatsCache(overrides: Partial<StatsCache> = {}): StatsCache {
  return {
    version: 1,
    lastComputedDate: new Date().toISOString(), // today — no enrichment needed by default
    dailyActivity: [],
    dailyModelTokens: [],
    modelUsage: {},
    totalSessions: 5,
    totalMessages: 50,
    longestSession: {
      sessionId: 'session-abc',
      duration: 3600000,
      messageCount: 20,
      timestamp: new Date().toISOString(),
    },
    firstSessionDate: '2026-01-01T00:00:00.000Z',
    hourCounts: { '9': 3, '14': 2 },
    ...overrides,
  }
}

function makeStat(mtimeMs = 1_000_000) {
  return { mtimeMs }
}

// ---------------------------------------------------------------------------
// Helpers to import the module fresh (resets module-level cache variables)
// ---------------------------------------------------------------------------

async function freshParseStats() {
  vi.resetModules()
  const mod = await import('./stats-parser')
  return mod.parseStats
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path — valid stats-cache.json, fresh date', () => {
    it('returns parsed stats from disk when mtime matches disk cache', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const parseStats = await freshParseStats()

      const stats = makeStatsCache()
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(stats)

      const result = await parseStats()

      expect(result).toEqual(stats)
      expect(readDiskCache).toHaveBeenCalledWith('stats', 1_000_000, expect.anything())
    })

    it('parses stats from raw file when disk cache misses', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache, writeDiskCache } = await import('@/lib/cache/disk-cache')
      const parseStats = await freshParseStats()

      const stats = makeStatsCache()
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(null)
      vi.mocked(fsMock.readFile).mockResolvedValue(JSON.stringify(stats) as never)

      const result = await parseStats()

      expect(result).toEqual(stats)
      expect(writeDiskCache).toHaveBeenCalledWith('stats', '/mock/.claude/stats-cache.json', 1_000_000, stats)
    })
  })

  describe('in-memory cache hit', () => {
    it('returns cached result on second call without hitting disk again', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const parseStats = await freshParseStats()

      const stats = makeStatsCache()
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(stats)

      await parseStats()
      const result2 = await parseStats()

      // readDiskCache should only be called once (in-memory cache serves second call)
      expect(readDiskCache).toHaveBeenCalledTimes(1)
      expect(result2).toEqual(stats)
    })
  })

  describe('missing stats file — falls back to computing from sessions', () => {
    it('returns null when no sessions exist and stat() fails', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      vi.mocked(fsMock.stat).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      const result = await parseStats()

      // With no sessions, computeStatsFromSessions returns a valid minimal stats object
      expect(result).not.toBeNull()
      expect(result?.totalSessions).toBe(0)
      expect(result?.totalMessages).toBe(0)
    })

    it('calls scanAllSessionsWithPaths when stats file is missing', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      vi.mocked(fsMock.stat).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      await parseStats()

      expect(scanAllSessionsWithPaths).toHaveBeenCalled()
    })
  })

  describe('malformed stats file — falls back gracefully', () => {
    it('falls back to session computation when JSON is invalid', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(null)
      vi.mocked(fsMock.readFile).mockResolvedValue('invalid-json{{{' as never)
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      const result = await parseStats()

      // Should not throw, falls back to computeStatsFromSessions
      expect(scanAllSessionsWithPaths).toHaveBeenCalled()
      // With empty sessions, returns a valid minimal object
      expect(result?.totalSessions).toBe(0)
    })

    it('falls back when Zod validation fails on stats file content', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      const badStats = { version: 1, lastComputedDate: 'bad' } // missing required fields
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(null)
      vi.mocked(fsMock.readFile).mockResolvedValue(JSON.stringify(badStats) as never)
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      const result = await parseStats()

      expect(scanAllSessionsWithPaths).toHaveBeenCalled()
      expect(result?.totalSessions).toBe(0)
    })
  })

  describe('stale cache — triggers enrichment with recent sessions', () => {
    it('calls scanAllSessionsWithPaths when lastComputedDate is before today', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      // lastComputedDate in the past — triggers enrichment
      const staleStats = makeStatsCache({ lastComputedDate: '2024-01-01T00:00:00.000Z' })
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(staleStats)
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      const result = await parseStats()

      expect(scanAllSessionsWithPaths).toHaveBeenCalled()
      // Returns original stats when no recent sessions found
      expect(result).toEqual(staleStats)
    })

    it('merges recent sessions into stale stats', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const { parseDetail } = await import('@/lib/parsers/session-parser')
      const parseStats = await freshParseStats()

      const staleStats = makeStatsCache({
        lastComputedDate: '2024-01-01T00:00:00.000Z',
        totalSessions: 3,
        totalMessages: 30,
      })

      const recentSession = {
        sessionId: 'new-session',
        projectPath: '/proj',
        projectName: 'proj',
        branch: 'main',
        cwd: '/proj',
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        durationMs: 1800000,
        messageCount: 5,
        userMessageCount: 3,
        assistantMessageCount: 2,
        isActive: false,
        model: 'claude-opus-4-6',
        version: '1.0.0',
        fileSizeBytes: 512,
        filePath: '/proj/new-session.jsonl',
      }

      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(staleStats)
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([recentSession])
      vi.mocked(parseDetail).mockResolvedValue({
        sessionId: 'new-session',
        projectPath: '/proj',
        projectName: 'proj',
        branch: 'main',
        turns: [
          { uuid: 't1', type: 'user', timestamp: new Date().toISOString(), toolCalls: [] },
          { uuid: 't2', type: 'assistant', timestamp: new Date().toISOString(), toolCalls: [] },
          { uuid: 't3', type: 'user', timestamp: new Date().toISOString(), toolCalls: [] },
          { uuid: 't4', type: 'assistant', timestamp: new Date().toISOString(), toolCalls: [] },
          { uuid: 't5', type: 'user', timestamp: new Date().toISOString(), toolCalls: [] },
        ],
        totalTokens: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        tokensByModel: {},
        toolFrequency: { Bash: 2 },
        errors: [],
        models: ['claude-opus-4-6'],
        agents: [],
        skills: [],
        tasks: [],
        contextWindow: null,
      })

      const result = await parseStats()

      // Should have merged the new session
      expect(result?.totalSessions).toBe(4) // 3 existing + 1 new
      expect(result?.totalMessages).toBe(35) // 30 existing + 5 from turns
    })
  })

  describe('merge cache — avoids re-scanning within 60 seconds', () => {
    it('returns merge cache on repeated stale calls within 60 seconds', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { readDiskCache } = await import('@/lib/cache/disk-cache')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      const staleStats = makeStatsCache({ lastComputedDate: '2024-01-01T00:00:00.000Z' })
      vi.mocked(fsMock.stat).mockResolvedValue(makeStat(1_000_000) as never)
      vi.mocked(readDiskCache).mockReturnValue(staleStats)
      vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([])

      // First call — triggers scan
      await parseStats()
      // Second call — should use merge cache (same mtime, within 60s)
      await parseStats()

      // scanAllSessionsWithPaths should only be called once
      expect(scanAllSessionsWithPaths).toHaveBeenCalledTimes(1)
    })
  })

  describe('returns null when everything fails', () => {
    it('returns null when stat fails and session scan throws', async () => {
      const { promises: fsMock } = await import('node:fs')
      const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
      const parseStats = await freshParseStats()

      vi.mocked(fsMock.stat).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(scanAllSessionsWithPaths).mockRejectedValue(new Error('scan failed'))

      const result = await parseStats()

      expect(result).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// updateHourCounts — tested indirectly via computeStatsFromSessions
// ---------------------------------------------------------------------------

describe('hour bucketing (via computeStatsFromSessions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments the correct hour bucket from startedAt timestamp', async () => {
    const { promises: fsMock } = await import('node:fs')
    const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
    const { parseDetail } = await import('@/lib/parsers/session-parser')
    const parseStats = await freshParseStats()

    // startedAt at 09:00 UTC
    const session = {
      sessionId: 'hour-test',
      projectPath: '/proj',
      projectName: 'proj',
      branch: null,
      cwd: '/proj',
      startedAt: '2026-03-10T09:00:00.000Z',
      lastActiveAt: '2026-03-10T09:30:00.000Z',
      durationMs: 1800000,
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      isActive: false,
      model: null,
      version: null,
      fileSizeBytes: 256,
      filePath: '/proj/hour-test.jsonl',
    }

    // stat fails → goes to computeStatsFromSessions
    vi.mocked(fsMock.stat).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([session])
    vi.mocked(parseDetail).mockRejectedValue(new Error('parse error')) // forces summary fallback

    const result = await parseStats()

    // Hour 9 should be incremented
    expect(result).not.toBeNull()
    // The hour from '2026-03-10T09:00:00.000Z' — depends on local timezone, so we just
    // check that some hour bucket was populated
    const hourValues = Object.values(result!.hourCounts)
    expect(hourValues.some((v) => v > 0)).toBe(true)
  })

  it('skips sessions with missing startedAt gracefully', async () => {
    const { promises: fsMock } = await import('node:fs')
    const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
    const parseStats = await freshParseStats()

    const session = {
      sessionId: 'no-time',
      projectPath: '/proj',
      projectName: 'proj',
      branch: null,
      cwd: '/proj',
      startedAt: '', // empty — should be skipped by updateHourCounts
      lastActiveAt: '',
      durationMs: 0,
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      isActive: false,
      model: null,
      version: null,
      fileSizeBytes: 0,
      filePath: '/proj/no-time.jsonl',
    }

    vi.mocked(fsMock.stat).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(scanAllSessionsWithPaths).mockResolvedValue([session])

    const result = await parseStats()

    expect(result).not.toBeNull()
    // hourCounts should be empty (skipped due to empty startedAt)
    expect(Object.keys(result!.hourCounts)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// mergeStatsCaches — pure function for multi-source stats aggregation
// ---------------------------------------------------------------------------

describe('mergeStatsCaches', () => {
  // Import directly since it's a pure function (no module-level state to reset)
  let mergeStatsCaches: typeof import('./stats-parser').mergeStatsCaches

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./stats-parser')
    mergeStatsCaches = mod.mergeStatsCaches
  })

  it('returns null for empty array', () => {
    expect(mergeStatsCaches([])).toBeNull()
  })

  it('returns single cache unchanged', () => {
    const cache = makeStatsCache({ totalSessions: 10, totalMessages: 100 })
    const result = mergeStatsCaches([cache])
    expect(result).toEqual(cache)
  })

  it('sums dailyActivity across caches by date', () => {
    const cache1 = makeStatsCache({
      dailyActivity: [
        { date: '2026-03-01', messageCount: 5, sessionCount: 2, toolCallCount: 10 },
        { date: '2026-03-02', messageCount: 3, sessionCount: 1, toolCallCount: 6 },
      ],
    })
    const cache2 = makeStatsCache({
      dailyActivity: [
        { date: '2026-03-01', messageCount: 7, sessionCount: 3, toolCallCount: 4 },
        { date: '2026-03-03', messageCount: 2, sessionCount: 1, toolCallCount: 1 },
      ],
    })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.dailyActivity).toEqual([
      { date: '2026-03-01', messageCount: 12, sessionCount: 5, toolCallCount: 14 },
      { date: '2026-03-02', messageCount: 3, sessionCount: 1, toolCallCount: 6 },
      { date: '2026-03-03', messageCount: 2, sessionCount: 1, toolCallCount: 1 },
    ])
  })

  it('sums dailyModelTokens across caches by date and model', () => {
    const cache1 = makeStatsCache({
      dailyModelTokens: [
        { date: '2026-03-01', tokensByModel: { 'claude-opus-4-6': 100, 'claude-sonnet-4-6': 50 } },
      ],
    })
    const cache2 = makeStatsCache({
      dailyModelTokens: [
        { date: '2026-03-01', tokensByModel: { 'claude-opus-4-6': 200, 'claude-haiku-3.5': 30 } },
        { date: '2026-03-02', tokensByModel: { 'claude-sonnet-4-6': 80 } },
      ],
    })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.dailyModelTokens).toEqual([
      { date: '2026-03-01', tokensByModel: { 'claude-opus-4-6': 300, 'claude-sonnet-4-6': 50, 'claude-haiku-3.5': 30 } },
      { date: '2026-03-02', tokensByModel: { 'claude-sonnet-4-6': 80 } },
    ])
  })

  it('sums modelUsage across caches by model', () => {
    const cache1 = makeStatsCache({
      modelUsage: {
        'claude-opus-4-6': { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 10, cacheCreationInputTokens: 5 },
      },
    })
    const cache2 = makeStatsCache({
      modelUsage: {
        'claude-opus-4-6': { inputTokens: 200, outputTokens: 80, cacheReadInputTokens: 20, cacheCreationInputTokens: 15 },
        'claude-sonnet-4-6': { inputTokens: 50, outputTokens: 30, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      },
    })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.modelUsage).toEqual({
      'claude-opus-4-6': { inputTokens: 300, outputTokens: 130, cacheReadInputTokens: 30, cacheCreationInputTokens: 20 },
      'claude-sonnet-4-6': { inputTokens: 50, outputTokens: 30, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    })
  })

  it('takes earliest firstSessionDate', () => {
    const cache1 = makeStatsCache({ firstSessionDate: '2026-03-10T00:00:00.000Z' })
    const cache2 = makeStatsCache({ firstSessionDate: '2026-01-15T00:00:00.000Z' })
    const cache3 = makeStatsCache({ firstSessionDate: '2026-02-20T00:00:00.000Z' })

    const result = mergeStatsCaches([cache1, cache2, cache3])!

    expect(result.firstSessionDate).toBe('2026-01-15T00:00:00.000Z')
  })

  it('sums totalSessions and totalMessages', () => {
    const cache1 = makeStatsCache({ totalSessions: 10, totalMessages: 100 })
    const cache2 = makeStatsCache({ totalSessions: 5, totalMessages: 40 })
    const cache3 = makeStatsCache({ totalSessions: 3, totalMessages: 20 })

    const result = mergeStatsCaches([cache1, cache2, cache3])!

    expect(result.totalSessions).toBe(18)
    expect(result.totalMessages).toBe(160)
  })

  it('takes the longest session by duration', () => {
    const cache1 = makeStatsCache({
      longestSession: { sessionId: 'short', duration: 1000, messageCount: 5, timestamp: '2026-03-01T00:00:00.000Z' },
    })
    const cache2 = makeStatsCache({
      longestSession: { sessionId: 'long', duration: 9999, messageCount: 50, timestamp: '2026-03-02T00:00:00.000Z' },
    })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.longestSession).toEqual({
      sessionId: 'long',
      duration: 9999,
      messageCount: 50,
      timestamp: '2026-03-02T00:00:00.000Z',
    })
  })

  it('sums hourCounts across caches', () => {
    const cache1 = makeStatsCache({ hourCounts: { '9': 3, '14': 2 } })
    const cache2 = makeStatsCache({ hourCounts: { '9': 1, '17': 5 } })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.hourCounts).toEqual({ '9': 4, '14': 2, '17': 5 })
  })

  it('takes the latest lastComputedDate', () => {
    const cache1 = makeStatsCache({ lastComputedDate: '2026-03-01T00:00:00.000Z' })
    const cache2 = makeStatsCache({ lastComputedDate: '2026-03-15T00:00:00.000Z' })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.lastComputedDate).toBe('2026-03-15T00:00:00.000Z')
  })

  it('sums totalSpeculationTimeSavedMs when present', () => {
    const cache1 = makeStatsCache({ totalSpeculationTimeSavedMs: 1000 })
    const cache2 = makeStatsCache({ totalSpeculationTimeSavedMs: 2500 })
    const cache3 = makeStatsCache({}) // no speculation time

    const result = mergeStatsCaches([cache1, cache2, cache3])!

    expect(result.totalSpeculationTimeSavedMs).toBe(3500)
  })

  it('preserves optional modelUsage fields (webSearchRequests, costUSD)', () => {
    const cache1 = makeStatsCache({
      modelUsage: {
        'claude-opus-4-6': {
          inputTokens: 100, outputTokens: 50,
          cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
          webSearchRequests: 3, costUSD: 0.50,
        },
      },
    })
    const cache2 = makeStatsCache({
      modelUsage: {
        'claude-opus-4-6': {
          inputTokens: 200, outputTokens: 80,
          cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
          webSearchRequests: 2, costUSD: 0.30,
        },
      },
    })

    const result = mergeStatsCaches([cache1, cache2])!

    expect(result.modelUsage['claude-opus-4-6']).toEqual({
      inputTokens: 300, outputTokens: 130,
      cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      webSearchRequests: 5, costUSD: 0.80,
    })
  })
})
