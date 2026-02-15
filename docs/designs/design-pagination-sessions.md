# Design: Sessions Page Pagination

## 1. Problem Statement

The sessions page currently loads **all sessions** from `~/.claude` in a single request via `scanAllSessions()`. This function iterates every project directory, stats and parses the head/tail of every `.jsonl` file, checks active status, then returns the entire sorted array to the client. For users with 100+ sessions, this means slow initial loads and unnecessarily large payloads.

## 2. Pagination Strategy

### Decision: Offset-based pagination with server-side filtering

**Rationale:** This is a local, single-user, read-only dashboard. Sessions change infrequently. The simplicity of offset pagination (`?page=2`) outweighs cursor-based stability benefits. Users benefit from "Page 2 of 5" display and the ability to jump to any page.

**Default page size:** 25 sessions per page.

## 3. Architecture

```
URL Search Params: ?page=1&search=foo&status=active&project=bar
                              |
                              v
        +----------------------------------------------------+
        |  Route: /_dashboard/sessions/index.tsx              |
        |  validateSearch with Zod schema                     |
        +----------------------------------------------------+
                              |
                              v
        +----------------------------------------------------+
        |  SessionList.tsx                                    |
        |  useQuery(paginatedSessionListQuery({...}))         |
        |  Renders: SessionFilters + SessionCard[] + Pagination|
        +----------------------------------------------------+
               |                              |
     +---------+                   +----------+
     v                             v
+--------------------+   +---------------------+
| sessions.queries.ts|   | PaginationControls  |
| paginatedSession   |   | (new component)     |
| ListQuery(params)  |   +---------------------+
+--------------------+
          |
          v
+---------------------------+
| sessions.server.ts        |
| getPaginatedSessions()    |
| - calls scanAllSessions() |
| - applies filters         |
| - slices to page          |
+---------------------------+
          |
          v
+---------------------------+
| session-scanner.ts        |
| scanAllSessions()         |
| (unchanged, mtime-cached) |
+---------------------------+
```

## 4. Data Flow

1. User navigates to /sessions?page=2&search=foo
2. Route validates search params via Zod schema
3. SessionList calls useQuery with filter+page params in query key
4. Server function `getPaginatedSessions()` runs:
   a. `scanAllSessions()` -> full list (mtime-cached, fast)
   b. Extract distinct project names (for filter dropdown)
   c. Apply search/status/project filters
   d. Compute totalCount, totalPages
   e. Slice to requested page
   f. Return `{ sessions, totalCount, totalPages, page, projects }`
5. Client renders 25 SessionCards + PaginationControls
6. Active session overlay: `activeSessionsQuery` (3s poll) merges isActive status client-side

## 5. Affected Files

### Modified Files

| File | Changes |
|------|---------|
| `routes/_dashboard/sessions/index.tsx` | Add `validateSearch` with Zod schema for page, search, status, project params |
| `features/sessions/sessions.server.ts` | Add `getPaginatedSessions` server function with filter/pagination logic |
| `features/sessions/sessions.queries.ts` | Add `paginatedSessionListQuery(params)` with filter state in queryKey |
| `features/sessions/SessionList.tsx` | Remove client-side filter useMemo. Read search params from route. Use paginatedSessionListQuery. Render PaginationControls |
| `features/sessions/SessionFilters.tsx` | Change from controlled local state to URL-driven. Navigate on filter change. Debounce search (300ms) |

### New Files

| File | Purpose |
|------|---------|
| `features/sessions/PaginationControls.tsx` | Reusable pagination UI: prev/next, page numbers with ellipsis |

## 6. URL Search Params Schema

```
page:     z.number().int().min(1).default(1).catch(1)
pageSize: z.number().int().min(10).max(100).default(25).catch(25)
search:   z.string().default('').catch('')
status:   z.enum(['all', 'active', 'completed']).default('all').catch('all')
project:  z.string().default('').catch('')
```

## 7. Server Function: `getPaginatedSessions`

**Input:** `{ page, pageSize, search, status, project }`

**Output:** `{ sessions, totalCount, totalPages, page, pageSize, projects }`

**Logic:**
1. Call `scanAllSessions()` (mtime-cached)
2. Extract distinct project names from full unfiltered set
3. Apply filters (search: case-insensitive substring on projectName/branch/sessionId/cwd; status; project)
4. Compute totalCount, totalPages
5. Clamp page to valid range
6. Slice to requested page
7. Return result

## 8. Query: `paginatedSessionListQuery`

- queryKey: `['sessions', 'paginated', { page, pageSize, search, status, project }]`
- `placeholderData: keepPreviousData` (prevents blank states during page transitions)
- 30-second refetch interval

## 9. PaginationControls Component

- Shows "Showing X-Y of Z sessions"
- Previous/Next buttons (disabled at bounds)
- Page numbers with ellipsis for large page counts
- Hidden when totalPages <= 1
- Dark theme styling

## 10. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Full scan on every request | Existing mtime cache makes repeated calls fast |
| Search keystroke flooding | Debounce search input (300ms) |
| Page beyond range after filter | Server clamps page; client resets to 1 on filter change |
| Breaking active sessions overlay | `activeSessionsQuery` remains completely unchanged |
