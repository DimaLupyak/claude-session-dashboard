import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs/promises'

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

export function getProjectsDirFor(source: DataSource): string {
  return path.join(source.claudeDir, 'projects')
}

export function getStatsPathFor(source: DataSource): string {
  return path.join(source.claudeDir, 'stats-cache.json')
}

export function getHistoryPathFor(source: DataSource): string {
  return path.join(source.claudeDir, 'history.jsonl')
}

/**
 * Decode a project directory name back to a filesystem path.
 * ~/.claude/projects stores dirs like "-Users-username-Documents-GitHub-foo"
 * which maps to "/Users/username/Documents/GitHub/foo"
 */
export function decodeProjectDirName(dirName: string): string {
  // Replace leading dash with / and all other dashes with /
  const decoded = dirName.replace(/^-/, '/').replace(/-/g, '/')
  // Detect Windows drive letter: /C/Users/... → C:/Users/...
  const windowsDrive = decoded.match(/^\/([A-Z])\/(.*)$/)
  if (windowsDrive) {
    return `${windowsDrive[1]}:/${windowsDrive[2]}`
  }
  return decoded
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

export async function detectCurrentPlatform(): Promise<'windows' | 'wsl' | 'macos' | 'linux'> {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  // Check for WSL — on WSL, process.platform is 'linux' but /proc/version contains 'microsoft' or 'WSL'
  try {
    const procVersion = await fs.readFile('/proc/version', 'utf8')
    if (procVersion.toLowerCase().includes('microsoft') || procVersion.toLowerCase().includes('wsl')) {
      return 'wsl'
    }
  } catch {
    // /proc/version doesn't exist or isn't readable — not WSL
  }
  return 'linux'
}

export async function detectWslDistros(): Promise<DataSource[]> {
  if (process.platform !== 'win32') return []

  const wslRoot = '\\\\wsl$'
  let distros: string[]
  try {
    distros = await fs.readdir(wslRoot)
  } catch {
    return [] // WSL not installed or not running
  }

  const sources: DataSource[] = []
  for (const distro of distros) {
    const homeDir = `${wslRoot}\\${distro}\\home`
    let users: string[]
    try {
      users = await fs.readdir(homeDir)
    } catch {
      continue
    }
    for (const user of users) {
      const claudeDir = `${wslRoot}\\${distro}\\home\\${user}\\.claude`
      try {
        await fs.access(claudeDir)
        sources.push({
          id: `wsl-${distro.toLowerCase()}-${user}`,
          label: `WSL - ${distro}`,
          claudeDir,
          platform: 'wsl',
          available: true,
        })
      } catch {
        // .claude doesn't exist for this user
      }
    }
  }
  return sources
}

export async function getDataSources(): Promise<DataSource[]> {
  const claudeDir = getClaudeDir()
  const platform = await detectCurrentPlatform()

  let available = false
  try {
    await fs.access(claudeDir)
    available = true
  } catch {
    available = false
  }

  const primarySource: DataSource = {
    id: 'primary',
    label: platform === 'windows' ? 'Windows' : platform === 'macos' ? 'macOS' : platform === 'wsl' ? 'WSL' : 'Linux',
    claudeDir,
    platform,
    available,
  }

  const sources = [primarySource]
  const wslSources = await detectWslDistros()
  sources.push(...wslSources)
  return sources
}
