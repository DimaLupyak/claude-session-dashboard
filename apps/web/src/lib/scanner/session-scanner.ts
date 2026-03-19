import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProjectsDir, getProjectsDirFor, getDataSources, extractSessionId } from '../utils/claude-path'
import type { DataSource } from '../utils/claude-path'
import { scanProjects, scanProjectsFrom } from './project-scanner'
import { isSessionActive } from './active-detector'
import { parseSummary, parseOutputTokens } from '../parsers/session-parser'
import type { SessionSummary } from '../parsers/types'

/** Extended summary that includes the absolute JSONL file path (server-side only). */
export interface SessionSummaryWithPath extends SessionSummary {
  filePath: string
}

// In-memory cache: sessionId -> { mtime, summary }
const summaryCache = new Map<
  string,
  { mtimeMs: number; summary: SessionSummary }
>()

/**
 * Internal scanning logic that returns summaries with their file paths.
 * Used by both public APIs below.
 */
async function scanSessionsInternal(): Promise<SessionSummaryWithPath[]> {
  const projects = await scanProjects()
  const summaries: SessionSummaryWithPath[] = []

  for (const project of projects) {
    for (const file of project.sessionFiles) {
      const sessionId = extractSessionId(file)
      const filePath = path.join(
        getProjectsDir(),
        project.dirName,
        file,
      )

      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat) continue

      // Check cache
      const cached = summaryCache.get(sessionId)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        // Refresh active status even for cached entries
        const active = await isSessionActive(project.dirName, sessionId)
        summaries.push({ ...cached.summary, isActive: active, filePath })
        continue
      }

      // Parse summary from first/last lines
      const summary = await parseSummary(
        filePath,
        sessionId,
        project.decodedPath,
        project.projectName,
        stat.size,
      )

      if (summary) {
        const active = await isSessionActive(project.dirName, sessionId)
        summary.isActive = active
        summary.outputTokens = await parseOutputTokens(filePath)

        summaryCache.set(sessionId, {
          mtimeMs: stat.mtimeMs,
          summary,
        })
        summaries.push({ ...summary, filePath })
      }
    }
  }

  // Sort by last active, newest first
  summaries.sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )

  return summaries
}

/** Public API: returns SessionSummary[] without filePath -- used by server functions that serialize to client. */
export async function scanAllSessions(): Promise<SessionSummary[]> {
  const results = await scanSessionsInternal()
  // Strip filePath to avoid leaking absolute paths to the client
  return results.map(({ filePath: _filePath, ...summary }) => summary)
}

/** Public API: returns SessionSummaryWithPath[] -- used by server-side stats enrichment. */
export async function scanAllSessionsWithPaths(): Promise<SessionSummaryWithPath[]> {
  return scanSessionsInternal()
}

export async function getActiveSessions(): Promise<SessionSummary[]> {
  const all = await scanAllSessions()
  return all.filter((s) => s.isActive)
}

/**
 * Scan sessions from a single DataSource, setting sourceId and sourceLabel on each result.
 * For non-primary sources, passes projectsDirOverride to isSessionActive.
 */
export async function scanSessionsFromSource(source: DataSource): Promise<SessionSummary[]> {
  const projects = await scanProjectsFrom(source)
  const summaries: SessionSummary[] = []
  const projectsDirOverride = source.id !== 'primary' ? getProjectsDirFor(source) : undefined

  for (const project of projects) {
    for (const file of project.sessionFiles) {
      const sessionId = extractSessionId(file)
      const projectsDir = source.id === 'primary' ? getProjectsDir() : getProjectsDirFor(source)
      const filePath = path.join(projectsDir, project.dirName, file)

      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat) continue

      const cached = summaryCache.get(`${source.id}:${sessionId}`)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        const active = await isSessionActive(project.dirName, sessionId, projectsDirOverride)
        summaries.push({
          ...cached.summary,
          isActive: active,
          sourceId: source.id,
          sourceLabel: source.label,
          sourcePlatform: source.platform,
        })
        continue
      }

      const summary = await parseSummary(
        filePath,
        sessionId,
        project.decodedPath,
        project.projectName,
        stat.size,
      )

      if (summary) {
        const active = await isSessionActive(project.dirName, sessionId, projectsDirOverride)
        summary.isActive = active
        summary.outputTokens = await parseOutputTokens(filePath)
        summary.sourceId = source.id
        summary.sourceLabel = source.label
        summary.sourcePlatform = source.platform

        summaryCache.set(`${source.id}:${sessionId}`, {
          mtimeMs: stat.mtimeMs,
          summary,
        })
        summaries.push(summary)
      }
    }
  }

  return summaries
}

/**
 * Scan sessions from all available DataSources, merging results sorted by lastActiveAt descending.
 * Deduplicates by sessionId, keeping the entry with the most recent lastActiveAt.
 */
export async function scanAllSessionsMultiSource(): Promise<SessionSummary[]> {
  const sources = await getDataSources()
  const allSessions: SessionSummary[] = []

  for (const source of sources) {
    if (!source.available) continue
    const sessions = await scanSessionsFromSource(source)
    allSessions.push(...sessions)
  }

  // Deduplicate by sessionId, keeping the one with newest lastActiveAt
  const deduped = new Map<string, SessionSummary>()
  for (const session of allSessions) {
    const existing = deduped.get(session.sessionId)
    if (!existing || new Date(session.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
      deduped.set(session.sessionId, session)
    }
  }

  const results = Array.from(deduped.values())
  results.sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )

  return results
}
