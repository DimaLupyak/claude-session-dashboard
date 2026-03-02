# Noridoc: session-detail

Path: @/apps/web/src/features/session-detail

### Overview

- Vertical slice for the individual session detail view, containing server data fetching, React Query integration, and all UI panels that render on the session detail page
- Data flows from `~/.claude/projects/<encoded-path>/<sessionId>.jsonl` through `session-detail.server.ts` -> `session-detail.queries.ts` -> route page and panel components
- Panels cover context window usage, tool frequency, cost estimation, agent dispatches, tasks, errors, timeline, skills, and the session resume ID display

### How it fits into the larger codebase

- The route at `@/apps/web/src/routes/_dashboard/sessions/$sessionId.tsx` composes these panels into the detail page layout and passes the `SessionDetail` type (defined in `@/apps/web/src/lib/parsers/types.ts`) into each panel
- `session-detail.server.ts` calls `parseDetail()` from `@/apps/web/src/lib/parsers/session-parser` to transform raw JSONL into a `SessionDetail` object
- `session-detail.queries.ts` wraps the server function in a `queryOptions` call with adaptive stale/refetch timing based on whether the session is active (2s stale / 5s refetch) or completed (30s stale / no refetch)
- Cost estimation panels (`CostEstimationPanel`, `CostSummaryLine`) are imported from `@/apps/web/src/features/cost-estimation/`
- Active session detection is shared from `@/apps/web/src/features/sessions/useIsSessionActive.ts`

### Core Implementation

- **Server function:** `getSessionDetail` in `session-detail.server.ts` resolves the sessionId to a JSONL file path by searching `~/.claude/projects/` directories, first by matching `projectPath`, then by exhaustive fallback search
- **Query layer:** `sessionDetailQuery()` in `session-detail.queries.ts` takes `sessionId`, `projectPath`, and `isActive` to configure React Query caching behavior
- **SessionIdDisplay component:** Renders the full session UUID with a "Copy" button that writes `claude --resume <sessionId>` to the clipboard via `navigator.clipboard.writeText()`. Uses local `useState` to show a 2-second "Copied!" confirmation

### Things to Know

- The `findSessionFile` function in `session-detail.server.ts` uses a two-pass search: first matching the provided `projectPath` against decoded directory names, then falling back to scanning all project directories for the JSONL file
- `SessionIdDisplay` copies the full `claude --resume <UUID>` command (not just the UUID) to make session resumption a single paste operation
- The route page (`$sessionId.tsx`) computes `durationMs` from the first and last turn timestamps, rather than receiving it pre-computed from the server

Created and maintained by Nori.
