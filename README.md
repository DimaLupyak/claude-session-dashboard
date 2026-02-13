# Claude Session Dashboard

A read-only, local observability dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions. Scans your `~/.claude` directory to visualize session details, tool usage, agent dispatches, token consumption, and execution timelines.

![Sessions Page](sessions-page.png)

## Why?

Claude Code stores session data locally in `~/.claude/projects/`, but there's no built-in way to browse, search, or analyze past sessions. This dashboard gives you visibility into:

- How long sessions run and how many tokens they consume
- Which tools and agents are used most frequently
- Timeline visualization of tool calls and agent dispatches
- Context window utilization and growth patterns
- Active vs completed session status

## Features

- **Sessions list** with search, status filters, project filters, and pagination
- **Session detail** with context window breakdown, tool usage stats, agent dispatch history
- **Cost estimation** — per-session and per-agent cost estimates based on Anthropic API pricing, with per-model and per-category breakdowns (input/output/cache)
- **Settings page** — configure API pricing per model and subscription tier, stored in `~/.claude-dashboard/settings.json`
- **Timeline chart** showing tool calls, agent runs, and skill invocations on a Gantt-style timeline with zoom controls
- **Stats page** with aggregate metrics, total estimated cost, and model usage across all sessions
- **Live updates** — active sessions refresh automatically (3s polling for status, 30s for full data)
- **Privacy mode** — toggle to anonymize paths and usernames for safe screenshot sharing

![Session Detail](session-detail-full.png)

![Stats Page](stats-page.png)

![Settings Page](settings-page.png)

## Quick Start

### Using npx (recommended)

```bash
npx claude-session-dashboard
```

### Using npm (global install)

```bash
npm install -g claude-session-dashboard
claude-dashboard
```

### Using Docker

```bash
docker run -v ~/.claude:/home/node/.claude:ro -p 3000:3000 ghcr.io/nicobailon/claude-session-dashboard
```

### From Source

```bash
git clone https://github.com/nicobailon/claude-session-dashboard.git
cd claude-session-dashboard/apps/web
npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### CLI Options

```
  -p, --port <number>   Port to listen on (default: 3000)
  --host <hostname>     Host to bind to (default: localhost)
  -o, --open            Open browser after starting
  -v, --version         Show version number
  -h, --help            Show this help message
```

> **Note:** The dashboard runs entirely on localhost and only reads files from `~/.claude`. It never modifies any Claude Code data.

## Tech Stack

- [TanStack Start](https://tanstack.com/start) — SSR framework on Vite
- [TanStack Router](https://tanstack.com/router) — file-based routing with type-safe search params
- [TanStack Query](https://tanstack.com/query) — data fetching with automatic refetch
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first styling
- [Recharts](https://recharts.org/) — charting library for timeline and stats
- [Zod](https://zod.dev/) — runtime validation for server functions and URL params

## Project Structure

```
apps/web/src/
  routes/                    # File-based routes (TanStack Router)
    _dashboard/
      sessions/
        index.tsx            # Sessions list page
        $sessionId.tsx       # Session detail page
      stats.tsx              # Aggregate stats page
      settings.tsx           # Pricing & account settings page
  features/                  # Vertical Slice Architecture
    sessions/                # Sessions list feature
    session-detail/          # Session detail feature
    stats/                   # Stats feature
    cost-estimation/         # Cost calculation & display
    settings/                # Pricing config & settings persistence
  lib/
    scanner/                 # Filesystem scanner for ~/.claude
    parsers/                 # JSONL session file parsers
    utils/                   # Shared utilities
```

## How It Works

1. **Scanning** — The server reads `~/.claude/projects/` to discover all session `.jsonl` files. An mtime-based cache avoids re-parsing unchanged files.
2. **Parsing** — Session files are parsed to extract metadata (project, branch, duration, model), tool calls, agent dispatches, token usage, and errors.
3. **Server Functions** — TanStack Start server functions expose parsed data to the client via type-safe RPC.
4. **React Query** — The UI fetches data through React Query with automatic background refetch for live updates.

## Development

```bash
cd apps/web

npm run dev          # Dev server on localhost:3000
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run test         # Run tests (Vitest)
```

## License

MIT
