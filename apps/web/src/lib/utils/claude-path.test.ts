import { describe, it, expect, vi, afterEach } from 'vitest'
import * as os from 'node:os'
import * as path from 'node:path'

// Pure functions can be imported directly
import {
  decodeProjectDirName,
  extractProjectName,
  extractSessionId,
  getProjectsDirFor,
  getStatsPathFor,
  getHistoryPathFor,
} from './claude-path'
import type { DataSource } from './claude-path'

// Shared mock functions that persist across vi.resetModules() via vi.hoisted()
const { mockReadFile, mockAccess, mockReaddir } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockAccess: vi.fn(),
  mockReaddir: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  mockReadFile.mockImplementation((...args: Parameters<typeof actual.readFile>) =>
    actual.readFile(...args)
  )
  mockAccess.mockImplementation((...args: Parameters<typeof actual.access>) =>
    actual.access(...args)
  )
  mockReaddir.mockImplementation((...args: Parameters<typeof actual.readdir>) =>
    actual.readdir(...args)
  )
  return {
    ...actual,
    readFile: mockReadFile,
    access: mockAccess,
    readdir: mockReaddir,
  }
})

describe('claude-path', () => {
  describe('getClaudeDir', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns default path when CLAUDE_HOME is not set', async () => {
      vi.stubEnv('CLAUDE_HOME', '')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      expect(getClaudeDir()).toBe(path.join(os.homedir(), '.claude'))
    })

    it('returns resolved CLAUDE_HOME when set', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude/dir')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      expect(getClaudeDir()).toBe('/custom/claude/dir')
    })

    it('resolves relative CLAUDE_HOME to absolute path', async () => {
      vi.stubEnv('CLAUDE_HOME', 'relative/claude')
      vi.resetModules()
      const { getClaudeDir } = await import('./claude-path')
      const result = getClaudeDir()
      expect(path.isAbsolute(result)).toBe(true)
      expect(result).toContain('relative/claude')
    })
  })

  describe('getProjectsDir', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns projects subdirectory under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getProjectsDir } = await import('./claude-path')
      expect(getProjectsDir()).toBe('/custom/claude/projects')
    })

    it('returns default projects path when CLAUDE_HOME not set', async () => {
      vi.stubEnv('CLAUDE_HOME', '')
      vi.resetModules()
      const { getProjectsDir } = await import('./claude-path')
      expect(getProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'))
    })
  })

  describe('getStatsPath', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns stats-cache.json path under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getStatsPath } = await import('./claude-path')
      expect(getStatsPath()).toBe('/custom/claude/stats-cache.json')
    })
  })

  describe('getHistoryPath', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    it('returns history.jsonl path under claude dir', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude')
      vi.resetModules()
      const { getHistoryPath } = await import('./claude-path')
      expect(getHistoryPath()).toBe('/custom/claude/history.jsonl')
    })
  })

  describe('decodeProjectDirName', () => {
    it('decodes leading dash to slash', () => {
      expect(decodeProjectDirName('-Users-username-project')).toBe('/Users/username/project')
    })

    it('decodes a typical encoded project directory name', () => {
      expect(decodeProjectDirName('-Users-alice-Documents-GitHub-myproject')).toBe(
        '/Users/alice/Documents/GitHub/myproject'
      )
    })

    it('handles a single segment path (no intermediate dashes)', () => {
      expect(decodeProjectDirName('-project')).toBe('/project')
    })

    it('converts all dashes to slashes after leading dash is replaced', () => {
      const result = decodeProjectDirName('-a-b-c-d')
      expect(result).toBe('/a/b/c/d')
    })

    it('handles a path with no dashes (returns string unchanged if no leading dash)', () => {
      // No leading dash means no replacement of leading char
      const result = decodeProjectDirName('nodash')
      expect(result).toBe('nodash')
    })

    it('handles deep nested paths', () => {
      expect(decodeProjectDirName('-home-user-work-clients-acme-frontend')).toBe(
        '/home/user/work/clients/acme/frontend'
      )
    })

    it('decodes Windows C: drive letter paths', () => {
      expect(decodeProjectDirName('-C-Users-user-project')).toBe('C:/Users/user/project')
    })

    it('decodes Windows D: drive letter paths', () => {
      expect(decodeProjectDirName('-D-Projects-myapp')).toBe('D:/Projects/myapp')
    })

    it('does not treat lowercase single-letter top-level dirs as Windows drives', () => {
      expect(decodeProjectDirName('-a-b-c')).toBe('/a/b/c')
    })

    it('does not treat multi-letter top-level dirs as Windows drives', () => {
      expect(decodeProjectDirName('-home-user-code')).toBe('/home/user/code')
    })
  })

  describe('extractProjectName', () => {
    it('extracts last segment from a decoded path', () => {
      expect(extractProjectName('/Users/username/Documents/GitHub/myproject')).toBe('myproject')
    })

    it('handles a short decoded path', () => {
      expect(extractProjectName('/project')).toBe('project')
    })

    it('handles paths with various depth levels', () => {
      expect(extractProjectName('/a/b/c/d/e')).toBe('e')
    })

    it('returns the name portion from a typical GitHub project path', () => {
      expect(extractProjectName('/Users/alice/work/repos/dashboard')).toBe('dashboard')
    })

    it('handles root path by returning empty string', () => {
      // path.basename('/') returns ''
      expect(extractProjectName('/')).toBe('')
    })
  })

  describe('extractSessionId', () => {
    it('strips .jsonl extension from filename', () => {
      expect(extractSessionId('abc-123.jsonl')).toBe('abc-123')
    })

    it('handles UUID-style session filenames', () => {
      expect(extractSessionId('550e8400-e29b-41d4-a716-446655440000.jsonl')).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      )
    })

    it('returns filename unchanged when no .jsonl extension', () => {
      expect(extractSessionId('no-extension')).toBe('no-extension')
    })

    it('returns filename unchanged for other extensions', () => {
      expect(extractSessionId('session.json')).toBe('session.json')
    })

    it('handles filenames with multiple dots', () => {
      expect(extractSessionId('session.backup.jsonl')).toBe('session.backup')
    })

    it('handles empty string', () => {
      expect(extractSessionId('')).toBe('')
    })
  })

  describe('detectCurrentPlatform', () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true, writable: true })
      mockReadFile.mockReset()
      vi.resetModules()
    })

    it('returns a valid platform value', async () => {
      vi.resetModules()
      const { detectCurrentPlatform } = await import('./claude-path')
      const result = await detectCurrentPlatform()
      expect(['windows', 'wsl', 'macos', 'linux']).toContain(result)
    })

    it('detects WSL when /proc/version contains microsoft', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

      vi.resetModules()
      const { detectCurrentPlatform } = await import('./claude-path')

      // Set mock AFTER import so the factory has already run
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath === '/proc/version') {
          return Promise.resolve('Linux version 5.15.0-microsoft-standard-WSL2 (gcc)')
        }
        return Promise.reject(new Error('ENOENT'))
      })

      const result = await detectCurrentPlatform()
      expect(result).toBe('wsl')
    })

    it('returns linux when /proc/version does not contain microsoft', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

      vi.resetModules()
      const { detectCurrentPlatform } = await import('./claude-path')

      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath === '/proc/version') {
          return Promise.resolve('Linux version 6.1.0-generic (gcc)')
        }
        return Promise.reject(new Error('ENOENT'))
      })

      const result = await detectCurrentPlatform()
      expect(result).toBe('linux')
    })
  })

  describe('per-source path helpers', () => {
    const mockSource: DataSource = {
      id: 'primary',
      label: 'Linux',
      claudeDir: '/home/user/.claude',
      platform: 'linux',
      available: true,
    }

    it('getProjectsDirFor returns projects subdir', () => {
      expect(getProjectsDirFor(mockSource)).toBe('/home/user/.claude/projects')
    })

    it('getStatsPathFor returns stats-cache.json path', () => {
      expect(getStatsPathFor(mockSource)).toBe('/home/user/.claude/stats-cache.json')
    })

    it('getHistoryPathFor returns history.jsonl path', () => {
      expect(getHistoryPathFor(mockSource)).toBe('/home/user/.claude/history.jsonl')
    })
  })

  describe('detectWslDistros', () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true, writable: true })
      mockReaddir.mockReset()
      mockAccess.mockReset()
      vi.resetModules()
    })

    it('returns empty array on non-windows platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true, writable: true })
      vi.resetModules()
      const { detectWslDistros } = await import('./claude-path')
      const result = await detectWslDistros()
      expect(result).toEqual([])
    })

    it('returns empty array on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true, writable: true })
      vi.resetModules()
      const { detectWslDistros } = await import('./claude-path')
      const result = await detectWslDistros()
      expect(result).toEqual([])
    })

    it('returns empty array when wsl$ is not accessible', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true, writable: true })
      vi.resetModules()
      const { detectWslDistros } = await import('./claude-path')

      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath === '\\\\wsl$') {
          return Promise.reject(new Error('ENOENT'))
        }
        return Promise.reject(new Error('ENOENT'))
      })

      const result = await detectWslDistros()
      expect(result).toEqual([])
    })

    it('discovers WSL distro users with .claude directories', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true, writable: true })
      vi.resetModules()
      const { detectWslDistros } = await import('./claude-path')

      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath === '\\\\wsl$') {
          return Promise.resolve(['Ubuntu', 'Debian'])
        }
        if (dirPath === '\\\\wsl$\\Ubuntu\\home') {
          return Promise.resolve(['alice', 'bob'])
        }
        if (dirPath === '\\\\wsl$\\Debian\\home') {
          return Promise.resolve(['charlie'])
        }
        return Promise.reject(new Error('ENOENT'))
      })

      mockAccess.mockImplementation((filePath: string) => {
        // alice has .claude, bob does not, charlie has .claude
        if (filePath === '\\\\wsl$\\Ubuntu\\home\\alice\\.claude') {
          return Promise.resolve()
        }
        if (filePath === '\\\\wsl$\\Debian\\home\\charlie\\.claude') {
          return Promise.resolve()
        }
        return Promise.reject(new Error('ENOENT'))
      })

      const result = await detectWslDistros()
      expect(result).toHaveLength(2)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'wsl-ubuntu-alice',
            label: 'WSL - Ubuntu',
            claudeDir: '\\\\wsl$\\Ubuntu\\home\\alice\\.claude',
            platform: 'wsl',
            available: true,
          }),
          expect.objectContaining({
            id: 'wsl-debian-charlie',
            label: 'WSL - Debian',
            claudeDir: '\\\\wsl$\\Debian\\home\\charlie\\.claude',
            platform: 'wsl',
            available: true,
          }),
        ])
      )
    })

    it('skips distros where /home is not accessible', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true, writable: true })
      vi.resetModules()
      const { detectWslDistros } = await import('./claude-path')

      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath === '\\\\wsl$') {
          return Promise.resolve(['Ubuntu'])
        }
        // /home not accessible
        return Promise.reject(new Error('ENOENT'))
      })

      const result = await detectWslDistros()
      expect(result).toEqual([])
    })
  })

  describe('getDataSources', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      mockReadFile.mockReset()
      mockAccess.mockReset()
      vi.resetModules()
    })

    it('returns at least one data source (the default)', async () => {
      vi.stubEnv('CLAUDE_HOME', '')
      vi.resetModules()
      const { getDataSources } = await import('./claude-path')
      const sources = await getDataSources()
      expect(sources.length).toBeGreaterThanOrEqual(1)
    })

    it('default source has expected shape', async () => {
      vi.stubEnv('CLAUDE_HOME', '/fake/.claude')
      vi.resetModules()
      const { getDataSources } = await import('./claude-path')
      const sources = await getDataSources()
      const defaultSource = sources[0]
      expect(defaultSource).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        claudeDir: '/fake/.claude',
        platform: expect.stringMatching(/^(windows|wsl|macos|linux)$/),
        available: expect.any(Boolean),
      })
    })

    it('CLAUDE_HOME source uses resolved path', async () => {
      vi.stubEnv('CLAUDE_HOME', '/custom/claude/dir')
      vi.resetModules()
      const { getDataSources } = await import('./claude-path')
      const sources = await getDataSources()
      expect(sources[0].claudeDir).toBe('/custom/claude/dir')
    })
  })
})
