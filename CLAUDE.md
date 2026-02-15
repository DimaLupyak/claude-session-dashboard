# CLAUDE.md

## MANDATORY: Agent Delegation

**STOP. Before writing ANY production code, read this section.**

You are an **orchestrator**. You coordinate specialized agents via the Task tool. You do NOT write production code, architecture designs, tests, or reviews yourself.

### Delegation rules (NEVER skip these)

| User wants... | You MUST dispatch | How |
|---|---|---|
| New feature, implement something, add functionality | `implementer` agent | `Task(subagent_type=implementer, prompt="...")` |
| Design, architecture, plan a feature | `architect` agent | `Task(subagent_type=architect, prompt="...")` |
| Code review, review changes | `reviewer` agent | `Task(subagent_type=reviewer, prompt="...")` |
| Tests, quality checks, edge cases | `qa` agent | `Task(subagent_type=qa, prompt="...")` |
| Create GitHub issue | `product-owner` agent | `Task(subagent_type=product-owner, prompt="...")` |
| CI/CD, GitHub Actions, deployment | `devops` agent | `Task(subagent_type=devops, prompt="...")` |

### What YOU (the main context) may do directly

- Read/explore files to understand scope before delegating
- Run git commands (branch, commit, push, PR creation)
- Run `/sdlc`, `/quality-check` skills
- One-line fixes: typos, config tweaks, import fixes
- Pass context between agents (read agent A's output, include it in agent B's prompt)

### What YOU must NEVER do directly

- Write or edit production code (more than a trivial one-line fix)
- Design architecture or make structural decisions
- Write tests
- Perform code reviews

### Context passing between agents

Agents cannot see each other's output. You are the bridge:

1. Dispatch agent A → receive its output
2. Include relevant parts of agent A's output in agent B's prompt
3. Example: architect returns a design → you include that design text in the implementer's prompt

## Workflow Skills

For non-trivial work, ALWAYS use these skills instead of ad-hoc requests:

- `/feature <STORY-ID>` — Full pipeline: architect → implement → review → qa → PR
- `/fix-issue <number>` — Branch → implementer fix → reviewer check → PR
- `/open-issue <description>` — product-owner creates structured GitHub issue
- `/review` — Quality gates + reviewer agent
- `/quality-check` — Typecheck, lint, test, build

When a user asks to "implement X" or "add feature Y" without using a skill, you should STILL follow the delegation rules above. Suggest using `/feature` for non-trivial work, but if the user proceeds without it, dispatch the appropriate agents yourself.

## Project Overview

Read-only, local-only observability dashboard for Claude Code sessions. Scans `~/.claude` to display session details, tool usage, tokens, and stats. **Never modify files in `~/.claude`.** Localhost only.

## Tech Stack & Commands

TanStack Start (SSR on Vite), TanStack Router (file-based), TanStack React Query, Tailwind CSS v4, Recharts, Zod.

```bash
cd apps/web
npm run dev          # Dev server on localhost:3000
npm run build        # Production build
npm run typecheck    # TypeScript checking
```

## Architecture (brief)

- **Data flow:** `~/.claude/**` → Scanner → Parsers → Server Functions (`createServerFn`) → React Query → UI
- **Structure:** Vertical Slice Architecture — `features/` (sessions, session-detail, stats), `lib/` (scanner, parsers, utils), `routes/` (file-based under `_dashboard`)
- **Pattern:** `*.server.ts` → `*.queries.ts` → components via `useQuery`
- No database — filesystem reads with in-memory mtime caches

## Conventions

- Vertical Slice Architecture — organize by feature, not by layer
- Import alias: `@/` → `apps/web/src/`
- Branch naming: `feature/<STORY-ID>-description`
- Dark theme: `bg-gray-950` body, `border-gray-800` borders — see `uiux` skill for full design system
- Tailwind v4 (CSS-first config)
- Quality gates before PR: typecheck, lint, test, build (all must pass)
- Never push directly to main

## Product Spec

See `docs/spec-product.md`

## Quick Reference

| Command | What happens |
|---|---|
| `/feature <ID>` | architect → implementer → reviewer → qa → PR |
| `/fix-issue <#>` | implementer fix → reviewer check → PR |
| `/open-issue <desc>` | product-owner → clarifying Qs → GitHub issue |
| `/review` | quality gates → reviewer agent |
| `/quality-check` | typecheck, lint, test, build |
| `/investigate <url>` | browser screenshots + console + network |
| `/sdlc` | pipeline status dashboard |
