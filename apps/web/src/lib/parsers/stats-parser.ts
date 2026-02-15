import * as fs from 'node:fs'
import { getStatsPath } from '../utils/claude-path'
import { readDiskCache, writeDiskCache } from '../cache/disk-cache'
import { StatsCacheSchema, type StatsCache } from './types'

let cachedStats: { mtimeMs: number; data: StatsCache } | null = null

export async function parseStats(): Promise<StatsCache | null> {
  const statsPath = getStatsPath()

  const stat = await fs.promises.stat(statsPath).catch(() => null)
  if (!stat) return null

  // Tier 1: in-memory mtime cache
  if (cachedStats && cachedStats.mtimeMs === stat.mtimeMs) {
    return cachedStats.data
  }

  // Tier 2: disk cache
  const diskResult = readDiskCache('stats', stat.mtimeMs, StatsCacheSchema)
  if (diskResult) {
    cachedStats = { mtimeMs: stat.mtimeMs, data: diskResult }
    return diskResult
  }

  // Tier 3: full parse from source
  const raw = await fs.promises.readFile(statsPath, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = StatsCacheSchema.parse(parsed)

  writeDiskCache('stats', statsPath, stat.mtimeMs, result)
  cachedStats = { mtimeMs: stat.mtimeMs, data: result }
  return result
}
