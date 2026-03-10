# Design: Improve Test Coverage (Issue #62)

## Problem Statement

The codebase is at 62% coverage overall, but several foundational `lib/` modules and feature slices have little to no tests. This leaves critical filesystem-scanning, parsing, and utility logic unverified, increasing the risk of regressions.

**Coverage gaps:**

| Module | Lines | Coverage |
|--------|-------|----------|
| `lib/scanner/session-scanner.ts` | 95 | 0% |
| `lib/scanner/project-scanner.ts` | 44 | 0% |
| `lib/scanner/active-detector.ts` | 30 | 7% |
| `lib/utils/claude-path.ts` | 53 | 27% |
| `lib/utils/format.ts` | 56 | 21% |
| `lib/parsers/history-parser.ts` | 36 | 0% |
| `lib/parsers/stats-parser.ts` | 404 | 0% |
| `features/session-detail/` | -- | 0% (no test files) |
| `features/theme/` | -- | 0% (no test files) |

## Decisions

### D1: Test co-location

Tests live next to their source files (e.g., `session-scanner.test.ts` beside `session-scanner.ts`). This matches the existing pattern (`disk-cache.test.ts`, `format.test.ts`).

### D2: Mocking strategy for `node:fs`

Use `vi.mock('node:fs')` at the top of each test file. The existing `disk-cache.test.ts` uses real filesystem I/O, but the scanner and parser modules access `~/.claude` paths -- mocking `node:fs` avoids touching real user data and makes tests deterministic.

For modules that also use `node:readline` (e.g., `history-parser.ts`), mock the readline interface by returning a mock async iterable.

### D3: Handling `claude-path.ts` module-level constant

`CLAUDE_DIR` is computed once at module load time via `resolveClaudeDir()`. Tests must either:

1. Set `process.env.CLAUDE_HOME` **before** the module is imported, or
2. Use `vi.resetModules()` + dynamic `import()` after changing the env var.

Approach (1) is simpler and sufficient: set `CLAUDE_HOME` in a `beforeAll` block, then `vi.resetModules()` to re-import.

### D4: Feature slice test scope

- **`session-detail/`**: Test only the pure data-transformation modules (`timeline-data.ts`, `timeline-colors.ts`). These have zero React dependencies and contain complex logic. Skip React component tests -- the components are thin wrappers over Recharts and are better covered by e2e tests.
- **`theme/`**: Test `getInitialTheme()` logic and `useTheme` hook behavior using `renderHook`. The ThemeToggle component is trivial and not worth a dedicated test.

### D5: Priority order

1. **Tier 1 -- Pure utilities** (no mocking needed): `format.ts`, `claude-path.ts`, `timeline-colors.ts`, `timeline-data.ts`
2. **Tier 2 -- Scanner modules** (mock `node:fs`): `project-scanner.ts`, `active-detector.ts`, `session-scanner.ts`
3. **Tier 3 -- Parsers** (mock `node:fs` + `node:readline`): `history-parser.ts`, `stats-parser.ts`
4. **Tier 4 -- Feature hooks**: `ThemeProvider` (`useTheme` hook)

### D6: Coverage depth

Each module gets:
- All happy-path scenarios
- Key edge cases (empty inputs, missing files, malformed data)
- Error recovery paths (catch blocks that return defaults)

No mutation testing or property-based testing in this pass.

## Architecture

No new production code or architectural changes. This is a test-only task.

```
apps/web/src/
  lib/
    scanner/
      session-scanner.ts          (existing)
      session-scanner.test.ts     (NEW)
      project-scanner.ts          (existing)
      project-scanner.test.ts     (NEW)
      active-detector.ts          (existing)
      active-detector.test.ts     (NEW)
    utils/
      claude-path.ts              (existing)
      claude-path.test.ts         (NEW)
      format.ts                   (existing)
      format.test.ts              (existing -- ADD missing tests)
    parsers/
      history-parser.ts           (existing)
      history-parser.test.ts      (NEW)
      stats-parser.ts             (existing)
      stats-parser.test.ts        (NEW)
  features/
    session-detail/
      timeline-chart/
        timeline-data.ts          (existing)
        timeline-data.test.ts     (NEW)
        timeline-colors.ts        (existing)
        timeline-colors.test.ts   (NEW)
    theme/
      ThemeProvider.tsx            (existing)
      ThemeProvider.test.tsx       (NEW)
```

## Test Plan by Module

### Tier 1: Pure Utilities

#### `format.test.ts` (extend existing)

Currently only tests `formatUSD`. Add tests for:

| Function | Test Cases |
|----------|-----------|
| `formatDuration(ms)` | `<1s`, seconds only, minutes+seconds, hours only, hours+minutes |
| `formatRelativeTime(dateStr)` | recent date ("X minutes ago"), older date |
| `formatDateTime(dateStr)` | valid ISO string -> "MMM d, yyyy HH:mm" |
| `formatTokenCount(count)` | `<1K` (raw number), `K` range, `M` range |
| `formatBytes(bytes)` | `B`, `KB`, `MB`, `GB` |

**Mocking:** None needed. `formatRelativeTime` depends on current time -- use `vi.useFakeTimers()`.

#### `claude-path.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `getClaudeDir()` | Returns `CLAUDE_HOME` when env is set; returns `~/.claude` when env is unset |
| `getProjectsDir()` | Returns `<claudeDir>/projects` |
| `getStatsPath()` | Returns `<claudeDir>/stats-cache.json` |
| `getHistoryPath()` | Returns `<claudeDir>/history.jsonl` |
| `decodeProjectDirName(dirName)` | `-Users-foo-bar` -> `/Users/foo/bar` |
| `extractProjectName(path)` | `/Users/foo/myproject` -> `myproject` |
| `extractSessionId(filename)` | `abc-123.jsonl` -> `abc-123`, already bare ID -> same |

**Mocking:** Use `vi.resetModules()` + dynamic import for `getClaudeDir()` tests with different `CLAUDE_HOME` values. Pure-function tests (`decodeProjectDirName`, `extractProjectName`, `extractSessionId`) need no mocking.

#### `timeline-colors.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `shortenToolName(name)` | MCP plugin name shortened, non-MCP name unchanged |
| `getToolColor(toolName)` | Known tool returns specific hex, unknown tool returns default `#9ca3af` |
| `getToolColorClass(toolName)` | Known tool returns tailwind class, unknown returns `text-gray-400` |

**Mocking:** None.

#### `timeline-data.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `buildTimelineChartData(turns, agents, skills, errors)` | Empty inputs -> zero-duration result |
| | Single turn with tool calls -> mainLane populated |
| | Agent invocations create swim lanes, excluded from mainLane |
| | Skill invocations create markers, excluded from mainLane |
| | Error markers created from errors array |
| | Invalid timestamps filtered gracefully |
| | Agent with `toolCalls` record -> tool dots distributed |

**Mocking:** None -- pure function operating on typed data.

### Tier 2: Scanner Modules

#### `project-scanner.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `scanProjects()` | Happy path: 2 project dirs with `.jsonl` files |
| | Empty projects dir -> `[]` |
| | Projects dir does not exist (readdir throws) -> `[]` |
| | Non-directory entries skipped |
| | Directories with no `.jsonl` files skipped |
| | Mixed: some dirs have sessions, some do not |

**Mocking:**
```
vi.mock('node:fs')
vi.mock('../utils/claude-path', () => ({
  getProjectsDir: () => '/fake/.claude/projects',
  decodeProjectDirName: (d: string) => d.replace(/^-/, '/').replace(/-/g, '/'),
  extractProjectName: (p: string) => p.split('/').pop() ?? '',
}))
```

Mock `fs.promises.readdir` and `fs.promises.stat` to simulate different directory structures.

#### `active-detector.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `isSessionActive(projectDirName, sessionId)` | JSONL file not found -> `false` |
| | JSONL older than 2 min -> `false` |
| | JSONL recent but no lock dir -> `false` |
| | JSONL recent AND lock dir exists -> `true` |
| | Lock path exists but is a file, not directory -> `false` |

**Mocking:** Same pattern -- `vi.mock('node:fs')`, control `stat` return values. Use `vi.useFakeTimers()` to control `Date.now()` for age checks.

#### `session-scanner.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `scanAllSessions()` | Returns summaries sorted by lastActiveAt descending |
| | Strips `filePath` from results |
| | Uses mtime cache on second call (verify `parseSummary` not called twice) |
| | Handles `stat` failures gracefully (skips file) |
| `scanAllSessionsWithPaths()` | Includes `filePath` in results |
| `getActiveSessions()` | Filters to only active sessions |

**Mocking:** Mock `node:fs`, `./project-scanner`, `./active-detector`, `../parsers/session-parser`. The session-scanner orchestrates these dependencies, so mock them at the module boundary. Must clear the module-level `summaryCache` Map between tests via `vi.resetModules()`.

### Tier 3: Parsers

#### `history-parser.test.ts` (new)

| Function | Test Cases |
|----------|-----------|
| `parseHistory()` | File does not exist -> `[]` |
| | Valid JSONL with 3 entries -> sorted by timestamp desc |
| | With `limit` param -> returns at most N entries |
| | Malformed lines skipped |
| | Entries missing required fields (`display`, `timestamp`, `sessionId`) skipped |

**Mocking:** Mock `node:fs` for `stat` and `createReadStream`. Create a mock readable stream that yields lines. Also mock `node:readline` to return a controllable async iterable:

```
vi.mock('node:readline', () => ({
  createInterface: () => mockLineIterator,
}))
```

Where `mockLineIterator` is an object with `[Symbol.asyncIterator]` yielding test lines.

#### `stats-parser.test.ts` (new)

This is the largest module (404 lines) with multiple internal functions. Focus on the public API and key internal logic paths.

| Function | Test Cases |
|----------|-----------|
| `parseStats()` | Stats file not found, sessions exist -> `computeStatsFromSessions()` fallback |
| | Stats file not found, no sessions -> `null` |
| | Valid stats file -> returns parsed StatsCache |
| | In-memory cache hit (same mtime) -> returns cached |
| | Disk cache hit -> returns from disk cache |
| | Malformed JSON -> falls back to computed |
| | Stats up-to-date (lastComputedDate >= today) -> no enrichment |
| | Stats stale (lastComputedDate < today) -> merges recent sessions |

**Mocking:** Mock `node:fs`, `../utils/claude-path`, `../cache/disk-cache`, `@/lib/scanner/session-scanner`, `@/lib/parsers/session-parser`. This module has many dependencies, so isolate at module boundaries. Use `vi.useFakeTimers()` to control "today" for staleness checks.

Between-test isolation is critical because of module-level `cachedStats` and `mergedCache` variables. Use `vi.resetModules()` before each test or test group.

### Tier 4: Feature Hooks

#### `ThemeProvider.test.tsx` (new)

| Test Case | Details |
|-----------|---------|
| `getInitialTheme()` | Returns `'dark'` on server (no window) |
| | Returns stored value from localStorage |
| | Falls back to system preference when no stored value |
| `useTheme` hook | Throws when used outside provider |
| | Returns current theme |
| | `toggleTheme` switches dark <-> light |
| | `setTheme` sets explicit value |

**Mocking:** The test setup already provides `localStorage` mock. Use `renderHook` from `@testing-library/react` with a wrapper that provides `ThemeProvider`. Mock `window.matchMedia` for system preference tests.

## Task Breakdown

| Task | Files | Est. Size | Priority |
|------|-------|-----------|----------|
| T1: Extend `format.test.ts` | `lib/utils/format.test.ts` | S | P0 |
| T2: New `claude-path.test.ts` | `lib/utils/claude-path.test.ts` | S | P0 |
| T3: New `timeline-colors.test.ts` | `features/session-detail/timeline-chart/timeline-colors.test.ts` | S | P0 |
| T4: New `timeline-data.test.ts` | `features/session-detail/timeline-chart/timeline-data.test.ts` | M | P0 |
| T5: New `project-scanner.test.ts` | `lib/scanner/project-scanner.test.ts` | M | P1 |
| T6: New `active-detector.test.ts` | `lib/scanner/active-detector.test.ts` | S | P1 |
| T7: New `session-scanner.test.ts` | `lib/scanner/session-scanner.test.ts` | L | P1 |
| T8: New `history-parser.test.ts` | `lib/parsers/history-parser.test.ts` | M | P2 |
| T9: New `stats-parser.test.ts` | `lib/parsers/stats-parser.test.ts` | XL | P2 |
| T10: New `ThemeProvider.test.tsx` | `features/theme/ThemeProvider.test.tsx` | M | P3 |

**Size key:** S = <30 lines, M = 30-80 lines, L = 80-150 lines, XL = 150+ lines

## Mocking Patterns Reference

### Pattern A: Mock `node:fs` (scanners, parsers)

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs'

vi.mock('node:fs')

const mockStat = vi.mocked(fs.promises.stat)
const mockReaddir = vi.mocked(fs.promises.readdir)

beforeEach(() => {
  vi.clearAllMocks()
})
```

### Pattern B: Dynamic import with `vi.resetModules()` (claude-path)

```typescript
beforeEach(() => {
  vi.resetModules()
})

it('uses CLAUDE_HOME when set', async () => {
  process.env.CLAUDE_HOME = '/custom/path'
  const { getClaudeDir } = await import('./claude-path')
  expect(getClaudeDir()).toBe('/custom/path')
  delete process.env.CLAUDE_HOME
})
```

### Pattern C: Mock readline async iterable (history-parser)

```typescript
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      for (const line of mockLines) {
        yield line
      }
    },
  })),
}))
```

### Pattern D: Mock module dependencies (session-scanner)

```typescript
vi.mock('./project-scanner', () => ({
  scanProjects: vi.fn(),
}))
vi.mock('./active-detector', () => ({
  isSessionActive: vi.fn(),
}))
vi.mock('../parsers/session-parser', () => ({
  parseSummary: vi.fn(),
}))
```

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Module-level state in scanners/parsers (`summaryCache`, `cachedStats`) leaks between tests | Tests produce false positives/negatives | Use `vi.resetModules()` before each test to get fresh module instances |
| `stats-parser.ts` has complex internal functions that are hard to test via the public API alone | Low coverage of edge cases in `mergeRecentSessions` | Build focused test fixtures that exercise specific merge paths; accept that some internal helper coverage comes indirectly |
| `formatRelativeTime` output depends on current time | Flaky tests | Use `vi.useFakeTimers()` with a fixed date |
| `ThemeProvider` tests may conflict with happy-dom's `window` implementation | Tests pass locally but fail in CI | Verify in CI; fall back to testing `getInitialTheme` as a pure function if hook tests are fragile |
| Mocking `node:fs` can be brittle if implementation changes import style | Tests break on refactor | Use `vi.mock('node:fs')` (module-level), not individual function mocks |

## Expected Coverage Impact

Conservative estimate based on lines covered:

| Module | Current | Target |
|--------|---------|--------|
| `session-scanner.ts` | 0% | 80%+ |
| `project-scanner.ts` | 0% | 90%+ |
| `active-detector.ts` | 7% | 90%+ |
| `claude-path.ts` | 27% | 95%+ |
| `format.ts` | 21% | 95%+ |
| `history-parser.ts` | 0% | 90%+ |
| `stats-parser.ts` | 0% | 60%+ (complex internal logic) |
| `timeline-data.ts` | 0% | 85%+ |
| `timeline-colors.ts` | 0% | 95%+ |
| `ThemeProvider.tsx` | 0% | 70%+ |

**Overall project coverage estimate:** 62% -> ~75-80%
