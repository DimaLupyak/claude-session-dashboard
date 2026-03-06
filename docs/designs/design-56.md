# Design: Add Test Coverage Badge and Socket.dev Security Badge (#56)

## Problem Statement

The README currently displays CI, CodeQL, OpenSSF Scorecard, OpenSSF Best Practices, npm, Node.js, and License badges. Two important signals are missing:

1. **Test coverage** -- contributors and users have no visibility into how well the codebase is tested. A Codecov badge provides an at-a-glance metric and encourages maintaining coverage over time.
2. **Supply-chain security** -- Socket.dev analyzes npm packages for known vulnerabilities, typosquatting, and risky install scripts. A badge signals that the package is monitored.

Adding both badges is low-effort, high-signal work that improves project credibility with zero runtime impact.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Coverage provider | Codecov | Free for public repos, widely adopted, GitHub Action available |
| Coverage tool | `@vitest/coverage-v8` | Native Vitest integration, V8 engine-level instrumentation (faster than Istanbul) |
| Action pinning | Full commit SHA | Matches existing CI convention (all actions pinned to SHA, not version tag) |
| Badge placement | After OpenSSF Best Practices, before npm version | Groups security/quality badges together, then distribution badges |
| Socket.dev badge | Static shields.io badge | No API token needed; links to Socket.dev package page |
| Coverage report format | Default (coverage/) | Codecov auto-detects; no explicit format flag needed |

## Architecture

This feature is purely CI/CD and documentation -- no application code changes.

```
README.md  <-- add two badge lines
ci.yml     <-- modify test job (coverage flag + upload step)
package.json  <-- add @vitest/coverage-v8 devDependency
vitest.config.ts  <-- add coverage configuration
```

## Affected Files

### 1. `apps/web/package.json`

Add `@vitest/coverage-v8` to `devDependencies`:

```
"@vitest/coverage-v8": "^4.0.18"
```

Version should match the existing `vitest` version (`^4.0.18`).

### 2. `apps/web/vitest.config.ts`

Add coverage configuration to the existing config:

```
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  reportsDirectory: './coverage',
  exclude: [
    'e2e/**',
    'node_modules/**',
    'src/test/**',
    '**/*.d.ts',
    'dist/**',
    '.output/**',
  ],
}
```

The `lcov` reporter produces `coverage/lcov.info` which Codecov expects. The `text` reporter prints a summary table to CI logs for quick visibility.

### 3. `.github/workflows/ci.yml`

Modify the `test` job:

**Change the test command** from `npm run test` to `npx vitest run --coverage` to generate coverage on every CI run without changing the local `npm run test` script.

**Add Codecov upload step** after the test step:

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@671740ac38dd9b0130fbe1cec585b89eea48d3de # v5.5.2
  with:
    files: ./apps/web/coverage/lcov.info
    fail_ci_if_error: false
  env:
    CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

Key choices:
- `fail_ci_if_error: false` -- coverage upload failures should not block PRs (Codecov may have transient outages)
- `files` explicitly points to the lcov report since the working-directory default does not apply to action `with` inputs
- `CODECOV_TOKEN` is required for Codecov uploads on public repos (tokenless upload was deprecated)

### 4. `README.md`

Insert two badge lines after the OpenSSF Best Practices badge (line 7), before the npm version badge (line 8):

```markdown
[![codecov](https://codecov.io/gh/dlupiak/claude-session-dashboard/graph/badge.svg)](https://codecov.io/gh/dlupiak/claude-session-dashboard)
[![Socket](https://img.shields.io/badge/Socket-secured-green?logo=socket.dev)](https://socket.dev/npm/package/claude-session-dashboard)
```

**Resulting badge order:**
1. CI
2. CodeQL
3. OpenSSF Scorecard
4. OpenSSF Best Practices
5. **Codecov** (new)
6. **Socket.dev** (new)
7. npm version
8. npm downloads
9. Node.js
10. License

### 5. `.gitignore` (if not already present)

Ensure `coverage/` is in `.gitignore` so generated reports are not committed. Check whether it is already covered by existing patterns.

## Data Flow

```
CI test job
  |
  v
vitest run --coverage
  |
  +--> stdout (text summary in CI logs)
  +--> coverage/lcov.info (lcov report file)
        |
        v
  codecov/codecov-action
        |
        +--> uploads to Codecov API
              |
              v
        Codecov badge URL reflects latest coverage %
```

## Prerequisites

Before merging, the repository owner must:

1. **Create a Codecov account** at codecov.io and link the `dlupiak/claude-session-dashboard` repository
2. **Add `CODECOV_TOKEN`** as a GitHub repository secret (Settings > Secrets and variables > Actions)

## Task Breakdown

| Task | Complexity | Files | Dependencies |
|---|---|---|---|
| Add `@vitest/coverage-v8` dev dependency | Trivial | `apps/web/package.json` | None |
| Add coverage config to vitest | Low | `apps/web/vitest.config.ts` | Task 1 |
| Update CI test job with coverage + Codecov upload | Low | `.github/workflows/ci.yml` | Task 1 |
| Add Codecov and Socket.dev badges to README | Trivial | `README.md` | None |
| Verify `coverage/` in `.gitignore` | Trivial | `.gitignore` | None |
| **Manual:** Set up Codecov integration + repo secret | Low | GitHub Settings | Before first CI run with upload |

## Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Codecov upload fails on first run (missing token) | Badge shows "unknown" | Medium | `fail_ci_if_error: false` prevents CI breakage; document prerequisite |
| `@vitest/coverage-v8` version mismatch with vitest | Build/test failure | Low | Pin to same major version as vitest (`^4.0.18`) |
| Coverage % is initially low, badge looks bad | Perception | Low | Coverage improves over time; badge still adds transparency |
| Codecov SHA becomes outdated | No immediate impact | Low | Dependabot or manual update in future |
