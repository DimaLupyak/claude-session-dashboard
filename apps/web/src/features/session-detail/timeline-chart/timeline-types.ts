export interface TimelineEvent {
  timestampMs: number
  toolName: string
  toolUseId: string
  relativeX: number // 0..1 position along time axis
}

export interface AgentToolDot {
  toolName: string
  count: number
  relativeX: number // 0..1 within the full timeline
}

export interface AgentLaneData {
  subagentType: string
  description: string
  startMs: number
  endMs: number
  startX: number // 0..1
  endX: number // 0..1
  durationMs: number | null
  totalTokens: number | null
  totalToolUseCount: number | null
  toolDots: AgentToolDot[]
  skills?: Array<{ skill: string; args: string | null }>
}

export interface SkillMarkerData {
  skill: string
  args: string | null
  timestampMs: number
  relativeX: number
}

export interface ErrorMarkerData {
  message: string
  type: string
  timestampMs: number
  relativeX: number
}

export interface TimelineChartData {
  startMs: number
  endMs: number
  durationMs: number
  mainLane: TimelineEvent[]
  agentLanes: AgentLaneData[]
  skillMarkers: SkillMarkerData[]
  errorMarkers: ErrorMarkerData[]
}

export type TooltipItem =
  | { kind: 'tool'; toolName: string; timestamp: string; toolUseId: string }
  | { kind: 'agent'; agent: AgentLaneData }
  | {
      kind: 'skill'
      skill: string
      args: string | null
      timestamp: string
    }
  | { kind: 'error'; message: string; type: string; timestamp: string }
