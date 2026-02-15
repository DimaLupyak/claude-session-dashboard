# Design: ANALYTICS-GAP -- Closing Analytics Gaps

## 1. Problem Statement

A competitor comparison revealed four analytics gaps in the Claude Session Dashboard. This design covers all four features as a cohesive package:

1. **Token Usage Over Time Chart** -- daily/weekly token trend visualization (data exists, not yet charted)
2. **CSV/JSON Export** -- download stats and session data for offline analysis
3. **Per-Project Analytics View** -- aggregate metrics grouped by project
4. **Real-time Monitoring** -- live updates for active sessions without full page refresh

Each feature is designed to integrate cleanly into the existing Vertical Slice Architecture, reuse established patterns (`createServerFn`, `queryOptions`, Recharts, dark theme), and avoid introducing new infrastructure (no database, no WebSockets).

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Token chart uses Recharts `AreaChart` (stacked) | Consistent with existing ActivityChart/ModelUsageChart; stacked area shows model composition over time |
| Export is purely client-side | Data is already in React Query cache from existing queries; no new server endpoints needed |
| Per-project analytics gets its own feature slice | It has a distinct route, server function, and aggregation logic -- qualifies as a new vertical slice |
| Real-time uses adaptive polling (not WebSockets) | WebSockets would require SSE/WS infrastructure; polling with React Query's `refetchInterval` is already proven (`activeSessionsQuery` uses 3s) |
| Token chart granularity toggle (daily/weekly) | Aggregation done client-side from dailyModelTokens; daily data may be too granular for long-term users |
| Export format: CSV for tabular data, JSON for structured data | CSV is universally importable (Excel, Google Sheets); JSON preserves nested structures (session turns, tool calls) |

---

## 3. Feature 1: Token Usage Over Time Chart

### 3.1 Data Source

`StatsCache.dailyModelTokens` is already parsed by `stats-parser.ts` and available via `statsQuery`. The schema (from `types.ts` lines 129-132):

```
DailyModelTokensSchema = z.object({
  date: z.string(),
  tokensByModel: z.record(z.string(), z.number()),  // model -> total token count
})
```

**Important:** `tokensByModel` is a flat `Record<string, number>` (total tokens per model per day), NOT a breakdown by input/output/cache categories. The chart will show total tokens per model as stacked areas.

### 3.2 Architecture

```
statsQuery (already fetched)
        |
        v
+----------------------------------+
| stats.dailyModelTokens           |
| Array<{ date, tokensByModel }>   |
+----------------------------------+
        |
        v
+----------------------------------+
| TokenTrendChart.tsx              |
| - Client-side aggregation        |
| - daily/weekly toggle            |
| - Recharts AreaChart (stacked)   |
| - Model color legend             |
+----------------------------------+
        |
        v
+----------------------------------+
| /_dashboard/stats.tsx            |
| (new chart section added)        |
+----------------------------------+
```

### 3.3 Component: `TokenTrendChart`

**File:** `apps/web/src/features/stats/TokenTrendChart.tsx`

**Props:**
```
interface TokenTrendChartProps {
  data: DailyModelTokens[]    // from StatsCache.dailyModelTokens
}
```

**Behavior:**
- Extracts all unique model names across all days
- Normalizes model names (strip date suffixes using same logic as ModelUsageChart: `model.replace(/^claude-/, '').split('-202')[0]`)
- Provides a daily/weekly toggle (state managed via `useState`)
- Weekly mode: groups by ISO week, sums tokensByModel entries within each week
- Renders a Recharts `AreaChart` with stacked `Area` components, one per model
- Uses the same `COLORS` palette as `ModelUsageChart.tsx`
- X-axis: date labels formatted via `date-fns` (daily: "MMM d", weekly: "Week of MMM d")
- Y-axis: token count with `formatTokenCount` tick formatter
- Tooltip shows date + per-model breakdown + total

**Dark theme styling:** Same card wrapper as other charts -- `rounded-xl border border-gray-800 bg-gray-900/50 p-4`.

### 3.4 Placement on Stats Page

Added below the existing `ActivityChart` and above the `ModelUsageChart`/`HourlyDistribution` grid. This positions the two time-series charts together (daily activity + token trend) before the aggregate views.

```
stats.tsx layout (updated):
  <StatCards />
  <ActivityChart />                  (existing)
  <TokenTrendChart />                (NEW)
  <ModelUsageChart + HourlyDist />   (existing grid)
```

### 3.5 File Changes

| File | Action | Changes |
|------|--------|---------|
| `features/stats/TokenTrendChart.tsx` | **CREATE** | New Recharts AreaChart component with daily/weekly toggle |
| `routes/_dashboard/stats.tsx` | **MODIFY** | Import and render TokenTrendChart between ActivityChart and the grid, pass `stats.dailyModelTokens` |

---

## 4. Feature 2: CSV/JSON Export

### 4.1 Architecture

Export is client-side only. The data is already loaded into React Query cache by existing queries. A utility module generates file content and triggers download via a Blob URL.

```
React Query Cache
  |
  +-- statsQuery.data ----> ExportButton (Stats page)
  |                              |
  |                              v
  |                         export-utils.ts
  |                         - statsToCSV(stats)
  |                         - statsToJSON(stats)
  |                              |
  |                              v
  |                         downloadFile(content, filename, mimeType)
  |
  +-- sessionDetailQuery.data -> ExportButton (Session Detail page)
                                     |
                                     v
                                export-utils.ts
                                - sessionToJSON(detail)
                                     |
                                     v
                                downloadFile(content, filename, mimeType)
```

### 4.2 Export Formats

**Stats Page exports:**

| Export | Format | Content |
|--------|--------|---------|
| Daily Activity CSV | CSV | date, messageCount, sessionCount, toolCallCount |
| Daily Token Usage CSV | CSV | date, model, totalTokens |
| Model Usage CSV | CSV | model, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens |
| Full Stats JSON | JSON | Complete StatsCache object |

**Session Detail Page export:**

| Export | Format | Content |
|--------|--------|---------|
| Session JSON | JSON | Full SessionDetail (turns, tools, tokens, errors, agents, skills, tasks) |

### 4.3 Utility Module: `export-utils.ts`

**File:** `apps/web/src/lib/utils/export-utils.ts`

```
Functions:
  statsToCSV(stats: StatsCache, type: 'daily-activity' | 'daily-tokens' | 'model-usage'): string
  statsToJSON(stats: StatsCache): string
  sessionToJSON(detail: SessionDetail): string
  downloadFile(content: string, filename: string, mimeType: string): void
```

`downloadFile` implementation: creates a Blob, generates an object URL via `URL.createObjectURL()`, programmatically clicks an `<a>` element with `download` attribute, then revokes the URL.

### 4.4 Component: `ExportDropdown`

**File:** `apps/web/src/components/ExportDropdown.tsx`

A shared dropdown button component that shows available export options.

**Props:**
```
interface ExportDropdownProps {
  options: Array<{
    label: string         // e.g. "Daily Activity (CSV)"
    onClick: () => void   // triggers export
  }>
}
```

**UI:** A button labeled "Export" with a downward chevron. Clicking opens a dropdown menu with options. Dark theme styled consistent with existing components.

### 4.5 Integration Points

**Stats page (`stats.tsx`):**
- `ExportDropdown` placed next to the page heading
- Options: "Daily Activity (CSV)", "Token Usage (CSV)", "Model Usage (CSV)", "Full Stats (JSON)"
- Each option calls `downloadFile(statsToCSV(stats, type), filename, 'text/csv')` or `downloadFile(statsToJSON(stats), filename, 'application/json')`

**Session Detail page (`$sessionId.tsx`):**
- `ExportDropdown` placed in the header area (next to sessionId)
- Options: "Export Session (JSON)"
- Calls `downloadFile(sessionToJSON(detail), filename, 'application/json')`

### 4.6 File Changes

| File | Action | Changes |
|------|--------|---------|
| `lib/utils/export-utils.ts` | **CREATE** | CSV/JSON generation and download trigger utilities |
| `components/ExportDropdown.tsx` | **CREATE** | Reusable dropdown button for export options |
| `routes/_dashboard/stats.tsx` | **MODIFY** | Add ExportDropdown with stats export options |
| `routes/_dashboard/sessions/$sessionId.tsx` | **MODIFY** | Add ExportDropdown with session JSON export |

---

## 5. Feature 3: Per-Project Analytics View

### 5.1 Architecture

This is a new vertical slice with its own server function, query, and components. It aggregates session data by project and includes cost estimation.

```
URL: /stats?tab=projects   (tab param on existing stats route)

+---------------------------------------------------+
|  stats.tsx                                        |
|  Tab bar: [Overview] [Projects]                   |
+---------------------------------------------------+
         |                           |
    tab=overview               tab=projects
         |                           |
    (existing charts)     +---------------------+
                          | ProjectAnalytics.tsx |
                          | useQuery(projectAnal |
                          |   yticsQuery)        |
                          +---------------------+
                                   |
                                   v
                          +---------------------+
                          | project-analytics   |
                          |   .queries.ts       |
                          +---------------------+
                                   |
                                   v
                          +---------------------+
                          | project-analytics   |
                          |   .server.ts        |
                          | getProjectAnalytics |
                          |   ()                |
                          +---------------------+
                                   |
                                   v
                          +---------------------+
                          | session-scanner.ts  |
                          | scanAllSessions()   |
                          | (mtime-cached)      |
                          +---------------------+
```

### 5.2 Decision: Tab on Stats Page vs. New Route

Using a tab on the existing `/stats` page rather than a new route because:
- It groups all analytics together in one navigation destination
- Avoids cluttering the sidebar (which only has 3 items currently)
- Tab state is managed via URL search param `tab` for shareability and back/forward navigation

### 5.3 Server Function: `getProjectAnalytics`

**File:** `apps/web/src/features/project-analytics/project-analytics.server.ts`

**Input:** None (aggregates all sessions)

**Output:**
```
interface ProjectAnalytics {
  projectPath: string
  projectName: string
  totalSessions: number
  activeSessions: number
  totalTokens: number
  tokensByModel: Record<string, TokenUsage>
  totalToolCalls: number
  toolFrequency: Record<string, number>   // top tools across all sessions
  totalDurationMs: number
  firstSessionAt: string
  lastSessionAt: string
  messageCount: number
}

interface ProjectAnalyticsResult {
  projects: ProjectAnalytics[]
}
```

**Logic:**
1. Call `scanAllSessions()` (mtime-cached)
2. Group sessions by `projectPath`
3. For each project, aggregate:
   - Count sessions and active sessions
   - Sum token counts (note: `SessionSummary` does not carry `tokensByModel` -- see section 5.5)
   - Sum message counts
   - Compute total duration
   - Track earliest/latest session timestamps
4. Sort projects by `lastSessionAt` (most recently active first)
5. Return result

### 5.4 Data Availability Gap

**Problem:** `SessionSummary` does not include `tokensByModel` or `toolFrequency`. These fields are only available in `SessionDetail`, which requires a full JSONL parse per session.

**Solution:** Two-tier approach:
- **Tier 1 (fast):** Aggregate from `SessionSummary` fields only: session count, active count, message count, duration, timestamps, project name. This data is already available from `scanAllSessions()` with no additional I/O.
- **Tier 2 (deferred):** Per-project token breakdown and tool frequency require parsing individual sessions. This is too expensive for all projects at once. Instead, provide a "drill-down" interaction: clicking a project row navigates to the sessions list filtered by that project (already supported via the `project` filter on `/sessions`).

This means the `ProjectAnalytics` type simplifies to:
```
interface ProjectAnalytics {
  projectPath: string
  projectName: string
  totalSessions: number
  activeSessions: number
  totalMessages: number
  totalDurationMs: number
  firstSessionAt: string
  lastSessionAt: string
}
```

Cost estimation per project is NOT included in the initial server response because `SessionSummary` does not carry per-model token data. This is a known limitation documented in the risks section.

### 5.5 Component Hierarchy

```
ProjectAnalytics.tsx
  |
  +-- ProjectSummaryCards (total projects, total sessions, most active project)
  |
  +-- ProjectTable
       |
       +-- ProjectRow (one per project)
            - Project name
            - Session count
            - Message count
            - Total duration
            - Last active (relative time)
            - Link to /sessions?project=<name>
```

**ProjectTable** is a sortable table. Default sort: last active (descending). Clickable column headers for: sessions, messages, duration, last active.

### 5.6 Tab Integration on Stats Page

The stats route search params gain a `tab` field:

```
z.object({
  tab: z.enum(['overview', 'projects']).default('overview').catch('overview'),
})
```

The stats page renders a tab bar at the top. "Overview" shows existing charts. "Projects" shows `ProjectAnalytics`.

### 5.7 File Changes

| File | Action | Changes |
|------|--------|---------|
| `features/project-analytics/project-analytics.server.ts` | **CREATE** | `getProjectAnalytics()` server function |
| `features/project-analytics/project-analytics.queries.ts` | **CREATE** | `projectAnalyticsQuery` with 60s refetch |
| `features/project-analytics/ProjectAnalytics.tsx` | **CREATE** | Main component with summary cards + project table |
| `features/project-analytics/ProjectTable.tsx` | **CREATE** | Sortable table of project metrics |
| `routes/_dashboard/stats.tsx` | **MODIFY** | Add tab search param, tab bar UI, conditional rendering of overview vs. projects tab |

---

## 6. Feature 4: Real-time Monitoring

### 6.1 Architecture

Real-time monitoring is built on React Query polling, which the codebase already uses. The approach adds three capabilities:

1. **Active session indicator in the sidebar** -- shows count of running sessions
2. **Adaptive polling for session detail** -- faster refresh when viewing an active session
3. **Active sessions badge in AppShell** -- always-visible indicator

```
+-------------------------------------------+
| AppShell.tsx                              |
|  Sidebar:                                 |
|    Sessions [3 active]  <-- badge         |
|    Stats                                  |
|    Settings                               |
+-------------------------------------------+
|                                           |
| activeSessionsQuery (3s poll)             |
|   |                                       |
|   +--> ActiveSessionsBadge.tsx            |
|                                           |
+-------------------------------------------+

Session Detail Page:
+-------------------------------------------+
| sessionDetailQuery                        |
|   refetchInterval:                        |
|     isActive ? 5_000 : undefined          |
|                                           |
| ActiveSessionBanner.tsx                   |
|   "This session is active. Auto-updating."|
+-------------------------------------------+
```

### 6.2 Active Sessions Badge

**File:** `apps/web/src/features/sessions/ActiveSessionsBadge.tsx`

A small component that renders the active session count next to "Sessions" in the sidebar nav.

**Behavior:**
- Uses `useQuery(activeSessionsQuery)` (already exists, polls every 3s)
- If count > 0, renders a small colored badge (e.g., `bg-green-500 text-white text-[10px] rounded-full px-1.5`)
- If count === 0, renders nothing

**Integration:** The `NAV_ITEMS` array in `AppShell.tsx` currently uses plain text labels. The "Sessions" item will be enhanced to include the badge component.

### 6.3 Adaptive Polling for Session Detail

**File:** `apps/web/src/features/session-detail/session-detail.queries.ts` (MODIFY)

The `sessionDetailQuery` function gains an optional `isActive` parameter:

```
export function sessionDetailQuery(
  sessionId: string,
  projectPath: string,
  isActive?: boolean,
) {
  return queryOptions({
    queryKey: ['session', 'detail', sessionId],
    queryFn: () => getSessionDetail({ data: { sessionId, projectPath } }),
    staleTime: isActive ? 2_000 : 30_000,
    refetchInterval: isActive ? 5_000 : undefined,
  })
}
```

**How `isActive` is determined on the detail page:**
- The session list already marks `isActive` on `SessionSummary`
- The detail page receives the `sessionId` and can cross-reference with `activeSessionsQuery`
- Use a custom hook `useIsSessionActive(sessionId)` that checks the active sessions list

### 6.4 Active Session Banner

**File:** `apps/web/src/features/session-detail/ActiveSessionBanner.tsx`

A thin banner displayed at the top of the session detail page when viewing an active session.

**Content:** "This session is currently active. Data refreshes automatically every 5 seconds."

**Styling:** `bg-green-900/30 border border-green-800 rounded-lg px-4 py-2 text-sm text-green-300` with a pulsing green dot indicator.

### 6.5 Hook: `useIsSessionActive`

**File:** `apps/web/src/features/sessions/useIsSessionActive.ts`

```
export function useIsSessionActive(sessionId: string): boolean {
  const { data: activeSessions } = useQuery(activeSessionsQuery)
  return activeSessions?.some(s => s.sessionId === sessionId) ?? false
}
```

This hook reuses `activeSessionsQuery` (3s poll) to determine if a specific session is active.

### 6.6 File Changes

| File | Action | Changes |
|------|--------|---------|
| `features/sessions/ActiveSessionsBadge.tsx` | **CREATE** | Badge component showing active session count |
| `features/sessions/useIsSessionActive.ts` | **CREATE** | Hook to check if a specific session is active |
| `features/session-detail/ActiveSessionBanner.tsx` | **CREATE** | Banner for active session detail pages |
| `features/session-detail/session-detail.queries.ts` | **MODIFY** | Add `isActive` param for adaptive polling |
| `routes/_dashboard/sessions/$sessionId.tsx` | **MODIFY** | Use `useIsSessionActive`, pass to query, render banner |
| `components/AppShell.tsx` | **MODIFY** | Render `ActiveSessionsBadge` next to Sessions nav item |

---

## 7. Complete File Plan

### New Files (10)

| # | File | Feature | Purpose |
|---|------|---------|---------|
| 1 | `features/stats/TokenTrendChart.tsx` | F1 | Stacked area chart for token usage over time |
| 2 | `lib/utils/export-utils.ts` | F2 | CSV/JSON generation and file download utilities |
| 3 | `components/ExportDropdown.tsx` | F2 | Reusable export dropdown button |
| 4 | `features/project-analytics/project-analytics.server.ts` | F3 | Server function for project-level aggregation |
| 5 | `features/project-analytics/project-analytics.queries.ts` | F3 | Query options for project analytics |
| 6 | `features/project-analytics/ProjectAnalytics.tsx` | F3 | Main project analytics view with summary cards |
| 7 | `features/project-analytics/ProjectTable.tsx` | F3 | Sortable table of project metrics |
| 8 | `features/sessions/ActiveSessionsBadge.tsx` | F4 | Active session count badge for sidebar |
| 9 | `features/sessions/useIsSessionActive.ts` | F4 | Hook to check if a session is currently active |
| 10 | `features/session-detail/ActiveSessionBanner.tsx` | F4 | Banner component for active session detail view |

### Modified Files (5)

| # | File | Features | Changes |
|---|------|----------|---------|
| 1 | `routes/_dashboard/stats.tsx` | F1, F2, F3 | Add TokenTrendChart, ExportDropdown, tab system for overview/projects |
| 2 | `routes/_dashboard/sessions/$sessionId.tsx` | F2, F4 | Add ExportDropdown for session JSON export, ActiveSessionBanner, adaptive polling |
| 3 | `features/session-detail/session-detail.queries.ts` | F4 | Add `isActive` parameter for adaptive refetch |
| 4 | `components/AppShell.tsx` | F4 | Render ActiveSessionsBadge in sidebar |
| 5 | `lib/parsers/types.ts` | F3 | Export `DailyModelTokens` type alias (if not already exported) |

---

## 8. Data Flow Diagrams

### Feature 1: Token Usage Over Time

```
~/.claude/stats-cache.json
        |
        v
  stats-parser.ts (mtime-cached)
        |
        v
  StatsCache { dailyModelTokens: DailyModelTokens[] }
        |
        v
  stats.server.ts -> getStats()
        |
        v
  statsQuery (React Query, 60s refetch)
        |
        v
  stats.tsx passes stats.dailyModelTokens
        |
        v
  TokenTrendChart.tsx
    - Extract unique models
    - Normalize model names
    - daily/weekly toggle (client-side aggregation)
    - Render Recharts AreaChart
```

### Feature 2: CSV/JSON Export

```
Stats Export:
  statsQuery.data (already in cache)
        |
        v
  ExportDropdown onClick
        |
        v
  export-utils.ts
    statsToCSV(stats, type) or statsToJSON(stats)
        |
        v
  downloadFile(content, filename, mime)
        |
        v
  Browser downloads file


Session Export:
  sessionDetailQuery.data (already in cache)
        |
        v
  ExportDropdown onClick
        |
        v
  export-utils.ts
    sessionToJSON(detail)
        |
        v
  downloadFile(content, filename, mime)
        |
        v
  Browser downloads file
```

### Feature 3: Per-Project Analytics

```
scanAllSessions() (mtime-cached SessionSummary[])
        |
        v
  project-analytics.server.ts
    getProjectAnalytics()
    - Group by projectPath
    - Aggregate: count, messages, duration, timestamps
        |
        v
  projectAnalyticsQuery (React Query, 60s refetch)
        |
        v
  ProjectAnalytics.tsx
    - ProjectSummaryCards (totals)
    - ProjectTable (sortable, each row links to /sessions?project=X)
```

### Feature 4: Real-time Monitoring

```
Sidebar (always visible):
  activeSessionsQuery (3s poll)
        |
        v
  ActiveSessionsBadge (count > 0 ? show badge : hide)


Session Detail Page:
  useIsSessionActive(sessionId) --- polls activeSessionsQuery
        |
        v
  isActive = true?
    YES -> sessionDetailQuery(id, path, true)
           refetchInterval: 5_000, staleTime: 2_000
           + render ActiveSessionBanner
    NO  -> sessionDetailQuery(id, path, false)
           refetchInterval: undefined, staleTime: 30_000
```

---

## 9. Server Function Signatures

### Existing (unchanged)
```
getStats(): Promise<StatsCache | null>
getSessionDetail({ sessionId, projectPath }): Promise<SessionDetail>
getActiveSessionList(): Promise<SessionSummary[]>
```

### New
```
getProjectAnalytics(): Promise<ProjectAnalyticsResult>

interface ProjectAnalyticsResult {
  projects: ProjectAnalytics[]
}

interface ProjectAnalytics {
  projectPath: string
  projectName: string
  totalSessions: number
  activeSessions: number
  totalMessages: number
  totalDurationMs: number
  firstSessionAt: string
  lastSessionAt: string
}
```

---

## 10. Component Props Summary

| Component | Props | Source |
|-----------|-------|--------|
| `TokenTrendChart` | `data: DailyModelTokens[]` | `statsQuery.data.dailyModelTokens` |
| `ExportDropdown` | `options: Array<{ label, onClick }>` | Built inline at call site |
| `ProjectAnalytics` | (none -- fetches own data) | `projectAnalyticsQuery` |
| `ProjectTable` | `projects: ProjectAnalytics[]` | Parent `ProjectAnalytics` component |
| `ActiveSessionsBadge` | (none -- fetches own data) | `activeSessionsQuery` |
| `ActiveSessionBanner` | (none -- purely presentational indicator) | Rendered conditionally by parent |

---

## 11. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **dailyModelTokens empty for users without stats-cache.json** | Low | TokenTrendChart already handles empty array gracefully (show "No data" message), same as existing charts |
| **Large number of models creates unreadable stacked chart** | Medium | Limit to top 5 models by total tokens; group remaining into "Other" category |
| **CSV export of large datasets may cause browser jank** | Low | Stats data is inherently small (one row per day). Session JSON is already in memory. Use `requestIdleCallback` if needed |
| **Project analytics N+1 if we try to load per-model tokens** | High | Mitigated by Tier 1 approach: only aggregate from SessionSummary fields. No per-session JSONL parsing. Cost estimate per project is deferred |
| **Adaptive polling increases server load** | Medium | Only active session detail pages poll at 5s. `activeSessionsQuery` already polls at 3s. The incremental load is one extra `getSessionDetail` call per 5s per open active session tab |
| **Tab state on stats page not preserved on navigation** | Low | Tab is a URL search param (`?tab=projects`), so it survives navigation and is bookmark-friendly |
| **Export dropdown may conflict with privacy mode** | Medium | Export should respect privacy mode: when active, anonymize project names in exported data using the same `anonymizeProjectName` function |
| **SessionSummary lacks message count for project analytics** | Low | `SessionSummary` has `messageCount` field (line 14 of types.ts) -- this is available |
| **Race condition: isActive changes between detail query calls** | Low | The query key does not include `isActive`, so toggling active status just changes polling frequency without cache invalidation |

---

## 12. Implementation Order

Features are ordered by dependency and incremental value:

### Phase 1: Token Usage Over Time (Feature 1)
**Estimated effort: Small**
- No new server logic required
- Single new component + minor stats page modification
- Immediate visual impact on the stats page
- **Files:** TokenTrendChart.tsx, stats.tsx (modify)

### Phase 2: CSV/JSON Export (Feature 2)
**Estimated effort: Small**
- Purely client-side, zero risk to existing functionality
- Utility module is self-contained
- Can be tested in isolation
- **Files:** export-utils.ts, ExportDropdown.tsx, stats.tsx (modify), $sessionId.tsx (modify)

### Phase 3: Real-time Monitoring (Feature 4)
**Estimated effort: Small-Medium**
- Builds on existing `activeSessionsQuery` infrastructure
- Small modifications to existing query and AppShell
- Active session banner is low-risk
- **Files:** ActiveSessionsBadge.tsx, useIsSessionActive.ts, ActiveSessionBanner.tsx, session-detail.queries.ts (modify), $sessionId.tsx (modify), AppShell.tsx (modify)

### Phase 4: Per-Project Analytics (Feature 3)
**Estimated effort: Medium**
- New vertical slice with server function, query, and multiple components
- Tab system on stats page is a UI pattern change
- Depends on Phase 1/2 being done first (stats.tsx is modified by all three phases; doing F3 last avoids merge conflicts)
- **Files:** All project-analytics/ files, stats.tsx (modify), types.ts (minor)

---

## 13. Testing Considerations

| Feature | Key Test Cases |
|---------|---------------|
| F1: Token Trend | Empty data array; single day; multi-model overlap; weekly aggregation math; model name normalization |
| F2: Export | CSV escaping (commas in project names); JSON round-trip fidelity; privacy mode redaction; empty data edge case |
| F3: Project Analytics | Zero sessions; single project; multiple projects with same name (different paths); sorting correctness |
| F4: Real-time | isActive transitions (active->inactive, inactive->active); polling interval changes; badge count accuracy |

---

## 14. Appendix: DailyModelTokens Schema Detail

The `DailyModelTokensSchema` in `types.ts` defines:

```typescript
z.object({
  date: z.string(),                              // "2025-02-14"
  tokensByModel: z.record(z.string(), z.number()) // e.g. { "claude-sonnet-4-20250514": 45000 }
})
```

This is a **total token count** per model per day (not split by input/output/cache). The TokenTrendChart should clearly label its Y-axis as "Total Tokens" and its tooltip should not imply input/output breakdown.

The `StatsCache.modelUsage` field DOES have per-category breakdown (input, output, cacheRead, cacheWrite) but is **aggregate across all time**, not per-day. These two data sources serve different purposes:
- `dailyModelTokens` -> time-series trend (Feature 1)
- `modelUsage` -> aggregate pie chart (existing ModelUsageChart)
