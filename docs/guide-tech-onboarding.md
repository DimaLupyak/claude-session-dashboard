# Technology Onboarding Guide

A developer reference for all technologies, patterns, and approaches used in claude-session-dashboard. Use this to understand how the codebase works and learn the tools needed to make manual changes.

---

## Table of Contents

1. [Core Framework](#1-core-framework--ssr)
2. [Routing](#2-routing)
3. [Data Fetching & State](#3-data-fetching--state-management)
4. [Styling](#4-styling)
5. [Charts](#5-charts--data-visualization)
6. [Schema Validation](#6-schema-validation)
7. [TypeScript](#7-typescript)
8. [Build Tooling](#8-build-tooling)
9. [Testing](#9-testing)
10. [Linting](#10-linting)
11. [Architecture Patterns](#11-architecture-patterns)
12. [Data Layer](#12-data-layer-custom)
13. [Deployment](#13-deployment--distribution)
14. [CI/CD](#14-cicd)

---

## 1. Core Framework & SSR

### TanStack Start v1.x

**What it is:** Full-stack React meta-framework with SSR, built on Vite. Think Next.js but with TanStack Router instead of file-system routing conventions.

**How we use it:**
- Server-side rendering for initial page loads
- `createServerFn()` for type-safe server functions (our "API layer")
- All server functions live in `*.server.ts` files

**Key files:**
- `apps/web/vite.config.ts` — plugin configuration
- `apps/web/src/router.tsx` — router factory
- `apps/web/src/routes/__root.tsx` — root layout

**Learn:**
- [TanStack Start docs](https://tanstack.com/start/latest)
- [TanStack Start quickstart](https://tanstack.com/start/latest/docs/framework/react/quick-start)
- [Server Functions guide](https://tanstack.com/start/latest/docs/framework/react/server-functions)

---

## 2. Routing

### TanStack Router v1.x

**What it is:** Type-safe, file-based routing for React. Routes are defined as files under `src/routes/` and a route tree is auto-generated.

**How we use it:**
- File-based routes in `apps/web/src/routes/`
- Auto-generated `routeTree.gen.ts` (never edit this manually)
- Layout routes: `_dashboard.tsx` wraps all dashboard pages
- Dynamic routes: `$sessionId.tsx` for session detail

**Route structure:**
```
routes/
├── __root.tsx              # Root layout (QueryClient, PrivacyProvider)
├── _dashboard.tsx          # Dashboard layout (AppShell sidebar)
├── _dashboard/
│   ├── sessions/
│   │   ├── index.tsx       # Session list page
│   │   └── $sessionId.tsx  # Session detail page
│   ├── stats.tsx           # Stats & analytics page
│   └── settings.tsx        # Settings page
└── index.tsx               # Redirect to /sessions
```

**Learn:**
- [TanStack Router docs](https://tanstack.com/router/latest)
- [File-based routing](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)
- [Route trees & nesting](https://tanstack.com/router/latest/docs/framework/react/guide/route-trees)

---

## 3. Data Fetching & State Management

### TanStack React Query v5.x

**What it is:** Async state management library. Handles fetching, caching, synchronization, and background updates for server data.

**How we use it:**
- All data fetching goes through React Query (no raw `fetch` or `useEffect`)
- `queryOptions()` defined in `*.queries.ts` files
- Polling with `refetchInterval` for real-time updates (3s for active sessions, 30s for lists)
- `keepPreviousData` for smooth pagination

**Pattern (every feature follows this):**
```
feature.server.ts   →  createServerFn() defines data fetching
feature.queries.ts  →  queryOptions() wraps server fn for React Query
Component.tsx       →  useQuery(featureQuery) or useSuspenseQuery()
```

**Key config:**
- `staleTime: 10_000` (10s) global default in `__root.tsx`
- Query keys follow `['feature', ...params]` convention

**Learn:**
- [TanStack Query docs](https://tanstack.com/query/latest)
- [queryOptions API](https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions)
- [Polling / refetchInterval](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching)
- [Pagination with keepPreviousData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)

---

## 4. Styling

### Tailwind CSS v4.x

**What it is:** Utility-first CSS framework. v4 uses CSS-first configuration (no `tailwind.config.js`).

**How we use it:**
- All styling is via Tailwind utility classes in JSX
- Theme customization in `apps/web/src/styles/app.css` using `@theme`
- Dark theme only: `bg-gray-950` body, `border-gray-800` borders
- Warm gray palette + terracotta accent color

**Key file:** `apps/web/src/styles/app.css` — theme tokens (colors, fonts)

**Design system summary:**
- Background: `bg-gray-950` (page), `bg-gray-900` (cards), `bg-gray-800` (elevated)
- Text: `text-gray-100` (primary), `text-gray-400` (secondary)
- Borders: `border-gray-800`
- Accent: `text-terracotta-400` (links), `bg-terracotta-600` (buttons)

**Learn:**
- [Tailwind CSS v4 docs](https://tailwindcss.com/docs)
- [v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) (explains CSS-first config)
- [Utility class reference](https://tailwindcss.com/docs/utility-reference)

---

## 5. Charts & Data Visualization

### Recharts v2.x

**What it is:** React charting library built on D3. Declarative, composable chart components.

**How we use it:**
- `BarChart` — daily activity, hourly distribution
- `PieChart` — model usage breakdown
- `AreaChart` — token trends over time (stacked)
- Custom heatmap — contribution heatmap (manual SVG, inspired by GitHub)

**Key files:**
- `features/stats/ActivityChart.tsx` — BarChart
- `features/stats/ModelUsageChart.tsx` — PieChart
- `features/stats/TokenTrendChart.tsx` — AreaChart
- `features/stats/HourlyDistribution.tsx` — BarChart
- `features/stats/ContributionHeatmap.tsx` — Custom SVG heatmap
- `features/session-detail/timeline-chart/` — Custom Gantt-style timeline

**Learn:**
- [Recharts docs](https://recharts.org/en-US)
- [Recharts API reference](https://recharts.org/en-US/api)
- [BarChart examples](https://recharts.org/en-US/api/BarChart)
- [AreaChart examples](https://recharts.org/en-US/api/AreaChart)

---

## 6. Schema Validation

### Zod v3.x

**What it is:** TypeScript-first schema validation library. Define a schema once, get runtime validation + TypeScript types.

**How we use it:**
- Server function input validation (`.inputValidator()`)
- Stats cache schema parsing
- Settings validation
- Type inference with `z.infer<typeof schema>`

**Key files:**
- `lib/parsers/types.ts` — core data schemas (StatsCache, DailyActivity, ModelUsage)
- `features/sessions/sessions.server.ts` — pagination input schema
- `features/settings/settings.types.ts` — settings schema

**Pattern:**
```typescript
const mySchema = z.object({ page: z.number(), size: z.number() })
type MyType = z.infer<typeof mySchema>  // TypeScript type from schema

createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => mySchema.parse(input))
  .handler(async ({ input }) => { /* input is typed */ })
```

**Learn:**
- [Zod docs](https://zod.dev)
- [Basic usage](https://zod.dev/?id=basic-usage)
- [Type inference](https://zod.dev/?id=type-inference)

---

## 7. TypeScript

### TypeScript v5.8

**How we use it:**
- Strict mode enabled
- Path alias: `@/` maps to `apps/web/src/`
- Target: ES2022, Module: ESNext, JSX: react-jsx
- All files are `.ts` or `.tsx` (no plain JS)

**Key config:** `apps/web/tsconfig.json`

**Conventions:**
- No `any` — use `unknown` and narrow with Zod or type guards
- Named exports preferred over default exports
- Interface for object shapes, type for unions/intersections

**Learn:**
- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/)
- [Strict mode explained](https://www.typescriptlang.org/tsconfig#strict)
- [Path mapping](https://www.typescriptlang.org/tsconfig#paths)

---

## 8. Build Tooling

### Vite v7.x

**What it is:** Fast build tool with native ESM dev server and Rollup-based production bundling.

**How we use it:**
- Dev server on `localhost:3000`
- HMR (Hot Module Replacement) for instant feedback
- Plugins: TanStack Start, React, Tailwind CSS, tsconfig paths

**Key file:** `apps/web/vite.config.ts`

**Learn:**
- [Vite docs](https://vite.dev/guide/)
- [Config reference](https://vite.dev/config/)

---

## 9. Testing

### Vitest (Unit Tests)

**What it is:** Vite-native test framework. Fast, with Jest-compatible API.

**How we use it:**
- Test files: `*.test.ts` / `*.test.tsx` co-located with source
- DOM environment: `happy-dom`
- Component testing with `@testing-library/react`
- Run: `cd apps/web && npm run test`

**Key files:**
- `apps/web/vitest.config.ts` — configuration
- `apps/web/src/test/setup.ts` — global setup (cleanup, mocks)
- Example tests: `lib/cache/disk-cache.test.ts`, `features/privacy/PrivacyContext.test.tsx`

**Learn:**
- [Vitest docs](https://vitest.dev/guide/)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [happy-dom](https://github.com/nicedoc/happy-dom)

### Playwright (E2E Tests)

**What it is:** Browser automation for end-to-end testing.

**How we use it:**
- E2E tests in `apps/web/e2e/tests/*.spec.ts`
- Fixture data in `apps/web/e2e/fixtures/.claude/`
- `CLAUDE_HOME` env var points to fixtures during tests
- Runs on `localhost:3001`

**Key files:**
- `apps/web/playwright.config.ts` — configuration
- `apps/web/e2e/helpers/selectors.ts` — centralized selectors

**Learn:**
- [Playwright docs](https://playwright.dev/docs/intro)
- [Writing tests](https://playwright.dev/docs/writing-tests)
- [Locators](https://playwright.dev/docs/locators)

---

## 10. Linting

### ESLint v9.x (Flat Config)

**What it is:** JavaScript/TypeScript linter. v9 uses flat config format.

**How we use it:**
- Config: `apps/web/eslint.config.js`
- Plugins: typescript-eslint, react-hooks, react-refresh
- Unused vars prefixed with `_` are allowed
- Run: `cd apps/web && npx eslint .`

**Learn:**
- [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint](https://typescript-eslint.io/)

---

## 11. Architecture Patterns

### Vertical Slice Architecture

**What it is:** Code organized by feature, not by layer. Each feature contains its own server functions, queries, components, hooks, and tests.

**How we use it:**
```
features/
├── sessions/           # Session list feature
│   ├── sessions.server.ts      # Server functions
│   ├── sessions.queries.ts     # React Query options
│   ├── SessionList.tsx          # UI components
│   ├── SessionCard.tsx
│   ├── SessionFilters.tsx
│   └── sessions.server.test.ts # Tests
├── session-detail/     # Session detail feature
├── stats/              # Analytics feature
├── settings/           # Settings feature
├── cost-estimation/    # Cost calculator feature
├── privacy/            # Privacy mode feature
└── project-analytics/  # Project metrics feature
```

**Why:** Changes to one feature don't touch other features. Each slice is self-contained.

**Learn:**
- [Vertical Slice Architecture (Jimmy Bogard)](https://www.jimmybogard.com/vertical-slice-architecture/)
- [Feature Sliced Design](https://feature-sliced.design/)

### Data Flow Pattern

Every feature follows this flow:

```
~/.claude/** (filesystem)
    ↓
Scanner (lib/scanner/) — finds and reads session files
    ↓
Parser (lib/parsers/) — extracts structured data from JSONL
    ↓
Server Function (*.server.ts) — createServerFn() wraps scanning + parsing
    ↓
Query Options (*.queries.ts) — queryOptions() wraps server fn
    ↓
Component (*.tsx) — useQuery() consumes data
```

### Two-Tier Parsing

For performance, session data is parsed at two levels:
- **Tier 1 (head/tail):** First 15 + last 15 lines of JSONL — used for session list (fast)
- **Tier 2 (full parse):** Entire JSONL file streamed — used for session detail view (complete)

### Real-Time Updates

No WebSockets — uses React Query polling:
- Active sessions badge: `refetchInterval: 3000` (3s)
- Session list: `refetchInterval: 30000` (30s)
- Adaptive polling in `useIsSessionActive`: 3s when active, 30s when not

---

## 12. Data Layer (Custom)

### Filesystem Scanner

Reads `~/.claude` directory structure to find sessions and projects. Never writes to `~/.claude`.

**Key files:**
- `lib/scanner/session-scanner.ts` — session discovery with mtime cache
- `lib/scanner/project-scanner.ts` — project directory scanning
- `lib/scanner/active-detector.ts` — detects active sessions
- `lib/utils/claude-path.ts` — path utilities, `CLAUDE_HOME` env var support

### JSONL Parsers

Claude stores session data as JSONL (JSON Lines). Custom parsers extract structured data.

**Key files:**
- `lib/parsers/session-parser.ts` — head/tail and full streaming parsers
- `lib/parsers/stats-parser.ts` — aggregated stats
- `lib/parsers/history-parser.ts` — history file parser
- `lib/parsers/types.ts` — Zod schemas + TypeScript types

### Disk Cache

Mtime-based cache with atomic writes. Prevents re-parsing unchanged files.

**Key file:** `lib/cache/disk-cache.ts`
- Location: `~/.claude-dashboard/cache/`
- Invalidation: source file mtime comparison
- Atomic writes: write to tmp → rename

---

## 13. Deployment & Distribution

### NPM Package

```bash
npx claude-session-dashboard          # Run directly
npx claude-session-dashboard --port 8080 --open  # Custom port + open browser
```

**CLI entry point:** `apps/web/bin/cli.mjs`
- Flags: `--port`, `--host`, `--open`, `--version`, `--help`
- Pre-flight check: warns if `~/.claude` not found

### Docker

```bash
docker compose up                     # Run via Docker Compose
```

**Key files:**
- `apps/web/Dockerfile` — multi-stage build (node:22-alpine)
- `docker-compose.yml` — mounts `~/.claude` as read-only volume

---

## 14. CI/CD

### GitHub Actions

**Workflows:**
- `.github/workflows/ci.yml` — typecheck, test, lint, build, e2e
- `.github/workflows/publish-npm.yml` — npm publish on release
- `.github/workflows/publish-docker.yml` — Docker image publish
- `.github/workflows/release-assets.yml` — GitHub release assets

**Learn:**
- [GitHub Actions docs](https://docs.github.com/en/actions)

---

## Quick Commands Reference

| Command | What it does |
|---|---|
| `cd apps/web && npm run dev` | Start dev server on localhost:3000 |
| `cd apps/web && npm run build` | Production build |
| `cd apps/web && npm run typecheck` | TypeScript type checking |
| `cd apps/web && npm run test` | Run unit tests (Vitest) |
| `cd apps/web && npm run test:ui` | Run tests with interactive UI |
| `cd apps/web && npx eslint .` | Run linter |
| `cd apps/web && npx playwright test` | Run E2E tests |

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `CLAUDE_HOME` | Override `~/.claude` directory path | `~/.claude` |
| `NODE_ENV` | Runtime environment | `development` |

---

## Key Libraries at a Glance

| Library | Version | Purpose | Docs |
|---|---|---|---|
| TanStack Start | v1.x | SSR framework | [tanstack.com/start](https://tanstack.com/start/latest) |
| TanStack Router | v1.x | File-based routing | [tanstack.com/router](https://tanstack.com/router/latest) |
| TanStack Query | v5.x | Data fetching/caching | [tanstack.com/query](https://tanstack.com/query/latest) |
| React | v19.x | UI library | [react.dev](https://react.dev) |
| Tailwind CSS | v4.x | Utility-first CSS | [tailwindcss.com](https://tailwindcss.com/docs) |
| Recharts | v2.x | Charts (D3-based) | [recharts.org](https://recharts.org) |
| Zod | v3.x | Schema validation | [zod.dev](https://zod.dev) |
| Vite | v7.x | Build tool / dev server | [vite.dev](https://vite.dev) |
| Vitest | v4.x | Unit testing | [vitest.dev](https://vitest.dev) |
| Playwright | v1.x | E2E testing | [playwright.dev](https://playwright.dev) |
| date-fns | v4.x | Date formatting | [date-fns.org](https://date-fns.org) |
| ESLint | v9.x | Linting | [eslint.org](https://eslint.org) |
| TypeScript | v5.8 | Type safety | [typescriptlang.org](https://www.typescriptlang.org) |
