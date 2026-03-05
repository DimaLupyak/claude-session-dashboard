# Design: PRIVACY-V2 -- Comprehensive Privacy Mode for Paths, Branches, and Analytics

## 1. Problem Statement

The current privacy mode (`usePrivacy()`) has three capabilities:

1. **Project name anonymization** -- Maps real project names to `project-1`, `project-2`, etc. (session-stable via `useRef` map). Works in `SessionCard`, `SessionFilters`, and `SessionDetailPage`.
2. **Path anonymization** -- Replaces only the OS username segment in paths (`/Users/john/...` to `/Users/user/...`). The rest of the path -- including project directories, client names, and internal structure -- remains fully visible.
3. **Privacy toggle** -- UI toggle in the sidebar that persists to `localStorage`.

### Gaps

| Gap | Location | Sensitive Data Exposed |
|-----|----------|----------------------|
| **G1: Paths leak project structure** | `SessionCard` (cwd display) | `/Users/user/work/acme-corp/secret-project` -- the username is hidden but the full directory tree is visible, revealing client names, project names, internal org structure |
| **G2: Branch names shown raw** | `SessionCard` line 37, `SessionDetailPage` line 92 | Branch names like `feature/ACME-1234-implement-auth` leak ticket IDs, project codenames, and feature descriptions |
| **G3: Project Analytics table not anonymized** | `ProjectTable.tsx` line 96 | Project names displayed as clickable links in the table |
| **G4: "Most Active" card not anonymized** | `ProjectAnalytics.tsx` line 58 | The `SummaryCard` showing the most active project name uses raw `projectName` |
| **G5: Project filter link in table passes raw name** | `ProjectTable.tsx` line 93 | The `search={{ project: project.projectName }}` link navigates with the raw project name in the URL |

### What is NOT in scope

- **Exports** -- Exports always contain raw data. The user explicitly chose to export; no anonymization needed.
- **Free-text content scrubbing** -- Task subjects, error messages, turn content. These are unstructured and regex scrubbing would be unreliable. Deferred.
- **URL bar** -- Search params may contain raw project names (e.g., `?project=acme-corp`). Anonymizing the URL bar is complex and out of scope for V2.

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Full path replacement** -- `anonymizePath()` returns `.../project-N` instead of masking just the username | The current approach (`/Users/user/work/acme-corp/secret`) still leaks sensitive directory names. Replacing everything after the username with the anonymized project name gives maximum privacy with minimal complexity |
| **Branch anonymization via ref-based map** -- Same pattern as `anonymizeProjectName` | Branches need consistent mapping within a session (same branch always maps to the same `branch-N`). Using the same `useRef(Map)` pattern keeps the approach uniform and predictable |
| **Branch map is separate from project map** -- Independent counter | Branch names and project names are different domains. A branch called "main" should map to `branch-1`, not `project-1`. Separate maps avoid confusion |
| **`anonymizeBranch` lives in `PrivacyContext`** -- Not in `anonymize.ts` | It requires stateful mapping (like `anonymizeProjectName`), so it belongs in the context provider. The `anonymize.ts` file stays for stateless utilities |
| **ProjectTable and ProjectAnalytics use `usePrivacy()` directly** -- No prop drilling | These components already have access to the React context. Adding `usePrivacy()` is the simplest integration path, consistent with how `SessionCard` and `SessionFilters` already work |
| **`anonymizePath` needs the project name to do full replacement** -- New signature | The current `anonymizePath(path)` cannot know which `project-N` to use. The enhanced version needs the associated project name so it can look up the anonymized name and construct `.../project-N` |

---

## 3. Architecture

### 3.1 Privacy Context -- Before vs After

```
BEFORE (current PrivacyContext):

  PrivacyProvider
    |
    +-- privacyMode: boolean
    +-- togglePrivacyMode: () => void
    +-- anonymizePath(path) -> replaces username only
    +-- anonymizeProjectName(name) -> project-N mapping
    |
    +-- Maps: projectNameMapRef (Map<string, string>)
    +-- Counter: nextIndexRef (1, 2, 3...)

AFTER (PRIVACY-V2):

  PrivacyProvider
    |
    +-- privacyMode: boolean
    +-- togglePrivacyMode: () => void
    +-- anonymizePath(path, projectName?) -> full path replacement
    +-- anonymizeProjectName(name) -> project-N mapping (UNCHANGED)
    +-- anonymizeBranch(branch) -> branch-N mapping (NEW)
    |
    +-- Maps: projectNameMapRef (Map<string, string>)  (existing)
    +-- Maps: branchNameMapRef (Map<string, string>)   (NEW)
    +-- Counter: nextProjectIndexRef (1, 2, 3...)      (renamed for clarity)
    +-- Counter: nextBranchIndexRef (1, 2, 3...)       (NEW)
```

### 3.2 Data Flow for Path Anonymization

```
SessionCard receives session.cwd = "/Users/john/work/acme-corp/secret"
                  session.projectName = "acme-corp"

  anonymizePath(session.cwd, session.projectName)
       |
       v
  [privacy mode OFF?] -> return raw path
       |
  [privacy mode ON]
       |
       v
  [projectName provided?]
       |
  YES: anonymizedProject = anonymizeProjectName(projectName) -> "project-3"
       return ".../project-3"
       |
  NO:  fall back to username-only masking (legacy behavior)
       return path.replace(OS_USERNAME_PATTERN, '$1/user')
```

### 3.3 Data Flow for Branch Anonymization

```
SessionCard receives session.branch = "feature/ACME-1234-auth-flow"

  anonymizeBranch(session.branch)
       |
       v
  [privacy mode OFF?] -> return raw branch
       |
  [privacy mode ON]
       |
       v
  branchNameMapRef.get("feature/ACME-1234-auth-flow")
       |
  MISS: assign "branch-1", store in map, return "branch-1"
  HIT:  return stored value (e.g., "branch-1")
```

### 3.4 Component Integration Map

```
+-------------------------------------------------------------------+
|  Components ALREADY using usePrivacy()                             |
|                                                                    |
|  SessionCard.tsx                                                   |
|    - anonymizeProjectName(session.projectName)  [existing]         |
|    - anonymizePath(session.cwd)                 [CHANGE signature] |
|    + anonymizeBranch(session.branch)            [NEW]              |
|                                                                    |
|  SessionFilters.tsx                                                |
|    - anonymizeProjectName(p)                    [existing, no chg] |
|                                                                    |
|  SessionDetailPage ($sessionId.tsx)                                |
|    - anonymizeProjectName(detail.projectName)   [existing]         |
|    + anonymizeBranch(detail.branch)             [NEW]              |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|  Components NEWLY integrating usePrivacy()                         |
|                                                                    |
|  ProjectTable.tsx                                                  |
|    + anonymizeProjectName(project.projectName)  [NEW]              |
|                                                                    |
|  ProjectAnalytics.tsx                                              |
|    + anonymizeProjectName(mostActive.projectName) [NEW]            |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
|  Components with NO privacy changes needed                         |
|                                                                    |
|  ActivityChart.tsx       -- no project/path/branch data            |
|  TokenTrendChart.tsx     -- model names only                       |
|  ModelUsageChart.tsx     -- model names only                       |
|  HourlyDistribution.tsx  -- hour counts only                       |
|  ContributionHeatmap.tsx -- date/token counts only                 |
|  ActiveSessionBanner.tsx -- static text only                       |
|  ContextWindowPanel.tsx  -- token/context numbers only             |
|  ToolUsagePanel.tsx      -- tool names only                        |
|  ErrorPanel.tsx          -- error messages (deferred scrubbing)    |
|  CostEstimationPanel.tsx -- model/cost numbers only                |
+-------------------------------------------------------------------+
```

---

## 4. Detailed Changes

### 4.1 `anonymize.ts` -- Enhanced `anonymizePath()`

**Current behavior:**
```
anonymizePath("/Users/john/work/acme") -> "/Users/user/work/acme"
```

**New behavior:**
```
anonymizePath("/Users/john/work/acme", "project-3") -> ".../project-3"
anonymizePath("/Users/john/work/acme")              -> "/Users/user/work/acme"  (legacy fallback)
```

The function gains an optional second parameter `anonymizedProjectName`. When provided, the entire path is replaced with `.../` followed by that name. When omitted, it falls back to the existing username-only masking for backward compatibility.

**New signature:**
```typescript
export function anonymizePath(path: string, anonymizedProjectName?: string): string
```

**Implementation logic:**
1. If `anonymizedProjectName` is provided: return `.../${anonymizedProjectName}`
2. Else: return `path.replace(OS_USERNAME_PATTERN, '$1/user')` (existing behavior)

This keeps the pure utility function stateless. The stateful project-name-to-`project-N` mapping remains in `PrivacyContext`.

### 4.2 `PrivacyContext.tsx` -- Add `anonymizeBranch` and Update `anonymizePath`

**New interface:**
```typescript
interface PrivacyContextValue {
  privacyMode: boolean
  togglePrivacyMode: () => void
  anonymizePath: (path: string, projectName?: string) => string  // CHANGED: optional projectName
  anonymizeProjectName: (name: string) => string                 // unchanged
  anonymizeBranch: (branch: string) => string                    // NEW
}
```

**New state in provider:**
```typescript
const branchNameMapRef = useRef<Map<string, string>>(new Map())
const nextBranchIndexRef = useRef(1)
```

**`anonymizeBranch` callback:**
```typescript
const anonymizeBranch = useCallback(
  (branch: string): string => {
    if (!privacyMode) return branch
    const existing = branchNameMapRef.current.get(branch)
    if (existing) return existing
    const anonymized = `branch-${nextBranchIndexRef.current}`
    nextBranchIndexRef.current += 1
    branchNameMapRef.current.set(branch, anonymized)
    return anonymized
  },
  [privacyMode],
)
```

**Updated `anonymizePath` callback:**
```typescript
const anonymizePath = useCallback(
  (path: string, projectName?: string): string => {
    if (!privacyMode) return path
    if (projectName) {
      const anonName = anonymizeProjectName(projectName)
      return anonymizePathUtil(path, anonName)
    }
    return anonymizePathUtil(path)
  },
  [privacyMode, anonymizeProjectName],
)
```

**Updated `togglePrivacyMode`:**
Both maps and both counters reset on toggle:
```typescript
projectNameMapRef.current = new Map()
nextProjectIndexRef.current = 1
branchNameMapRef.current = new Map()
nextBranchIndexRef.current = 1
```

### 4.3 `SessionCard.tsx` -- Add Branch Anonymization, Fix Path Anonymization

**Current code (lines 9-17):**
```tsx
const { privacyMode, anonymizePath, anonymizeProjectName } = usePrivacy()
const displayName = privacyMode
  ? anonymizeProjectName(session.projectName)
  : session.projectName
const displayCwd = session.cwd
  ? privacyMode
    ? anonymizePath(session.cwd)
    : session.cwd
  : null
```

**New code:**
```tsx
const { privacyMode, anonymizePath, anonymizeProjectName, anonymizeBranch } = usePrivacy()
const displayName = privacyMode
  ? anonymizeProjectName(session.projectName)
  : session.projectName
const displayCwd = session.cwd
  ? anonymizePath(session.cwd, session.projectName)
  : null
const displayBranch = session.branch
  ? anonymizeBranch(session.branch)
  : null
```

**Branch display (lines 35-39), change from:**
```tsx
{session.branch && (
  <p className="mt-1 truncate text-xs text-gray-500">
    <span className="font-mono">{session.branch}</span>
  </p>
)}
```
**To:**
```tsx
{displayBranch && (
  <p className="mt-1 truncate text-xs text-gray-500">
    <span className="font-mono">{displayBranch}</span>
  </p>
)}
```

**CWD display simplification:**
The ternary for `displayCwd` is simplified because `anonymizePath` already checks `privacyMode` internally. When privacy is off, it returns the raw path. When on, it returns `.../project-N`.

### 4.4 `$sessionId.tsx` (SessionDetailPage) -- Add Branch Anonymization

**Current code (lines 33, 86-93):**
```tsx
const { privacyMode, anonymizeProjectName } = usePrivacy()
...
{detail.branch && (
  <span className="font-mono">{detail.branch}</span>
)}
```

**New code:**
```tsx
const { privacyMode, anonymizeProjectName, anonymizeBranch } = usePrivacy()
...
{detail.branch && (
  <span className="font-mono">
    {anonymizeBranch(detail.branch)}
  </span>
)}
```

Note: The project name display on line 86-88 remains unchanged -- it already uses `anonymizeProjectName`.

### 4.5 `ProjectTable.tsx` -- Add Privacy Integration

**New import and hook usage:**
```tsx
import { usePrivacy } from '@/features/privacy/PrivacyContext'

export function ProjectTable({ projects }: ProjectTableProps) {
  const { anonymizeProjectName } = usePrivacy()
  ...
```

**Project name column (line 90-97), change from:**
```tsx
<td className="px-4 py-3">
  <Link
    to="/sessions"
    search={{ project: project.projectName }}
    className="text-sm text-blue-400 hover:underline"
  >
    {project.projectName}
  </Link>
```

**To:**
```tsx
<td className="px-4 py-3">
  <Link
    to="/sessions"
    search={{ project: project.projectName }}
    className="text-sm text-blue-400 hover:underline"
  >
    {anonymizeProjectName(project.projectName)}
  </Link>
```

The `search={{ project: project.projectName }}` intentionally keeps the raw project name in the URL. This is a navigation parameter that the server uses for filtering -- it must match the actual data. Only the displayed text is anonymized.

**Sorting consideration:** The sort on `projectName` (line 30-31) compares raw `a.projectName.localeCompare(b.projectName)`. This is correct -- sorting should use the real data so results are deterministic. The anonymized display names are applied at render time only.

### 4.6 `ProjectAnalytics.tsx` -- Anonymize "Most Active" Card

**New import and hook usage:**
```tsx
import { usePrivacy } from '@/features/privacy/PrivacyContext'

export function ProjectAnalytics() {
  const { anonymizeProjectName } = usePrivacy()
  const { data, isLoading } = useQuery(projectAnalyticsQuery)
  ...
```

**"Most Active" card (line 57-59), change from:**
```tsx
<SummaryCard
  label="Most Active"
  value={mostActive.projectName}
  sub={`${mostActive.totalSessions} sessions`}
/>
```

**To:**
```tsx
<SummaryCard
  label="Most Active"
  value={anonymizeProjectName(mostActive.projectName)}
  sub={`${mostActive.totalSessions} sessions`}
/>
```

---

## 5. File Plan

### 5.1 Modified Files (5)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/features/privacy/anonymize.ts` | Add optional `anonymizedProjectName` parameter to `anonymizePath()`. When provided, return `.../${anonymizedProjectName}` instead of username-only masking |
| 2 | `apps/web/src/features/privacy/PrivacyContext.tsx` | Add `branchNameMapRef`, `nextBranchIndexRef`. Add `anonymizeBranch` callback with `branch-N` mapping. Update `anonymizePath` callback to accept optional `projectName` and delegate to `anonymizeProjectName` for lookup. Update `togglePrivacyMode` to reset branch map. Update `PrivacyContextValue` interface |
| 3 | `apps/web/src/features/sessions/SessionCard.tsx` | Destructure `anonymizeBranch` from `usePrivacy()`. Compute `displayBranch` using `anonymizeBranch`. Pass `session.projectName` to `anonymizePath` for full path replacement. Use `displayBranch` in render |
| 4 | `apps/web/src/routes/_dashboard/sessions/$sessionId.tsx` | Destructure `anonymizeBranch` from `usePrivacy()`. Wrap `detail.branch` display with `anonymizeBranch()` |
| 5 | `apps/web/src/features/project-analytics/ProjectTable.tsx` | Import `usePrivacy`. Call `anonymizeProjectName(project.projectName)` for table cell display text |
| 6 | `apps/web/src/features/project-analytics/ProjectAnalytics.tsx` | Import `usePrivacy`. Call `anonymizeProjectName(mostActive.projectName)` for "Most Active" summary card |

### 5.2 New Files (0)

No new files. All changes fit within existing files.

### 5.3 Files NOT Changed (with reasoning)

| File | Reason |
|------|--------|
| `SessionFilters.tsx` | Already uses `anonymizeProjectName` for dropdown -- no branch/path fields shown. No change needed |
| `PrivacyToggle.tsx` | UI toggle only -- no data display. No change needed |
| `ActivityChart.tsx` | Shows dates and counts only -- no project/path/branch data |
| `TokenTrendChart.tsx` | Shows model names and token counts only |
| `ModelUsageChart.tsx` | Shows model names only |
| `HourlyDistribution.tsx` | Shows hour counts only |
| `ContributionHeatmap.tsx` | Shows date/token data only |
| `ErrorPanel.tsx` | Error messages are free text -- content scrubbing is deferred |
| `TasksPanel.tsx` | Task subjects are free text -- content scrubbing is deferred |
| `export-utils.ts` | Exports always contain raw data per requirements |
| Any `*.server.ts` | Privacy is purely a client-side display concern. Server functions return raw data |

---

## 6. Privacy Coverage Matrix

This table shows every structured field that could contain sensitive information and its privacy status after PRIVACY-V2.

| Field | Where Displayed | Privacy Status |
|-------|----------------|---------------|
| `projectName` | SessionCard, SessionDetail header, SessionFilters dropdown, ProjectTable, ProjectAnalytics "Most Active" card | Anonymized (`project-N`) |
| `cwd` (working directory path) | SessionCard footer | Anonymized (`.../project-N`) |
| `branch` | SessionCard, SessionDetail header | Anonymized (`branch-N`) |
| `projectPath` | Used as navigation parameter, not displayed as text | Not displayed -- no change needed |
| `sessionId` | SessionDetail header (truncated 8 chars) | UUIDs are not sensitive -- no change |
| `model` | SessionCard, SessionDetail, charts | Model names are not sensitive -- no change |
| Error messages | ErrorPanel | Deferred (free text) |
| Task subjects | TasksPanel | Deferred (free text) |
| Agent/skill names | AgentsSkillsPanel | Generic names (e.g., "implementer", "architect") -- not sensitive |

---

## 7. Anonymization Mapping Behavior

### 7.1 Session Stability

Both `anonymizeProjectName` and `anonymizeBranch` use `useRef(Map)` inside `PrivacyProvider`. This means:

- **Within a page session:** The same real name always maps to the same anonymized name. If "acme-corp" is `project-1` on the sessions page, it remains `project-1` on the session detail page.
- **Across page reloads:** The mapping resets. "acme-corp" might become `project-2` if a different project is encountered first.
- **On privacy toggle:** The mapping resets. This prevents stale entries from accumulating.

### 7.2 Cross-Reference Consistency

A concern: if a user sees `project-3` in SessionCard and clicks through to SessionDetail, will the same project still display as `project-3`?

**Yes.** Both components call `anonymizeProjectName(session.projectName)` with the same real name. The ref-based map in PrivacyContext ensures the same input always returns the same output within a session. The mapping is global (at the provider level), not per-component.

The same applies to branches: if `feature/ACME-1234` is `branch-2` on the SessionCard, clicking into SessionDetail will also show `branch-2` because both components call `anonymizeBranch("feature/ACME-1234")` which hits the same ref map.

### 7.3 Path and Project Name Linkage

The enhanced `anonymizePath()` in the context calls `anonymizeProjectName(projectName)` internally. This ensures the project name in the path matches the project name displayed elsewhere. If the card header shows `project-3`, the cwd path below it will show `.../project-3` (not a different number).

---

## 8. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **URL still contains raw project name** -- Navigating from ProjectTable passes `search={{ project: project.projectName }}` with the real name in the URL bar | Low | This is a known limitation documented in "out of scope". The URL is not displayed prominently. Fixing it would require a two-way mapping (anonymized to real) or a separate mechanism, adding significant complexity for minimal gain. Users who are screen-sharing should be aware the URL bar is not anonymized |
| 2 | **Branch mapping is not deterministic across reloads** -- `branch-1` might refer to different branches after a page reload | Low | This matches the existing behavior of `anonymizeProjectName`. The purpose is to prevent shoulder-surfing and screenshots, not to provide a stable pseudonymous identity. The tradeoff is acceptable: deterministic mapping would require persistent storage and a more complex lookup system |
| 3 | **`anonymizePath` signature change could break callers** -- Adding an optional parameter changes the function signature | Very Low | The parameter is optional with a fallback to existing behavior. TypeScript will not flag any existing call sites as errors. The only call site (`SessionCard`) is being updated in this PR |
| 4 | **Performance of ref-based maps with many unique branches** | Very Low | Even power users with 1000+ sessions would have at most hundreds of unique branch names. A `Map` lookup is O(1). No measurable performance impact |
| 5 | **Project names in `TasksPanel` subjects or `ErrorPanel` messages** | Medium | These are free-text fields where project names might appear incidentally (e.g., "Error in acme-corp build"). Content scrubbing is explicitly deferred. The privacy mode documentation (tooltip on toggle) could be updated to note this limitation in a future iteration |
| 6 | **Sorting ProjectTable by "Project" column shows anonymized order** | Low | The sort operates on raw data (`a.projectName.localeCompare(b.projectName)`), not anonymized names. This means the alphabetical order of the display column may look random when privacy mode is on. This is acceptable -- the sort is stable and correct, just not visually alphabetical by the displayed text. Sorting by other columns (sessions, duration, last active) is unaffected |

---

## 9. Testing Considerations

| Area | Key Test Cases |
|------|---------------|
| **`anonymizePath()`** | With `anonymizedProjectName`: returns `.../project-N`. Without: returns username-masked path (existing behavior). Empty path: returns empty string. Path without username pattern: returned unchanged when no `anonymizedProjectName` |
| **`anonymizeBranch()`** | Privacy off: returns raw branch. Privacy on: first call returns `branch-1`, same input returns `branch-1` again, different input returns `branch-2`. Toggle off then on: counter resets |
| **`PrivacyContext` integration** | `anonymizePath(cwd, projectName)` returns path containing the same `project-N` as `anonymizeProjectName(projectName)`. Branch and project counters are independent (branch-1 does not interfere with project-1 numbering) |
| **`ProjectTable` rendering** | With privacy on: table cells show `project-N` text. Links still navigate to correct sessions page with real project name in URL |
| **`ProjectAnalytics` rendering** | "Most Active" card shows anonymized name when privacy is on |
| **`SessionCard` rendering** | Branch shows `branch-N`, path shows `.../project-N`, project name shows `project-N` -- all when privacy mode is on. All show raw values when privacy is off |

---

## 10. Implementation Order

This is a single cohesive change that can be implemented in one PR. The recommended file order is:

1. **`anonymize.ts`** -- Update the pure utility function signature (foundation)
2. **`PrivacyContext.tsx`** -- Add branch map, update path callback, export new `anonymizeBranch` (core logic)
3. **`SessionCard.tsx`** -- Integrate branch anonymization and enhanced path anonymization (highest-traffic component)
4. **`$sessionId.tsx`** -- Add branch anonymization (session detail page)
5. **`ProjectTable.tsx`** -- Add project name anonymization (analytics)
6. **`ProjectAnalytics.tsx`** -- Add project name anonymization to summary card (analytics)

All six files are modified in a single commit. There are no intermediate states where the feature is partially working.
