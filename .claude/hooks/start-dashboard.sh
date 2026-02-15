#!/bin/bash

# Auto-start claude-session-dashboard on session start
# Runs in background, logs to $HOME/.claude/dashboard.log
# Idempotent: exits silently if already running

set -e

LOG_FILE="$HOME/.claude/dashboard.log"

# Check if port 3000 is already in use
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  # Dashboard already running, exit silently
  exit 0
fi

# Start dashboard in background, detached
nohup npx claude-session-dashboard --open >> "$LOG_FILE" 2>&1 &
disown

# Exit immediately (hook must complete within 5s timeout)
exit 0
