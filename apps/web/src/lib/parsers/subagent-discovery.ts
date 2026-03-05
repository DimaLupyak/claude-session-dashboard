import * as fs from 'node:fs'
import * as path from 'node:path'

/** Pattern matching subagent JSONL filenames like agent-abc123.jsonl */
const AGENT_FILE_PATTERN = /^agent-(.+)\.jsonl$/

/**
 * Discover subagent JSONL files by scanning the session directory.
 *
 * Checks `<sessionDir>/subagents/` first, then falls back to `<sessionDir>/agents/`.
 * Returns a Map of agentId -> absolute file path.
 *
 * If neither directory exists, returns an empty map.
 */
export async function discoverSubagentFiles(
  sessionDir: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  const candidateDirs = [
    path.join(sessionDir, 'subagents'),
    path.join(sessionDir, 'agents'),
  ]

  for (const dir of candidateDirs) {
    try {
      const entries = await fs.promises.readdir(dir)
      for (const entry of entries) {
        const match = AGENT_FILE_PATTERN.exec(entry)
        if (match) {
          const agentId = match[1]
          // Only add if not already found (subagents/ takes priority over agents/)
          if (!result.has(agentId)) {
            result.set(agentId, path.join(dir, entry))
          }
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable — skip
    }
  }

  return result
}
