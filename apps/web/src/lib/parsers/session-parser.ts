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
import { discoverSubagentFiles } from './subagent-discovery'

/** Tool names that dispatch a subagent (Task = legacy, Agent = 2.1.68+) */
const AGENT_DISPATCH_TOOL_NAMES = new Set(['Task', 'Agent'])

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

  // Detect non-interactive (task/subagent) sessions by checking for queue-operation type
  let isInteractive = true
  for (const line of allLines) {
    const raw = safeParse(line)
    if (raw && (raw as { type: string }).type === 'queue-operation') {
      isInteractive = false
      break
    }
  }

  let startedAt: string | null = null
  let lastActiveAt: string | null = null
  let branch: string | null = null
  let cwd: string | null = null
  let model: string | null = null
  let version: string | null = null
  let userMessageCount = 0
  let assistantMessageCount = 0
  let totalMessageCount = 0
  let toolCallCount = 0

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
      const content = msg.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') toolCallCount++
        }
      }
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
    toolCallCount,
    model,
    version,
    fileSizeBytes,
    isInteractive,
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
  // Detect non-interactive sessions by checking head lines for queue-operation
  const headForDetect = await readHeadLines(filePath, HEAD_LINES)
  let isInteractive = true
  for (const line of headForDetect) {
    const raw = safeParse(line)
    if (raw && (raw as { type: string }).type === 'queue-operation') {
      isInteractive = false
      break
    }
  }

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
  const agentIdByToolUseId = new Map<string, string>()

  // Map for linking TaskCreate tool_use_id to pending task
  const pendingTaskByToolUseId = new Map<string, TaskItem>()
  const taskById = new Map<string, TaskItem>()

  // Context window tracking
  const contextSnapshots: ContextWindowSnapshot[] = []
  let assistantTurnIndex = 0

  // Dedup: skip token accumulation for repeated requestIds (same API call logged multiple times)
  const seenRequestIds = new Set<string>()

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg || msg.type === 'file-history-snapshot') continue

    if (msg.gitBranch && !branch) branch = msg.gitBranch

    // Track agent progress messages
    if (msg.type === 'progress' && msg.parentToolUseID) {
      const parentId = msg.parentToolUseID

      // Track the agentId from progress messages
      const progressAgentId = msg.data?.agentId
      if (progressAgentId && parentId) {
        agentIdByToolUseId.set(parentId, progressAgentId)
      }

      // Track the model used by each agent
      const progressModel = msg.data?.message?.message?.model
      if (progressModel && parentId) {
        agentProgressModel.set(parentId, progressModel)
      }

      // Deduplicate progress messages by requestId — same API call can appear multiple times
      const progressRequestId = msg.requestId
      const isNewProgressRequest = !progressRequestId || !seenRequestIds.has(progressRequestId)
      if (progressRequestId) seenRequestIds.add(progressRequestId)

      const usage = msg.data?.message?.message?.usage
      if (usage && isNewProgressRequest) {
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

          // Extract agent invocations from Task/Agent tool calls
          if (AGENT_DISPATCH_TOOL_NAMES.has(block.name) && block.input) {
            const inp = block.input as Record<string, unknown>
            const subagentType = inp.subagent_type ?? inp.agent_type
            if (subagentType) {
              const agent: AgentInvocation = {
                subagentType: String(subagentType),
                description: String(inp.description ?? inp.prompt ?? ''),
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

        // Deduplicate by requestId — same API call can appear in multiple JSONL lines
        const requestId = msg.requestId
        const isNewRequest = !requestId || !seenRequestIds.has(requestId)
        if (requestId) seenRequestIds.add(requestId)

        if (isNewRequest) {
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
        }

        // Track context window snapshot (always — tracks what was sent to the API, not billing)
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
          tokens: isNewRequest ? tokens : undefined,
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

          // Extract agentId from background agent launch text
          // Background agents (run_in_background: true) emit NO progress messages.
          // Their agentId appears in the tool_result text content like:
          //   "agentId: aa1bbed (internal ID - do not mention to user...)"
          if (resultText && toolUseId) {
            const agentIdMatch = resultText.match(/agentId:\s*([\w-]+)/)
            if (agentIdMatch) {
              agentIdByToolUseId.set(String(toolUseId), agentIdMatch[1])
            }
          }

          // Extract agentId and agent stats from toolUseResult
          if (msg.toolUseResult && toolUseId) {
            const result = msg.toolUseResult

            // Always extract agentId regardless of matching agent dispatch
            if (result.agentId) {
              agentIdByToolUseId.set(String(toolUseId), result.agentId)
            }

            // TaskOutput results may also contain an agentId via task.task_id
            if (result.retrieval_status && result.task?.task_id) {
              agentIdByToolUseId.set(String(toolUseId), result.task.task_id)
            }

            // Extract agent completion stats if we have a matching agent dispatch
            const agent = agentByToolUseId.get(String(toolUseId))
            if (agent) {
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

  // Discover all subagent files via filesystem scan
  const sessionDir = filePath.replace(/\.jsonl$/, '')
  const subagentFileMap = await discoverSubagentFiles(sessionDir)

  // Track which agentIds have been matched to a known agent dispatch
  const matchedAgentIds = new Set<string>()

  // Enrich agents with agentId and subagent detail (skills, tokens, tools, model)
  await Promise.all(
    agents.map(async (agent) => {
      const agentId = agentIdByToolUseId.get(agent.toolUseId)
      if (!agentId) return

      agent.agentId = agentId
      matchedAgentIds.add(agentId)

      const subagentFilePath = subagentFileMap.get(agentId)
      if (!subagentFilePath) return

      try {
        const detail = await parseSubagentDetail(subagentFilePath)
        mergeSubagentData(
          agent,
          detail,
          agentProgressTokens.get(agent.toolUseId),
          totalTokens,
          tokensByModel,
        )
      } catch {
        // Subagent file is not readable — skip
      }
    }),
  )

  // Task 6: Handle orphan subagent files (files not matched to any agent dispatch)
  for (const [agentId, subagentFilePath] of subagentFileMap) {
    if (matchedAgentIds.has(agentId)) continue

    try {
      const detail = await parseSubagentDetail(subagentFilePath)

      const hasTokens = detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0
      const hasActivity = hasTokens || detail.skills.length > 0 || detail.totalToolUseCount > 0

      // Add tokens to session-level totals
      if (hasTokens) {
        addTokens(totalTokens, detail.tokens)

        // Add to per-model tracking
        if (detail.model) {
          const existing = tokensByModel[detail.model] ?? createEmptyTokenUsage()
          addTokens(existing, detail.tokens)
          tokensByModel[detail.model] = existing
        }
      }

      // Merge tool calls into session-level tool frequency
      for (const [toolName, count] of Object.entries(detail.toolCalls)) {
        toolFrequency[toolName] = (toolFrequency[toolName] ?? 0) + count
      }

      // Push a synthetic AgentInvocation for this orphan subagent only if meaningful
      if (hasActivity) {
        agents.push({
          subagentType: 'unknown',
          description: '',
          timestamp: '',
          toolUseId: `orphan-${agentId}`,
          agentId,
          tokens: detail.tokens,
          toolCalls: detail.toolCalls,
          model: detail.model,
          totalToolUseCount: detail.totalToolUseCount,
          skills: detail.skills,
        })
      }
    } catch {
      // Subagent file not readable — skip
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
    isInteractive,
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

// --- Subagent detail parsing ---

/** Regex to extract skill name from <command-name>SKILL_NAME</command-name> */
const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/

interface SubagentDetail {
  skills: SkillInvocation[]
  tokens: TokenUsage
  toolCalls: Record<string, number>
  model?: string
  totalToolUseCount: number
}

/**
 * Full single-pass parser that reads a subagent JSONL file and extracts
 * skills, token usage, tool call frequency, and model info.
 *
 * Skills detection has two patterns:
 *
 * 1. **Injected skills** (from agent frontmatter): user messages where
 *    content[0].text contains `<command-name>SKILL_NAME</command-name>`.
 *    These appear in the first ~20 messages of the subagent JSONL.
 *
 * 2. **Invoked skills** (legacy): assistant messages with `Skill` tool_use blocks.
 *
 * Token usage, tool calls, and model are extracted from assistant messages
 * that contain `usage` and `content` fields (same structure as main session).
 */
async function parseSubagentDetail(
  subagentFilePath: string,
): Promise<SubagentDetail> {
  const skills: SkillInvocation[] = []
  const tokens: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
  const toolCalls: Record<string, number> = {}
  let model: string | undefined
  let totalToolUseCount = 0
  const seenRequestIds = new Set<string>()

  const stream = fs.createReadStream(subagentFilePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let lineCount = 0
  const MAX_LINES_FOR_INJECTED = 20

  for await (const line of rl) {
    const msg = safeParse(line)
    if (!msg) continue
    lineCount++

    // Pattern 1: Injected skills from agent frontmatter (user messages with <command-name>)
    if (lineCount <= MAX_LINES_FOR_INJECTED && msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content
      if (Array.isArray(content) && content.length >= 1) {
        const firstBlock = content[0]
        if (firstBlock.type === 'text' && firstBlock.text) {
          const match = COMMAND_NAME_RE.exec(firstBlock.text)
          if (match) {
            const skillName = match[1].trim()
            if (skillName) {
              skills.push({
                skill: skillName,
                args: null,
                timestamp: msg.timestamp ?? '',
                toolUseId: `injected-${skillName}-${lineCount}`,
                source: 'injected',
              })
            }
          }
        }
      }
    }

    // Extract data from assistant messages
    if (msg.type === 'assistant' && msg.message) {
      const requestId = msg.requestId

      // Only count tokens once per API call (messages from same call share requestId)
      const isNewRequest = !requestId || !seenRequestIds.has(requestId)
      if (requestId) seenRequestIds.add(requestId)

      // Extract model (use the first one found, which is the actual model)
      if (msg.message.model && !model) {
        model = msg.message.model
      }

      // Accumulate tokens across all requests (cumulative total for the subagent)
      if (isNewRequest && msg.message.usage) {
        const u = msg.message.usage
        tokens.inputTokens += u.input_tokens ?? 0
        tokens.outputTokens += u.output_tokens ?? 0
        tokens.cacheReadInputTokens += u.cache_read_input_tokens ?? 0
        tokens.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0
      }

      // Extract tool calls and skills from content blocks
      if (msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && block.name) {
            toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1
            totalToolUseCount++

            // Legacy Skill tool_use blocks
            if (block.name === 'Skill') {
              const inp = block.input as Record<string, unknown> | undefined
              if (inp?.skill) {
                skills.push({
                  skill: String(inp.skill),
                  args: inp.args ? String(inp.args) : null,
                  timestamp: msg.timestamp ?? '',
                  toolUseId: block.id ?? '',
                  source: 'invoked',
                })
              }
            }
          }
        }
      }
    }
  }

  return { skills, tokens, toolCalls, model, totalToolUseCount }
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

// --- Token merge helpers ---

function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
}

function addTokens(target: TokenUsage, source: TokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
}

function subtractTokens(target: TokenUsage, source: TokenUsage): void {
  target.inputTokens -= source.inputTokens
  target.outputTokens -= source.outputTokens
  target.cacheReadInputTokens -= source.cacheReadInputTokens
  target.cacheCreationInputTokens -= source.cacheCreationInputTokens
}

/**
 * Merge subagent detail data into an agent invocation with double-count prevention.
 *
 * - Always sets skills from subagent detail (most complete source).
 * - If subagent has tokens AND progress tokens were already counted:
 *   subtract progress tokens from session totals first, then add subagent tokens.
 * - If subagent has tokens but NO progress tokens: just add to totals.
 * - Merges tool calls, model, totalToolUseCount.
 */
function mergeSubagentData(
  agent: AgentInvocation,
  detail: SubagentDetail,
  progressTokens: TokenUsage | undefined,
  totalTokens: TokenUsage,
  tokensByModel: Record<string, TokenUsage>,
): void {
  // Always set skills from subagent JSONL (most complete source)
  agent.skills = detail.skills

  // Token merge with double-count prevention
  if (detail.tokens.inputTokens > 0 || detail.tokens.outputTokens > 0) {
    if (progressTokens) {
      // Progress tokens were already added to session totals — replace them
      // Subtract the progress tokens that were previously added
      subtractTokens(totalTokens, progressTokens)

      // If progress tokens were tracked per-model, subtract from the old model.
      // agent.model was set from agentProgressModel (same model used when adding
      // progress tokens to tokensByModel), so the key is guaranteed to match.
      const progressModel = agent.model
      if (progressModel && tokensByModel[progressModel]) {
        subtractTokens(tokensByModel[progressModel], progressTokens)
      }
    }

    // Set agent-level tokens from the more accurate subagent JSONL
    agent.tokens = detail.tokens

    // Add subagent tokens to session-level totals
    addTokens(totalTokens, detail.tokens)

    // Add to per-model tracking
    if (detail.model) {
      const existing = tokensByModel[detail.model] ?? createEmptyTokenUsage()
      addTokens(existing, detail.tokens)
      tokensByModel[detail.model] = existing
    }
  } else if (!agent.tokens && progressTokens) {
    // Subagent JSONL has no tokens — keep progress tokens as-is
    agent.tokens = progressTokens
  }

  // Merge tool calls (prefer subagent detail, fallback to progress)
  if (!agent.toolCalls && Object.keys(detail.toolCalls).length > 0) {
    agent.toolCalls = detail.toolCalls
  }

  // NOTE: We do NOT merge subagent tool calls into session-level toolFrequency here.
  // Session-level toolFrequency already contains the dispatch tool call (Task/Agent).
  // Adding subagent-internal tool calls would double-count when the main session's
  // assistant messages already track tool_use blocks. Orphan handling has its own
  // toolFrequency merge because orphan agents have no main-session dispatch.

  if (!agent.model && detail.model) {
    agent.model = detail.model
  }

  if (!agent.totalToolUseCount && detail.totalToolUseCount > 0) {
    agent.totalToolUseCount = detail.totalToolUseCount
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
  rl.close()
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
