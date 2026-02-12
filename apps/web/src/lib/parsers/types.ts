import { z } from 'zod'

// --- Session summary (derived from first/last N lines of JSONL) ---

export interface SessionSummary {
  sessionId: string
  projectPath: string
  projectName: string
  branch: string | null
  cwd: string | null
  startedAt: string
  lastActiveAt: string
  durationMs: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  isActive: boolean
  model: string | null
  version: string | null
  fileSizeBytes: number
}

// --- Session detail (full streaming parse) ---

export interface Turn {
  uuid: string
  type: 'user' | 'assistant' | 'system' | 'progress'
  timestamp: string
  message?: string
  model?: string
  toolCalls: ToolCall[]
  tokens?: TokenUsage
  stopReason?: string
}

export interface ToolCall {
  toolName: string
  toolUseId: string
  input?: Record<string, any>
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export interface AgentInvocation {
  subagentType: string
  description: string
  timestamp: string
  toolUseId: string
  tokens?: TokenUsage
  totalTokens?: number
  totalToolUseCount?: number
  durationMs?: number
  model?: string
  toolCalls?: Record<string, number>
}

export interface SkillInvocation {
  skill: string
  args: string | null
  timestamp: string
  toolUseId: string
}

export interface TaskItem {
  taskId: string
  subject: string
  description?: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  timestamp: string
}

export interface ContextWindowSnapshot {
  turnIndex: number
  timestamp: string
  contextSize: number
  outputTokens: number
}

export interface ContextWindowData {
  contextLimit: number
  modelName: string
  systemOverhead: number
  currentContextSize: number
  messagesEstimate: number
  freeSpace: number
  autocompactBuffer: number
  usagePercent: number
  snapshots: ContextWindowSnapshot[]
}

export interface SessionDetail {
  sessionId: string
  projectPath: string
  projectName: string
  branch: string | null
  turns: Turn[]
  totalTokens: TokenUsage
  tokensByModel: Record<string, TokenUsage>
  toolFrequency: Record<string, number>
  errors: SessionError[]
  models: string[]
  agents: AgentInvocation[]
  skills: SkillInvocation[]
  tasks: TaskItem[]
  contextWindow: ContextWindowData | null
}

export interface SessionError {
  timestamp: string
  message: string
  type: string
}

// --- Stats cache (from ~/.claude/stats-cache.json) ---

export const DailyActivitySchema = z.object({
  date: z.string(),
  messageCount: z.number(),
  sessionCount: z.number(),
  toolCallCount: z.number(),
})

export const DailyModelTokensSchema = z.object({
  date: z.string(),
  tokensByModel: z.record(z.string(), z.number()),
})

export const ModelUsageSchema = z.record(
  z.string(),
  z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    webSearchRequests: z.number().optional(),
    costUSD: z.number().optional(),
  }),
)

export const LongestSessionSchema = z.object({
  sessionId: z.string(),
  duration: z.number(),
  messageCount: z.number(),
  timestamp: z.string(),
})

export const StatsCacheSchema = z.object({
  version: z.number(),
  lastComputedDate: z.string(),
  dailyActivity: z.array(DailyActivitySchema),
  dailyModelTokens: z.array(DailyModelTokensSchema),
  modelUsage: ModelUsageSchema,
  totalSessions: z.number(),
  totalMessages: z.number(),
  longestSession: LongestSessionSchema,
  firstSessionDate: z.string(),
  hourCounts: z.record(z.string(), z.number()),
  totalSpeculationTimeSavedMs: z.number().optional(),
})

export type StatsCache = z.infer<typeof StatsCacheSchema>
export type DailyActivity = z.infer<typeof DailyActivitySchema>
export type ModelUsage = z.infer<typeof ModelUsageSchema>

// --- History (from ~/.claude/history.jsonl) ---

export interface HistoryEntry {
  display: string
  timestamp: number
  project: string
  sessionId: string
}

// --- JSONL message types (raw file format) ---

export interface RawJsonlMessage {
  type: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot'
  uuid?: string
  parentUuid?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  gitBranch?: string
  version?: string
  message?: {
    model?: string
    role?: string
    content?: Array<{
      type: string
      text?: string
      name?: string
      id?: string
      input?: Record<string, any>
      // tool_result fields
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
    }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
    stop_reason?: string
  }
  data?: {
    type?: string
    message?: {
      type?: string
      message?: {
        model?: string
        content?: Array<{ type: string; name?: string; id?: string; input?: Record<string, any> }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      }
    }
  }
  parentToolUseID?: string
  toolUseResult?: {
    totalTokens?: number
    totalToolUseCount?: number
    totalDurationMs?: number
    agentId?: string
  }
  slug?: string
  subtype?: string
  level?: string
}
