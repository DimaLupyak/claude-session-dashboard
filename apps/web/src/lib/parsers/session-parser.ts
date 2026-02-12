import * as fs from 'node:fs'
import * as readline from 'node:readline'
import type {
  SessionSummary,
  SessionDetail,
  Turn,
  ToolCall,
  TokenUsage,
  SessionError,
  AgentInvocation,
  SkillInvocation,
  TaskItem,
  RawJsonlMessage,
  ContextWindowSnapshot,
  ContextWindowData,
} from './types'

const HEAD_LINES = 15
const TAIL_LINES = 15

/**
 * Parse a session summary by reading only the first and last N lines.
 * This keeps memory usage minimal even for 500MB+ files.
 */
export async function parseSummary(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
  fileSizeBytes: number,
): Promise<SessionSummary | null> {
  const headLines = await readHeadLines(filePath, HEAD_LINES)
  const tailLines = await readTailLines(filePath, TAIL_LINES)
  const allLines = [...headLines, ...tailLines]

  if (allLines.length === 0) return null

  let startedAt: string | null = null
  let lastActiveAt: string | null = null
  let branch: string | null = null
  let cwd: string | null = null
  let model: string | null = null
  let version: string | null = null
  let userMessageCount = 0
  let assistantMessageCount = 0
  let totalMessageCount = 0

  for (const line of allLines) {
    const msg = safeParse(line)
    if (!msg) continue
    if (msg.type === 'file-history-snapshot') continue

    const ts = msg.timestamp
    if (ts) {
      if (!startedAt || ts < startedAt) startedAt = ts
      if (!lastActiveAt || ts > lastActiveAt) lastActiveAt = ts
    }

    if (msg.gitBranch && !branch) branch = msg.gitBranch
    if (msg.cwd && !cwd) cwd = msg.cwd
    if (msg.version && !version) version = msg.version

    if (msg.type === 'user') userMessageCount++
    if (msg.type === 'assistant') {
      assistantMessageCount++
      if (msg.message?.model && !model) model = msg.message.model
    }
    if (msg.type === 'user' || msg.type === 'assistant' || msg.type === 'system') {
      totalMessageCount++
    }
  }

  if (!startedAt) return null

  const durationMs =
    startedAt && lastActiveAt
      ? new Date(lastActiveAt).getTime() - new Date(startedAt).getTime()
      : 0

  return {
    sessionId,
    projectPath,
    projectName,
    branch,
    cwd,
    startedAt,
    lastActiveAt: lastActiveAt ?? startedAt,
    durationMs,
    messageCount: totalMessageCount,
    userMessageCount,
    assistantMessageCount,
    isActive: false, // Will be set by caller
    model,
    version,
    fileSizeBytes,
  }
}

/**
 * Stream-parse the full session file for detail view.
 * Processes line-by-line to handle large files.
 */
export async function parseDetail(
  filePath: string,
  sessionId: string,
  projectPath: string,
  projectName: string,
): Promise<SessionDetail> {
  const turns: Turn[] = []
  const toolFrequency: Record<string, number> = {}
  const errors: SessionError[] = []
  const agents: AgentInvocation[] = []
  const skills: SkillInvocation[] = []
  const tasks: TaskItem[] = []
  const modelsSet = new Set<string>()
  let branch: string | null = null
  const totalTokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
  const tokensByModel: Record<string, TokenUsage> = {}

  // Maps for linking agent stats
  const agentByToolUseId = new Map<string, AgentInvocation>()
  const agentProgressTokens = new Map<string, TokenUsage>()
  const agentProgressToolCalls = new Map<string, Record<string, number>>()
  const agentProgressModel = new Map<string, string>()

  // Map for linking TaskCreate tool_use_id to pending task
  const pendingTaskByToolUseId = new Map<string, TaskItem>()
  const taskById = new Map<string, TaskItem>()

  // Context window tracking
  const contextSnapshots: ContextWindowSnapshot[] = []
  let assistantTurnIndex = 0

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg || msg.type === 'file-history-snapshot') continue

    if (msg.gitBranch && !branch) branch = msg.gitBranch

    // Track agent progress messages
    if (msg.type === 'progress' && msg.parentToolUseID) {
      const parentId = msg.parentToolUseID

      // Track the model used by each agent
      const progressModel = msg.data?.message?.message?.model
      if (progressModel && parentId) {
        agentProgressModel.set(parentId, progressModel)
      }

      const usage = msg.data?.message?.message?.usage
      if (usage) {
        const existing = agentProgressTokens.get(parentId) ?? {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        }
        existing.inputTokens += usage.input_tokens ?? 0
        existing.outputTokens += usage.output_tokens ?? 0
        existing.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
        existing.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
        agentProgressTokens.set(parentId, existing)

        // Also add to session-level totals for accurate cost estimation
        const tokens = {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        }

        totalTokens.inputTokens += tokens.inputTokens
        totalTokens.outputTokens += tokens.outputTokens
        totalTokens.cacheReadInputTokens += tokens.cacheReadInputTokens
        totalTokens.cacheCreationInputTokens += tokens.cacheCreationInputTokens

        // Add to per-model tracking using model from progress message
        const modelId = msg.data?.message?.message?.model ?? 'unknown'
        if (modelId !== 'unknown') {
          const modelExisting = tokensByModel[modelId] ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          }
          modelExisting.inputTokens += tokens.inputTokens
          modelExisting.outputTokens += tokens.outputTokens
          modelExisting.cacheReadInputTokens += tokens.cacheReadInputTokens
          modelExisting.cacheCreationInputTokens += tokens.cacheCreationInputTokens
          tokensByModel[modelId] = modelExisting
        }
      }

      // Track tool calls within agent progress
      const content = msg.data?.message?.message?.content
      if (Array.isArray(content)) {
        const toolMap = agentProgressToolCalls.get(parentId) ?? {}
        for (const block of content) {
          if (block.type === 'tool_use' && block.name) {
            toolMap[block.name] = (toolMap[block.name] ?? 0) + 1
          }
        }
        agentProgressToolCalls.set(parentId, toolMap)
      }
      continue
    }

    const toolCalls: ToolCall[] = []

    if (msg.type === 'assistant' && msg.message) {
      const content = msg.message.content ?? []
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          toolCalls.push({
            toolName: block.name,
            toolUseId: block.id ?? '',
            input: block.input,
          })
          toolFrequency[block.name] = (toolFrequency[block.name] ?? 0) + 1

          // Extract agent invocations from Task tool calls
          if (block.name === 'Task' && block.input) {
            const inp = block.input as Record<string, unknown>
            if (inp.subagent_type) {
              const agent: AgentInvocation = {
                subagentType: String(inp.subagent_type),
                description: String(inp.description ?? ''),
                timestamp: msg.timestamp ?? '',
                toolUseId: block.id ?? '',
                model: inp.model ? String(inp.model) : undefined,
              }
              agents.push(agent)
              if (block.id) agentByToolUseId.set(block.id, agent)
            }
          }

          // Extract skill invocations from Skill tool calls
          if (block.name === 'Skill' && block.input) {
            const inp = block.input as Record<string, unknown>
            if (inp.skill) {
              skills.push({
                skill: String(inp.skill),
                args: inp.args ? String(inp.args) : null,
                timestamp: msg.timestamp ?? '',
                toolUseId: block.id ?? '',
              })
            }
          }

          // Extract TaskCreate
          if (block.name === 'TaskCreate' && block.input) {
            const inp = block.input as Record<string, unknown>
            const task: TaskItem = {
              taskId: '',
              subject: String(inp.subject ?? ''),
              description: inp.description ? String(inp.description) : undefined,
              activeForm: inp.activeForm ? String(inp.activeForm) : undefined,
              status: 'pending',
              timestamp: msg.timestamp ?? '',
            }
            tasks.push(task)
            if (block.id) pendingTaskByToolUseId.set(block.id, task)
          }

          // Extract TaskUpdate
          if (block.name === 'TaskUpdate' && block.input) {
            const inp = block.input as Record<string, unknown>
            const taskId = String(inp.taskId ?? '')
            const existing = taskById.get(taskId)
            if (existing && inp.status) {
              existing.status = String(inp.status) as TaskItem['status']
            }
          }
        }
      }

      if (msg.message.model) modelsSet.add(msg.message.model)

      if (msg.message.usage) {
        const u = msg.message.usage
        const tokens: TokenUsage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
        }
        totalTokens.inputTokens += tokens.inputTokens
        totalTokens.outputTokens += tokens.outputTokens
        totalTokens.cacheReadInputTokens += tokens.cacheReadInputTokens
        totalTokens.cacheCreationInputTokens += tokens.cacheCreationInputTokens

        // Track per-model token usage
        if (msg.message.model) {
          const modelId = msg.message.model
          const existing = tokensByModel[modelId] ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          }
          existing.inputTokens += tokens.inputTokens
          existing.outputTokens += tokens.outputTokens
          existing.cacheReadInputTokens += tokens.cacheReadInputTokens
          existing.cacheCreationInputTokens += tokens.cacheCreationInputTokens
          tokensByModel[modelId] = existing
        }

        // Track context window snapshot
        const contextSize =
          tokens.inputTokens +
          tokens.cacheReadInputTokens +
          tokens.cacheCreationInputTokens
        const lastSnapshot = contextSnapshots[contextSnapshots.length - 1]
        if (!lastSnapshot || lastSnapshot.contextSize !== contextSize) {
          contextSnapshots.push({
            turnIndex: assistantTurnIndex,
            timestamp: msg.timestamp ?? '',
            contextSize,
            outputTokens: tokens.outputTokens,
          })
        }
        assistantTurnIndex++

        turns.push({
          uuid: msg.uuid ?? '',
          type: msg.type,
          timestamp: msg.timestamp ?? '',
          model: msg.message.model,
          toolCalls,
          tokens,
          stopReason: msg.message.stop_reason,
        })
        continue
      }
    }

    // Handle tool_result messages (user type with tool results)
    if (msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type !== 'tool_result') continue
          const toolUseId = block.tool_use_id ?? block.id
          // Extract text from tool_result content (can be string or array)
          const resultText = extractToolResultText(block)

          // Extract task ID from TaskCreate results
          if (resultText) {
            const taskMatch = resultText.match(/Task #(\S+) created successfully/)
            if (taskMatch && toolUseId) {
              const pending = pendingTaskByToolUseId.get(String(toolUseId))
              if (pending) {
                pending.taskId = taskMatch[1]
                taskById.set(pending.taskId, pending)
              }
            }
          }

          // Extract agent completion stats from toolUseResult
          if (msg.toolUseResult && toolUseId) {
            const agent = agentByToolUseId.get(String(toolUseId))
            if (agent) {
              const result = msg.toolUseResult
              if (result.totalTokens) agent.totalTokens = result.totalTokens
              if (result.totalToolUseCount) agent.totalToolUseCount = result.totalToolUseCount
              if (result.totalDurationMs) agent.durationMs = result.totalDurationMs
            }
          }
        }
      }
    }

    // Collect errors from system messages
    if (msg.type === 'system' && msg.level === 'error') {
      errors.push({
        timestamp: msg.timestamp ?? '',
        message: msg.slug ?? msg.subtype ?? 'Unknown error',
        type: msg.subtype ?? 'system',
      })
    }

    if (msg.type === 'user' || msg.type === 'assistant' || msg.type === 'system') {
      const textContent = extractTextContent(msg)
      turns.push({
        uuid: msg.uuid ?? '',
        type: msg.type,
        timestamp: msg.timestamp ?? '',
        message: textContent,
        toolCalls,
      })
    }
  }

  // Merge accumulated progress stats into agents
  for (const agent of agents) {
    const progressTokens = agentProgressTokens.get(agent.toolUseId)
    if (progressTokens && !agent.tokens) {
      agent.tokens = progressTokens
    }
    const progressTools = agentProgressToolCalls.get(agent.toolUseId)
    if (progressTools && !agent.toolCalls) {
      agent.toolCalls = progressTools
    }
    // Set actual model from progress data (overrides the requested model from Task input)
    const actualModel = agentProgressModel.get(agent.toolUseId)
    if (actualModel) {
      agent.model = actualModel
    }
  }

  // Build context window data
  const modelName = modelsSet.size > 0 ? Array.from(modelsSet)[0] : 'unknown'
  const contextWindow = buildContextWindowData(
    contextSnapshots,
    modelName,
  )

  return {
    sessionId,
    projectPath,
    projectName,
    branch,
    turns,
    totalTokens,
    tokensByModel,
    toolFrequency,
    errors,
    models: Array.from(modelsSet),
    agents,
    skills,
    tasks,
    contextWindow,
  }
}

/**
 * Read paginated raw messages from a session file.
 */
export async function readSessionMessages(
  filePath: string,
  offset: number,
  limit: number,
): Promise<{ messages: RawJsonlMessage[]; total: number }> {
  const messages: RawJsonlMessage[] = []
  let lineIndex = 0
  let total = 0

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg || msg.type === 'file-history-snapshot') continue
    total++

    if (lineIndex >= offset && lineIndex < offset + limit) {
      messages.push(msg)
    }
    lineIndex++

    // Early exit if we have enough
    if (lineIndex >= offset + limit + 1000) {
      // Keep counting for total estimate but don't parse
    }
  }

  return { messages, total }
}

// --- Context window helpers ---

function getContextLimit(_modelName: string): number {
  return 200_000
}

function buildContextWindowData(
  snapshots: ContextWindowSnapshot[],
  modelName: string,
): ContextWindowData | null {
  if (snapshots.length === 0) return null

  const contextLimit = getContextLimit(modelName)
  const autocompactBuffer = Math.round(contextLimit * 0.165)
  const systemOverhead = snapshots[0].contextSize
  const currentContextSize = snapshots[snapshots.length - 1].contextSize
  const messagesEstimate = Math.max(0, currentContextSize - systemOverhead)
  const freeSpace = Math.max(0, contextLimit - currentContextSize)
  const usagePercent = Math.round((currentContextSize / contextLimit) * 100)

  return {
    contextLimit,
    modelName,
    systemOverhead,
    currentContextSize,
    messagesEstimate,
    freeSpace,
    autocompactBuffer,
    usagePercent,
    snapshots,
  }
}

// --- Helpers ---

async function readHeadLines(
  filePath: string,
  count: number,
): Promise<string[]> {
  const lines: string[] = []
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    lines.push(line)
    if (lines.length >= count) break
  }

  stream.destroy()
  return lines
}

async function readTailLines(
  filePath: string,
  count: number,
): Promise<string[]> {
  // Read the last ~64KB to get tail lines (enough for any reasonable line length)
  const stat = await fs.promises.stat(filePath)
  const readSize = Math.min(stat.size, 65536)
  const buffer = Buffer.alloc(readSize)

  const fd = await fs.promises.open(filePath, 'r')
  try {
    await fd.read(buffer, 0, readSize, Math.max(0, stat.size - readSize))
  } finally {
    await fd.close()
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter(Boolean)
  return lines.slice(-count)
}

function safeParse(line: string): RawJsonlMessage | null {
  try {
    return JSON.parse(line) as RawJsonlMessage
  } catch {
    return null
  }
}

function extractToolResultText(block: {
  text?: string
  content?: string | Array<{ type: string; text?: string }>
}): string | undefined {
  // tool_result text can be in block.text (legacy) or block.content (actual format)
  if (block.text) return block.text
  if (typeof block.content === 'string') return block.content
  if (Array.isArray(block.content)) {
    const texts = block.content
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
    return texts.length > 0 ? texts.join('\n') : undefined
  }
  return undefined
}

function extractTextContent(msg: RawJsonlMessage): string | undefined {
  if (!msg.message) return undefined
  const content = msg.message.content
  if (!Array.isArray(content)) return undefined

  const texts = content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)

  return texts.length > 0 ? texts.join('\n').slice(0, 500) : undefined
}
