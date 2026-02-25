# Noridoc: sessions

Path: @/apps/web/src/features/sessions

### Overview

- Vertical slice for the session list view, handling server-side scanning, pagination/filtering, and the card-based UI for browsing all Claude Code sessions
- Data flows from `~/.claude/projects/` through the scanner (`@/apps/web/src/lib/scanner/session-scanner`) -> server functions -> React Query -> `SessionList` -> `SessionCard` components
- Provides active session detection shared by other features

### How it fits into the larger codebase

- The route at `@/apps/web/src/routes/_dashboard/sessions/index.tsx` renders `SessionList`, which is the primary consumer of this feature slice
- `sessions.server.ts` exposes three server functions: `getSessionList` (all sessions), `getActiveSessionList` (active only, fast-polling), and `getPaginatedSessions` (filtered/paginated)
- `SessionCard` links to the session detail route at `@/apps/web/src/routes/_dashboard/sessions/$sessionId.tsx`, passing `sessionId` and `projectPath` as route params/search
- `useIsSessionActive` is consumed by the session detail feature (`@/apps/web/src/features/session-detail/`) to adjust query refetch intervals
- Privacy mode support comes from `@/apps/web/src/features/privacy/PrivacyContext`, applied to project names, branches, and paths in the card display

### Core Implementation

- **SessionList** merges two queries: a paginated session query (30s refetch) and an active sessions query (3s refetch), combining them so active status stays current even when the paginated data is stale
- **SessionCard** renders a clickable card with project name, branch, duration/timer, message count, model, file size, and a truncated 8-character session ID. The session ID uses `sessionId.slice(0, 8)` for compact display in the metadata row
- **Pagination logic** in `sessions.server.ts` (`paginateAndFilterSessions`) applies search (substring match on projectName/branch/sessionId/cwd), status filter, and project filter before slicing to the requested page
- **Page size preference** is persisted to localStorage via `usePageSizePreference` and applied on mount with URL-param-takes-priority semantics

### Things to Know

- The search filter in `paginateAndFilterSessions` matches against `sessionId`, which means users can search for sessions by their UUID
- Active session merging in `SessionList` uses a `Set` of active session IDs to override `isActive` on stale paginated results, preventing active sessions from appearing inactive between paginated refetches

Created and maintained by Nori.
