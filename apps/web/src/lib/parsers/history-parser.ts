import * as fs from 'node:fs'
import * as readline from 'node:readline'
import { getHistoryPath, getHistoryPathFor, getDataSources } from '../utils/claude-path'
import type { DataSource } from '../utils/claude-path'
import type { HistoryEntry } from './types'

/**
 * Stream-parse history.jsonl and return entries (most recent first).
 * Optionally limit to last N entries.
 */
export async function parseHistory(limit?: number): Promise<HistoryEntry[]> {
  const historyPath = getHistoryPath()

  const stat = await fs.promises.stat(historyPath).catch(() => null)
  if (!stat) return []

  const entries: HistoryEntry[] = []

  const stream = fs.createReadStream(historyPath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line) as HistoryEntry
      if (entry.display && entry.timestamp && entry.sessionId) {
        entries.push(entry)
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => b.timestamp - a.timestamp)

  return limit ? entries.slice(0, limit) : entries
}

/**
 * Parse history from a specific DataSource's claudeDir.
 * Same logic as parseHistory() but reads from getHistoryPathFor(source).
 */
export async function parseHistoryFrom(
  source: DataSource,
  limit?: number,
): Promise<HistoryEntry[]> {
  const historyPath = getHistoryPathFor(source)

  const stat = await fs.promises.stat(historyPath).catch(() => null)
  if (!stat) return []

  const entries: HistoryEntry[] = []

  const stream = fs.createReadStream(historyPath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line) as HistoryEntry
      if (entry.display && entry.timestamp && entry.sessionId) {
        entries.push(entry)
      }
    } catch {
      // Skip malformed lines
    }
  }

  entries.sort((a, b) => b.timestamp - a.timestamp)

  return limit ? entries.slice(0, limit) : entries
}

/**
 * Parse history from all available DataSources, merge, deduplicate, and sort.
 * Deduplicates by sessionId + timestamp. Returns entries sorted by timestamp descending.
 */
export async function parseHistoryMultiSource(): Promise<HistoryEntry[]> {
  const sources = await getDataSources()

  const allEntries: HistoryEntry[] = []

  for (const source of sources) {
    if (!source.available) continue
    const entries = await parseHistoryFrom(source)
    allEntries.push(...entries)
  }

  // Deduplicate by sessionId + timestamp
  const seen = new Set<string>()
  const deduplicated: HistoryEntry[] = []

  for (const entry of allEntries) {
    const key = `${entry.sessionId}:${entry.timestamp}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(entry)
    }
  }

  // Sort by timestamp descending
  deduplicated.sort((a, b) => b.timestamp - a.timestamp)

  return deduplicated
}
