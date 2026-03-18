import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  promises: {
    readdir: vi.fn(),
    stat: vi.fn(),
  },
}))

vi.mock('@/lib/utils/claude-path', () => ({
  getProjectsDir: vi.fn(() => '/fake/projects'),
  getProjectsDirFor: vi.fn((source: { claudeDir: string }) => `${source.claudeDir}/projects`),
  getDataSources: vi.fn(),
  decodeProjectDirName: vi.fn((dirName: string) =>
    dirName.replace(/^-/, '/').replace(/-/g, '/'),
  ),
  extractProjectName: vi.fn((decodedPath: string) => {
    const parts = decodedPath.split('/')
    return parts[parts.length - 1] ?? decodedPath
  }),
}))

import * as fs from 'node:fs'
import { getDataSources } from '@/lib/utils/claude-path'
import { scanProjects, scanProjectsFrom, scanAllProjects } from './project-scanner'

const mockReaddir = fs.promises.readdir as ReturnType<typeof vi.fn>
const mockStat = fs.promises.stat as ReturnType<typeof vi.fn>

function makeStat(isDir: boolean) {
  return { isDirectory: () => isDir }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scanProjects', () => {
  describe('empty and missing directory', () => {
    it('returns [] when projects directory is empty', async () => {
      mockReaddir.mockResolvedValueOnce([])

      const result = await scanProjects()

      expect(result).toEqual([])
    })

    it('returns [] when readdir throws (directory does not exist)', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

      const result = await scanProjects()

      expect(result).toEqual([])
    })

    it('returns [] when readdir throws a permission error', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('EACCES: permission denied'))

      const result = await scanProjects()

      expect(result).toEqual([])
    })
  })

  describe('filtering non-directory entries', () => {
    it('skips entries that are files, not directories', async () => {
      mockReaddir.mockResolvedValueOnce(['-Users-alice-project'])
      mockStat.mockResolvedValueOnce(makeStat(false))

      const result = await scanProjects()

      expect(result).toEqual([])
    })

    it('skips entries where stat throws', async () => {
      mockReaddir.mockResolvedValueOnce(['-Users-alice-project'])
      mockStat.mockRejectedValueOnce(new Error('ENOENT'))

      const result = await scanProjects()

      expect(result).toEqual([])
    })
  })

  describe('filtering projects with no session files', () => {
    it('skips a project directory that has no .jsonl files', async () => {
      mockReaddir
        .mockResolvedValueOnce(['-Users-alice-empty-project'])
        .mockResolvedValueOnce(['README.md', 'config.json'])
      mockStat.mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result).toEqual([])
    })

    it('skips a project directory whose inner readdir throws', async () => {
      mockReaddir
        .mockResolvedValueOnce(['-Users-alice-broken-project'])
        .mockRejectedValueOnce(new Error('EACCES'))
      mockStat.mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result).toEqual([])
    })
  })

  describe('single project with session files', () => {
    it('returns project info with session files', async () => {
      const dirName = '-Users-alice-myproject'
      mockReaddir
        .mockResolvedValueOnce([dirName])
        .mockResolvedValueOnce(['session-1.jsonl', 'session-2.jsonl', 'notes.txt'])
      mockStat.mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        dirName,
        sessionFiles: ['session-1.jsonl', 'session-2.jsonl'],
      })
      expect(result[0].decodedPath).toContain('myproject')
      expect(result[0].projectName).toBe('myproject')
    })

    it('only includes .jsonl files in sessionFiles', async () => {
      const dirName = '-Users-bob-work'
      mockReaddir
        .mockResolvedValueOnce([dirName])
        .mockResolvedValueOnce([
          'a.jsonl',
          'b.json',
          'c.txt',
          'd.jsonl',
          'e.JSONL',
        ])
      mockStat.mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result[0].sessionFiles).toEqual(['a.jsonl', 'd.jsonl'])
    })
  })

  describe('multiple projects', () => {
    it('returns all qualifying projects', async () => {
      const dir1 = '-Users-alice-project-alpha'
      const dir2 = '-Users-alice-project-beta'

      mockReaddir
        .mockResolvedValueOnce([dir1, dir2])
        .mockResolvedValueOnce(['session-1.jsonl'])
        .mockResolvedValueOnce(['session-2.jsonl', 'session-3.jsonl'])
      mockStat
        .mockResolvedValueOnce(makeStat(true))
        .mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result).toHaveLength(2)
      expect(result.map((p) => p.dirName)).toEqual([dir1, dir2])
      expect(result[0].sessionFiles).toHaveLength(1)
      expect(result[1].sessionFiles).toHaveLength(2)
    })

    it('mixes qualifying and skipped projects correctly', async () => {
      const validDir = '-Users-alice-has-sessions'
      const fileEntry = '-Users-alice-not-a-dir'
      const emptyDir = '-Users-alice-no-sessions'

      mockReaddir
        .mockResolvedValueOnce([validDir, fileEntry, emptyDir])
        .mockResolvedValueOnce(['session.jsonl'])
        .mockResolvedValueOnce([])
      mockStat
        .mockResolvedValueOnce(makeStat(true))
        .mockResolvedValueOnce(makeStat(false))
        .mockResolvedValueOnce(makeStat(true))

      const result = await scanProjects()

      expect(result).toHaveLength(1)
      expect(result[0].dirName).toBe(validDir)
    })

    it('handles stat error on one of multiple entries and continues', async () => {
      const dir1 = '-Users-alice-fine'
      const dir2 = '-Users-alice-broken'

      mockReaddir
        .mockResolvedValueOnce([dir1, dir2])
        .mockResolvedValueOnce(['session.jsonl'])
      mockStat
        .mockResolvedValueOnce(makeStat(true))
        .mockRejectedValueOnce(new Error('EPERM'))

      const result = await scanProjects()

      expect(result).toHaveLength(1)
      expect(result[0].dirName).toBe(dir1)
    })
  })
})

describe('scanProjectsFrom', () => {
  it('scans projects from a specific data source directory', async () => {
    const source = {
      id: 'wsl-ubuntu-dev',
      label: 'WSL - Ubuntu',
      claudeDir: '/mnt/wsl/ubuntu/home/dev/.claude',
      platform: 'wsl' as const,
      available: true,
    }
    const dirName = '-home-dev-myproject'

    mockReaddir
      .mockResolvedValueOnce([dirName])
      .mockResolvedValueOnce(['session-1.jsonl'])
    mockStat.mockResolvedValueOnce(makeStat(true))

    const result = await scanProjectsFrom(source)

    expect(result).toHaveLength(1)
    expect(result[0].dirName).toBe(dirName)
    expect(result[0].sourceId).toBe('wsl-ubuntu-dev')
    expect(result[0].sourceLabel).toBe('WSL - Ubuntu')
    // Verify it used the source-specific projects dir
    expect(mockReaddir).toHaveBeenCalledWith('/mnt/wsl/ubuntu/home/dev/.claude/projects')
  })

  it('returns [] when the source projects directory does not exist', async () => {
    const source = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/alice/.claude',
      platform: 'macos' as const,
      available: true,
    }

    mockReaddir.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await scanProjectsFrom(source)

    expect(result).toEqual([])
  })

  it('sets sourceId and sourceLabel on all returned projects', async () => {
    const source = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/alice/.claude',
      platform: 'macos' as const,
      available: true,
    }
    const dir1 = '-Users-alice-proj1'
    const dir2 = '-Users-alice-proj2'

    mockReaddir
      .mockResolvedValueOnce([dir1, dir2])
      .mockResolvedValueOnce(['a.jsonl'])
      .mockResolvedValueOnce(['b.jsonl'])
    mockStat
      .mockResolvedValueOnce(makeStat(true))
      .mockResolvedValueOnce(makeStat(true))

    const result = await scanProjectsFrom(source)

    expect(result).toHaveLength(2)
    for (const project of result) {
      expect(project.sourceId).toBe('primary')
      expect(project.sourceLabel).toBe('macOS')
    }
  })
})

describe('scanAllProjects', () => {
  const mockGetDataSources = getDataSources as ReturnType<typeof vi.fn>

  it('merges projects from multiple data sources', async () => {
    const source1 = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/alice/.claude',
      platform: 'macos' as const,
      available: true,
    }
    const source2 = {
      id: 'wsl-ubuntu-alice',
      label: 'WSL - Ubuntu',
      claudeDir: '/mnt/wsl/ubuntu/home/alice/.claude',
      platform: 'wsl' as const,
      available: true,
    }

    mockGetDataSources.mockResolvedValueOnce([source1, source2])

    // Source 1 readdir calls
    mockReaddir
      .mockResolvedValueOnce(['-Users-alice-proj1'])
      .mockResolvedValueOnce(['s1.jsonl'])
    mockStat.mockResolvedValueOnce(makeStat(true))

    // Source 2 readdir calls
    mockReaddir
      .mockResolvedValueOnce(['-home-alice-proj2'])
      .mockResolvedValueOnce(['s2.jsonl'])
    mockStat.mockResolvedValueOnce(makeStat(true))

    const result = await scanAllProjects()

    expect(result).toHaveLength(2)
    expect(result[0].sourceId).toBe('primary')
    expect(result[0].sourceLabel).toBe('macOS')
    expect(result[1].sourceId).toBe('wsl-ubuntu-alice')
    expect(result[1].sourceLabel).toBe('WSL - Ubuntu')
  })

  it('skips unavailable data sources', async () => {
    const available = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/alice/.claude',
      platform: 'macos' as const,
      available: true,
    }
    const unavailable = {
      id: 'wsl-ubuntu',
      label: 'WSL - Ubuntu',
      claudeDir: '/mnt/wsl/ubuntu/.claude',
      platform: 'wsl' as const,
      available: false,
    }

    mockGetDataSources.mockResolvedValueOnce([available, unavailable])

    mockReaddir
      .mockResolvedValueOnce(['-Users-alice-proj'])
      .mockResolvedValueOnce(['s.jsonl'])
    mockStat.mockResolvedValueOnce(makeStat(true))

    const result = await scanAllProjects()

    expect(result).toHaveLength(1)
    expect(result[0].sourceId).toBe('primary')
  })

  it('returns [] when no data sources are available', async () => {
    mockGetDataSources.mockResolvedValueOnce([])

    const result = await scanAllProjects()

    expect(result).toEqual([])
  })

  it('continues when one source fails and another succeeds', async () => {
    const source1 = {
      id: 'primary',
      label: 'macOS',
      claudeDir: '/Users/alice/.claude',
      platform: 'macos' as const,
      available: true,
    }
    const source2 = {
      id: 'wsl-ubuntu',
      label: 'WSL - Ubuntu',
      claudeDir: '/mnt/wsl/ubuntu/.claude',
      platform: 'wsl' as const,
      available: true,
    }

    mockGetDataSources.mockResolvedValueOnce([source1, source2])

    // Source 1 fails
    mockReaddir.mockRejectedValueOnce(new Error('ENOENT'))

    // Source 2 succeeds
    mockReaddir
      .mockResolvedValueOnce(['-home-alice-proj'])
      .mockResolvedValueOnce(['s.jsonl'])
    mockStat.mockResolvedValueOnce(makeStat(true))

    const result = await scanAllProjects()

    expect(result).toHaveLength(1)
    expect(result[0].sourceId).toBe('wsl-ubuntu')
  })
})
