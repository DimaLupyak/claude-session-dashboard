# Architect Agent Memory

## Project Structure
- All source code in `apps/web/src/`
- Features: `features/sessions/`, `features/session-detail/`, `features/stats/`, `features/privacy/`, `features/cost-estimation/`, `features/settings/`
- Shared: `lib/parsers/`, `lib/scanner/`, `lib/utils/`, `components/`
- Routes: file-based under `routes/_dashboard/`
- Import alias: `@/` -> `apps/web/src/`

## Established Patterns
- **Server functions**: `createServerFn({ method: 'GET' })` in `*.server.ts`
- **Queries**: `queryOptions()` in `*.queries.ts`, consumed via `useQuery()`
- **Validation**: Zod schemas for route search params and server fn inputs
- **Styling**: Dark theme cards use `rounded-xl border border-gray-800 bg-gray-900/50 p-4`
- **No database**: filesystem reads only, in-memory mtime caches
- **Dashboard never writes to `~/.claude/`** -- only reads
- **Recharts colors**: `COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1']` in ModelUsageChart
- **Model name display**: `model.replace(/^claude-/, '').split('-202')[0]` strips prefix and date suffix

## Types Location
- Core types in `lib/parsers/types.ts` (SessionSummary, SessionDetail, TokenUsage, etc.)
- Stats types use Zod schemas in same file
- Cost types in `features/cost-estimation/cost-estimation.types.ts`

## Design Doc Format
- See `docs/designs/pagination-sessions.md` for reference format
- Sections: Problem Statement, Decisions, Architecture (ASCII diagrams), Data Flow, File Plan, Risks

## Key Technical Details
- Session JSONL files log model IDs with date suffix: `claude-sonnet-4-20250514`
- SessionDetail.totalTokens is aggregate; tokensByModel has per-model breakdown
- Context window hardcoded to 200K in session-parser.ts `getContextLimit()`
- AppShell NAV_ITEMS array controls sidebar navigation
- **DailyModelTokensSchema**: `{ date: string, tokensByModel: Record<string, number> }` -- flat total tokens per model, NOT per-category breakdown
- **SessionSummary lacks**: tokensByModel, toolFrequency (only available in SessionDetail which requires full JSONL parse)
- **activeSessionsQuery** already polls at 3s -- reuse for any real-time feature
- `scanAllSessions()` returns mtime-cached results -- safe to call frequently
- Cost estimation uses `normalizeModelId()` from settings.types to match pricing table
