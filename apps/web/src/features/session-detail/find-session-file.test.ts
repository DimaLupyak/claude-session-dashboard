import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'node:path'
import type { DataSource } from '@/lib/utils/claude-path'

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('@/lib/utils/claude-path', () => ({
  getDataSources: vi.fn(),
  getProjectsDirFor: vi.fn((source: DataSource) => path.join(source.claudeDir, 'projects')),
  decodeProjectDirName: vi.fn((dirName: string) =>
    dirName.replace(/^-/, '/').replace(/-/g, '/'),
  ),
}))

import * as fs from 'node:fs'
import { findSessionFile } from './find-session-file'
import { getDataSources } from '@/lib/utils/claude-path'

const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>
const mockGetDataSources = getDataSources as ReturnType<typeof vi.fn>

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: 'primary',
    label: 'macOS',
    claudeDir: '/home/user/.claude',
    platform: 'macos',
    available: true,
    ...overrides,
  }
}

describe('findSessionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds session file in primary source via project path match', async () => {
    const primary = makeSource()
    mockGetDataSources.mockResolvedValue([primary])
    mockReaddirSync.mockReturnValue(['-Users-user-myproject'])
    mockExistsSync.mockImplementation((p: string) => {
      return p === '/home/user/.claude/projects/-Users-user-myproject/session-123.jsonl'
    })

    const result = await findSessionFile('session-123', '/Users/user/myproject')

    expect(result).toEqual({
      path: '/home/user/.claude/projects/-Users-user-myproject/session-123.jsonl',
      dirName: '-Users-user-myproject',
    })
  })

  it('finds session file via fallback scan of all projects in primary source', async () => {
    const primary = makeSource()
    mockGetDataSources.mockResolvedValue([primary])
    mockReaddirSync.mockReturnValue(['-Users-user-other', '-Users-user-myproject'])
    mockExistsSync.mockImplementation((p: string) => {
      return p === '/home/user/.claude/projects/-Users-user-myproject/session-123.jsonl'
    })

    const result = await findSessionFile('session-123', '/Users/user/nonexistent')

    expect(result).toEqual({
      path: '/home/user/.claude/projects/-Users-user-myproject/session-123.jsonl',
      dirName: '-Users-user-myproject',
    })
  })

  it('finds session file in secondary source when not in primary', async () => {
    const primary = makeSource()
    const secondary = makeSource({
      id: 'wsl-ubuntu',
      label: 'WSL-Ubuntu',
      claudeDir: '/mnt/wsl/ubuntu/.claude',
      platform: 'wsl',
    })
    mockGetDataSources.mockResolvedValue([primary, secondary])

    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/home/user/.claude/projects') return ['-Users-user-other']
      if (p === '/mnt/wsl/ubuntu/.claude/projects') return ['-home-user-project']
      return []
    })
    mockExistsSync.mockImplementation((p: string) => {
      return p === '/mnt/wsl/ubuntu/.claude/projects/-home-user-project/session-456.jsonl'
    })

    const result = await findSessionFile('session-456', '/Users/user/nonexistent')

    expect(result).toEqual({
      path: '/mnt/wsl/ubuntu/.claude/projects/-home-user-project/session-456.jsonl',
      dirName: '-home-user-project',
    })
  })

  it('returns null when session not found in any source', async () => {
    const primary = makeSource()
    mockGetDataSources.mockResolvedValue([primary])
    mockReaddirSync.mockReturnValue(['-Users-user-project'])
    mockExistsSync.mockReturnValue(false)

    const result = await findSessionFile('nonexistent-id', '/Users/user/project')

    expect(result).toBeNull()
  })

  it('skips unavailable sources', async () => {
    const primary = makeSource({ available: false })
    const secondary = makeSource({
      id: 'secondary',
      claudeDir: '/other/.claude',
      available: true,
    })
    mockGetDataSources.mockResolvedValue([primary, secondary])

    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/home/user/.claude/projects') {
        throw new Error('should not be called for unavailable source')
      }
      if (p === '/other/.claude/projects') return ['-other-project']
      return []
    })
    mockExistsSync.mockImplementation((p: string) => {
      return p === '/other/.claude/projects/-other-project/session-789.jsonl'
    })

    const result = await findSessionFile('session-789', '/other/project')

    expect(result).toEqual({
      path: '/other/.claude/projects/-other-project/session-789.jsonl',
      dirName: '-other-project',
    })
  })

  it('handles readdir failure gracefully for a source', async () => {
    const primary = makeSource()
    mockGetDataSources.mockResolvedValue([primary])
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const result = await findSessionFile('session-123', '/Users/user/project')

    expect(result).toBeNull()
  })
})
