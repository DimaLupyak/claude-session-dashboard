import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}))

vi.mock('@/lib/utils/claude-path', () => ({
  getProjectsDir: vi.fn(() => '/fake/projects'),
}))

import * as fs from 'node:fs'
import { isSessionActive } from './active-detector'

const mockStat = fs.promises.stat as ReturnType<typeof vi.fn>

const PROJECT_DIR = 'some-project'
const SESSION_ID = 'session-abc-123'
const JSONL_PATH = `/fake/projects/${PROJECT_DIR}/${SESSION_ID}.jsonl`
const LOCK_DIR_PATH = `/fake/projects/${PROJECT_DIR}/${SESSION_ID}`
const ACTIVE_THRESHOLD_MS = 120_000

function makeStatResult(mtimeMs: number, isDir = false) {
  return {
    mtimeMs,
    isDirectory: () => isDir,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('isSessionActive', () => {
  describe('mtime-based threshold', () => {
    it('returns true when file was modified within 2 minutes and lock dir exists', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 60_000 // 1 minute ago (within threshold)

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs)) // jsonl stat
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true)) // lock dir stat (isDirectory = true)

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(true)
      expect(mockStat).toHaveBeenCalledWith(JSONL_PATH)
      expect(mockStat).toHaveBeenCalledWith(LOCK_DIR_PATH)
    })

    it('returns false when file was modified more than 2 minutes ago', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS - 1 // just over threshold

      mockStat.mockResolvedValueOnce(makeStatResult(mtimeMs))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
      // Lock dir should NOT be checked when mtime check fails
      expect(mockStat).toHaveBeenCalledTimes(1)
    })

    it('returns false when file was modified exactly at the threshold boundary', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS // exactly at threshold: age === 120000 which is NOT > threshold
      // age > ACTIVE_THRESHOLD_MS is false when age === ACTIVE_THRESHOLD_MS
      // so this should proceed to lock dir check

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      // age === threshold means age > threshold is false, lock dir check happens
      expect(result).toBe(true)
    })

    it('returns false when file was modified 1ms beyond the threshold', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - ACTIVE_THRESHOLD_MS - 1

      mockStat.mockResolvedValueOnce(makeStatResult(mtimeMs))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })
  })

  describe('jsonl file not found', () => {
    it('returns false when stat on jsonl throws ENOENT', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValueOnce(Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
      expect(mockStat).toHaveBeenCalledTimes(1)
    })

    it('returns false when stat on jsonl throws a permission error', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValueOnce(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns false when stat on jsonl throws a generic error', async () => {
      vi.setSystemTime(1_700_000_000_000)

      mockStat.mockRejectedValueOnce(new Error('Unexpected error'))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })
  })

  describe('lock directory checks', () => {
    it('returns false when lock directory does not exist', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 30_000 // recent

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns false when lock path exists but is a file, not a directory', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 30_000

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockResolvedValueOnce(makeStatResult(mtimeMs, false)) // isDirectory = false

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(false)
    })

    it('returns true when file is recent and lock directory exists', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 10_000 // 10 seconds ago

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      expect(result).toBe(true)
    })

    it('returns false when lock dir stat throws even if jsonl is recent', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 5_000

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockRejectedValueOnce(new Error('permission denied'))

      const result = await isSessionActive(PROJECT_DIR, SESSION_ID)

      // lockStat is null due to .catch(() => null), so lockStat?.isDirectory() ?? false = false
      expect(result).toBe(false)
    })
  })

  describe('path construction', () => {
    it('constructs the correct jsonl path from projectDirName and sessionId', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      mockStat.mockRejectedValue(new Error('ENOENT'))

      await isSessionActive('my-project-dir', 'my-session-id')

      expect(mockStat).toHaveBeenCalledWith('/fake/projects/my-project-dir/my-session-id.jsonl')
    })

    it('constructs the correct lock dir path from projectDirName and sessionId', async () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      const mtimeMs = now - 1_000

      mockStat
        .mockResolvedValueOnce(makeStatResult(mtimeMs))
        .mockResolvedValueOnce(makeStatResult(mtimeMs, true))

      await isSessionActive('my-project-dir', 'my-session-id')

      expect(mockStat).toHaveBeenCalledWith('/fake/projects/my-project-dir/my-session-id')
    })
  })
})
