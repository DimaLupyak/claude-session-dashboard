import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ZodSchema } from 'zod'

interface DiskCacheEntry<T> {
  version: 1
  sourceFile: string
  sourceMtimeMs: number
  cachedAt: string
  data: T
}

const CACHE_VERSION = 1

export function getCacheDir(): string {
  return path.join(os.homedir(), '.claude-dashboard', 'cache')
}

function getCachePath(cacheKey: string): string {
  return path.join(getCacheDir(), `${cacheKey}.cache.json`)
}

/**
 * Read a cached value from disk. Returns null if:
 * - Cache file does not exist
 * - JSON parse fails
 * - Zod validation fails
 * - sourceMtimeMs does not match (source has been modified since cache was written)
 * - Cache version does not match
 *
 * All errors are caught and logged; cache failures never crash the app.
 */
export function readDiskCache<T>(
  cacheKey: string,
  sourceMtimeMs: number,
  schema: ZodSchema<T>,
): T | null {
  try {
    const cachePath = getCachePath(cacheKey)

    if (!fs.existsSync(cachePath)) {
      return null
    }

    const raw = fs.readFileSync(cachePath, 'utf-8')
    const parsed: DiskCacheEntry<unknown> = JSON.parse(raw)

    // Validate cache version
    if (parsed.version !== CACHE_VERSION) {
      return null
    }

    // Validate source mtime matches
    if (parsed.sourceMtimeMs !== sourceMtimeMs) {
      return null
    }

    // Validate data with Zod schema
    const result = schema.safeParse(parsed.data)
    if (!result.success) {
      console.warn(`[disk-cache] Zod validation failed for "${cacheKey}":`, result.error.message)
      return null
    }

    return result.data
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[disk-cache] Read failed for "${cacheKey}":`, message)
    return null
  }
}

/**
 * Write a value to the disk cache. Uses atomic write (write to .tmp, then rename)
 * to prevent corruption from interrupted writes.
 *
 * Directory creation is lazy (created on first write via mkdirSync({ recursive: true })).
 * All errors are caught and logged; cache failures never crash the app.
 */
export function writeDiskCache<T>(
  cacheKey: string,
  sourceFile: string,
  sourceMtimeMs: number,
  data: T,
): void {
  try {
    const cacheDir = getCacheDir()
    fs.mkdirSync(cacheDir, { recursive: true })

    const cachePath = getCachePath(cacheKey)
    const tmpPath = `${cachePath}.tmp`

    const entry: DiskCacheEntry<T> = {
      version: CACHE_VERSION,
      sourceFile,
      sourceMtimeMs,
      cachedAt: new Date().toISOString(),
      data,
    }

    fs.writeFileSync(tmpPath, JSON.stringify(entry), 'utf-8')
    fs.renameSync(tmpPath, cachePath)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[disk-cache] Write failed for "${cacheKey}":`, message)
  }
}
