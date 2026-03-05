---
name: typescript-rules
description: TypeScript coding conventions
user_invocable: false
---

# TypeScript Rules

## Types
- Never use `any` — use `unknown` with type guards or explicit types
- Prefer `interface` for object shapes, `type` for unions/intersections
- Export types alongside their functions, not from barrel files
- Use `satisfies` for type-safe object literals: `const x = { ... } satisfies Config`

## Imports
- Use `@/` path alias for imports from `apps/web/src/`
- Group imports: external libs → `@/lib/` → relative slice imports
- Use `type` imports for type-only: `import type { Foo } from './types'`

## Architecture Boundaries (enforced by automated tests)
These rules are verified by architecture tests in `src/__tests__/architecture/`. Violations will fail CI.

### Cross-feature imports
- Never import from another feature's internals (`domain/`, `infra/`, `api/`, `hooks/`, `ui/`)
- Cross-slice imports go through the `model.ts` facade only: `import { AgentCard } from '@/features/registry/model'`
- Each slice's `model.ts` re-exports its public API (types, hooks, helpers other slices need)

### SDK isolation
- `@supabase/supabase-js` and `@supabase/ssr` — only in `src/lib/supabase/`
- `@a2a-js/sdk` — only in `src/lib/a2a/`, `src/lib/a2a-dispatch/`, `src/lib/a2a-server/`
- `@xenova/transformers` — only in `src/lib/routing/`
- Feature code accesses SDKs through `@/lib/` adapters, never directly

### Domain purity (core slices: chat, inspector, registry, tasks)
- `domain/` files contain only types, ports, and value objects — no infrastructure imports
- `domain/` must NOT import from `infra/`, `api/`, `hooks/`, or any SDK package
- `infra/` implements domain ports — it imports from its own slice's `domain/` only
- `lib/` modules must NOT import from `src/features/`

### File naming
- Hook files in `hooks/` must start with `use` prefix (e.g., `useAgents.ts`)
- Server function files in `api/` use camelCase (e.g., `getAgents.ts`, `cancelTask.ts`)
- Domain files use standard names: `types.ts`, `ports.ts`, `values.ts`, `errors.ts`
- Test files live in `__tests__/` directories, co-located with source

## Error Handling
- Throw typed errors, not strings: `throw new Error('message')`
- Use discriminated unions for result types: `{ ok: true; data: T } | { ok: false; error: string }`
- Catch `unknown`, narrow with `instanceof`

## Functions
- Prefer named function declarations over arrow functions for top-level exports
- Use explicit return types on exported functions
- Keep functions small — max ~50 lines

## Zod
- Validate all external input (API responses, form data, URL params) with Zod
- Co-locate schemas with server functions, not in separate schema files
- Use `z.infer<typeof schema>` for derived types
