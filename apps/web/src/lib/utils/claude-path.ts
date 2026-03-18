import * as path from 'node:path'
import * as os from 'node:os'
import { promises as fs } from 'node:fs'

function resolveClaudeDir(): string {
  if (process.env.CLAUDE_HOME) {
    return path.resolve(process.env.CLAUDE_HOME)
  }
  return path.join(os.homedir(), '.claude')
}

const CLAUDE_DIR = resolveClaudeDir()

export function getClaudeDir(): string {
  return CLAUDE_DIR
}

export function getProjectsDir(): string {
  return path.join(CLAUDE_DIR, 'projects')
}

export function getStatsPath(): string {
  return path.join(CLAUDE_DIR, 'stats-cache.json')
}

export function getHistoryPath(): string {
  return path.join(CLAUDE_DIR, 'history.jsonl')
}

/**
 * Decode a project directory name back to a filesystem path.
 * ~/.claude/projects stores dirs like "-Users-username-Documents-GitHub-foo"
 * which maps to "/Users/username/Documents/GitHub/foo"
 */
export function decodeProjectDirName(dirName: string): string {
  // Replace leading dash with / and all other dashes with /
  return dirName.replace(/^-/, '/').replace(/-/g, '/')
}

/**
 * Extract a short project name from a decoded path.
 * "/Users/username/Documents/GitHub/myproject" -> "myproject"
 */
export function extractProjectName(decodedPath: string): string {
  return path.basename(decodedPath)
}

/**
 * Extract session ID from a JSONL filename.
 * "abc-123.jsonl" -> "abc-123"
 */
export function extractSessionId(filename: string): string {
  return filename.replace(/\.jsonl$/, '')
}

export interface DataSource {
  id: string
  label: string
  claudeDir: string
  platform: 'windows' | 'wsl' | 'macos' | 'linux'
  available: boolean
}

function detectCurrentPlatform(): 'windows' | 'macos' | 'linux' {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    default:
      return 'linux'
  }
}

export async function getDataSources(): Promise<DataSource[]> {
  const claudeDir = getClaudeDir()
  const platform = detectCurrentPlatform()

  let available = false
  try {
    await fs.access(claudeDir)
    available = true
  } catch {
    available = false
  }

  const primarySource: DataSource = {
    id: platform,
    label: platform === 'windows' ? 'Windows' : platform === 'macos' ? 'macOS' : 'Linux',
    claudeDir,
    platform,
    available,
  }

  return [primarySource]
}
