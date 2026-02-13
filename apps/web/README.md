# Claude Session Dashboard

A read-only, local observability dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions. Scans your `~/.claude` directory to visualize session details, tool usage, agent dispatches, token consumption, and execution timelines.

## Usage

```bash
npx claude-session-dashboard
```

Or install globally:

```bash
npm install -g claude-session-dashboard
claude-dashboard
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

## Features

- **Sessions list** with search, status filters, project filters, and pagination
- **Session detail** with context window breakdown, tool usage stats, agent dispatch history
- **Cost estimation** per session and per agent based on Anthropic API pricing
- **Timeline chart** showing tool calls, agent runs, and skill invocations
- **Stats page** with aggregate metrics across all sessions
- **Live updates** for active sessions
- **Privacy mode** to anonymize paths and usernames for safe screenshot sharing

## How It Works

The dashboard runs a local server that reads `~/.claude/projects/` to discover session `.jsonl` files. It parses them to extract metadata, tool calls, agent dispatches, and token usage, then displays everything in a web UI. No data leaves your machine.

## Links

- [GitHub](https://github.com/dlupiak/claude-session-dashboard)
- [Issues](https://github.com/dlupiak/claude-session-dashboard/issues)
- [Docker](https://github.com/dlupiak/claude-session-dashboard/pkgs/container/claude-session-dashboard)

## License

MIT
