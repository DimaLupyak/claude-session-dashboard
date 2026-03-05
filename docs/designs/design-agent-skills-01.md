# Design: AGENT-SKILLS-01 -- Parse Subagent JSONL Files to Detect Agent-Level Skill Invocations

## 1. Problem Statement

The dashboard currently parses main session JSONL files but completely ignores subagent JSONL files located at `~/.claude/projects/<project>/session-id/subagents/agent-*.jsonl`. These subagent files contain the full conversation of each dispatched agent, including any `Skill` tool calls the agent made during its execution.

As a result:
- Skills invoked by agents (e.g., an `architect` agent using `/database-rules` or `/tanstack-start`) are invisible
- There is no link between an agent dispatch and the specific skills it consumed
- The "Agents & Skills" panel shows agents and session-level skills as independent lists, with no way to see which agent used which skill

### Goals

1. Extract `agentId` from progress messages in the main JSONL to link `AgentInvocation` records to their subagent files
2. Scan and parse subagent JSONL files for `Skill` tool_use blocks
3. Enrich `AgentInvocation` with the skills each agent used
4. Display agent-level skills in the `AgentsSkillsPanel` UI

### Non-Goals

- Reading `.claude/agents/*.md` project configuration files (only JSONL parsing)
- Parsing subagent files for token usage (already handled via progress messages in the main session)
- Creating a new vertical slice (this enriches the existing `session-detail` slice)

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Extract `agentId` from progress messages (`data.agentId`) in main JSONL | The `agentId` is the key that maps a `Task` tool_use_id to a subagent file (`agent-{agentId}.jsonl`). Progress messages already carry this field but the parser ignores it |
| Parse subagent JSONL files during `parseDetail()`, not during `parseSummary()` | Subagent parsing requires full JSONL reads, which is expensive. Summary parsing only reads head/tail lines. Subagent skills are a detail-level concern |
| Extract only `Skill` tool_use blocks from subagent files (not full parse) | Subagent files can be large. We only need to find `Skill` tool calls, so we can skip full turn/token/context analysis and do a targeted single-pass scan |
| Add `agentId` and `skills` fields to `AgentInvocation` type | Extending the existing type (not creating new ones) keeps the data model cohesive and avoids breaking changes |
| Add `agentId` to `RawJsonlMessage.data` type definition | The `data.agentId` field exists in real JSONL but is not in the TypeScript type. Fixing this enables type-safe extraction |
| Build subagent file path from known filesystem convention | `~/.claude/projects/<project-dir>/<session-id>/subagents/agent-<agentId>.jsonl` is deterministic given the project dir, session ID, and agent ID |
| Scan subagent files lazily (only when a session has agents) | Most sessions have zero agents. Avoiding unnecessary filesystem reads for sessions without `Task` tool calls |
| Do NOT modify the scanner or summary layer | This change is isolated to the parser and UI. The scanner (`session-scanner.ts`, `project-scanner.ts`) does not need to know about subagent files since they are accessed on-demand during detail parsing |

---

## 3. Architecture

### 3.1 Current Flow (Before)

```
~/.claude/projects/<project>/<session-id>.jsonl
        |
        v
  parseDetail()  (session-parser.ts)
        |
        +-- Extracts Task tool_use blocks --> AgentInvocation[]
        +-- Extracts Skill tool_use blocks --> SkillInvocation[]
        +-- Tracks agent tokens from progress messages
        |
        v
  SessionDetail { agents, skills }
        |
        v
  AgentsSkillsPanel.tsx
    - Agents list (no link to skills)
    - Skills list (no link to agents)
```

### 3.2 New Flow (After)

```
~/.claude/projects/<project>/<session-id>.jsonl
        |
        v
  parseDetail()  (session-parser.ts)
        |
        +-- Extracts Task tool_use blocks --> AgentInvocation[]
        +-- Extracts agentId from progress messages (NEW)
        |       maps: parentToolUseID -> agentId
        |
        +-- Extracts Skill tool_use blocks --> SkillInvocation[]
        +-- Tracks agent tokens from progress messages
        |
        v
  Post-parse enrichment (NEW)
        |
        +-- For each agent with an agentId:
        |     Build path: <project-dir>/<session-id>/subagents/agent-<agentId>.jsonl
        |     If file exists:
        |       parseSubagentSkills(filePath)
        |         - Stream through JSONL lines
        |         - Extract Skill tool_use blocks only
        |         - Return SkillInvocation[]
        |     Attach skills to agent.skills
        |
        v
  SessionDetail { agents (with skills), skills }
        |
        v
  AgentsSkillsPanel.tsx  (MODIFIED)
    - Agent detail rows now show skill badges
    - Skills section shows all skills (session-level + agent-level)
    - Agent-level skills are attributed: "via architect"
```

### 3.3 Subagent File Discovery

```
Given:
  projectDir  = "-Users-foo-myproject"     (from findSessionFile)
  sessionId   = "ee5cde66-abc1-..."
  agentId     = "a0c69b2"                  (from progress message)

Path construction:
  ~/.claude/projects/-Users-foo-myproject/ee5cde66-abc1-.../subagents/agent-a0c69b2.jsonl

Filesystem layout:
  ~/.claude/projects/-Users-foo-myproject/
  +-- ee5cde66-abc1-....jsonl              (main session file)
  +-- ee5cde66-abc1-.../                   (session directory)
      +-- subagents/
          +-- agent-a0c69b2.jsonl          (subagent file)
          +-- agent-a2b1bed.jsonl
          +-- agent-a5cd4e6.jsonl
```

---

## 4. Type Changes

### 4.1 `RawJsonlMessage` -- Add `data.agentId`

**File:** `apps/web/src/lib/parsers/types.ts`

The `data` field needs an `agentId` property to capture the agent ID from progress messages:

```
data?: {
    type?: string
    agentId?: string        // <-- NEW: present when type === 'agent_progress'
    message?: {
      ...existing...
    }
  }
```

### 4.2 `AgentInvocation` -- Add `agentId` and `skills`

**File:** `apps/web/src/lib/parsers/types.ts`

```
export interface AgentInvocation {
  subagentType: string
  description: string
  timestamp: string
  toolUseId: string
  agentId?: string              // <-- NEW: extracted from progress messages
  skills?: SkillInvocation[]    // <-- NEW: skills used by this agent
  tokens?: TokenUsage
  totalTokens?: number
  totalToolUseCount?: number
  durationMs?: number
  model?: string
  toolCalls?: Record<string, number>
}
```

### 4.3 `AgentLaneData` -- Add `skills` for timeline

**File:** `apps/web/src/features/session-detail/timeline-chart/timeline-types.ts`

```
export interface AgentLaneData {
  ...existing fields...
  skills?: Array<{ skill: string; args: string | null }>  // <-- NEW
}
```

---

## 5. Parser Changes

### 5.1 Extract `agentId` from Progress Messages

**File:** `apps/web/src/lib/parsers/session-parser.ts`

In the existing progress message handling block (around line 149), add extraction of `data.agentId`:

```
// Inside the progress message handler block:
if (msg.type === 'progress' && msg.parentToolUseID) {
    const parentId = msg.parentToolUseID

    // NEW: Extract agentId from progress messages
    const progressAgentId = msg.data?.agentId
    if (progressAgentId && parentId) {
        agentIdByToolUseId.set(parentId, progressAgentId)
    }

    ...existing token/tool tracking...
}
```

A new `Map<string, string>` called `agentIdByToolUseId` tracks the mapping from `parentToolUseID` (which equals the Task tool_use_id) to the `agentId`.

### 5.2 New Function: `parseSubagentSkills`

**File:** `apps/web/src/lib/parsers/session-parser.ts`

A targeted, lightweight parser that reads a subagent JSONL file and extracts only `Skill` tool_use blocks:

```
Purpose:
  - Stream-parse a subagent JSONL file line by line
  - Look for assistant messages with tool_use blocks where name === 'Skill'
  - Extract skill name, args, timestamp, toolUseId
  - Return SkillInvocation[]

Signature:
  async function parseSubagentSkills(filePath: string): Promise<SkillInvocation[]>

Performance:
  - Uses readline stream (same pattern as parseDetail)
  - Only extracts Skill blocks, skips all other processing
  - Early exit not possible (skills could appear anywhere)
  - Expected file sizes: typically 100KB-5MB per subagent
```

### 5.3 Enrichment Phase in `parseDetail`

**File:** `apps/web/src/lib/parsers/session-parser.ts`

After the main JSONL parsing loop and the existing agent stats merge (around line 403-417), add a new enrichment phase:

```
Phase: Subagent skill enrichment (runs after main loop)

For each agent in agents[]:
  1. Look up agentId from agentIdByToolUseId map
  2. If agentId exists:
     a. Set agent.agentId = agentId
     b. Construct subagent file path:
        <sessionDir>/subagents/agent-<agentId>.jsonl
        where sessionDir = filePath.replace('.jsonl', '')
     c. Check if subagent file exists (fs.existsSync)
     d. If exists: agent.skills = await parseSubagentSkills(subagentFilePath)
     e. If not exists: agent.skills remains undefined
```

### 5.4 `parseDetail` Signature Change

The `parseDetail` function signature does NOT change. The subagent file path is derived from the main session file path:

```
Main session: /path/to/projects/<project-dir>/<session-id>.jsonl
Session dir:  /path/to/projects/<project-dir>/<session-id>/
Subagent:     /path/to/projects/<project-dir>/<session-id>/subagents/agent-<agentId>.jsonl
```

The session directory path is computed by stripping `.jsonl` from `filePath`.

---

## 6. Data Flow

### 6.1 End-to-End Data Flow

```
User navigates to /sessions/<id>
        |
        v
sessionDetailQuery -> getSessionDetail()
        |
        v
findSessionFile(sessionId, projectPath)
  returns { path: ".../projects/<dir>/<session-id>.jsonl", dirName: "<dir>" }
        |
        v
parseDetail(filePath, sessionId, projectPath, projectName)
        |
        +-- Phase 1: Stream main JSONL
        |     - Extract Task tool_use -> AgentInvocation[]
        |     - Extract Skill tool_use -> SkillInvocation[] (session-level)
        |     - Track progress messages:
        |         agentIdByToolUseId: Map<toolUseId, agentId>
        |         agentProgressTokens, agentProgressToolCalls, agentProgressModel
        |
        +-- Phase 2: Merge agent stats (existing)
        |     - Attach tokens, toolCalls, model to each agent
        |
        +-- Phase 3: Subagent skill enrichment (NEW)
        |     For each agent:
        |       agentId = agentIdByToolUseId.get(agent.toolUseId)
        |       if agentId:
        |         subagentPath = filePath.replace('.jsonl', '') +
        |                        '/subagents/agent-' + agentId + '.jsonl'
        |         if fs.existsSync(subagentPath):
        |           agent.skills = await parseSubagentSkills(subagentPath)
        |         agent.agentId = agentId
        |
        +-- Phase 4: Build SessionDetail (existing)
              Return { agents (now with skills), skills, ... }
        |
        v
React Query cache
        |
        v
AgentsSkillsPanel receives { agents, skills }
  - Each agent row shows its skills as badges
  - Session-level skills still shown in "Skill Invocations" section
```

### 6.2 Subagent JSONL Message Format

Subagent JSONL files contain standard messages with additional fields:

```json
{
  "parentUuid": "1b5dda15...",
  "isSidechain": true,
  "agentId": "a0c69b2",
  "sessionId": "ee5cde66-...",
  "type": "assistant",
  "timestamp": "2026-02-16T10:30:00Z",
  "message": {
    "role": "assistant",
    "model": "claude-sonnet-4-20250514",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01ABC...",
        "name": "Skill",
        "input": {
          "skill": "database-rules",
          "args": null
        }
      }
    ]
  }
}
```

The `parseSubagentSkills` function uses the same `safeParse` helper and the same `Skill` extraction logic already in `parseDetail`, but scoped to a single file and a single purpose.

---

## 7. UI Changes

### 7.1 AgentsSkillsPanel Modifications

**File:** `apps/web/src/features/session-detail/AgentsSkillsPanel.tsx`

#### Agent Detail Rows -- Inline Skill Badges

Each agent row in the "Agent Dispatches" section will show skill badges if the agent has skills:

```
Current agent row layout:
  [architect]  [sonnet-4]  "Design database schema..."   42K tokens  ~$0.03  12 tools  2m30s  10:15:23

New agent row layout:
  [architect]  [sonnet-4]  "Design database schema..."   42K tokens  ~$0.03  12 tools  2m30s  10:15:23
               [/database-rules] [/tanstack-start]        <-- NEW: skill badges below the row
```

The skill badges use the same amber color scheme as session-level skill badges (`bg-amber-500/15 text-amber-300`) but are rendered at a slightly smaller size (`text-[9px]`) to differentiate from the agent type badge.

#### Skills Summary Section -- Attribution

The "Skills" summary section at the top can optionally show which agent invoked each skill:

```
Current:
  Skills
    [/database-rules x2]  [/tanstack-start x1]

New (union of session-level + agent-level):
  Skills
    [/database-rules x2]  [/tanstack-start x1]  [/uiux x1]
```

The skill counts in the summary should aggregate both session-level skills AND agent-level skills for a complete picture.

#### Skill Invocations Section -- Attribution Labels

In the detailed "Skill Invocations" list, agent-sourced skills get an attribution label:

```
Current:
  /database-rules                               10:15:30
  /tanstack-start                               10:16:45

New:
  /database-rules          via architect         10:15:30    <-- agent-sourced
  /tanstack-start          via architect         10:16:45    <-- agent-sourced
  /quality-check                                 10:20:00    <-- session-level (no attribution)
```

### 7.2 Deriving the Combined Skills List

The component receives `agents` (now with `skills`) and `skills` (session-level). To build a unified skills view:

```
allSkills = [
  ...skills.map(s => ({ ...s, source: null })),           // session-level
  ...agents.flatMap(a =>
    (a.skills ?? []).map(s => ({ ...s, source: a.subagentType }))  // agent-level
  )
].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
```

### 7.3 Timeline Chart -- Agent Lane Skill Markers

**File:** `apps/web/src/features/session-detail/timeline-chart/timeline-data.ts`

The `buildTimelineChartData` function already builds `agentLanes`. When building each `AgentLaneData`, pass through the agent's skills:

```
const agentLanes = agents.map((agent) => {
  ...existing logic...
  return {
    ...existing fields...,
    skills: agent.skills?.map(s => ({ skill: s.skill, args: s.args })) ?? [],
  }
})
```

**File:** `apps/web/src/features/session-detail/timeline-chart/TimelineEventsChart.tsx`

In the agent swim lane rendering, optionally show small skill markers within the agent's time span. These would appear as amber-colored tick marks or dots alongside the existing tool dots.

This is a nice-to-have enhancement that can be deferred to a follow-up if the basic skill badges in AgentsSkillsPanel are sufficient.

---

## 8. File Plan

### Modified Files (5)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/lib/parsers/types.ts` | Add `agentId?: string` to `data` field of `RawJsonlMessage`. Add `agentId?: string` and `skills?: SkillInvocation[]` to `AgentInvocation` |
| 2 | `apps/web/src/lib/parsers/session-parser.ts` | Add `agentIdByToolUseId` map. Extract `data.agentId` from progress messages. Add `parseSubagentSkills()` function. Add post-parse enrichment phase in `parseDetail()` |
| 3 | `apps/web/src/features/session-detail/AgentsSkillsPanel.tsx` | Show skill badges on agent rows. Merge session-level and agent-level skills for summary/detail. Add attribution labels |
| 4 | `apps/web/src/features/session-detail/timeline-chart/timeline-types.ts` | Add `skills?: Array<{ skill: string; args: string \| null }>` to `AgentLaneData` |
| 5 | `apps/web/src/features/session-detail/timeline-chart/timeline-data.ts` | Pass agent skills through to `AgentLaneData` when building timeline data |

### New Files (0)

No new files are needed. All changes are extensions to existing modules, consistent with enriching the existing `session-detail` vertical slice.

---

## 9. Performance Analysis

### 9.1 Cost of Subagent Parsing

| Factor | Analysis |
|--------|----------|
| **When it runs** | Only during `parseDetail()` -- i.e., when a user views a specific session's detail page. Never during list/summary views |
| **How many files** | Only sessions with agent dispatches. Typical: 0-10 subagent files per session |
| **File sizes** | Subagent files are typically 100KB-5MB (smaller than main session files which can be 50MB+) |
| **Parse complexity** | `parseSubagentSkills` is a lightweight single-pass: only checks for `Skill` tool_use blocks, skips all token/turn/context tracking |
| **Parallelism** | Subagent files are independent -- could use `Promise.all()` to parse them in parallel |
| **Filesystem access** | One `existsSync` check per agent (fast, cached by OS). One `createReadStream` per subagent file that exists |

### 9.2 Expected Latency Impact

```
Scenario: Session with 5 agents, 3 have subagent files (avg 500KB each)

Current parseDetail:
  - Main JSONL parse: ~100-500ms (depending on file size)

Added latency:
  - 5x existsSync checks: ~1ms total
  - 3x parseSubagentSkills (500KB each, sequential): ~30-50ms total
  - 3x parseSubagentSkills (500KB each, parallel):   ~15-25ms total

Total overhead: <50ms (negligible relative to main parse)
```

### 9.3 Optimization: Parallel Subagent Parsing

Use `Promise.all()` to parse all subagent files concurrently:

```
await Promise.all(
  agents.map(async (agent) => {
    const agentId = agentIdByToolUseId.get(agent.toolUseId)
    if (!agentId) return
    agent.agentId = agentId
    const subagentPath = buildSubagentPath(filePath, agentId)
    if (fs.existsSync(subagentPath)) {
      agent.skills = await parseSubagentSkills(subagentPath)
    }
  })
)
```

---

## 10. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Subagent directory structure may change in future Claude versions** | Medium | The path convention `<session-id>/subagents/agent-<agentId>.jsonl` is derived from observed real files. If it changes, `parseSubagentSkills` simply won't find files and returns empty -- graceful degradation |
| **Some progress messages may not have `data.agentId`** | Low | The `agentId` extraction is guarded by null checks. Agents without a resolved `agentId` simply won't have skills attached. No error thrown |
| **Large subagent files could slow detail page** | Low | Subagent files are typically much smaller than main session files. The targeted parser only looks for Skill blocks, making it faster than full parsing. Parallel execution further reduces latency |
| **`data.agentId` field not in current TypeScript type** | Low | This is fixed as part of this feature by adding the field to `RawJsonlMessage.data`. The field is optional so existing code is unaffected |
| **Agent without subagent file (file deleted or not yet written)** | Low | `existsSync` check handles missing files. `agent.skills` remains `undefined` |
| **Naming collision: `SkillInvocation` on both `SessionDetail.skills` and `AgentInvocation.skills`** | Low | Both use the same `SkillInvocation` type, which is intentional -- a skill invocation has the same shape regardless of where it was called from |
| **Session-level skills may duplicate agent-level skills** | Low | Session-level skills are extracted from the MAIN session JSONL. Agent-level skills are from SUBAGENT JSONL. These are different files with different messages, so there should be no duplication. The main session only sees `Task` tool calls, not the internal `Skill` calls within agents |
| **Privacy mode interaction** | None | Skill names are not project-sensitive data. They are tool/feature identifiers (e.g., "database-rules", "tanstack-start"), not user content. No privacy mode changes needed |

---

## 11. Edge Cases

| Case | Behavior |
|------|----------|
| Session with no agents | No subagent parsing occurs. Zero overhead |
| Agent dispatched but no progress messages (killed early) | No `agentId` resolved. `agent.skills` remains undefined. Agent row shows as before |
| Subagent file exists but is empty | `parseSubagentSkills` returns `[]`. `agent.skills = []` |
| Subagent used no skills | `parseSubagentSkills` returns `[]`. No skill badges shown on agent row |
| Subagent file is corrupted (invalid JSON) | `safeParse` returns null for bad lines, same as main parser. Valid lines still processed |
| Multiple agents use the same skill | Each agent gets its own `SkillInvocation[]`. The combined summary correctly counts total invocations |
| Nested agents (agent dispatches another agent) | Out of scope. Subagent JSONL may contain `Task` tool calls, but we only extract `Skill` blocks. Nested agent skills would require recursive parsing, which is deferred |

---

## 12. Testing Considerations

| Test Area | Key Cases |
|-----------|-----------|
| `parseSubagentSkills` | Empty file; file with no Skill blocks; file with one Skill block; file with multiple Skill blocks; malformed JSON lines |
| `agentId` extraction | Progress message with `data.agentId`; progress message without `data.agentId`; multiple progress messages for same agent (idempotent) |
| Enrichment phase | Agent with agentId and existing subagent file; agent with agentId but missing file; agent without agentId |
| `AgentsSkillsPanel` | Agent with skills; agent without skills; mixed agents (some with, some without); skill attribution labels; combined skill summary counts |
| Path construction | Session ID with special characters; verify `.jsonl` stripping produces correct directory path |

---

## 13. Implementation Order

### Step 1: Type Changes
- Add `data.agentId` to `RawJsonlMessage`
- Add `agentId` and `skills` to `AgentInvocation`
- Add `skills` to `AgentLaneData`

### Step 2: Parser -- Extract agentId
- Add `agentIdByToolUseId` map to `parseDetail`
- Extract `data.agentId` from progress messages
- Assign `agentId` to agents in the merge phase

### Step 3: Parser -- Subagent Skill Parsing
- Implement `parseSubagentSkills()` function
- Add post-parse enrichment phase to `parseDetail()`
- Use `Promise.all` for parallel subagent file parsing

### Step 4: Timeline Data
- Pass skills through in `timeline-data.ts` when building `AgentLaneData`

### Step 5: UI -- AgentsSkillsPanel
- Add skill badges to agent detail rows
- Merge session-level and agent-level skills for summary section
- Add attribution labels to skill invocation detail rows

---

## 14. Appendix: Progress Message agentId Extraction

Real example of a progress message in the main session JSONL that carries `data.agentId`:

```json
{
  "type": "progress",
  "parentToolUseID": "toolu_01VU1abcdef",
  "data": {
    "type": "agent_progress",
    "agentId": "a3d93b1",
    "message": {
      "type": "assistant",
      "message": {
        "model": "claude-sonnet-4-20250514",
        "content": [...],
        "usage": {
          "input_tokens": 12000,
          "output_tokens": 800,
          "cache_read_input_tokens": 5000,
          "cache_creation_input_tokens": 0
        }
      }
    }
  }
}
```

The `parentToolUseID` (`"toolu_01VU1abcdef"`) matches the `toolUseId` on the corresponding `AgentInvocation` (created from the `Task` tool_use block). The `data.agentId` (`"a3d93b1"`) identifies the subagent file: `agent-a3d93b1.jsonl`.
