import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { HistoryEntry } from './types'
import type { DataSource } from '../utils/claude-path'

// vi.mock is hoisted — define the mock inline, then grab the spy reference after import
vi.mock('../utils/claude-path', () => ({
  getHistoryPath: vi.fn(),
  getHistoryPathFor: vi.fn((source: DataSource) =>
    path.join(source.claudeDir, 'history.jsonl'),
  ),
  getDataSources: vi.fn(),
  getClaudeDir: vi.fn(),
  getProjectsDir: vi.fn(),
  getStatsPath: vi.fn(),
  decodeProjectDirName: vi.fn(),
  extractProjectName: vi.fn(),
  extractSessionId: vi.fn(),
}))

import { getHistoryPath, getDataSources } from '../utils/claude-path'
import { parseHistory, parseHistoryFrom, parseHistoryMultiSource } from './history-parser'

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

describe('parseHistoryFrom', () => {
  let tempDir: string

  function makeSource(dir: string, id = 'test-source'): DataSource {
    return {
      id,
      label: 'Test Source',
      claudeDir: dir,
      platform: 'macos',
      available: true,
    }
  }

  function writeHistoryFileAt(dir: string, entries: HistoryEntry[]): void {
    const lines = entries.map((e) => JSON.stringify(e))
    fs.writeFileSync(path.join(dir, 'history.jsonl'), lines.join('\n'), 'utf-8')
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

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-from-test-'))
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

  it('reads history from the given source claudeDir', async () => {
    const entries: HistoryEntry[] = [
      makeEntry({ display: 'fix bug', timestamp: 1000, sessionId: 'sess-1' }),
      makeEntry({ display: 'add feature', timestamp: 2000, sessionId: 'sess-2' }),
    ]
    writeHistoryFileAt(tempDir, entries)
    const source = makeSource(tempDir)

    const result = await parseHistoryFrom(source)

    expect(result).toHaveLength(2)
    // Sorted descending by timestamp
    expect(result[0].sessionId).toBe('sess-2')
    expect(result[0].display).toBe('add feature')
    expect(result[1].sessionId).toBe('sess-1')
  })

  it('returns empty array when source history file does not exist', async () => {
    // tempDir exists but has no history.jsonl
    const source = makeSource(tempDir)

    const result = await parseHistoryFrom(source)

    expect(result).toEqual([])
  })

  it('accepts an optional limit parameter', async () => {
    const entries: HistoryEntry[] = [
      makeEntry({ display: 'a', timestamp: 1000, sessionId: 's1' }),
      makeEntry({ display: 'b', timestamp: 2000, sessionId: 's2' }),
      makeEntry({ display: 'c', timestamp: 3000, sessionId: 's3' }),
    ]
    writeHistoryFileAt(tempDir, entries)
    const source = makeSource(tempDir)

    const result = await parseHistoryFrom(source, 2)

    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe(3000)
    expect(result[1].timestamp).toBe(2000)
  })
})

describe('parseHistoryMultiSource', () => {
  const tempDirs: string[] = []

  function makeTempSource(entries: HistoryEntry[], id: string): DataSource {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `history-multi-${id}-`))
    tempDirs.push(dir)
    const lines = entries.map((e) => JSON.stringify(e))
    fs.writeFileSync(path.join(dir, 'history.jsonl'), lines.join('\n'), 'utf-8')
    return {
      id,
      label: `Source ${id}`,
      claudeDir: dir,
      platform: 'macos',
      available: true,
    }
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

  afterEach(() => {
    vi.clearAllMocks()
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true })
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0
  })

  it('merges history from multiple sources', async () => {
    const src1 = makeTempSource(
      [makeEntry({ display: 'from s1', timestamp: 1000, sessionId: 'a' })],
      'source-1',
    )
    const src2 = makeTempSource(
      [makeEntry({ display: 'from s2', timestamp: 2000, sessionId: 'b' })],
      'source-2',
    )

    vi.mocked(getDataSources).mockResolvedValue([src1, src2])

    const result = await parseHistoryMultiSource()

    expect(result).toHaveLength(2)
    // Sorted descending by timestamp
    expect(result[0].display).toBe('from s2')
    expect(result[1].display).toBe('from s1')
  })

  it('deduplicates entries by sessionId+timestamp', async () => {
    const sharedEntry = makeEntry({
      display: 'shared',
      timestamp: 1000,
      sessionId: 'dup-sess',
    })
    const uniqueEntry = makeEntry({
      display: 'unique',
      timestamp: 2000,
      sessionId: 'unique-sess',
    })

    const src1 = makeTempSource([sharedEntry, uniqueEntry], 'source-1')
    const src2 = makeTempSource([sharedEntry], 'source-2')

    vi.mocked(getDataSources).mockResolvedValue([src1, src2])

    const result = await parseHistoryMultiSource()

    // Should have 2 entries, not 3 (duplicate removed)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.sessionId).sort()).toEqual(['dup-sess', 'unique-sess'])
  })

  it('skips unavailable sources', async () => {
    const availableSource = makeTempSource(
      [makeEntry({ display: 'exists', timestamp: 1000, sessionId: 's1' })],
      'available',
    )
    const unavailableSource: DataSource = {
      id: 'unavail',
      label: 'Unavailable',
      claudeDir: '/nonexistent/path/that/does/not/exist',
      platform: 'linux',
      available: false,
    }

    vi.mocked(getDataSources).mockResolvedValue([availableSource, unavailableSource])

    const result = await parseHistoryMultiSource()

    expect(result).toHaveLength(1)
    expect(result[0].display).toBe('exists')
  })
})
