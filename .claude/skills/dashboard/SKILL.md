---
name: dashboard
description: Open the Claude Session Dashboard in the browser. Starts it first if not already running.
user_invocable: true
---

# Open Dashboard

## Steps

### 1. Check if dashboard is running

Run: `lsof -i :3000 -sTCP:LISTEN`

- If output is non-empty → dashboard is already running, skip to step 3
- If empty → go to step 2

### 2. Start the dashboard

Run in background:

```bash
nohup npx claude-session-dashboard --port 3000 >> "$HOME/.claude/dashboard.log" 2>&1 & disown
```

Wait a few seconds for it to start, then verify it's up:

```bash
npx wait-on http://localhost:3000 --timeout 15000 2>/dev/null || sleep 5
```

### 3. Open in browser

```bash
open http://localhost:3000
```

Report to the user that the dashboard is open at http://localhost:3000.
