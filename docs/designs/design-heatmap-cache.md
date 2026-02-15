# Design: HEATMAP-CACHE -- Contribution Heatmap with Persistent Disk Cache

## 1. Problem Statement

The stats page lacks a high-level "at a glance" visualization showing usage patterns over time. A GitHub-style contribution heatmap would immediately communicate:

- Which days the user was active with Claude Code
- Relative intensity of usage (tokens consumed) per day
- Seasonal patterns, streaks, and gaps

Additionally, the dashboard currently relies entirely on in-memory caches that are lost on server restart. The first page load after a restart re-parses all data from scratch. A persistent disk cache in `~/.claude-dashboard/` would make even cold starts fast.

This design addresses both concerns as a single feature: the heatmap visualization and the underlying persistent cache layer.

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Rolling 365-day window (not calendar year) | Matches GitHub convention; always shows a full year of context regardless of when the user looks at it |
| Blue color scale (not green) | Matches dashboard primary color `#3b82f6`; gray-800 for zero days, 4 intensity levels of blue for active days |
| Heatmap placement: below stat cards, above ActivityChart | High visual impact position; serves as a summary before drill-down charts |
| Pure CSS grid (not Recharts/SVG library) | Heatmap is a simple grid of `<div>` squares -- no charting library needed. This avoids adding Recharts overhead for a component that is fundamentally a styled grid |
| Persistent disk cache at `~/.claude-dashboard/cache/` | Survives server restarts; follows existing pattern of `~/.claude-dashboard/` for dashboard-owned data (settings already writes there) |
| Cache keyed by source file mtime | Same invalidation strategy as existing in-memory caches, but persisted to disk. When `stats-cache.json` mtime changes, the disk cache entry is regenerated |
| Heatmap data derived from existing `StatsCache` fields | `dailyActivity.sessionCount` + `dailyModelTokens.tokensByModel` (summed) already provide sessions and tokens per day -- no new parsing needed |
| No new server function | The heatmap data is a client-side transformation of data already returned by `getStats()`. The persistent cache applies to the stats-parser layer, not the heatmap specifically |

---

## 3. Architecture Overview

```
~/.claude/stats-cache.json
        |
        v  (mtime check)
+----------------------------------+
| stats-parser.ts                  |
| 1. Check in-memory mtime cache  |
| 2. If miss: check disk cache    |
|    (~/.claude-dashboard/cache/   |
|     stats-cache.disk.json)       |
| 3. If miss: parse + write disk   |
|    cache + update in-memory      |
+----------------------------------+
        |
        v
  StatsCache { dailyActivity, dailyModelTokens, ... }
        |
        v
  stats.server.ts -> getStats()
        |
        v
  statsQuery (React Query, 60s refetch)
        |
        v
  stats.tsx
    |
    +-- StatCards (existing)
    |
    +-- ContributionHeatmap (NEW)    <--- inserted here
    |     - Joins dailyActivity + dailyModelTokens by date
    |     - Builds 365-day rolling grid
    |     - Renders CSS grid with tooltip
    |
    +-- ActivityChart (existing)
    +-- TokenTrendChart (existing)
    +-- ModelUsageChart + HourlyDistribution (existing)
```

---

## 4. Persistent Disk Cache Architecture

### 4.1 Cache Location

```
~/.claude-dashboard/
  settings.json          (existing -- user settings)
  cache/                 (NEW directory)
    stats.cache.json     (persisted StatsCache + metadata)
```

### 4.2 Cache File Format

```typescript
interface DiskCacheEntry<T> {
  version: 1
  sourceFile: string      // absolute path to source (e.g. ~/.claude/stats-cache.json)
  sourceMtimeMs: number   // mtime of source when cache was written
  cachedAt: string        // ISO timestamp of when cache was created
  data: T                 // the parsed and validated data
}
```

The cache file for stats would be `DiskCacheEntry<StatsCache>`.

### 4.3 Cache Flow (3-tier)

```
Request for stats data
        |
        v
[Tier 1] In-memory cache (existing)
  - Key: sourceMtimeMs
  - Hit? Return immediately
  - Miss? Fall through
        |
        v
[Tier 2] Disk cache (~/.claude-dashboard/cache/stats.cache.json)
  - Read file, check sourceMtimeMs matches current source mtime
  - Hit? Populate in-memory cache, return data
  - Miss or corrupt? Fall through
        |
        v
[Tier 3] Full parse from source (~/.claude/stats-cache.json)
  - Parse + validate with Zod
  - Write to disk cache (atomic: tmp + rename)
  - Populate in-memory cache
  - Return data
```

### 4.4 Cache Invalidation Strategy

| Trigger | Behavior |
|---------|----------|
| Source file mtime changes | In-memory cache misses, disk cache checked. If disk mtime also stale, full reparse + write new disk cache |
| Server restart (cold start) | In-memory cache empty, disk cache loaded. If mtime matches, instant return with no source parse |
| Cache file corrupt/unreadable | Treated as miss; full reparse, overwrite disk cache |
| User manually deletes `~/.claude-dashboard/cache/` | Treated as miss; directory recreated, cache files regenerated |

### 4.5 Cache Module Design

**File:** `apps/web/src/lib/cache/disk-cache.ts`

This is a generic, reusable cache utility that any parser can use. It is NOT specific to stats.

```
Functions:
  readDiskCache<T>(cacheKey: string, sourceMtimeMs: number, schema: ZodSchema<T>): T | null
  writeDiskCache<T>(cacheKey: string, sourceFile: string, sourceMtimeMs: number, data: T): void
  getCacheDir(): string   // ~/.claude-dashboard/cache/
  getCachePath(cacheKey: string): string
```

**Design notes:**
- `cacheKey` maps to a filename: `getCachePath('stats') -> ~/.claude-dashboard/cache/stats.cache.json`
- `readDiskCache` returns `null` if: file missing, JSON parse error, Zod validation fails, or `sourceMtimeMs` does not match
- `writeDiskCache` uses atomic write (write to `.tmp`, then `rename`) -- same pattern as `settings.server.ts`
- Directory creation is lazy (created on first write via `mkdirSync({ recursive: true })`)
- All errors are caught and logged; cache failures never crash the app

### 4.6 Integration with stats-parser.ts

The existing `parseStats()` function is modified to use the 3-tier cache:

```
BEFORE:
  1. Check in-memory mtime -> hit? return
  2. Read + parse source file
  3. Store in memory

AFTER:
  1. Check in-memory mtime -> hit? return
  2. Check disk cache (readDiskCache) -> hit? store in memory, return
  3. Read + parse source file
  4. Write disk cache (writeDiskCache)
  5. Store in memory, return
```

The in-memory cache variable (`cachedStats`) and its structure remain unchanged. The disk cache is an additional layer inserted between the in-memory check and the full parse.

---

## 5. Heatmap Component Design

### 5.1 Data Preparation

The heatmap needs two values per day: **session count** and **total tokens**. These come from two existing arrays in `StatsCache`:

```
dailyActivity:     Array<{ date, messageCount, sessionCount, toolCallCount }>
dailyModelTokens:  Array<{ date, tokensByModel: Record<string, number> }>
```

**Join strategy:** Build a `Map<string, HeatmapDay>` keyed by date string (`YYYY-MM-DD`). Iterate both arrays once. For any date in the rolling 365-day window, merge `sessionCount` from `dailyActivity` and sum all values in `tokensByModel` from `dailyModelTokens`.

```typescript
interface HeatmapDay {
  date: string           // "2025-02-14"
  sessionCount: number   // from dailyActivity
  totalTokens: number    // sum of tokensByModel values
}
```

This join is done client-side in a `useMemo` hook. Both arrays are already in the React Query cache from `statsQuery`. No new server function is needed.

### 5.2 Grid Layout

The heatmap follows the GitHub contribution graph layout:

```
       Week 1   Week 2   Week 3   ...   Week 52/53
Mon    [  ]     [  ]     [  ]            [  ]
Tue    [  ]     [  ]     [  ]            [  ]
Wed    [  ]     [  ]     [  ]            [  ]
Thu    [  ]     [  ]     [  ]            [  ]
Fri    [  ]     [  ]     [  ]            [  ]
Sat    [  ]     [  ]     [  ]            [  ]
Sun    [  ]     [  ]     [  ]            [  ]
```

- Columns: ~52-53 weeks (rolling 365 days from today back)
- Rows: 7 days (Monday at top, Sunday at bottom)
- Each cell: a small square `<div>`
- Start column may be partial (if today is not Sunday)
- The leftmost column starts at the day 365 days ago

**CSS approach:** `display: grid` with `grid-template-rows: repeat(7, 1fr)` and `grid-auto-flow: column`. Each cell is a fixed-size square (e.g., `10px x 10px` with `2px` gap).

**Month labels:** Displayed above the grid. Computed by checking when the month changes across the week columns. Positioned with `grid-column` to align with the first week of each month.

**Day labels:** Short day names (Mon, Wed, Fri) displayed to the left of rows 1, 3, 5 (matching GitHub's sparse labeling).

### 5.3 Color Scale

Five levels, using blue intensity against the dark background:

| Level | Condition | Tailwind Class / Color |
|-------|-----------|----------------------|
| 0 (no activity) | `totalTokens === 0` | `bg-gray-800` (`#1f2937`) |
| 1 (light) | `<= p25` | `bg-blue-900/70` (approx `#1e3a5f`) |
| 2 (medium-light) | `<= p50` | `bg-blue-700/70` (approx `#1d4ed8` at 70% opacity) |
| 3 (medium) | `<= p75` | `bg-blue-500/80` (approx `#3b82f6` at 80% opacity) |
| 4 (intense) | `> p75` | `bg-blue-400` (`#60a5fa`) |

**Quantile calculation:** Percentiles are computed from the non-zero days only, using the `totalTokens` values. This ensures that even light usage days get a visible color (Level 1) rather than being washed out by a few extreme days.

```typescript
function getIntensityLevel(tokens: number, percentiles: { p25: number; p50: number; p75: number }): 0 | 1 | 2 | 3 | 4 {
  if (tokens === 0) return 0
  if (tokens <= percentiles.p25) return 1
  if (tokens <= percentiles.p50) return 2
  if (tokens <= percentiles.p75) return 3
  return 4
}
```

### 5.4 Tooltip

On hover over a cell, show a tooltip with:

```
+----------------------------------+
|  February 14, 2025               |
|  3 sessions   1.2M tokens        |
+----------------------------------+
```

Or for zero days:

```
+----------------------------------+
|  February 14, 2025               |
|  No activity                     |
+----------------------------------+
```

**Implementation:** CSS `group-hover` with absolutely positioned tooltip div (same pattern as `HourlyDistribution.tsx` lines 42-44). The tooltip follows the dark theme: `bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-xs`.

**Positioning:** The tooltip appears above the hovered cell. For cells near the right edge, the tooltip shifts left to avoid overflow.

### 5.5 Legend

A small legend below the grid showing the color scale:

```
Less [  ][  ][  ][  ][  ] More
```

Five small squares from Level 0 to Level 4, with "Less" and "More" labels. This matches the GitHub convention.

### 5.6 Component Interface

```typescript
interface ContributionHeatmapProps {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
}
```

The component is a pure presentation component. All data transformation (joining, percentile calculation, grid generation) happens inside the component via `useMemo`.

### 5.7 Empty State

If both arrays are empty (no stats data), the component renders:

```
+--------------------------------------------------+
|  Contribution Heatmap                             |
|  Token usage intensity over the last 365 days     |
|                                                   |
|            No activity data available             |
|                                                   |
+--------------------------------------------------+
```

Same card wrapper and empty state pattern as other stats charts.

### 5.8 Responsive Behavior

- On wide screens (md+): full 52-column grid with all month labels
- On narrow screens (<md): the grid scrolls horizontally within the card. The card gets `overflow-x-auto` and the grid maintains its natural width. Day labels remain sticky on the left.

---

## 6. Data Flow Diagram

```
~/.claude/stats-cache.json
        |
        | (fs.stat -> mtime)
        v
+--------------------------------------------------+
| stats-parser.ts :: parseStats()                  |
|                                                  |
|  [1] in-memory cache hit?                        |
|       YES -> return cached StatsCache            |
|       NO  -> [2]                                 |
|                                                  |
|  [2] disk cache hit?                             |
|       readDiskCache('stats', mtime, Schema)      |
|       YES -> populate in-memory, return          |
|       NO  -> [3]                                 |
|                                                  |
|  [3] full parse from source                      |
|       JSON.parse -> Zod validate                 |
|       writeDiskCache('stats', path, mtime, data) |
|       populate in-memory, return                 |
+--------------------------------------------------+
        |
        v
  getStats() server function
        |
        v (HTTP / server fn call)
  statsQuery (React Query, queryKey: ['stats'], 60s refetch)
        |
        v
  stats.tsx :: StatsOverview
        |
        +-- stats.dailyActivity ------+
        |                              |
        +-- stats.dailyModelTokens ---+
                                      |
                                      v
                          ContributionHeatmap.tsx
                            |
                            +-- useMemo: join by date
                            |   -> Map<date, { sessionCount, totalTokens }>
                            |
                            +-- useMemo: compute percentiles (p25, p50, p75)
                            |
                            +-- useMemo: build grid cells (365 days)
                            |   -> Array<{ date, dayOfWeek, weekIndex, level, sessions, tokens }>
                            |
                            +-- render CSS grid
                            |   - month labels (top)
                            |   - day labels (left)
                            |   - colored squares with hover tooltips
                            |   - legend (bottom)
```

---

## 7. File Plan

### 7.1 New Files (2)

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/web/src/lib/cache/disk-cache.ts` | Generic persistent disk cache utility for `~/.claude-dashboard/cache/`. Provides `readDiskCache()` and `writeDiskCache()` with atomic writes and Zod validation |
| 2 | `apps/web/src/features/stats/ContributionHeatmap.tsx` | GitHub-style heatmap component. Pure client-side: joins `dailyActivity` + `dailyModelTokens`, renders CSS grid with blue color scale, tooltips, month/day labels, and legend |

### 7.2 Modified Files (2)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/lib/parsers/stats-parser.ts` | Insert disk cache layer between in-memory cache check and full parse. Import and use `readDiskCache`/`writeDiskCache` from `lib/cache/disk-cache.ts`. Add `getStatsPath()` to disk cache `sourceFile` for mtime tracking |
| 2 | `apps/web/src/routes/_dashboard/stats.tsx` | Import `ContributionHeatmap`. Render it in `StatsOverview` between the stat cards grid and `ActivityChart`, passing `stats.dailyActivity` and `stats.dailyModelTokens` as props |

### 7.3 Stats Page Layout After Change

```
stats.tsx :: StatsOverview (updated layout)

  <StatCards />                              (existing, unchanged)

  <ContributionHeatmap                       (NEW -- inserted here)
    dailyActivity={stats.dailyActivity}
    dailyModelTokens={stats.dailyModelTokens}
  />

  <ActivityChart />                          (existing, unchanged)
  <TokenTrendChart />                        (existing, unchanged)
  <ModelUsageChart + HourlyDistribution />   (existing, unchanged)
```

---

## 8. Component Internals

### 8.1 Grid Generation Algorithm

```
Input: today's date, dailyActivity[], dailyModelTokens[]

1. Compute startDate = today - 364 days (inclusive, so 365 total days)
2. Adjust startDate backward to the previous Monday (so the first column is a full or partial week)
3. Build a Map<string, HeatmapDay> from dailyActivity and dailyModelTokens:
   - For each entry in dailyActivity: map[date].sessionCount = sessionCount
   - For each entry in dailyModelTokens: map[date].totalTokens = sum(tokensByModel values)
4. Compute percentiles from non-zero totalTokens values
5. Generate cells array:
   - For each day from adjustedStart to today:
     - weekIndex = floor((day - adjustedStart) / 7)
     - dayOfWeek = day.getDay() adjusted so Monday=0, Sunday=6
     - Look up HeatmapDay from map (default: { sessionCount: 0, totalTokens: 0 })
     - Compute intensity level from percentiles
     - If day < startDate (padding days before the 365-day window): mark as "outside" (render transparent or skip)
6. Generate month labels:
   - For each weekIndex, check if the Monday of that week is in a new month
   - If yes, emit a label { monthName, weekIndex }
```

### 8.2 CSS Grid Structure

```html
<div class="contribution-heatmap">
  <!-- Month labels row -->
  <div class="grid" style="grid-template-columns: 28px repeat(53, 1fr)">
    <div />  <!-- spacer for day labels column -->
    {monthLabels.map(m => <span style="grid-column: m.weekIndex + 2">{m.name}</span>)}
  </div>

  <!-- Heatmap grid -->
  <div class="flex gap-0.5">
    <!-- Day labels column -->
    <div class="grid grid-rows-7 gap-0.5 text-[9px] text-gray-500" style="width: 28px">
      <span>Mon</span>
      <span />
      <span>Wed</span>
      <span />
      <span>Fri</span>
      <span />
      <span />
    </div>

    <!-- Grid of squares -->
    <div class="grid gap-0.5"
         style="grid-template-rows: repeat(7, 10px); grid-auto-flow: column; grid-auto-columns: 10px">
      {cells.map(cell => (
        <div
          class="group relative rounded-sm"
          style={{ backgroundColor: INTENSITY_COLORS[cell.level] }}
        >
          <!-- Tooltip (hidden, shown on hover) -->
          <div class="absolute ... hidden group-hover:block">
            {cell.date}: {cell.sessions} sessions, {formatTokenCount(cell.tokens)}
          </div>
        </div>
      ))}
    </div>
  </div>

  <!-- Legend -->
  <div class="mt-2 flex items-center justify-end gap-1 text-[10px] text-gray-500">
    <span>Less</span>
    {INTENSITY_COLORS.map(color => <div style={{ backgroundColor: color }} class="h-2.5 w-2.5 rounded-sm" />)}
    <span>More</span>
  </div>
</div>
```

### 8.3 Color Constants

```typescript
const INTENSITY_COLORS = [
  '#1f2937',  // Level 0: gray-800 (no activity)
  '#1e3a5f',  // Level 1: dark blue
  '#1d4ed8b3', // Level 2: blue-700 at ~70% opacity
  '#3b82f6cc', // Level 3: blue-500 at ~80% opacity
  '#60a5fa',  // Level 4: blue-400 (most intense)
] as const
```

These are inline styles (not Tailwind classes) because the specific color values need to be precise and the opacity blending works better as hex/rgba than as Tailwind opacity modifiers on a dark background.

---

## 9. Disk Cache Module API

### 9.1 Public Interface

```typescript
// lib/cache/disk-cache.ts

import { type ZodSchema } from 'zod'

/**
 * Attempt to read a cached value from disk.
 * Returns null if: file missing, JSON parse error, schema validation fails,
 * or sourceMtimeMs does not match.
 */
function readDiskCache<T>(
  cacheKey: string,
  sourceMtimeMs: number,
  schema: ZodSchema<T>,
): T | null

/**
 * Write a value to disk cache with atomic rename.
 * Creates ~/.claude-dashboard/cache/ if it does not exist.
 * Errors are caught and logged (never thrown).
 */
function writeDiskCache<T>(
  cacheKey: string,
  sourceFile: string,
  sourceMtimeMs: number,
  data: T,
): void

/**
 * Returns the cache directory path: ~/.claude-dashboard/cache/
 */
function getCacheDir(): string
```

### 9.2 Disk Cache File Example

```json
{
  "version": 1,
  "sourceFile": "/Users/example/.claude/stats-cache.json",
  "sourceMtimeMs": 1739548200000,
  "cachedAt": "2025-02-14T18:30:00.000Z",
  "data": {
    "version": 2,
    "lastComputedDate": "2025-02-14",
    "dailyActivity": [...],
    "dailyModelTokens": [...],
    ...
  }
}
```

### 9.3 Extensibility

The disk cache module is generic. It can be reused for any future parser that reads from `~/.claude/`:

```
readDiskCache('stats', statsFileMtime, StatsCacheSchema)     // stats-parser.ts
readDiskCache('history', historyFileMtime, HistorySchema)    // future: history-parser.ts
```

Each cache key maps to a separate file: `~/.claude-dashboard/cache/{cacheKey}.cache.json`.

---

## 10. Modified File: stats-parser.ts

### 10.1 Before (current)

```
parseStats():
  1. stat(statsPath) -> mtime
  2. if in-memory cache mtime matches -> return cached
  3. readFile + JSON.parse + Zod validate
  4. store in memory
  5. return
```

### 10.2 After (with disk cache)

```
parseStats():
  1. stat(statsPath) -> mtime (or null if file missing)
  2. if in-memory cache mtime matches -> return cached
  3. diskData = readDiskCache('stats', mtime, StatsCacheSchema)
     if diskData !== null:
       store in memory (mtime + diskData)
       return diskData
  4. readFile + JSON.parse + Zod validate -> result
  5. writeDiskCache('stats', statsPath, mtime, result)
  6. store in memory (mtime + result)
  7. return result
```

The change is minimal: two new lines (steps 3 and 5) plus one import. The existing in-memory cache logic and variable are untouched.

---

## 11. Modified File: stats.tsx

### 11.1 Changes

1. Add import: `import { ContributionHeatmap } from '@/features/stats/ContributionHeatmap'`
2. In `StatsOverview`, between the stat cards `<div>` and the `<ActivityChart>` div, add:

```
<div className="mt-6">
  <ContributionHeatmap
    dailyActivity={stats.dailyActivity}
    dailyModelTokens={stats.dailyModelTokens}
  />
</div>
```

The existing `<ActivityChart>` div changes from `mt-6` to `mt-4` to tighten spacing since the heatmap now provides the visual break.

---

## 12. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Disk cache write fails (permissions, full disk)** | Low | `writeDiskCache` catches all errors and logs them. App falls back to in-memory-only caching (current behavior). No user-visible impact |
| 2 | **Disk cache file corrupted (partial write, JSON syntax error)** | Low | Atomic write via tmp+rename prevents partial writes. If file is still corrupt, `readDiskCache` catches JSON parse errors and returns null (full reparse) |
| 3 | **365-day grid overwhelms narrow screens** | Medium | Horizontal scroll with `overflow-x-auto` on the card container. Day labels remain fixed on the left with `sticky` positioning. Grid squares are a compact 10px |
| 4 | **Tooltip overflow at grid edges (right/bottom)** | Low | Tooltip positioning uses `right-0` for cells in the last ~5 columns and `left-0` otherwise. Detect column index to choose side |
| 5 | **Days with extreme token counts skew the color scale** | Medium | Using percentile-based thresholds (p25/p50/p75) instead of linear scaling. This ensures the color distribution is balanced regardless of outliers |
| 6 | **Sparse data (user only has a few days of activity)** | Low | For very few non-zero days (< 4), fall back to equal-width buckets rather than percentiles. The grid still renders all 365 days with most cells gray |
| 7 | **Timezone mismatch between `stats-cache.json` dates and local time** | Low | The dates in `stats-cache.json` are date strings without timezone (e.g., "2025-02-14"). The heatmap treats them as-is. The "today" anchor uses the server's local date (consistent with how Claude Code generates the stats). No cross-timezone conversion needed since this is a local-only dashboard |
| 8 | **Cache directory conflicts with future features** | Low | The `~/.claude-dashboard/cache/` namespace is organized by `cacheKey`. Each feature gets its own file (`stats.cache.json`, etc.). No risk of collision |
| 9 | **Large StatsCache duplicated on disk** | Low | The `stats-cache.json` file is typically small (a few hundred KB at most for heavy users). The disk cache duplicates this data but the storage cost is negligible. If this becomes a concern, future optimization could cache only derived/computed data rather than the full parsed object |
| 10 | **In-memory cache and disk cache could diverge** | Low | The in-memory cache is always populated from either the disk cache or a fresh parse. They use the same mtime key. Divergence is only possible if the source file is modified between the in-memory check and the disk cache read, which is harmless (next request will catch it) |

---

## 13. Testing Considerations

| Area | Key Test Cases |
|------|---------------|
| **disk-cache.ts** | Read from non-existent file returns null; read with stale mtime returns null; read with matching mtime returns data; write creates directory; write is atomic (no partial files); corrupt JSON returns null; Zod validation failure returns null |
| **stats-parser.ts** (updated) | In-memory hit skips disk; disk hit populates memory; full parse writes disk; missing source file returns null; disk cache error falls back to full parse |
| **ContributionHeatmap** | Empty data renders empty state; single day renders in correct grid position; 365 days fills grid; percentile calculation with 1/2/3/N non-zero days; month labels appear at correct columns; tooltip shows correct data; zero-token day gets level 0; cell at max tokens gets level 4 |
| **Grid alignment** | First day of 365-day window lands on correct weekday row; last day (today) lands on correct position; partial first/last weeks handled correctly |

---

## 14. Implementation Order

### Phase 1: Persistent Disk Cache (foundation)
**Estimated effort: Small**
- Create `lib/cache/disk-cache.ts` (generic module)
- Modify `lib/parsers/stats-parser.ts` (add 2 calls)
- Unit tests for disk cache module
- **Files:** disk-cache.ts (CREATE), stats-parser.ts (MODIFY)

### Phase 2: Contribution Heatmap (visualization)
**Estimated effort: Medium**
- Create `ContributionHeatmap.tsx` with grid generation, color scale, tooltips, legend
- Modify `stats.tsx` to render heatmap
- Unit tests for grid generation and percentile logic
- **Files:** ContributionHeatmap.tsx (CREATE), stats.tsx (MODIFY)

Phase 1 and Phase 2 can be implemented in parallel since the heatmap does not depend on the disk cache -- it depends on `statsQuery` data which already works. However, implementing the cache first provides immediate performance benefits and a clean commit history.

---

## 15. Appendix: Heatmap Cell Size and Spacing Math

```
Cell size:      10px x 10px
Gap:            2px
Day labels:     28px wide
Weeks:          53 columns (max, for 365 + padding)

Total grid width = 28px (labels) + 53 * (10px + 2px) - 2px = 28 + 634 - 2 = 660px

This fits comfortably within the dashboard content area (typically 800-1200px).
On screens narrower than ~700px, horizontal scroll activates.
```

## 16. Appendix: Heatmap Visual Mockup (ASCII)

```
+------------------------------------------------------------------------+
|  Contribution Heatmap                                                  |
|  Token usage intensity over the last 365 days                          |
|                                                                        |
|          Mar        Apr        May        Jun   ...   Jan     Feb      |
|  Mon  [##][  ][##][  ][  ][##][##][  ] ...           [##][##][  ]      |
|       [  ][  ][##][  ][  ][  ][  ][  ] ...           [  ][##][  ]      |
|  Wed  [##][##][##][##][  ][  ][##][##] ...           [##][##][##]      |
|       [  ][  ][  ][  ][  ][  ][  ][  ] ...           [  ][  ][  ]      |
|  Fri  [##][  ][##][  ][##][  ][  ][##] ...           [##][  ][##]      |
|       [  ][  ][  ][  ][  ][  ][  ][  ] ...           [  ][  ][  ]      |
|       [  ][  ][  ][  ][  ][  ][  ][  ] ...           [  ][  ]          |
|                                                                        |
|                                         Less [  ][..][..][..][##] More |
+------------------------------------------------------------------------+

[  ] = gray-800 (no activity)
[..] = blue intensity levels 1-3
[##] = blue-400 (most intense, level 4)
```
