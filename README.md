# Claude Session Dashboard

[![CI](https://github.com/dlupiak/claude-session-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/dlupiak/claude-session-dashboard/actions/workflows/ci.yml)
[![CodeQL](https://github.com/dlupiak/claude-session-dashboard/actions/workflows/codeql.yml/badge.svg)](https://github.com/dlupiak/claude-session-dashboard/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/dlupiak/claude-session-dashboard)](https://securityscorecards.dev/viewer/?uri=github.com/dlupiak/claude-session-dashboard)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12094/badge)](https://www.bestpractices.dev/projects/12094)
[![codecov](https://codecov.io/gh/dlupiak/claude-session-dashboard/graph/badge.svg)](https://codecov.io/gh/dlupiak/claude-session-dashboard)
[![Socket](https://img.shields.io/badge/Socket-secured-green?logo=socket.dev)](https://socket.dev/npm/package/claude-session-dashboard)
[![npm version](https://img.shields.io/npm/v/claude-session-dashboard)](https://www.npmjs.com/package/claude-session-dashboard)
[![npm downloads](https://img.shields.io/npm/dm/claude-session-dashboard)](https://www.npmjs.com/package/claude-session-dashboard)
[![Node.js](https://img.shields.io/node/v/claude-session-dashboard)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

See exactly where your context window goes. Trace every agent delegation. Understand how your Claude Code workflows actually execute — all from your local `~/.claude`, no data sent anywhere.

```bash
npx claude-session-dashboard
```

## Why?

If you run Claude Code with agentic workflows and custom skills, you've probably felt this: sessions that start sharp and gradually get worse. Claude repeating itself, missing earlier context, giving shallower answers. The context window is filling up silently and you have no way to see it.

The fix is agent delegation — each subagent starts with a fresh context, keeping your main session lean. But most people do this by instinct, not by design. You can't optimize what you can't see.

This dashboard makes it visible. It reads your local session files, parses the JSONL logs, and shows you what's actually happening inside your workflows — which agents were dispatched, in what order, how much context each step consumed, and where your tokens are going.

Everything runs entirely on your machine. Read-only — it never modifies any Claude Code data.

## Features

**Agent delegation timeline** ← the unique one
- Gantt-style diagram showing every subagent dispatch in a session, in sequence
- See the full delegation chain: which agents ran, in what order, how long each took
- Token usage per agent — understand exactly how each delegation affects context consumption
- Zoom controls for detailed inspection of complex multi-agent workflows

**Context window visualization**
- Live breakdown of how your 200K context window is being used: input, output, cache reads, cache writes
- See at a glance whether your main session is staying lean or accumulating context
- Per-session and per-agent cost estimates with per-model and per-category breakdowns

![Session Detail](screenshots/session-detail-full.png)

**Session browsing and search**
- Full-text search across session names, projects, and branches
- Filter by status (active / completed), project, model, and date range
- Sortable columns with pagination
- Active session indicator with real-time status polling

**Analytics and stats**
- GitHub-style contribution heatmap showing token usage intensity over the past year
- Token usage over time -- stacked area chart with daily/weekly toggle, top 5 models + "Other"
- Model usage distribution across all sessions
- Hourly activity distribution chart
- Aggregate metrics: total sessions, messages, tokens, estimated cost

![Stats Overview](screenshots/stats-overview-full.png)

**Per-project analytics**
- Dedicated "Projects" tab with sortable table
- Sessions, messages, tokens, and duration aggregated per project
- Drill-down links to filtered session lists

![Per-Project Analytics](screenshots/stats-projects.png)

**Cost estimation**
- Configurable API pricing per model (Claude Sonnet 4, Opus 4, Haiku, etc.)
- Subscription tier support (Free, Pro, Max 5x/20x) with appropriate rate adjustments
- Settings persisted to `~/.claude-dashboard/settings.json`

![Settings Page](screenshots/settings-page.png)

**Data export**
- Export stats and session data in CSV or JSON format
- Four export formats: session summaries, model usage, daily activity, project analytics
- Client-side export -- no server round-trip needed

**Real-time monitoring**
- Active sessions badge in the sidebar with 3-second status polling
- Active session banner on detail pages with adaptive refresh intervals
- Automatic data refresh for in-progress sessions

**Privacy mode**
- Toggle to anonymize project names, file paths, branch names, and usernames
- Analytics data anonymized consistently across all views
- Safe for screenshot sharing and presentations

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

### From source

```bash
git clone https://github.com/dlupiak/claude-session-dashboard.git
cd claude-session-dashboard/apps/web
npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Updating

**npx** — always fetches the latest published version automatically. No action needed.

**Global install** — check your current version and update:

```bash
claude-dashboard --version           # see current version
npm install -g claude-session-dashboard@latest
```

**From source** — pull the latest changes and rebuild:

```bash
cd claude-session-dashboard
git pull
cd apps/web && npm install && npm run build
```

## CLI Options

```
  -p, --port <number>   Port to listen on (default: 3000)
  --host <hostname>     Host to bind to (default: localhost)
  -o, --open            Open browser after starting
  -v, --version         Show version number
  -h, --help            Show this help message
```

> **Note:** The dashboard runs entirely on localhost and only reads files from `~/.claude`. It never modifies any Claude Code data and never sends data over the network.

## Tech Stack

- [TanStack Start](https://tanstack.com/start) -- SSR framework on Vite
- [TanStack Router](https://tanstack.com/router) -- file-based routing with type-safe search params
- [TanStack Query](https://tanstack.com/query) -- data fetching with caching and automatic background refetch
- [Tailwind CSS v4](https://tailwindcss.com/) -- utility-first styling with CSS-first configuration
- [Recharts](https://recharts.org/) -- composable charting library for timeline, heatmap, and stats visualizations
- [Zod](https://zod.dev/) -- runtime validation for server functions and URL params
- Node.js >= 18

## Project Structure

```
apps/web/src/
  routes/                        # File-based routes (TanStack Router)
    _dashboard/
      sessions/
        index.tsx                # Sessions list page
        $sessionId.tsx           # Session detail page
      stats.tsx                  # Stats + per-project analytics page
      settings.tsx               # Settings page
  features/                      # Vertical Slice Architecture
    sessions/                    # Session list, filters, active badge
    session-detail/              # Session detail, timeline, context window
    stats/                       # Activity chart, heatmap, token trends, model usage
    project-analytics/           # Per-project aggregated metrics
    cost-estimation/             # Cost calculation and display
    settings/                    # Subscription tier, pricing editor
    privacy/                     # Privacy mode toggle and anonymization
  lib/
    scanner/                     # Filesystem scanner for ~/.claude
    parsers/                     # JSONL session file parsers
    cache/                       # Persistent disk cache (heatmap data)
    utils/                       # Formatting, export utilities
  components/                    # Shared UI components (ExportDropdown, etc.)
```

## How It Works

1. **Scanning** -- The server reads `~/.claude/projects/` to discover all session `.jsonl` files. An mtime-based cache avoids re-parsing unchanged files.
2. **Parsing** -- Session files are parsed to extract metadata (project, branch, duration, model), tool calls, agent dispatches, token usage, and errors.
3. **Server Functions** -- TanStack Start server functions (`createServerFn`) expose parsed data to the client via type-safe RPC. All file I/O stays on the server.
4. **React Query** -- The UI fetches data through React Query with automatic background refetch for live updates. Active sessions use adaptive polling intervals.
5. **Caching** -- Parsed session summaries and heatmap data are cached in memory (mtime-based invalidation) and on disk (`~/.claude-dashboard/cache/`) for fast startup.

## Development

```bash
cd apps/web

npm run dev          # Dev server on localhost:3000
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run test         # Unit tests (Vitest)
npm run e2e          # End-to-end tests (Playwright)
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and conventions. Check [good first issues](https://github.com/dlupiak/claude-session-dashboard/labels/good%20first%20issue) for beginner-friendly tasks.

If you find this project useful, consider giving it a star -- it helps others discover it.

## Links

- [GitHub](https://github.com/dlupiak/claude-session-dashboard)
- [npm](https://www.npmjs.com/package/claude-session-dashboard)
- [Issues](https://github.com/dlupiak/claude-session-dashboard/issues)
- [Discussions](https://github.com/dlupiak/claude-session-dashboard/discussions)

## License

MIT
