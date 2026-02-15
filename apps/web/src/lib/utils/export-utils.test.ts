import { describe, it, expect } from 'vitest'
import type { StatsCache, SessionDetail } from '@/lib/parsers/types'
import {
  dailyActivityToCSV,
  dailyTokensToCSV,
  modelUsageToCSV,
  statsToJSON,
  sessionToJSON,
} from './export-utils'

describe('export-utils', () => {
  describe('dailyActivityToCSV', () => {
    it('should generate CSV with correct header', () => {
      const stats: StatsCache = createMockStats({
        dailyActivity: [],
      })

      const csv = dailyActivityToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[0]).toBe('date,messageCount,sessionCount,toolCallCount')
    })

    it('should generate correct data rows', () => {
      const stats: StatsCache = createMockStats({
        dailyActivity: [
          { date: '2026-01-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
          { date: '2026-01-02', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
        ],
      })

      const csv = dailyActivityToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(3) // header + 2 data rows
      expect(lines[1]).toBe('2026-01-01,10,2,5')
      expect(lines[2]).toBe('2026-01-02,20,3,8')
    })

    it('should handle empty dailyActivity array', () => {
      const stats: StatsCache = createMockStats({
        dailyActivity: [],
      })

      const csv = dailyActivityToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(1) // only header
      expect(lines[0]).toBe('date,messageCount,sessionCount,toolCallCount')
    })

    it('should escape CSV fields with commas', () => {
      // Even though dates shouldn't have commas, test the escaping mechanism
      const stats: StatsCache = createMockStats({
        dailyActivity: [
          { date: '2026-01-01,extra', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        ],
      })

      const csv = dailyActivityToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[1]).toBe('"2026-01-01,extra",10,2,5')
    })
  })

  describe('dailyTokensToCSV', () => {
    it('should generate CSV with correct header', () => {
      const stats: StatsCache = createMockStats({
        dailyModelTokens: [],
      })

      const csv = dailyTokensToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[0]).toBe('date,model,tokens')
    })

    it('should flatten tokensByModel to one row per model per day', () => {
      const stats: StatsCache = createMockStats({
        dailyModelTokens: [
          {
            date: '2026-01-01',
            tokensByModel: {
              'claude-opus-4-6': 1000,
              'claude-sonnet-4-5': 500,
            },
          },
          {
            date: '2026-01-02',
            tokensByModel: {
              'claude-opus-4-6': 2000,
            },
          },
        ],
      })

      const csv = dailyTokensToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(4) // header + 3 data rows (2 models on day 1, 1 model on day 2)
      expect(lines[1]).toBe('2026-01-01,claude-opus-4-6,1000')
      expect(lines[2]).toBe('2026-01-01,claude-sonnet-4-5,500')
      expect(lines[3]).toBe('2026-01-02,claude-opus-4-6,2000')
    })

    it('should handle empty dailyModelTokens array', () => {
      const stats: StatsCache = createMockStats({
        dailyModelTokens: [],
      })

      const csv = dailyTokensToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(1) // only header
      expect(lines[0]).toBe('date,model,tokens')
    })

    it('should handle model names with commas', () => {
      const stats: StatsCache = createMockStats({
        dailyModelTokens: [
          {
            date: '2026-01-01',
            tokensByModel: {
              'claude-opus-4-6,test': 1000,
            },
          },
        ],
      })

      const csv = dailyTokensToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[1]).toBe('2026-01-01,"claude-opus-4-6,test",1000')
    })
  })

  describe('modelUsageToCSV', () => {
    it('should generate CSV with correct header', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {},
      })

      const csv = modelUsageToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[0]).toBe('model,inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens')
    })

    it('should generate correct data rows from ModelUsage', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {
          'claude-opus-4-6': {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 200,
            cacheCreationInputTokens: 100,
          },
          'claude-sonnet-4-5': {
            inputTokens: 2000,
            outputTokens: 1000,
            cacheReadInputTokens: 400,
            cacheCreationInputTokens: 200,
          },
        },
      })

      const csv = modelUsageToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(3) // header + 2 data rows
      expect(lines[1]).toBe('claude-opus-4-6,1000,500,200,100')
      expect(lines[2]).toBe('claude-sonnet-4-5,2000,1000,400,200')
    })

    it('should handle empty modelUsage object', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {},
      })

      const csv = modelUsageToCSV(stats)
      const lines = csv.split('\n')

      expect(lines.length).toBe(1) // only header
      expect(lines[0]).toBe('model,inputTokens,outputTokens,cacheReadInputTokens,cacheCreationInputTokens')
    })

    it('should escape model names with special characters', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {
          'claude-opus-4-6,special': {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 200,
            cacheCreationInputTokens: 100,
          },
        },
      })

      const csv = modelUsageToCSV(stats)
      const lines = csv.split('\n')

      expect(lines[1]).toBe('"claude-opus-4-6,special",1000,500,200,100')
    })
  })

  describe('statsToJSON', () => {
    it('should return valid JSON', () => {
      const stats: StatsCache = createMockStats()

      const json = statsToJSON(stats)

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should contain all stats fields', () => {
      const stats: StatsCache = createMockStats({
        version: 1,
        totalSessions: 10,
        totalMessages: 100,
      })

      const json = statsToJSON(stats)
      const parsed = JSON.parse(json)

      expect(parsed.version).toBe(1)
      expect(parsed.totalSessions).toBe(10)
      expect(parsed.totalMessages).toBe(100)
      expect(parsed.dailyActivity).toBeDefined()
      expect(parsed.dailyModelTokens).toBeDefined()
      expect(parsed.modelUsage).toBeDefined()
    })

    it('should format JSON with 2-space indentation', () => {
      const stats: StatsCache = createMockStats()

      const json = statsToJSON(stats)

      // Check that it's formatted (not minified)
      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })

    it('should handle empty stats data', () => {
      const stats: StatsCache = createMockStats({
        dailyActivity: [],
        dailyModelTokens: [],
        modelUsage: {},
      })

      const json = statsToJSON(stats)
      const parsed = JSON.parse(json)

      expect(parsed.dailyActivity).toEqual([])
      expect(parsed.dailyModelTokens).toEqual([])
      expect(parsed.modelUsage).toEqual({})
    })
  })

  describe('sessionToJSON', () => {
    it('should return valid JSON', () => {
      const detail: SessionDetail = createMockSessionDetail()

      const json = sessionToJSON(detail)

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should contain session detail fields', () => {
      const detail: SessionDetail = createMockSessionDetail({
        sessionId: 'test-session-123',
        projectName: 'test-project',
      })

      const json = sessionToJSON(detail)
      const parsed = JSON.parse(json)

      expect(parsed.sessionId).toBe('test-session-123')
      expect(parsed.projectName).toBe('test-project')
      expect(parsed.turns).toBeDefined()
      expect(parsed.totalTokens).toBeDefined()
      expect(parsed.tokensByModel).toBeDefined()
    })

    it('should format JSON with 2-space indentation', () => {
      const detail: SessionDetail = createMockSessionDetail()

      const json = sessionToJSON(detail)

      // Check that it's formatted (not minified)
      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })

    it('should handle empty arrays in session detail', () => {
      const detail: SessionDetail = createMockSessionDetail({
        turns: [],
        agents: [],
        skills: [],
        tasks: [],
        errors: [],
      })

      const json = sessionToJSON(detail)
      const parsed = JSON.parse(json)

      expect(parsed.turns).toEqual([])
      expect(parsed.agents).toEqual([])
      expect(parsed.skills).toEqual([])
      expect(parsed.tasks).toEqual([])
      expect(parsed.errors).toEqual([])
    })
  })

  describe('CSV field escaping edge cases', () => {
    it('should escape fields with quotes', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {
          'model"with"quotes': {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 5,
          },
        },
      })

      const csv = modelUsageToCSV(stats)
      const lines = csv.split('\n')

      // Quotes should be doubled and the field should be quoted
      expect(lines[1]).toBe('"model""with""quotes",100,50,10,5')
    })

    it('should escape fields with newlines', () => {
      const stats: StatsCache = createMockStats({
        modelUsage: {
          'model\nwith\nnewlines': {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 5,
          },
        },
      })

      const csv = modelUsageToCSV(stats)

      // The field should be quoted
      expect(csv).toContain('"model\nwith\nnewlines"')
    })

    it('should not escape plain fields', () => {
      const stats: StatsCache = createMockStats({
        dailyActivity: [
          { date: '2026-01-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        ],
      })

      const csv = dailyActivityToCSV(stats)
      const lines = csv.split('\n')

      // Plain fields should not have quotes
      expect(lines[1]).toBe('2026-01-01,10,2,5')
      expect(lines[1]).not.toContain('"')
    })
  })
})

// Test helpers

function createMockStats(overrides: Partial<StatsCache> = {}): StatsCache {
  return {
    version: 1,
    lastComputedDate: '2026-01-01',
    dailyActivity: [],
    dailyModelTokens: [],
    modelUsage: {},
    totalSessions: 0,
    totalMessages: 0,
    longestSession: {
      sessionId: 'test-session',
      duration: 0,
      messageCount: 0,
      timestamp: '2026-01-01T00:00:00Z',
    },
    firstSessionDate: '2026-01-01',
    hourCounts: {},
    ...overrides,
  }
}

function createMockSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    sessionId: 'test-session-123',
    projectPath: '/path/to/project',
    projectName: 'test-project',
    branch: 'main',
    turns: [],
    totalTokens: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    tokensByModel: {},
    toolFrequency: {},
    errors: [],
    models: [],
    agents: [],
    skills: [],
    tasks: [],
    contextWindow: null,
    ...overrides,
  }
}
