# Design: E2E Tests with Playwright

## 1. Problem Statement

The dashboard has no end-to-end test coverage. All quality gates currently rely on TypeScript type checking, a unit test suite (Vitest with happy-dom), and a production build check. There is no automated verification that pages render correctly, navigation works, data appears, or that the user-facing behavior matches expectations when real session data is present.

Additionally, the app reads from `~/.claude` at runtime (hardcoded in `claude-path.ts`), which makes E2E tests non-reproducible -- they depend on whatever sessions happen to exist on the developer's machine.

## 2. Goals

1. Introduce Playwright E2E tests that run against **static fixture data**, ensuring deterministic and reproducible results.
2. Use BDD-style test descriptions (Given/When/Then) for clarity.
3. Integrate E2E tests into the existing GitHub Actions CI pipeline.
4. Cover all primary pages: Sessions list, Session detail, Stats, Settings.

## 3. Decisions

### D1: Override mechanism for `~/.claude` path

**Decision:** Introduce a `CLAUDE_HOME` environment variable in `claude-path.ts`. When set, all path functions use it instead of `os.homedir() + '/.claude'`.

**Rationale:** This is the minimal, non-invasive change. The `claude-path.ts` module is the single source of truth for all filesystem paths (used by scanner, parsers, active-detector). Changing it once propagates to the entire data pipeline. No dependency injection refactoring needed.

**Implementation:**

```
// claude-path.ts (modified)
function getClaudeBaseDir(): string {
  return process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude')
}

const CLAUDE_DIR = getClaudeBaseDir()
```

**Why not a Vite env var (`VITE_CLAUDE_HOME`)?** The path utilities run server-side only (in `createServerFn` handlers). `process.env` is the correct mechanism for server-side configuration. A `VITE_` prefix would unnecessarily expose it to the client bundle.

### D2: Fixture data strategy

**Decision:** Create a minimal `e2e/fixtures/.claude/` directory tree that mirrors the real `~/.claude` structure with hand-crafted, deterministic data.

**Rationale:** Tests must be reproducible across machines and CI. Hand-crafted fixtures give full control over edge cases (empty sessions, multi-model sessions, long sessions, errors).

### D3: Test style

**Decision:** BDD-style test descriptions using Playwright's `test.describe` / `test` with Given/When/Then pattern in the test name string.

**Rationale:** Provides clear documentation of expected behavior. Playwright does not have native Gherkin support, but descriptive test names achieve the same readability without extra tooling.

### D4: Server startup strategy for E2E

**Decision:** Use Playwright's built-in `webServer` config to start the Vite dev server with `CLAUDE_HOME` pointed at fixtures.

**Rationale:** Playwright manages the dev server lifecycle (start before tests, kill after). Using `npm run dev` with the env var override is simpler and more reliable than building first and running production mode.

### D5: CI strategy

**Decision:** Add a new `e2e` job in the existing `ci.yml` workflow, running after the build job.

**Rationale:** E2E tests are slower than unit tests and type checks. Running them as a separate parallel job keeps feedback fast for other checks while still gating PRs.

## 4. Architecture

```
+--------------------------------------------------+
|  Playwright Test Runner                          |
|  (reads playwright.config.ts)                    |
+--------------------------------------------------+
         |                        |
         | starts webServer       | runs tests
         v                        v
+-------------------+    +------------------------+
| Vite Dev Server   |    | Test Files             |
| CLAUDE_HOME=      |    | e2e/tests/*.spec.ts    |
| e2e/fixtures/     |    | (BDD-style)            |
| .claude           |    +------------------------+
+-------------------+             |
         |                        | HTTP requests
         v                        v
+---------------------------------------------------+
|  TanStack Start App                               |
|  Server Functions -> Scanner -> Parsers            |
|  (all read from CLAUDE_HOME instead of ~/.claude)  |
+---------------------------------------------------+
         |
         v
+---------------------------------------------------+
|  e2e/fixtures/.claude/                            |
|  +-- projects/                                    |
|  |   +-- -Users-test-projects-my-app/            |
|  |   |   +-- session-001.jsonl                   |
|  |   |   +-- session-002.jsonl                   |
|  |   +-- -Users-test-projects-another/           |
|  |       +-- session-003.jsonl                   |
|  +-- stats-cache.json                             |
+---------------------------------------------------+
```

### File Tree (new files)

```
apps/web/
+-- e2e/
|   +-- fixtures/
|   |   +-- .claude/
|   |       +-- projects/
|   |       |   +-- -Users-test-projects-my-app/
|   |       |   |   +-- session-001.jsonl
|   |       |   |   +-- session-002.jsonl
|   |       |   +-- -Users-test-projects-another/
|   |       |       +-- session-003.jsonl
|   |       +-- stats-cache.json
|   +-- tests/
|   |   +-- sessions.spec.ts
|   |   +-- session-detail.spec.ts
|   |   +-- stats.spec.ts
|   |   +-- settings.spec.ts
|   |   +-- navigation.spec.ts
|   +-- helpers/
|       +-- selectors.ts
+-- playwright.config.ts
```

## 5. Data Flow

### Normal runtime

```
os.homedir()/.claude  -->  getClaudeDir()  -->  getProjectsDir()  -->  scanProjects()
                                           -->  getStatsPath()    -->  parseStats()
```

### E2E test runtime

```
CLAUDE_HOME=e2e/fixtures/.claude  -->  getClaudeDir()  -->  getProjectsDir()  -->  scanProjects()
                                                        -->  getStatsPath()    -->  parseStats()
```

The only change is at the root: `getClaudeDir()` reads from `CLAUDE_HOME` env var when present.

## 6. Fixture Data Specification

### Session JSONL files

Each `.jsonl` file contains one JSON object per line, following the `RawJsonlMessage` type.

#### session-001.jsonl (standard completed session)

- **Project:** `/Users/test/projects/my-app`
- **Branch:** `main`
- **Model:** `claude-sonnet-4-20250514`
- **Messages:** 3 user + 3 assistant turns (6 total)
- **Tools used:** Read, Write, Bash (for tool frequency chart)
- **Token usage:** Non-zero inputTokens, outputTokens, cacheReadInputTokens
- **Duration:** ~5 minutes (timestamps spread 5 min apart)
- **No errors**

#### session-002.jsonl (session with errors and multiple models)

- **Project:** `/Users/test/projects/my-app`
- **Branch:** `feature/new-thing`
- **Models:** `claude-sonnet-4-20250514`, `claude-haiku-3-20250314`
- **Messages:** 5 user + 5 assistant turns
- **Tools used:** Read, Grep, Task (agent invocation)
- **1 system error** message (overload)
- **Agent invocation:** 1 Task call with `subagent_type: "implementer"`
- **Duration:** ~15 minutes

#### session-003.jsonl (minimal session from different project)

- **Project:** `/Users/test/projects/another`
- **Branch:** `develop`
- **Model:** `claude-sonnet-4-20250514`
- **Messages:** 1 user + 1 assistant turn
- **Duration:** ~1 minute
- **No tools, no errors**

### stats-cache.json

A valid `StatsCache` object matching the `StatsCacheSchema`:

```json
{
  "version": 1,
  "lastComputedDate": "2025-06-15",
  "dailyActivity": [
    { "date": "2025-06-14", "messageCount": 10, "sessionCount": 2, "toolCallCount": 5 },
    { "date": "2025-06-15", "messageCount": 6, "sessionCount": 1, "toolCallCount": 3 }
  ],
  "dailyModelTokens": [
    { "date": "2025-06-14", "tokensByModel": { "claude-sonnet-4-20250514": 50000 } },
    { "date": "2025-06-15", "tokensByModel": { "claude-sonnet-4-20250514": 30000 } }
  ],
  "modelUsage": {
    "claude-sonnet-4-20250514": {
      "inputTokens": 60000,
      "outputTokens": 20000,
      "cacheReadInputTokens": 5000,
      "cacheCreationInputTokens": 2000
    }
  },
  "totalSessions": 3,
  "totalMessages": 16,
  "longestSession": {
    "sessionId": "session-002",
    "duration": 900000,
    "messageCount": 10,
    "timestamp": "2025-06-14T10:00:00Z"
  },
  "firstSessionDate": "2025-06-14",
  "hourCounts": { "10": 8, "11": 5, "14": 3 }
}
```

## 7. Test Specifications (BDD-style)

### navigation.spec.ts

```
describe('Navigation')
  test('Given the app is loaded, When I visit the root URL, Then I am redirected to /sessions')
  test('Given I am on the sessions page, When I click "Stats" in the sidebar, Then I see the Stats page')
  test('Given I am on the sessions page, When I click "Settings" in the sidebar, Then I see the Settings page')
  test('Given I am on any page, Then the sidebar shows "Claude Dashboard" branding')
```

### sessions.spec.ts

```
describe('Sessions List')
  test('Given sessions exist in fixtures, When I visit /sessions, Then I see session cards with project names')
  test('Given sessions exist, When I visit /sessions, Then I see "my-app" and "another" as project names')
  test('Given sessions exist, When I search for "another", Then only the "another" project session appears')
  test('Given sessions exist, When I filter by project "my-app", Then only my-app sessions appear')
  test('Given I am on /sessions, When I view a session card, Then it shows the model name, branch, and duration')
```

### session-detail.spec.ts

```
describe('Session Detail')
  test('Given session-001 exists, When I click on its card from the sessions list, Then I see the detail page with project name "my-app"')
  test('Given I am on session-001 detail, Then I see the Context Window panel')
  test('Given I am on session-001 detail, Then I see the Tool Usage panel with Read, Write, Bash tools')
  test('Given I am on session-001 detail, Then I see the Cost Estimation panel')
  test('Given I am on session-002 detail, Then I see the error panel with the overload error')
  test('Given I am on session-001 detail, When I click "Sessions" breadcrumb, Then I return to the sessions list')
```

### stats.spec.ts

```
describe('Stats Page')
  test('Given stats-cache.json exists in fixtures, When I visit /stats, Then I see summary cards (Total Sessions, Total Messages, etc.)')
  test('Given stats data exists, When I view the stats page, Then I see "3" as total sessions')
  test('Given stats data exists, Then I see the Activity chart rendered')
  test('Given stats data exists, Then I see the Model Usage chart rendered')
  test('Given I am on the stats page, When I click the "Projects" tab, Then I see the Projects analytics view')
```

### settings.spec.ts

```
describe('Settings Page')
  test('Given I visit /settings, Then I see the subscription tier selector')
  test('Given I visit /settings, Then I see the API pricing table')
  test('Given I am on settings, When I select a different tier, Then the Save button becomes enabled')
  test('Given I changed settings, When I click "Reset to Defaults", Then the form resets')
```

## 8. Playwright Configuration

```
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const fixturesDir = path.resolve(__dirname, 'e2e', 'fixtures', '.claude')

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3001',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      CLAUDE_HOME: fixturesDir,
    },
  },
})
```

**Key choices:**

- **Port 3001:** Avoids collision with a running dev server on 3000.
- **Single browser (Chromium):** Sufficient for a local developer tool. Reduces CI time.
- **`forbidOnly: !!process.env.CI`:** Prevents `.only` from slipping into CI.
- **`retries: 2` in CI:** Handles flaky network/rendering timing.
- **`workers: 1` in CI:** Prevents resource contention on GitHub runners.
- **`reporter: 'github'`:** Integrates with GitHub Actions annotations.
- **`reuseExistingServer: !process.env.CI`:** Speeds up local development.

## 9. Selectors Helper

To avoid brittle selectors and centralize test utilities:

```
// e2e/helpers/selectors.ts
export const selectors = {
  sidebar: {
    root: 'aside',
    sessionsLink: 'a[href="/sessions"]',
    statsLink: 'a[href="/stats"]',
    settingsLink: 'a[href="/settings"]',
    branding: 'text=Claude Dashboard',
  },
  sessions: {
    heading: 'h1:has-text("Sessions")',
    sessionCard: '[class*="rounded-xl"][class*="border-gray-800"]',
    searchInput: 'input[placeholder*="Search"]',
    projectFilter: 'select, [role="combobox"]',
  },
  sessionDetail: {
    backLink: 'text=Sessions',
    projectName: 'h1',
    contextPanel: 'text=Context Window',
    toolUsagePanel: 'text=Tool Usage',
    costPanel: 'text=Cost',
    errorPanel: 'text=Error',
    timeline: 'text=Timeline',
  },
  stats: {
    heading: 'h1:has-text("Stats")',
    totalSessions: 'text=Total Sessions',
    totalMessages: 'text=Total Messages',
    overviewTab: 'button:has-text("Overview")',
    projectsTab: 'button:has-text("Projects")',
  },
  settings: {
    heading: 'h1:has-text("Settings")',
    tierSelector: 'text=Subscription Tier',
    pricingTable: 'text=API Pricing',
    saveButton: 'button:has-text("Save")',
    resetButton: 'button:has-text("Reset")',
  },
}
```

## 10. Affected Files

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/lib/utils/claude-path.ts` | Read `CLAUDE_HOME` env var; use as base dir when set |
| `apps/web/package.json` | Add `@playwright/test` devDependency; add `e2e` and `e2e:ui` scripts |
| `.github/workflows/ci.yml` | Add `e2e` job with Playwright browser install and test execution |
| `.gitignore` | Add `playwright-report/`, `test-results/`, `blob-report/` |

### New Files

| File | Purpose |
|------|---------|
| `apps/web/playwright.config.ts` | Playwright configuration with webServer, fixture path, browser projects |
| `apps/web/e2e/fixtures/.claude/projects/-Users-test-projects-my-app/session-001.jsonl` | Standard completed session fixture |
| `apps/web/e2e/fixtures/.claude/projects/-Users-test-projects-my-app/session-002.jsonl` | Multi-model session with errors and agent invocations |
| `apps/web/e2e/fixtures/.claude/projects/-Users-test-projects-another/session-003.jsonl` | Minimal session from different project |
| `apps/web/e2e/fixtures/.claude/stats-cache.json` | Static stats data matching StatsCacheSchema |
| `apps/web/e2e/tests/navigation.spec.ts` | Sidebar navigation and redirect tests |
| `apps/web/e2e/tests/sessions.spec.ts` | Sessions list page tests |
| `apps/web/e2e/tests/session-detail.spec.ts` | Session detail page tests |
| `apps/web/e2e/tests/stats.spec.ts` | Stats page tests |
| `apps/web/e2e/tests/settings.spec.ts` | Settings page tests |
| `apps/web/e2e/helpers/selectors.ts` | Centralized test selectors |

## 11. claude-path.ts Change Detail

The change is minimal -- a single function addition and one constant modification:

**Before:**
```typescript
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
```

**After:**
```typescript
function resolveClaudeDir(): string {
  if (process.env.CLAUDE_HOME) {
    return path.resolve(process.env.CLAUDE_HOME)
  }
  return path.join(os.homedir(), '.claude')
}

const CLAUDE_DIR = resolveClaudeDir()
```

`path.resolve()` ensures relative paths (like in test configs) are resolved correctly against the working directory.

**Impact analysis:** Every consumer of `getClaudeDir()`, `getProjectsDir()`, `getStatsPath()`, and `getHistoryPath()` automatically picks up the override. No other files need changes to the data pipeline.

Note: `CLAUDE_DIR` is computed once at module load time. This is fine because `process.env.CLAUDE_HOME` is set before the server starts (via Playwright's `webServer.env` config). There is no scenario where the env var changes mid-process.

## 12. Package.json Script Additions

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:headed": "playwright test --headed"
  }
}
```

## 13. GitHub Actions CI Integration

Add a new job to `.github/workflows/ci.yml`:

```yaml
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: ./apps/web
  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
        cache-dependency-path: ./apps/web/package-lock.json

    - name: Install dependencies
      run: npm ci

    - name: Install Playwright browsers
      run: npx playwright install --with-deps chromium

    - name: Run E2E tests
      run: npm run e2e

    - name: Upload Playwright report
      uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: playwright-report
        path: apps/web/playwright-report/
        retention-days: 14
```

**Key choices:**

- **`--with-deps chromium`:** Installs only Chromium (not Firefox/WebKit) plus OS-level dependencies. Reduces install time from ~90s to ~30s.
- **`if: ${{ !cancelled() }}`:** Uploads the HTML report even on failure, so developers can inspect screenshots and traces.
- **`retention-days: 14`:** Keeps reports for 2 weeks. Balances storage with debugging usefulness.
- **No dependency on `build` job:** E2E tests run the Vite dev server, not the production build. This tests closer to the development experience and avoids a sequential dependency.

## 14. JSONL Fixture Format Reference

Each line in a `.jsonl` fixture must be a valid JSON object matching the `RawJsonlMessage` interface. Here is the minimal structure for key message types:

**User message:**
```json
{"type":"user","uuid":"u-001","timestamp":"2025-06-15T10:00:00Z","cwd":"/Users/test/projects/my-app","gitBranch":"main","message":{"role":"user","content":[{"type":"text","text":"Hello, help me with this project"}]}}
```

**Assistant message (with usage and tool calls):**
```json
{"type":"assistant","uuid":"a-001","timestamp":"2025-06-15T10:00:30Z","message":{"model":"claude-sonnet-4-20250514","role":"assistant","content":[{"type":"text","text":"I'll help you."},{"type":"tool_use","name":"Read","id":"tu-001","input":{"file_path":"/Users/test/projects/my-app/src/index.ts"}}],"usage":{"input_tokens":1500,"output_tokens":200,"cache_read_input_tokens":100,"cache_creation_input_tokens":50},"stop_reason":"tool_use"}}
```

**Tool result (user message carrying tool output):**
```json
{"type":"user","uuid":"u-002","timestamp":"2025-06-15T10:00:31Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu-001","content":"export function main() { ... }"}]}}
```

**System error:**
```json
{"type":"system","uuid":"s-001","timestamp":"2025-06-15T10:05:00Z","level":"error","slug":"overloaded","subtype":"overloaded"}
```

## 15. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vite dev server startup is slow in CI | Medium | Medium (test timeout) | `webServer.timeout: 60_000` gives ample time; Vite cold start is typically <10s |
| Fixture data drifts from real JSONL format | Low | High (tests pass but don't reflect reality) | Fixture data is derived from documented `RawJsonlMessage` type; add a validation step in test setup that parses fixtures through the real parsers |
| Recharts SVG rendering differences across environments | Medium | Low (visual differences) | E2E tests assert data presence, not pixel-perfect rendering; avoid visual regression testing for charts |
| `CLAUDE_HOME` env var conflicts with real Claude CLI | Very Low | Medium | `CLAUDE_HOME` is not a documented Claude CLI variable; if it ever becomes one, rename to `CLAUDE_DASHBOARD_DATA_DIR` |
| Module-level `CLAUDE_DIR` caching prevents env changes | Low | Medium | Documented in section 11; Playwright starts a fresh server process each run, so caching is a non-issue |
| Flaky tests due to animation/loading states | Medium | Low | Use Playwright's auto-waiting; add explicit `waitForSelector` for lazy-loaded content; use `networkidle` state for page loads |
| E2E tests slow down CI pipeline | Low | Low | E2E runs in parallel with other jobs (typecheck, test, build); Chromium-only keeps execution under 2 minutes |
| Settings tests write to filesystem | Low | Medium | Settings writes go to `~/.claude-dashboard/settings.json` (separate from `CLAUDE_HOME`); in CI this is harmless; for isolation, could mock or set `HOME` env var |

### Risk: Settings writes not isolated

The `settings.server.ts` uses `os.homedir()` directly for the settings directory (not `CLAUDE_HOME`), so settings save operations in E2E tests would write to the actual home directory. For the initial implementation this is acceptable because:

1. Settings are stored in `~/.claude-dashboard/` (not `~/.claude/`), so no data corruption risk.
2. In CI, the home directory is ephemeral.
3. Settings tests can be limited to read-only assertions (verify UI renders, tier selector works) without actually saving.

If full settings write isolation is needed in the future, the `getSettingsPath()` function can be similarly updated to respect an env var.

## 16. Future Considerations

- **Visual regression testing:** Could add Playwright visual comparisons for chart rendering using `toHaveScreenshot()`. Deferred to avoid maintenance burden.
- **Firefox/WebKit:** Additional browser targets can be added to the Playwright config if cross-browser issues are reported. Not needed for a local developer tool.
- **Performance testing:** Playwright can measure page load times. Could add assertions like "sessions page loads under 3s" once baseline is established.
- **Fixture generation script:** If fixture maintenance becomes tedious, create a script that generates JSONL fixtures from a declarative spec. Deferred until fixture count grows beyond 5-6 files.
