# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A read-only, local-only observability dashboard for Claude Code sessions. It scans `~/.claude` to detect active/historical sessions, parse JSONL logs, and display session details, tool usage, token consumption, and aggregate stats. **Must never modify any files in `~/.claude`.** There is no deployment target — this runs on localhost only.

## Commands

All commands run from `apps/web/`:

```bash
cd apps/web
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build (output in .output/)
npm run start        # Run production build
npm run typecheck    # TypeScript type checking (tsc --noEmit)
```

No monorepo tooling — `apps/web` is the only package with its own `package-lock.json`.

## Missing Tooling

No linter, test runner, or formatter is configured yet. CI (`.github/workflows/ci.yml`) is stubbed and has no active jobs — when jobs are added, it should only run lints.

## Architecture

**Tech stack:** TanStack Start (SSR framework on Vite), TanStack Router (file-based routing), TanStack React Query, Tailwind CSS v4, Recharts, Zod.

### Data Flow

```
~/.claude/projects/*/*.jsonl  ──►  Scanner  ──►  Parsers  ──►  Server Functions  ──►  React Query  ──►  UI
~/.claude/stats-cache.json    ──►  stats-parser  ──►  ...
~/.claude/history.jsonl       ──►  history-parser  ──►  ...
```

Server functions (`createServerFn`) in `*.server.ts` files run server-side and are called from React Query hooks defined in `*.queries.ts` files. No database — all state is derived from filesystem reads with in-memory mtime-based caches.

### Key Layers

- **`lib/scanner/`** — Discovers projects and session files under `~/.claude/projects/`, detects active sessions via mtime + lock directory presence (2-minute threshold)
- **`lib/parsers/`** — Parses JSONL session files (head/tail sampling for summaries, full stream for detail), `stats-cache.json` (Zod-validated), and `history.jsonl`
- **`lib/utils/`** — Path helpers (`claude-path.ts` decodes encoded directory names like `-Users-foo-bar` → `/Users/foo/bar`), formatting utilities
- **`features/`** — Vertical slices: `sessions/` (list + filters), `session-detail/` (timeline, tokens, tools, agents, errors, raw logs), `stats/` (charts)
- **`routes/`** — TanStack Router file-based routes under `_dashboard` layout; `/` redirects to `/sessions`

### Route Structure

- `/_dashboard/sessions/` — Session list with active/all filtering
- `/_dashboard/sessions/$sessionId` — Session detail view
- `/_dashboard/stats` — Aggregate usage charts from stats-cache.json

### Server Function Pattern

Each feature slice follows: `*.server.ts` (defines `createServerFn`) → `*.queries.ts` (wraps in `queryOptions` with refetch intervals) → components consume via `useQuery`.

## Conventions

- Vertical Slice Architecture — organize by feature, not by layer
- Import alias: `@/` maps to `apps/web/src/`
- Env vars: `VITE_` prefix = client-side, no prefix = server-only
- Branch naming: `feature/<STORY-ID>-description`
- Quality gates before PR: typecheck, lint, test, build (all must pass)
- Never push directly to main — always feature branches and PRs
- Tailwind v4 (CSS-first config via `@import 'tailwindcss'` in `app.css`)
- Dark theme: `bg-gray-950` body, `border-gray-800` borders, `text-gray-100` base text

## Product Spec

See `docs/claude-session-dashboard.md` for the full product specification.

## Agents

Use the Task tool to dispatch these agents:

| subagent_type | When to use |
|---------------|-------------|
| `product-owner` | Creating GitHub issues with acceptance criteria |
| `architect` | Design docs, data flow, schema design (read-only, no code) |
| `implementer` | Writing production code slice by slice |
| `reviewer` | Read-only code review after implementation |
| `qa` | Writing tests, running quality checks |
| `devops` | CI/CD pipelines, GitHub Actions |

## Task Sessions

- `CLAUDE_CODE_TASK_LIST_ID` is set per-branch via the `SessionStart` hook
- Tasks are scoped to the current feature branch — switching branches starts a fresh task list

## Browser Automation

- Use `playwright-cli` (CLI-based) instead of Playwright MCP plugin — more token-efficient
- See `.claude/skills/playwright-cli/SKILL.md` for full command reference
- Common: `playwright-cli open`, `goto`, `snapshot`, `screenshot`, `console`, `close`
