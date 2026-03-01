# Design: STATS-ENRICHMENT-FIX -- Fix Empty Heatmap and Missing Token/Tool Data in Stats Enrichment

## 1. Problem Statement

The stats enrichment pipeline has two bugs that cause incorrect data on the Stats page:

### Problem 1: Heatmap shows no data after the stats-cache cutoff date

The `ContributionHeatmap` uses `dailyModelTokens[].tokensByModel` to determine intensity colors. When `stats-cache.json` is stale (its `lastComputedDate` is in the past), `mergeRecentSessions()` creates entries for new dates but sets `tokensByModel` to an empty object `{}`. The heatmap sums the values in this record and gets `0`, so all enriched days render as "no activity" (Level 0 intensity) even though sessions occurred.

**Root cause:** `SessionSummary` does not contain token data. The enrichment loop (stats-parser.ts line 156-159) only ensures a date entry exists, but never populates `tokensByModel`.

### Problem 2: Stats are too low -- missing subagent tokens, tool calls, and model usage

The enrichment only uses `messageCount` from `SessionSummary`. Full session detail parsing (which reads entire JSONL files plus subagent JSONL files) produces `totalTokens`, `tokensByModel`, `toolFrequency`, and agent-level token data. None of this makes it into the enriched stats, so:

- `dailyModelTokens[].tokensByModel` is empty for enriched dates
- `dailyActivity[].toolCallCount` stays `0` for enriched dates
- `modelUsage` is never updated with tokens from recent sessions

**Root cause:** `mergeRecentSessions()` calls `scanAllSessions()` which returns `SessionSummary[]` (fast, reads ~30 lines per file). Token and tool data are only available via `parseDetail()` (full file stream-parse).

---

## 2. Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Use `parseDetail()` for recent sessions during enrichment** | Option C from the brief. The enrichment only runs for sessions after the cutoff date (typically 1-14 days of sessions, maybe 5-50 files). Full parsing is acceptable for this bounded set on a localhost dashboard |
| 2 | **Parallelize detail parsing with `Promise.all`** | Recent session files can be parsed concurrently. I/O-bound work benefits from parallelism. Cap concurrency at 10 to avoid file descriptor exhaustion |
| 3 | **Cache enrichment results for 60 seconds (existing behavior)** | The `mergedCache` already prevents re-scanning on every request. The costlier `parseDetail()` calls are amortized by this cache. No change to staleness interval needed |
| 4 | **Update `modelUsage` during enrichment** | The precomputed stats have an aggregate `modelUsage` record with per-model token breakdowns (input, output, cache). Enrichment should add recent session tokens into this aggregate so cost estimation stays accurate |
| 5 | **Do NOT extend `SessionSummary` or create a new parser tier** | Options A and B add complexity (new parse modes, type changes, cache invalidation) for marginal performance gain. The bounded nature of the problem (small N of recent sessions) makes full parsing the simplest and most correct approach |
| 6 | **New `scanAllSessionsWithPaths()` scanner function** | Returns `SessionSummaryWithPath[]` for server-side callers that need file paths. Avoids leaking absolute filesystem paths to the client through the existing `scanAllSessions()` API and the `SessionSummary` type |

---

## 3. Architecture

### 3.1 Current Flow (Broken)

```
~/.claude/stats-cache.json
        |
        v (stale: lastComputedDate < today)
mergeRecentSessions(stats)
        |
        v
scanAllSessions() -> SessionSummary[]
        |
        v (filter: lastActiveAt > cutoffDate)
recentSessions: SessionSummary[]
        |
        v (for each session)
- activityMap[date].messageCount += s.messageCount   OK
- activityMap[date].sessionCount += 1                OK
- activityMap[date].toolCallCount += ???              MISSING (stays 0)
- modelTokensMap[date] = {}                          BROKEN  (empty)
- hourCounts updated                                 OK
- longestSession updated                             OK
```

**Result:** Heatmap sees `tokensByModel: {}` for new dates, renders all gray. Tool call counts are zero. Model usage aggregate is stale.

### 3.2 Proposed Flow (Fixed)

```
~/.claude/stats-cache.json
        |
        v (stale: lastComputedDate < today)
mergeRecentSessions(stats)
        |
        v
scanAllSessionsWithPaths() -> SessionSummaryWithPath[]
        |
        v (filter: lastActiveAt > cutoffDate)
recentSessions: SessionSummaryWithPath[]
        |
        v (for each: use filePath from scan result)
parseDetail(filePath, ...) -> SessionDetail     <--- NEW
        |
        v (for each SessionDetail)
- activityMap[date].messageCount += turns.length
- activityMap[date].sessionCount += 1
- activityMap[date].toolCallCount += sum(toolFrequency)
- modelTokensMap[date][model] += totalTokens     <--- FIXED
- modelUsage[model] += tokensByModel[model]      <--- NEW
- hourCounts updated
- longestSession updated
```

### 3.3 Concurrency Model

```
recentSessions (SessionSummaryWithPath[])
        |
        v
Split into chunks of 10
        |
        v
+--------+--------+--------+
| chunk1 | chunk2 | chunk3 |   Promise.all per chunk
| parse  | parse  | parse  |   (max 10 concurrent)
| Detail | Detail | Detail |
+--------+--------+--------+
        |
        v
SessionDetail[] (all results)
        |
        v
Merge into stats maps (sequential, in-memory)
```

---

## 4. Data Flow Detail

### 4.1 File Path Resolution

`SessionSummary` has `sessionId` and `projectPath` (decoded path like `/Users/foo/myproject`). To call `parseDetail()`, we need the JSONL file path. The scanner already constructs this path in `scanAllSessions()`:

```
filePath = path.join(getProjectsDir(), project.dirName, `${sessionId}.jsonl`)
```

**Approach:** Add a new exported function `scanAllSessionsWithPaths()` to `session-scanner.ts` that returns `SessionSummaryWithPath[]`, an extended type that includes the `filePath`. The existing `scanAllSessions()` continues to return `SessionSummary[]` without the path, so no client-facing API changes are needed.

```
interface SessionSummaryWithPath extends SessionSummary {
  filePath: string  // Absolute path to the JSONL file
}
```

This avoids leaking absolute filesystem paths through `getSessionList()` and `getPaginatedSessions()` server functions, which serialize `SessionSummary` directly to the client. The `SessionSummaryWithPath` type is only used internally by server-side code (stats enrichment).

**Implementation:** Refactor `scanAllSessions()` so the core scanning logic lives in an internal function that returns `SessionSummaryWithPath[]`. The public `scanAllSessions()` strips the `filePath` field. The new `scanAllSessionsWithPaths()` returns the full result.

### 4.2 Token Aggregation for `dailyModelTokens`

`SessionDetail.tokensByModel` is `Record<string, TokenUsage>` where keys are model IDs like `"claude-sonnet-4-20250514"` and values have `{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }`.

`DailyModelTokensSchema.tokensByModel` is `Record<string, number>` -- a flat total per model.

**Mapping:**

```
For each model in SessionDetail.tokensByModel:
  totalForModel = inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens
  modelTokensMap[date][model] = (existing ?? 0) + totalForModel
```

### 4.3 Tool Call Aggregation for `dailyActivity`

`SessionDetail.toolFrequency` is `Record<string, number>` (tool name -> call count).

```
totalToolCalls = Object.values(toolFrequency).reduce((sum, n) => sum + n, 0)
activityMap[date].toolCallCount += totalToolCalls
```

### 4.4 Model Usage Aggregation

`StatsCache.modelUsage` is `Record<string, { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests?, costUSD? }>`.

```
For each model in SessionDetail.tokensByModel:
  stats.modelUsage[model].inputTokens += tokensByModel[model].inputTokens
  stats.modelUsage[model].outputTokens += tokensByModel[model].outputTokens
  ... (same for cache fields)
```

---

## 5. File Plan

### 5.1 Modified Files (2)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/lib/parsers/stats-parser.ts` | Rewrite `mergeRecentSessions()` to call `parseDetail()` for each recent session. Add `modelUsage` and `toolCallCount` aggregation. Import `parseDetail` from session-parser. Switch from `scanAllSessions()` to `scanAllSessionsWithPaths()`. |
| 2 | `apps/web/src/lib/scanner/session-scanner.ts` | Refactor to expose `scanAllSessionsWithPaths()` that returns `SessionSummaryWithPath[]`. Internal scanning logic shared with existing `scanAllSessions()`. Export the `SessionSummaryWithPath` type. |

### 5.2 No Changes to Types

`SessionSummary` in `types.ts` is NOT modified. The `SessionSummaryWithPath` type is defined and exported from `session-scanner.ts` as an extension, keeping the core type clean.

### 5.3 No New Files

The fix is contained within existing modules. No new parsers, caches, or components are needed.

---

## 6. Detailed Changes

### 6.1 `session-scanner.ts` -- Add `scanAllSessionsWithPaths()`

Define a new type and refactor the scanning logic:

```
export interface SessionSummaryWithPath extends SessionSummary {
  filePath: string
}
```

Refactor the existing `scanAllSessions()`:

```
// Internal function that does the actual scanning
async function scanSessionsInternal(): Promise<SessionSummaryWithPath[]> {
  const projects = await scanProjects()
  const summaries: SessionSummaryWithPath[] = []

  for (const project of projects) {
    for (const file of project.sessionFiles) {
      const sessionId = extractSessionId(file)
      const filePath = path.join(getProjectsDir(), project.dirName, file)

      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat) continue

      // Check cache (updated to store filePath)
      const cached = summaryCache.get(sessionId)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        const active = await isSessionActive(project.dirName, sessionId)
        summaries.push({ ...cached.summary, isActive: active, filePath })
        continue
      }

      const summary = await parseSummary(
        filePath, sessionId, project.decodedPath,
        project.projectName, stat.size,
      )

      if (summary) {
        const active = await isSessionActive(project.dirName, sessionId)
        summary.isActive = active
        summaryCache.set(sessionId, { mtimeMs: stat.mtimeMs, summary })
        summaries.push({ ...summary, filePath })
      }
    }
  }

  summaries.sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )

  return summaries
}

// Public API: returns SessionSummary[] (no filePath) -- used by server functions
export async function scanAllSessions(): Promise<SessionSummary[]> {
  const results = await scanSessionsInternal()
  // Strip filePath to avoid leaking to client
  return results.map(({ filePath, ...summary }) => summary)
}

// Public API: returns SessionSummaryWithPath[] -- used by stats enrichment
export async function scanAllSessionsWithPaths(): Promise<SessionSummaryWithPath[]> {
  return scanSessionsInternal()
}
```

The in-memory `summaryCache` continues to store `SessionSummary` (without filePath). The `filePath` is re-attached from the loop variable when building the result. This avoids changing the cache structure.

### 6.2 `stats-parser.ts` -- Rewrite `mergeRecentSessions()`

The function is rewritten to:

1. Filter recent sessions (unchanged)
2. Call `parseDetail()` for each recent session using its `filePath` (NEW)
3. Aggregate `tokensByModel`, `toolFrequency`, `messageCount` from detail results (FIXED)
4. Update `modelUsage` with new per-model token data (NEW)

**Imports to add:**

```
import { scanAllSessionsWithPaths, type SessionSummaryWithPath } from '@/lib/scanner/session-scanner'
import { parseDetail } from '@/lib/parsers/session-parser'
import type { SessionDetail } from './types'
```

**Batched detail parsing helper:**

```
async function parseDetailsInBatches(
  sessions: SessionSummaryWithPath[],
  batchSize: number = 10
): Promise<Map<string, SessionDetail>> {
  const results = new Map<string, SessionDetail>()

  for (let i = 0; i < sessions.length; i += batchSize) {
    const batch = sessions.slice(i, i + batchSize)
    const details = await Promise.all(
      batch.map(async (s) => {
        try {
          return {
            sessionId: s.sessionId,
            detail: await parseDetail(
              s.filePath, s.sessionId, s.projectPath, s.projectName,
            ),
          }
        } catch {
          return null  // Skip sessions that fail to parse
        }
      })
    )

    for (const result of details) {
      if (result) results.set(result.sessionId, result.detail)
    }
  }

  return results
}
```

**Updated `mergeRecentSessions()` signature and body:**

```
async function mergeRecentSessions(stats: StatsCache): Promise<StatsCache> {
  const summaries = await scanAllSessionsWithPaths()
  const cutoffDate = extractDateString(stats.lastComputedDate)

  const recentSessions = summaries.filter((s) => {
    const sessionDate = extractDateString(s.lastActiveAt ?? s.startedAt)
    return sessionDate > cutoffDate
  })

  if (recentSessions.length === 0) {
    return stats
  }

  // Parse full details for recent sessions (batched, max 10 concurrent)
  const detailMap = await parseDetailsInBatches(recentSessions)

  // Build mutable copies of stats maps
  const activityMap = new Map<string, { messageCount: number; sessionCount: number; toolCallCount: number }>()
  for (const entry of stats.dailyActivity) {
    activityMap.set(entry.date, {
      messageCount: entry.messageCount,
      sessionCount: entry.sessionCount,
      toolCallCount: entry.toolCallCount,
    })
  }

  const modelTokensMap = new Map<string, Record<string, number>>()
  for (const entry of stats.dailyModelTokens) {
    modelTokensMap.set(entry.date, { ...entry.tokensByModel })
  }

  const hourCounts: Record<string, number> = { ...stats.hourCounts }
  const modelUsage: Record<string, {
    inputTokens: number; outputTokens: number;
    cacheReadInputTokens: number; cacheCreationInputTokens: number
  }> = {}
  // Deep copy existing modelUsage
  for (const [model, usage] of Object.entries(stats.modelUsage)) {
    modelUsage[model] = { ...usage }
  }

  let additionalMessages = 0
  const additionalSessions = recentSessions.length
  let longestSession = { ...stats.longestSession }
  const existingSessionCount = stats.totalSessions

  for (const s of recentSessions) {
    const date = extractDateString(s.lastActiveAt ?? s.startedAt)
    const detail = detailMap.get(s.sessionId)

    const cur = activityMap.get(date) ?? { messageCount: 0, sessionCount: 0, toolCallCount: 0 }
    cur.sessionCount += 1

    if (detail) {
      // Use accurate data from full parse
      cur.messageCount += detail.turns.length
      cur.toolCallCount += Object.values(detail.toolFrequency)
        .reduce((sum, n) => sum + n, 0)

      // Populate dailyModelTokens with real per-model token totals
      const dayTokens = modelTokensMap.get(date) ?? {}
      for (const [model, usage] of Object.entries(detail.tokensByModel)) {
        const total = usage.inputTokens + usage.outputTokens
          + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
        dayTokens[model] = (dayTokens[model] ?? 0) + total
      }
      modelTokensMap.set(date, dayTokens)

      // Update aggregate modelUsage with per-category breakdown
      for (const [model, usage] of Object.entries(detail.tokensByModel)) {
        const existing = modelUsage[model] ?? {
          inputTokens: 0, outputTokens: 0,
          cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
        }
        existing.inputTokens += usage.inputTokens
        existing.outputTokens += usage.outputTokens
        existing.cacheReadInputTokens += usage.cacheReadInputTokens
        existing.cacheCreationInputTokens += usage.cacheCreationInputTokens
        modelUsage[model] = existing
      }

      additionalMessages += detail.turns.length
    } else {
      // Fallback: use summary data (if parseDetail() failed for this session)
      cur.messageCount += s.messageCount
      additionalMessages += s.messageCount

      if (!modelTokensMap.has(date)) {
        modelTokensMap.set(date, {})
      }
    }

    activityMap.set(date, cur)
    updateHourCounts(hourCounts, s)

    if (s.durationMs > longestSession.duration) {
      longestSession = {
        sessionId: s.sessionId,
        duration: s.durationMs,
        messageCount: detail?.turns.length ?? s.messageCount,
        timestamp: s.lastActiveAt ?? s.startedAt,
      }
    }
  }

  // Rebuild sorted arrays
  const dailyActivity = Array.from(activityMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const dailyModelTokens = Array.from(modelTokensMap.entries())
    .map(([date, tokensByModel]) => ({ date, tokensByModel }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  return {
    ...stats,
    dailyActivity,
    dailyModelTokens,
    modelUsage,
    totalSessions: existingSessionCount + additionalSessions,
    totalMessages: stats.totalMessages + additionalMessages,
    longestSession,
    hourCounts,
  }
}
```

### 6.3 `computeStatsFromSessions()` -- Also Fix Fallback Path

The `computeStatsFromSessions()` function (used when `stats-cache.json` does not exist) has the same problem: it uses `scanAllSessions()` and produces empty `tokensByModel`. For consistency, this should also use `parseDetail()`.

However, this path parses ALL sessions (not just recent ones), which could be hundreds. For this fallback path:

- Parse all sessions with `parseDetail()` using the same batched approach
- This is a one-time cost when the stats cache file is completely missing
- The in-memory merge cache ensures results are reused for 60 seconds
- On subsequent calls, the cache returns immediately

If performance becomes a concern for users with very large session histories (500+), we can add a limit (e.g., only parse the most recent 90 days of sessions). But for the initial fix, parsing all sessions is the simplest correct approach.

**Updated `computeStatsFromSessions()`:**

```
async function computeStatsFromSessions(): Promise<StatsCache | null> {
  try {
    const summaries = await scanAllSessionsWithPaths()

    // Parse full details for token and tool data
    const detailMap = await parseDetailsInBatches(summaries)

    // Group by date and aggregate
    const activityMap = new Map<string, { messageCount: number; sessionCount: number; toolCallCount: number }>()
    const modelTokensMap = new Map<string, Record<string, number>>()
    const modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }> = {}
    let totalMessages = 0
    let longestSession = { sessionId: '', duration: 0, messageCount: 0, timestamp: '' }
    let firstSessionDate: string | null = null
    const hourCounts: Record<string, number> = {}

    for (const s of summaries) {
      const d = (s.lastActiveAt ?? s.startedAt).split('T')[0]
      const detail = detailMap.get(s.sessionId)

      const cur = activityMap.get(d) ?? { messageCount: 0, sessionCount: 0, toolCallCount: 0 }
      cur.sessionCount += 1

      if (detail) {
        cur.messageCount += detail.turns.length
        cur.toolCallCount += Object.values(detail.toolFrequency).reduce((sum, n) => sum + n, 0)
        totalMessages += detail.turns.length

        // Per-day model tokens
        const dayTokens = modelTokensMap.get(d) ?? {}
        for (const [model, usage] of Object.entries(detail.tokensByModel)) {
          const total = usage.inputTokens + usage.outputTokens
            + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
          dayTokens[model] = (dayTokens[model] ?? 0) + total
        }
        modelTokensMap.set(d, dayTokens)

        // Aggregate model usage
        for (const [model, usage] of Object.entries(detail.tokensByModel)) {
          const existing = modelUsage[model] ?? {
            inputTokens: 0, outputTokens: 0,
            cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
          }
          existing.inputTokens += usage.inputTokens
          existing.outputTokens += usage.outputTokens
          existing.cacheReadInputTokens += usage.cacheReadInputTokens
          existing.cacheCreationInputTokens += usage.cacheCreationInputTokens
          modelUsage[model] = existing
        }
      } else {
        cur.messageCount += s.messageCount
        totalMessages += s.messageCount
        if (!modelTokensMap.has(d)) modelTokensMap.set(d, {})
      }

      activityMap.set(d, cur)
      updateHourCounts(hourCounts, s)

      if (s.durationMs > longestSession.duration) {
        longestSession = {
          sessionId: s.sessionId,
          duration: s.durationMs,
          messageCount: detail?.turns.length ?? s.messageCount,
          timestamp: s.lastActiveAt ?? s.startedAt,
        }
      }

      if (!firstSessionDate || s.startedAt < firstSessionDate) {
        firstSessionDate = s.startedAt
      }
    }

    const dailyActivity = Array.from(activityMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    const dailyModelTokens = Array.from(modelTokensMap.entries())
      .map(([date, tokensByModel]) => ({ date, tokensByModel }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    return {
      version: 1,
      lastComputedDate: new Date().toISOString(),
      dailyActivity,
      dailyModelTokens,
      modelUsage,
      totalSessions: summaries.length,
      totalMessages,
      longestSession: {
        sessionId: longestSession.sessionId,
        duration: longestSession.duration,
        messageCount: longestSession.messageCount,
        timestamp: longestSession.timestamp || new Date().toISOString(),
      },
      firstSessionDate: firstSessionDate ?? new Date().toISOString(),
      hourCounts,
    }
  } catch {
    return null
  }
}
```

---

## 7. Performance Analysis

### 7.1 Worst Case: `mergeRecentSessions()`

| Scenario | Recent Sessions | Parse Time (est.) | Acceptable? |
|----------|----------------|-------------------|-------------|
| Stats 1 day stale | 1-5 sessions | < 1s | Yes |
| Stats 1 week stale | 10-30 sessions | 1-3s | Yes |
| Stats 2 weeks stale | 20-60 sessions | 2-6s | Acceptable (one-time) |
| Stats 1 month stale | 50-150 sessions | 5-15s | Borderline |

**Mitigations for the borderline case:**
- The 60-second merge cache means this parse cost is paid at most once per minute
- After the first enrichment, subsequent requests are instant (in-memory cached)
- Users who actively use the dashboard will have the stats cache updated by Claude Code itself within a day or two, so the "1 month stale" scenario is unlikely for active users

### 7.2 Worst Case: `computeStatsFromSessions()`

This only runs when `~/.claude/stats-cache.json` does not exist at all. For a user with 500 sessions, full parsing might take 30-60 seconds. This is a one-time cold start cost. The merge cache prevents re-parsing.

### 7.3 I/O Characteristics

`parseDetail()` uses streaming (`readline.createInterface` + `for await`), so memory usage is proportional to the output size (turns array), not the file size. A 50MB JSONL file can be parsed with ~10MB of memory for the result.

Subagent parsing adds I/O: each session with agents triggers additional file reads (`subagents/agent-*.jsonl`). For sessions with 5-10 agents, this adds 5-10 small file reads per session. With concurrency of 10, this is handled efficiently by the OS I/O scheduler.

---

## 8. Edge Cases

| Case | Handling |
|------|----------|
| `parseDetail()` throws (corrupt JSONL, missing file) | Catch error, fall back to summary data for that session. Other sessions still enriched normally |
| Session spans multiple days (started Monday, last active Wednesday) | Tokens are attributed to the `lastActiveAt` date (same as current behavior). This is a simplification but matches how the precomputed stats work |
| Subagent JSONL files are missing | `parseDetail()` already handles this gracefully (try/catch in the subagent parsing loop at session-parser.ts line 501) |
| Session has zero tokens (e.g., user opened and immediately closed) | `tokensByModel` will be empty. `dailyModelTokens` entry gets `{}` (same as current behavior, but now intentionally correct) |
| Very large session file (500MB+) | Streaming parser handles this. The 60-second cache prevents re-parsing. May cause a one-time delay of 5-10 seconds for that single file |
| `scanAllSessionsWithPaths()` returns sessions whose files were deleted between scan and parse | `parseDetail()` throws, caught in the try/catch. Session falls back to summary-only aggregation |

---

## 9. Verification

After implementation, verify the fix by:

1. **Heatmap:** Confirm that dates after `lastComputedDate` show colored cells (not gray) when sessions exist
2. **Tooltip:** Hover over an enriched date and confirm token count > 0
3. **Stats cards:** Confirm total session count and message count include recent sessions
4. **Tool call count:** Confirm `dailyActivity[].toolCallCount` is non-zero for enriched dates
5. **Model usage:** Confirm the model usage pie chart includes tokens from sessions after the cutoff

---

## 10. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Performance regression: `parseDetail()` is much slower than `parseSummary()`** | Medium | Bounded by number of recent sessions (typically < 50). Cached for 60 seconds. Only runs when stats are stale. Users see the delay only on the first request after a stale period |
| 2 | **Double-counting tokens if stats-cache already has partial data for the cutoff date** | Medium | Use `>` comparison (not `>=`) for the cutoff date, same as current behavior. Dates strictly after `lastComputedDate` are enriched. The cutoff date itself is assumed complete in the precomputed stats |
| 3 | **File descriptor exhaustion with high concurrency** | Low | Batch size of 10 limits concurrent open files. `parseDetail()` uses streaming (`createReadStream`) which properly closes on completion. Subagent files add some FD pressure but are small and short-lived |
| 4 | **`computeStatsFromSessions()` becomes very slow for users with large histories** | Medium | Add a comment documenting this known limitation. Future optimization: limit to most recent 90 days, or implement a background worker. For now, the 60-second cache bounds the impact |
| 5 | **Merge cache holds stale data while new sessions are created** | Low | The 60-second `MERGE_STALENESS_MS` is unchanged. This is an acceptable tradeoff for a localhost dashboard. Users can refresh the page to trigger a re-merge after 60 seconds |
| 6 | **`scanAllSessionsWithPaths()` runs the full scan twice if `scanAllSessions()` is also called** | Low | Both functions call `scanSessionsInternal()` which uses the existing `summaryCache` (keyed by mtime). The second call hits cache for all sessions, so the overhead is just the iteration + isActive check, not re-parsing JSONL files |

---

## 11. Implementation Order

### Step 1: Add `scanAllSessionsWithPaths()` to session-scanner.ts
- Define `SessionSummaryWithPath` interface
- Extract internal `scanSessionsInternal()` function
- Re-implement `scanAllSessions()` as a wrapper that strips `filePath`
- Export `scanAllSessionsWithPaths()` for server-side callers
- Run typecheck to confirm no breakage

### Step 2: Rewrite `mergeRecentSessions()` in stats-parser.ts
- Import `scanAllSessionsWithPaths` and `parseDetail`
- Add `parseDetailsInBatches()` helper
- Rewrite the aggregation loop to use `SessionDetail` data
- Add `modelUsage` aggregation
- Return updated `modelUsage` in the merged result

### Step 3: Fix `computeStatsFromSessions()` fallback
- Use the same `parseDetail()` approach for the no-stats-file case
- Ensure the fallback still works when `parseDetail()` fails for some sessions

### Step 4: Test and verify
- Test with a stale `stats-cache.json` (manually set `lastComputedDate` to a past date)
- Verify heatmap shows colored cells for recent dates
- Verify tooltip shows non-zero token counts
- Verify tool call counts are populated
- Confirm no absolute paths leak to the browser (check network tab for `filePath` in session list responses)

---

## 12. Appendix: Why Not Options A or B?

### Option A: Extend SessionSummary (add lightweight token extraction to `parseSummary()`)

**Rejected because:**
- JSONL files do not have a predictable structure for token data. Usage blocks appear in assistant messages scattered throughout the file. Reading the first/last 15 lines may miss most of them.
- The tail-reading approach (last 15 lines) only captures the final few messages. For sessions with 100+ turns, this misses 90%+ of token usage.
- Even if we read more lines (e.g., 100), we still miss subagent tokens which are in separate JSONL files.
- Extending `parseSummary()` to read more data makes it slower for ALL sessions, not just the few that need enrichment.

### Option B: New "summary+" parser (middle ground)

**Rejected because:**
- A "summary+" parser that reads token usage but skips turn construction would need to duplicate most of `parseDetail()`'s logic (agent tracking, subagent file discovery, usage accumulation).
- The maintenance cost of two nearly-identical parsers outweighs the performance benefit.
- The performance gain is small: the expensive part of `parseDetail()` is I/O (reading the file), not CPU (building turn objects). A "summary+" parser would do the same I/O.
- For the bounded set of recent sessions (typically < 50), full parsing is acceptable.

---

## 13. Implementation Summary

**Status:** Implemented (2026-03-01)

### Files Modified

1. **`apps/web/src/lib/scanner/session-scanner.ts`**
   - Added `SessionSummaryWithPath` interface extending `SessionSummary` with `filePath: string`
   - Extracted core logic into `scanSessionsInternal()` returning `SessionSummaryWithPath[]`
   - `scanAllSessions()` now wraps internal and strips `filePath` to prevent client-side path leakage
   - Added `scanAllSessionsWithPaths()` for server-side callers (stats enrichment)

2. **`apps/web/src/lib/parsers/stats-parser.ts`**
   - Replaced `scanAllSessions` import with `scanAllSessionsWithPaths` and `SessionSummaryWithPath`
   - Added `parseDetail` import from `session-parser`
   - Added `parseDetailsInBatches()` helper (concurrency limit of 10)
   - Rewrote `mergeRecentSessions()` to parse full session details, populating `dailyModelTokens.tokensByModel`, `dailyActivity.toolCallCount`, and `modelUsage` with real data
   - Rewrote `computeStatsFromSessions()` with the same detail-parsing approach for the no-cache fallback

### Quality Gates
- `npm run typecheck`: Pass
- `npm run lint` (eslint on modified files): Pass
