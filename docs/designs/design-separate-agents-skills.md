# Design: Separate Agents and Skills into Distinct Panels

## 1. Problem Statement

The `AgentsSkillsPanel` component combines two conceptually different concerns -- agent dispatches and skill invocations -- into a single card with internal scrollbars (`max-h-64` for agents, `max-h-48` for skills). This creates two problems:

1. **Agent dispatches are truncated** by the `max-h-64` scrollbar, forcing users to scroll within a scrollable page. Sessions with many agents (5-10+) have their details hidden behind a tiny viewport.
2. **Skill invocations are buried mid-page**, sandwiched between cost estimation and tasks, when they are a secondary concern better suited for the bottom of the page.

### Goals

1. Split `AgentsSkillsPanel` into two standalone components: `AgentDispatchesPanel` and `SkillInvocationsPanel`
2. Remove the scrollbar constraint from the agents section -- show all agents fully expanded
3. Move skill invocations to the very bottom of the page (after Timeline chart)
4. Preserve all existing functionality, styling, and data flow

### Non-Goals

- Changing the data model or types (`AgentInvocation`, `SkillInvocation`)
- Modifying server functions, queries, or parsers
- Redesigning the visual appearance of individual agent/skill rows
- Changing how the combined skills list is computed (session-level + agent-level merge)

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Split into two components in the same file initially | Both components share the `allSkills` merge logic and cost calculation. Keeping them colocated avoids premature extraction of shared utilities. The file can be split later if it grows |
| Remove `max-h-64 overflow-y-auto` from agents section | The user explicitly requested full expansion. Agent rows are compact (~40px each); even 10 agents only add ~400px, well within acceptable page length |
| Move skills panel to after the Timeline chart | Skills are a supplementary detail -- users primarily care about agent dispatches, tool usage, and the timeline. Skills at the bottom serve as reference material |
| Keep the `AgentsSkillsPanel.tsx` file but export two components | Renaming the file would create unnecessary git churn. The file already contains the logic for both concerns. Export names make the purpose clear |
| Each component gets its own card wrapper | Both panels should be independent visual units with their own `rounded-xl border border-gray-800 bg-gray-900/50 p-4` card styling, consistent with all other panels on the page |
| Null-return when empty stays on each component independently | `AgentDispatchesPanel` returns null when `agents.length === 0`. `SkillInvocationsPanel` returns null when there are no skills (session-level or agent-level). This is simpler than the current combined check |

---

## 3. Architecture

### 3.1 Current Layout

```
+--------------------------------------------------+
| Header (project, branch, stats, export)          |
+--------------------------------------------------+
| Stats Grid                                       |
| [ContextWindowPanel]  [ToolUsagePanel]           |
+--------------------------------------------------+
| CostEstimationPanel                              |
+--------------------------------------------------+
| AgentsSkillsPanel  <-- COMBINED                  |
|   "Agents & Skills" header with counts           |
|   +-- Agent Dispatches (max-h-64, scrollable)    |
|   +-- Skill Invocations (max-h-48, scrollable)   |
+--------------------------------------------------+
| TasksPanel                                       |
+--------------------------------------------------+
| ErrorPanel                                       |
+--------------------------------------------------+
| Timeline Chart                                   |
+--------------------------------------------------+
```

### 3.2 New Layout

```
+--------------------------------------------------+
| Header (project, branch, stats, export)          |
+--------------------------------------------------+
| Stats Grid                                       |
| [ContextWindowPanel]  [ToolUsagePanel]           |
+--------------------------------------------------+
| CostEstimationPanel                              |
+--------------------------------------------------+
| AgentDispatchesPanel  <-- SPLIT (no scrollbar)   |
|   "Agent Dispatches" header with count + tokens  |
|   +-- Agent rows (ALL visible, no max-h)         |
|   +-- Inline skill badges per agent (unchanged)  |
+--------------------------------------------------+
| TasksPanel                                       |
+--------------------------------------------------+
| ErrorPanel                                       |
+--------------------------------------------------+
| Timeline Chart                                   |
+--------------------------------------------------+
| SkillInvocationsPanel  <-- MOVED TO BOTTOM       |
|   "Skill Invocations" header with count          |
|   +-- Skill rows (no max-h)                      |
+--------------------------------------------------+
```

---

## 4. Component Design

### 4.1 `AgentDispatchesPanel`

**Props:**

```typescript
{
  agents: AgentInvocation[]
}
```

**Responsibilities:**

- Render the card wrapper with header "Agent Dispatches"
- Show count of agents and total token usage in the header subtitle
- Show per-agent cost (requires `useQuery(settingsQuery)` + cost calculation -- stays in this component)
- Render all agent rows fully expanded (NO `max-h-64`, NO `overflow-y-auto`)
- Render inline skill badges below each agent row (the `a.skills` rendering, unchanged)
- Return `null` when `agents.length === 0`

**Key difference from current:** The `max-h-64 overflow-y-auto` class on the wrapping div is removed. The `space-y-1` layout remains.

### 4.2 `SkillInvocationsPanel`

**Props:**

```typescript
{
  agents: AgentInvocation[]
  skills: SkillInvocation[]
}
```

**Responsibilities:**

- Compute the merged `allSkills` list (session-level + agent-level, sorted by timestamp) -- same `useMemo` logic currently in `AgentsSkillsPanel`
- Render the card wrapper with header "Skill Invocations"
- Show count of total skill invocations in the header subtitle
- Render all skill rows fully expanded (NO `max-h-48`, NO `overflow-y-auto`)
- Show attribution labels ("via architect") for agent-sourced skills (unchanged)
- Show "context" label for injected skills (unchanged)
- Return `null` when `allSkills.length === 0`

**Key difference from current:** The `max-h-48 overflow-y-auto` class on the wrapping div is removed. The component receives `agents` only to extract their nested skills for the merged list.

### 4.3 Shared Logic

The cost calculation (`agentCosts`, `totalAgentCost` via `useMemo`) stays inside `AgentDispatchesPanel` since only the agents panel needs it. The `allSkills` merge logic moves to `SkillInvocationsPanel`.

The `computeAgentTokens` helper function remains in the same file, used by `AgentDispatchesPanel`.

---

## 5. Route File Changes

### 5.1 `$sessionId.tsx` -- Import Changes

Replace the single import:

```typescript
// BEFORE
import { AgentsSkillsPanel } from '@/features/session-detail/AgentsSkillsPanel'

// AFTER
import { AgentDispatchesPanel, SkillInvocationsPanel } from '@/features/session-detail/AgentsSkillsPanel'
```

### 5.2 `$sessionId.tsx` -- Layout Changes

The current placement (lines 143-148):

```tsx
{/* Agents & Skills */}
{(detail.agents.length > 0 || detail.skills.length > 0) && (
  <div className="mt-4">
    <AgentsSkillsPanel agents={detail.agents} skills={detail.skills} />
  </div>
)}
```

Becomes two separate placements:

**Position 1 -- After CostEstimationPanel (same position as before):**

```tsx
{/* Agent Dispatches */}
{detail.agents.length > 0 && (
  <div className="mt-4">
    <AgentDispatchesPanel agents={detail.agents} />
  </div>
)}
```

**Position 2 -- After Timeline Chart (new position, at the very bottom):**

```tsx
{/* Skill Invocations */}
{(detail.skills.length > 0 || detail.agents.some(a => a.skills && a.skills.length > 0)) && (
  <div className="mt-6">
    <SkillInvocationsPanel agents={detail.agents} skills={detail.skills} />
  </div>
)}
```

### 5.3 Full Layout Order in JSX

```
1. ActiveSessionBanner (conditional)
2. Header block
3. Stats grid (ContextWindowPanel, ToolUsagePanel)
4. CostEstimationPanel
5. AgentDispatchesPanel        <-- agents only, no scrollbar
6. TasksPanel
7. ErrorPanel
8. Timeline Chart
9. SkillInvocationsPanel       <-- skills only, page bottom
```

---

## 6. File Plan

### Modified Files (2)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/src/features/session-detail/AgentsSkillsPanel.tsx` | Split the single `AgentsSkillsPanel` export into two named exports: `AgentDispatchesPanel` and `SkillInvocationsPanel`. Remove scrollbar constraints. Redistribute logic between the two components. Keep `computeAgentTokens` helper. Optionally remove the old `AgentsSkillsPanel` export or keep it as a deprecated alias |
| 2 | `apps/web/src/routes/_dashboard/sessions/$sessionId.tsx` | Update import to use new component names. Place `AgentDispatchesPanel` in current agent position. Place `SkillInvocationsPanel` after Timeline chart. Update conditional rendering guards |

### New Files (0)

No new files needed.

### Deleted Files (0)

No files deleted. The existing `AgentsSkillsPanel.tsx` file is reused with new exports.

---

## 7. Naming Conventions

| Item | Name | Rationale |
|------|------|-----------|
| Agents component | `AgentDispatchesPanel` | Matches the existing section header "Agent Dispatches" and the `AgentInvocation` type name |
| Skills component | `SkillInvocationsPanel` | Matches the existing section header "Skill Invocations" and the `SkillInvocation` type name |
| Source file | `AgentsSkillsPanel.tsx` (unchanged) | Avoid renaming to reduce git churn. Both components are logically related and share the same source file. The file can be split in a future refactor if needed |
| Card headers | "Agent Dispatches" / "Skill Invocations" | Reuse the existing subsection header text, now promoted to panel-level headers |

---

## 8. Visual Specification

### 8.1 AgentDispatchesPanel Card

```
+--------------------------------------------------------------+
| Agent Dispatches                                             |
| 5 agent dispatches (142K tokens . ~$0.42)                   |
|                                                              |
| [architect] [sonnet-4] "Design db schema..."  42K  ~$0.12   |
|              [/database-rules] [/tanstack-start]             |
|                                                              |
| [implementer] [sonnet-4] "Build feature..."   68K  ~$0.20   |
|              [/tanstack-start]                               |
|                                                              |
| [reviewer] [sonnet-4] "Review changes..."     20K  ~$0.06   |
|                                                              |
| [qa] [sonnet-4] "Write tests..."             8K   ~$0.03   |
|                                                              |
| [devops] [sonnet-4] "Fix CI..."              4K   ~$0.01   |
+--------------------------------------------------------------+
```

All 5 agents visible without scrolling. Card grows vertically to fit content.

### 8.2 SkillInvocationsPanel Card

```
+--------------------------------------------------------------+
| Skill Invocations                                            |
| 4 skill invocations                                          |
|                                                              |
| [/database-rules]           via architect         10:15:30   |
| [/tanstack-start]           via architect         10:16:45   |
| [/tanstack-start]           via implementer       10:20:00   |
| [/quality-check]                                  10:30:15   |
+--------------------------------------------------------------+
```

Session-level skills show no attribution. Agent-sourced skills show "via {agentType}".

---

## 9. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Page becomes very long with many agents expanded** | Low | Agent rows are compact (~40-56px each including skill badges). Even 15 agents would add ~840px. The timeline chart already dominates page height. Users can scroll naturally |
| **Skills panel at page bottom may be overlooked** | Low | Skills are a supplementary detail. Users who care about them can scroll down. The agent rows still show inline skill badges, providing the primary skill visibility |
| **Conditional rendering for skills panel is more complex** | Low | The guard `detail.skills.length > 0 \|\| detail.agents.some(a => a.skills?.length > 0)` handles the case where all skills are agent-level (no session-level skills). The `SkillInvocationsPanel` itself also returns null when `allSkills.length === 0`, providing a safety net |
| **Breaking change if anything imports `AgentsSkillsPanel` by name** | Low | Only `$sessionId.tsx` imports this component. No other consumers exist. The old export name can be kept temporarily as a re-export alias if desired |

---

## 10. Implementation Checklist

1. In `AgentsSkillsPanel.tsx`:
   - Create `AgentDispatchesPanel` component with agents-only logic and no scroll constraint
   - Create `SkillInvocationsPanel` component with skills merge logic and no scroll constraint
   - Each component gets its own card wrapper (`rounded-xl border border-gray-800 bg-gray-900/50 p-4`)
   - Each component has its own null guard (return null when nothing to show)
   - Remove or deprecate the combined `AgentsSkillsPanel` export

2. In `$sessionId.tsx`:
   - Update import statement
   - Place `AgentDispatchesPanel` at position 5 (after CostEstimationPanel)
   - Place `SkillInvocationsPanel` at position 9 (after Timeline chart)
   - Update conditional rendering guards for each panel independently
