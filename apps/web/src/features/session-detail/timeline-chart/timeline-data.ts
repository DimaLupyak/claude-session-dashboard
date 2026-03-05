import type {
  Turn,
  AgentInvocation,
  SkillInvocation,
  SessionError,
} from '@/lib/parsers/types'
import type {
  TimelineChartData,
  TimelineEvent,
  AgentLaneData,
  AgentToolDot,
  SkillMarkerData,
  ErrorMarkerData,
} from './timeline-types'

export function buildTimelineChartData(
  turns: Turn[],
  agents: AgentInvocation[],
  skills: SkillInvocation[],
  errors: SessionError[],
): TimelineChartData {
  // Step 1: Compute time bounds from all timestamps
  const allTimestamps: number[] = []

  for (const turn of turns) {
    if (turn.timestamp) {
      const ms = new Date(turn.timestamp).getTime()
      if (!isNaN(ms)) allTimestamps.push(ms)
    }
  }
  for (const agent of agents) {
    if (agent.timestamp) {
      const ms = new Date(agent.timestamp).getTime()
      if (!isNaN(ms)) allTimestamps.push(ms)
    }
  }
  for (const skill of skills) {
    if (skill.timestamp) {
      const ms = new Date(skill.timestamp).getTime()
      if (!isNaN(ms)) allTimestamps.push(ms)
    }
  }

  if (allTimestamps.length === 0) {
    return {
      startMs: 0,
      endMs: 0,
      durationMs: 0,
      mainLane: [],
      agentLanes: [],
      skillMarkers: [],
      errorMarkers: [],
    }
  }

  const startMs = Math.min(...allTimestamps)
  const endMs = Math.max(...allTimestamps)
  const durationMs = Math.max(endMs - startMs, 1) // Avoid division by zero

  function toRelativeX(ms: number): number {
    return (ms - startMs) / durationMs
  }

  // Step 2: Build sets of agent/skill toolUseIds to exclude from main lane
  const agentToolUseIds = new Set(agents.map((a) => a.toolUseId))
  const skillToolUseIds = new Set(skills.map((s) => s.toolUseId))

  // Step 3: Classify tool calls into main lane
  const mainLane: TimelineEvent[] = []
  for (const turn of turns) {
    if (turn.type !== 'assistant' || turn.toolCalls.length === 0) continue
    const turnMs = new Date(turn.timestamp).getTime()
    if (isNaN(turnMs)) continue

    for (const tc of turn.toolCalls) {
      if (agentToolUseIds.has(tc.toolUseId)) continue
      if (skillToolUseIds.has(tc.toolUseId)) continue
      mainLane.push({
        timestampMs: turnMs,
        toolName: tc.toolName,
        toolUseId: tc.toolUseId,
        relativeX: toRelativeX(turnMs),
      })
    }
  }

  // Step 4: Build agent swim lanes
  const agentLanes: AgentLaneData[] = agents.map((agent) => {
    const agentStartMs = new Date(agent.timestamp).getTime()
    const agentEndMs = agent.durationMs
      ? agentStartMs + agent.durationMs
      : agentStartMs + durationMs * 0.02 // Minimum 2% width fallback

    // Distribute tool dots evenly within agent's time span
    const toolDots: AgentToolDot[] = []
    if (agent.toolCalls) {
      const entries = Object.entries(agent.toolCalls).sort(
        ([, a], [, b]) => b - a,
      )
      const totalDots = entries.reduce((sum, [, count]) => sum + count, 0)
      let dotIndex = 0
      for (const [toolName, count] of entries) {
        for (let i = 0; i < count; i++) {
          const fraction =
            totalDots > 1 ? dotIndex / (totalDots - 1) : 0.5
          const dotMs = agentStartMs + (agentEndMs - agentStartMs) * fraction
          toolDots.push({
            toolName,
            count: 1,
            relativeX: toRelativeX(dotMs),
          })
          dotIndex++
        }
      }
    }

    return {
      subagentType: agent.subagentType,
      description: agent.description,
      startMs: agentStartMs,
      endMs: agentEndMs,
      startX: toRelativeX(agentStartMs),
      endX: toRelativeX(agentEndMs),
      durationMs: agent.durationMs ?? null,
      totalTokens: agent.totalTokens ?? null,
      totalToolUseCount: agent.totalToolUseCount ?? null,
      toolDots,
      skills: agent.skills?.map((s) => ({ skill: s.skill, args: s.args })) ?? [],
    }
  })

  // Step 5: Build skill markers
  const skillMarkers: SkillMarkerData[] = skills
    .map((s) => {
      const ms = new Date(s.timestamp).getTime()
      if (isNaN(ms)) return null
      return {
        skill: s.skill,
        args: s.args,
        timestampMs: ms,
        relativeX: toRelativeX(ms),
      }
    })
    .filter((s): s is SkillMarkerData => s !== null)

  // Step 6: Build error markers
  const errorMarkers: ErrorMarkerData[] = errors
    .map((e) => {
      const ms = new Date(e.timestamp).getTime()
      if (isNaN(ms)) return null
      return {
        message: e.message,
        type: e.type,
        timestampMs: ms,
        relativeX: toRelativeX(ms),
      }
    })
    .filter((e): e is ErrorMarkerData => e !== null)

  return {
    startMs,
    endMs,
    durationMs,
    mainLane,
    agentLanes,
    skillMarkers,
    errorMarkers,
  }
}
