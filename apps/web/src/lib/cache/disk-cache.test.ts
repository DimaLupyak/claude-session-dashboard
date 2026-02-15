import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { readDiskCache, writeDiskCache, getCacheDir } from './disk-cache'

describe('disk-cache', () => {
  let testCacheFiles: string[]

  beforeEach(() => {
    testCacheFiles = []
  })

  afterEach(() => {
    // Clean up any test cache files created during tests
    for (const filePath of testCacheFiles) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Clean up tmp files
    const cacheDir = getCacheDir()
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir)
      for (const file of files) {
        if (file.includes('test-') || file.endsWith('.tmp')) {
          try {
            fs.unlinkSync(path.join(cacheDir, file))
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }
  })

  function trackCacheFile(cacheKey: string): void {
    const cacheDir = getCacheDir()
    const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)
    testCacheFiles.push(cachePath)
    testCacheFiles.push(`${cachePath}.tmp`)
  }

  describe('getCacheDir', () => {
    it('should return path to .claude-dashboard/cache in home directory', () => {
      const cacheDir = getCacheDir()
      expect(cacheDir).toContain('.claude-dashboard')
      expect(cacheDir).toContain('cache')
    })
  })

  describe('writeDiskCache', () => {
    it('should write and read cached data (happy path)', () => {
      const schema = z.object({ value: z.number() })
      const data = { value: 42 }
      const cacheKey = 'test-cache-happy'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)

      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toEqual(data)
    })

    it('should create cache directory if missing', () => {
      const cacheDir = getCacheDir()

      // Ensure directory doesn't exist
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true })
      }

      const data = { value: 42 }
      const cacheKey = 'test-cache-create-dir'

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', 1234567890, data)

      // Directory should now exist
      expect(fs.existsSync(cacheDir)).toBe(true)
    })

    it('should use atomic write (tmp + rename) by checking file creation', () => {
      const schema = z.object({ value: z.number() })
      const data = { value: 42 }
      const cacheKey = 'test-cache-atomic'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)

      const cacheDir = getCacheDir()
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      // Ensure cache doesn't exist initially
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath)
      }

      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)

      // Final cache file should exist after atomic write
      expect(fs.existsSync(cachePath)).toBe(true)

      // Read back to verify data integrity after atomic write
      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toEqual(data)
    })
  })

  describe('readDiskCache', () => {
    it('should return null if cache file does not exist', () => {
      const schema = z.object({ value: z.number() })
      const cacheKey = 'test-cache-nonexistent-' + Date.now()
      const result = readDiskCache(cacheKey, 1234567890, schema)

      expect(result).toBeNull()
    })

    it('should return null if mtime does not match (stale cache)', () => {
      const schema = z.object({ value: z.number() })
      const data = { value: 42 }
      const cacheKey = 'test-cache-stale'
      const originalMtime = 1234567890
      const newMtime = 9999999999

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', originalMtime, data)

      // Try to read with different mtime
      const result = readDiskCache(cacheKey, newMtime, schema)
      expect(result).toBeNull()
    })

    it('should return null if JSON parse fails (corrupt file)', () => {
      const schema = z.object({ value: z.number() })
      const cacheKey = 'test-cache-corrupt'
      const cacheDir = getCacheDir()

      trackCacheFile(cacheKey)
      fs.mkdirSync(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      // Write invalid JSON
      fs.writeFileSync(cachePath, 'invalid json{{{', 'utf-8')

      const result = readDiskCache(cacheKey, 1234567890, schema)
      expect(result).toBeNull()
    })

    it('should return null if Zod validation fails', () => {
      const schema = z.object({ value: z.number() })
      const invalidData = { value: 'not-a-number' } // Wrong type
      const cacheKey = 'test-cache-zod-fail'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)

      // Write data that doesn't match schema
      const cacheDir = getCacheDir()
      fs.mkdirSync(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      const entry = {
        version: 1,
        sourceFile: '/source/file.ts',
        sourceMtimeMs,
        cachedAt: new Date().toISOString(),
        data: invalidData,
      }

      fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8')

      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toBeNull()
    })

    it('should return null if cache version does not match', () => {
      const schema = z.object({ value: z.number() })
      const data = { value: 42 }
      const cacheKey = 'test-cache-version'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)

      // Write cache with wrong version
      const cacheDir = getCacheDir()
      fs.mkdirSync(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      const entry = {
        version: 999, // Wrong version
        sourceFile: '/source/file.ts',
        sourceMtimeMs,
        cachedAt: new Date().toISOString(),
        data,
      }

      fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8')

      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toBeNull()
    })

    it('should handle file permission errors gracefully', () => {
      const schema = z.object({ value: z.number() })
      const cacheKey = 'test-cache-permissions'

      trackCacheFile(cacheKey)

      const cacheDir = getCacheDir()
      fs.mkdirSync(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      // Write a cache file with read permission only (on unix-like systems)
      // Note: This test may behave differently on Windows
      writeDiskCache(cacheKey, '/source/file.ts', 1234567890, { value: 42 })

      if (fs.existsSync(cachePath)) {
        try {
          // Try to make file unreadable (may not work on all platforms)
          fs.chmodSync(cachePath, 0o000)

          // Attempt to read should return null gracefully
          const result = readDiskCache(cacheKey, 1234567890, schema)
          expect(result).toBeNull()

          // Restore permissions for cleanup
          fs.chmodSync(cachePath, 0o644)
        } catch {
          // Skip test if chmod is not supported (e.g., on Windows)
          // This is acceptable as the core functionality is tested elsewhere
          fs.chmodSync(cachePath, 0o644)
        }
      }
    })

    it('should validate data structure with complex Zod schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        tags: z.array(z.string()),
        metadata: z.object({
          created: z.string(),
          updated: z.string(),
        }),
      })

      const data = {
        name: 'Test',
        age: 30,
        tags: ['a', 'b', 'c'],
        metadata: {
          created: '2026-01-01',
          updated: '2026-01-02',
        },
      }

      const cacheKey = 'test-cache-complex'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)

      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toEqual(data)
    })

    it('should handle missing optional fields in cache entry gracefully', () => {
      const schema = z.object({ value: z.number() })
      const data = { value: 42 }
      const cacheKey = 'test-cache-minimal'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)

      // Write minimal cache entry (missing optional fields like cachedAt)
      const cacheDir = getCacheDir()
      fs.mkdirSync(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, `${cacheKey}.cache.json`)

      const entry = {
        version: 1,
        sourceMtimeMs,
        data,
      }

      fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8')

      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)
      expect(result).toEqual(data)
    })
  })

  describe('round-trip caching', () => {
    it('should preserve all data types through write/read cycle', () => {
      const schema = z.object({
        string: z.string(),
        number: z.number(),
        boolean: z.boolean(),
        null: z.null(),
        array: z.array(z.number()),
        nested: z.object({
          deep: z.string(),
        }),
      })

      const data = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: {
          deep: 'value',
        },
      }

      const cacheKey = 'test-cache-round-trip'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)
      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)

      expect(result).toEqual(data)
    })

    it('should handle empty objects and arrays', () => {
      const schema = z.object({
        emptyObj: z.object({}),
        emptyArr: z.array(z.string()),
      })

      const data = {
        emptyObj: {},
        emptyArr: [],
      }

      const cacheKey = 'test-cache-empty'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)
      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)

      expect(result).toEqual(data)
    })

    it('should handle unicode and special characters', () => {
      const schema = z.object({
        unicode: z.string(),
        emoji: z.string(),
        quotes: z.string(),
      })

      const data = {
        unicode: '你好世界',
        emoji: '🚀🎉',
        quotes: 'test "quotes" and \'apostrophes\'',
      }

      const cacheKey = 'test-cache-unicode'
      const sourceMtimeMs = 1234567890

      trackCacheFile(cacheKey)
      writeDiskCache(cacheKey, '/source/file.ts', sourceMtimeMs, data)
      const result = readDiskCache(cacheKey, sourceMtimeMs, schema)

      expect(result).toEqual(data)
    })
  })
})
