# Noridoc: sessions routes

Path: @/apps/web/src/routes/_dashboard/sessions

### Overview

- File-based TanStack Router routes for the sessions section of the dashboard
- Contains the session list page (`index.tsx`) and the session detail page (`$sessionId.tsx`)
- These routes are thin wrappers that validate URL params/search and compose feature-slice components

### How it fits into the larger codebase

- Lives under the `_dashboard` layout route, which provides the shared dashboard shell
- `index.tsx` renders `SessionList` from `@/apps/web/src/features/sessions/`
- `$sessionId.tsx` composes panels from `@/apps/web/src/features/session-detail/` (ContextWindowPanel, ToolUsagePanel, ErrorPanel, AgentDispatchesPanel, TasksPanel, TimelineEventsChart, SkillInvocationsPanel, SessionIdDisplay) and `@/apps/web/src/features/cost-estimation/` (CostEstimationPanel, CostSummaryLine)
- Search params are validated with Zod schemas: the list page accepts `page`, `pageSize`, `search`, `status`, and `project`; the detail page accepts `project`

### Core Implementation

- **Session list route** (`index.tsx`): Validates search params via `sessionsSearchSchema` with defaults (page 1, pageSize 5, empty search, status "all", empty project), then renders `SessionList`
- **Session detail route** (`$sessionId.tsx`): Extracts `sessionId` from URL params and `project` from search params. Fetches `SessionDetail` via `sessionDetailQuery`, computing duration from first/last turn timestamps. The header displays project name, branch, datetime, duration, turn count, cost summary, model badges, an export dropdown, and the full session UUID with a copy button (`SessionIdDisplay`)

### Things to Know

- The detail page uses `useIsSessionActive` to drive both an `ActiveSessionBanner` and the refetch interval of the detail query -- active sessions poll at 5s
- Privacy mode (from `@/apps/web/src/features/privacy/PrivacyContext`) is applied in both routes to anonymize project names and branches

Created and maintained by Nori.
