# Claude Code Session Dashboard

> Observability dashboard for Claude Code execution — visualizes active sessions and running tasks by analyzing `~/.claude`.

## Objective

Create a local dashboard that:

1. Detects active Claude Code sessions
2. Identifies running and completed tasks
3. Extracts and displays:
   - Session ID
   - Session start time
   - Session duration
   - Status (running / completed / failed)
   - Agents used
   - Skills used
   - Tools used
   - Token usage (if available)
   - Errors (if present)
4. Updates automatically when `~/.claude` changes
5. Works in **read-only mode** (must NOT modify any Claude files)

## Data Source

Use the `~/.claude` directory as the single source of truth.

The application must:

- Recursively scan the directory
- Detect session-related files
- Parse logs and JSON state files
- Infer structure dynamically if format is unknown
- Gracefully handle malformed or partial files
- Identify which sessions are currently active

## Core Features

### 1. Active Sessions View

- List of currently running sessions
- Visual status indicator
- Running time counter

### 2. Historical Sessions View

- Completed / failed sessions
- Sort by date or duration

### 3. Session Details Page

- Timeline of execution events
- Agents used
- Skills used
- Tools used
- Token consumption summary
- Error messages
- Raw event log viewer

### 4. Live Updates

- Automatically detect file changes
- Update UI in real time

### 5. Filtering & Search

- Filter by status
- Filter by agent
- Filter by skill
- Search by session ID

## Architectural Requirements

- Clean separation between:
  - File scanning
  - Parsing
  - State aggregation
  - UI presentation
- Memory-based state (no database)
- Scalable to 100+ sessions
- Modular parser to support future Claude file format changes

## Output Requirements

- Single-page local web application
- No external dependencies beyond the chosen framework
- Starts with a single command
- Accessible at `localhost`
