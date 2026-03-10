import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { HistoryEntry } from './types'

// vi.mock is hoisted — define the mock inline, then grab the spy reference after import
vi.mock('../utils/claude-path', () => ({
  getHistoryPath: vi.fn(),
  getClaudeDir: vi.fn(),
  getProjectsDir: vi.fn(),
  getStatsPath: vi.fn(),
  decodeProjectDirName: vi.fn(),
  extractProjectName: vi.fn(),
  extractSessionId: vi.fn(),
}))

import { getHistoryPath } from '../utils/claude-path'
import { parseHistory } from './history-parser'

describe('parseHistory', () => {
  let tempDir: string
  let historyPath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-parser-test-'))
    historyPath = path.join(tempDir, 'history.jsonl')
    vi.mocked(getHistoryPath).mockReturnValue(historyPath)
  })

  afterEach(() => {
    vi.clearAllMocks()

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  function writeHistoryFile(entries: HistoryEntry[]): void {
    const lines = entries.map((e) => JSON.stringify(e))
    fs.writeFileSync(historyPath, lines.join('\n'), 'utf-8')
  }

  function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
    return {
      display: 'Default display text',
      timestamp: 1000000,
      project: '/home/user/project',
      sessionId: 'session-abc-123',
      ...overrides,
    }
  }

  describe('valid JSONL with multiple entries', () => {
    it('should parse and return all valid entries', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ display: 'First task', timestamp: 1000, sessionId: 'session-1' }),
        makeEntry({ display: 'Second task', timestamp: 2000, sessionId: 'session-2' }),
        makeEntry({ display: 'Third task', timestamp: 3000, sessionId: 'session-3' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory()

      expect(result).toHaveLength(3)
      expect(result.map((e) => e.sessionId)).toEqual(['session-3', 'session-2', 'session-1'])
    })

    it('should return entries sorted by timestamp descending (most recent first)', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ timestamp: 3000, sessionId: 'session-c' }),
        makeEntry({ timestamp: 1000, sessionId: 'session-a' }),
        makeEntry({ timestamp: 2000, sessionId: 'session-b' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory()

      expect(result[0].sessionId).toBe('session-c')
      expect(result[1].sessionId).toBe('session-b')
      expect(result[2].sessionId).toBe('session-a')
    })

    it('should preserve all fields of each entry', async () => {
      const entry: HistoryEntry = {
        display: 'Build the feature',
        timestamp: 1700000000,
        project: '/Users/dev/my-project',
        sessionId: 'abc-def-ghi',
      }

      writeHistoryFile([entry])

      const result = await parseHistory()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(entry)
    })
  })

  describe('malformed lines in JSONL', () => {
    it('should skip malformed lines and still return valid entries', async () => {
      const validEntry1 = makeEntry({ display: 'Valid one', timestamp: 1000, sessionId: 'v1' })
      const validEntry2 = makeEntry({ display: 'Valid two', timestamp: 2000, sessionId: 'v2' })

      const lines = [
        JSON.stringify(validEntry1),
        'this is not valid json {{{',
        JSON.stringify(validEntry2),
        'another malformed line',
      ]

      fs.writeFileSync(historyPath, lines.join('\n'), 'utf-8')

      const result = await parseHistory()

      expect(result).toHaveLength(2)
      expect(result.map((e) => e.sessionId)).toContain('v1')
      expect(result.map((e) => e.sessionId)).toContain('v2')
    })

    it('should skip lines with valid JSON but missing required fields', async () => {
      // Missing sessionId
      const missingSessionId = { display: 'No session', timestamp: 1000, project: '/p' }
      // Missing display
      const missingDisplay = { timestamp: 1000, project: '/p', sessionId: 'x' }
      // Missing timestamp
      const missingTimestamp = { display: 'No ts', project: '/p', sessionId: 'y' }
      // Valid
      const valid = makeEntry({ display: 'Valid', timestamp: 5000, sessionId: 'valid-id' })

      const lines = [
        JSON.stringify(missingSessionId),
        JSON.stringify(missingDisplay),
        JSON.stringify(missingTimestamp),
        JSON.stringify(valid),
      ]

      fs.writeFileSync(historyPath, lines.join('\n'), 'utf-8')

      const result = await parseHistory()

      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('valid-id')
    })

    it('should return [] when all lines are malformed', async () => {
      const lines = ['not json', '{bad}', '<<<']
      fs.writeFileSync(historyPath, lines.join('\n'), 'utf-8')

      const result = await parseHistory()

      expect(result).toEqual([])
    })
  })

  describe('empty file', () => {
    it('should return [] for an empty file', async () => {
      fs.writeFileSync(historyPath, '', 'utf-8')

      const result = await parseHistory()

      expect(result).toEqual([])
    })

    it('should return [] for a file containing only blank lines', async () => {
      fs.writeFileSync(historyPath, '\n\n\n', 'utf-8')

      const result = await parseHistory()

      expect(result).toEqual([])
    })
  })

  describe('missing file (ENOENT)', () => {
    it('should return [] when the history file does not exist', async () => {
      // historyPath has NOT been created — file is absent
      expect(fs.existsSync(historyPath)).toBe(false)

      const result = await parseHistory()

      expect(result).toEqual([])
    })
  })

  describe('limit parameter', () => {
    it('should return only the N most recent entries when limit is provided', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ timestamp: 1000, sessionId: 'session-old' }),
        makeEntry({ timestamp: 2000, sessionId: 'session-mid' }),
        makeEntry({ timestamp: 3000, sessionId: 'session-new' }),
        makeEntry({ timestamp: 4000, sessionId: 'session-newest' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory(2)

      expect(result).toHaveLength(2)
      expect(result[0].sessionId).toBe('session-newest')
      expect(result[1].sessionId).toBe('session-new')
    })

    it('should return all entries when limit exceeds total count', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ timestamp: 1000, sessionId: 'session-1' }),
        makeEntry({ timestamp: 2000, sessionId: 'session-2' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory(100)

      expect(result).toHaveLength(2)
    })

    it('should return all entries when limit is not provided', async () => {
      const entries: HistoryEntry[] = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ timestamp: (i + 1) * 1000, sessionId: `session-${i}` }),
      )

      writeHistoryFile(entries)

      const result = await parseHistory()

      expect(result).toHaveLength(5)
    })

    it('should return the single most recent entry when limit is 1', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ timestamp: 1000, sessionId: 'older' }),
        makeEntry({ timestamp: 9000, sessionId: 'newest' }),
        makeEntry({ timestamp: 5000, sessionId: 'middle' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory(1)

      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('newest')
    })
  })

  describe('ordering', () => {
    it('should handle entries with equal timestamps', async () => {
      const entries: HistoryEntry[] = [
        makeEntry({ timestamp: 5000, sessionId: 'a', display: 'A' }),
        makeEntry({ timestamp: 5000, sessionId: 'b', display: 'B' }),
        makeEntry({ timestamp: 5000, sessionId: 'c', display: 'C' }),
      ]

      writeHistoryFile(entries)

      const result = await parseHistory()

      expect(result).toHaveLength(3)
      expect(result.map((e) => e.sessionId).sort()).toEqual(['a', 'b', 'c'])
    })

    it('should correctly sort a large number of entries', async () => {
      const count = 50
      const entries: HistoryEntry[] = Array.from({ length: count }, (_, i) =>
        makeEntry({ timestamp: (i + 1) * 100, sessionId: `session-${i}` }),
      )

      // Shuffle entries before writing to ensure sort is not order-dependent
      const shuffled = [...entries].sort(() => Math.random() - 0.5)
      writeHistoryFile(shuffled)

      const result = await parseHistory()

      expect(result).toHaveLength(count)
      // Verify descending order throughout the result
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].timestamp).toBeGreaterThanOrEqual(result[i + 1].timestamp)
      }
    })
  })
})
