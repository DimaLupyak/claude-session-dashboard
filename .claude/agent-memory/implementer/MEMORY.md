# Implementer Agent Memory

## TanStack Start Server Functions (this project)

- This project uses `@tanstack/react-start@^1.159.5` which has `.inputValidator()` NOT `.validator()` for server function input validation.
- Pattern: `.inputValidator((input: TypeHere) => input)` followed by `.handler(async ({ data }) => { ... })`
- See `features/session-detail/session-detail.server.ts` as the reference example.

## TanStack Router Search Params

- Use Zod schema with `validateSearch` in route definitions.
- `.catch()` on each field ensures invalid URL params fall back to defaults without errors.
- Components access params via `Route.useSearch()` (import Route from the route file).
- Navigate with search param updates: `navigate({ to: '/path', search: (prev) => ({ ...prev, key: value }) })`.

## Project Quality Gates

- Only `npm run typecheck` and `npm run build` are available (no lint script configured).
- Run from `apps/web/` directory.

## Key Patterns

- Import alias: `@/` maps to `apps/web/src/`
- Dark theme conventions in `.claude/skills/uiux/SKILL.md`
- Vertical Slice Architecture: each feature in `features/<name>/` with `*.server.ts`, `*.queries.ts`, and components
- `keepPreviousData` from `@tanstack/react-query` is available and works for pagination smooth transitions
