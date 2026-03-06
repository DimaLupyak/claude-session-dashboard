/**
 * Fuzz target for the JSONL session parsers.
 *
 * Uses Jazzer.js FuzzedDataProvider to exercise the core parsing logic
 * with arbitrary byte sequences, helping surface crashes, hangs, or
 * unexpected behaviour in the JSON parsing and message-processing paths.
 *
 * Run locally (after `npm install @jazzer.js/core`):
 *   npx jazzer fuzz.ts -- -max_total_time=60
 */
import { FuzzedDataProvider } from '@jazzer.js/core'

// ---------------------------------------------------------------------------
// Inline the pure (non-filesystem) parsing helpers from session-parser.ts so
// the fuzz target has zero I/O and runs synchronously.
// ---------------------------------------------------------------------------

interface RawMessage {
  type?: string
  uuid?: string
  timestamp?: string
  cwd?: string
  gitBranch?: string
  version?: string
  message?: {
    model?: string
    content?: Array<{
      type?: string
      text?: string
      name?: string
      id?: string
      input?: Record<string, unknown>
      tool_use_id?: string
      content?: string | Array<{ type?: string; text?: string }>
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
    agentId?: string
    message?: {
      message?: {
        model?: string
        content?: Array<{ type?: string; name?: string; id?: string; input?: Record<string, unknown> }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      }
    }
  }
  requestId?: string
  parentToolUseID?: string
  toolUseResult?: {
    totalTokens?: number
    agentId?: string
    retrieval_status?: string
    task?: { task_id?: string }
  }
  slug?: string
  subtype?: string
  level?: string
}

function safeParse(line: string): RawMessage | null {
  try {
    return JSON.parse(line) as RawMessage
  } catch {
    return null
  }
}

function extractToolResultText(block: {
  text?: string
  content?: string | Array<{ type?: string; text?: string }>
}): string | undefined {
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

function extractTextContent(msg: RawMessage): string | undefined {
  if (!msg.message) return undefined
  const content = msg.message.content
  if (!Array.isArray(content)) return undefined
  const texts = content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
  return texts.length > 0 ? texts.join('\n').slice(0, 500) : undefined
}

const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/
const AGENT_DISPATCH_TOOL_NAMES = new Set(['Task', 'Agent'])

/**
 * Drive the summary-parsing logic (the field-extraction loop that runs over
 * head/tail lines) with a single fuzzed JSONL line.
 */
function fuzzSummaryParsing(line: string): void {
  const msg = safeParse(line)
  if (!msg) return
  if (msg.type === 'file-history-snapshot') return

  const ts = msg.timestamp
  let startedAt: string | null = null
  let lastActiveAt: string | null = null

  if (ts) {
    if (!startedAt || ts < startedAt) startedAt = ts
    if (!lastActiveAt || ts > lastActiveAt) lastActiveAt = ts
  }

  // Mimic durationMs computation from parseSummary
  if (startedAt && lastActiveAt) {
    const _durationMs = new Date(lastActiveAt).getTime() - new Date(startedAt).getTime()
  }

  // Field extraction (same as parseSummary loop body)
  const _branch = msg.gitBranch ?? null
  const _cwd = msg.cwd ?? null
  const _version = msg.version ?? null
  const _model = msg.type === 'assistant' ? (msg.message?.model ?? null) : null
}

/**
 * Drive the detail-parsing logic with a single fuzzed JSONL line.
 * Exercises tool-call extraction, token accumulation, and content parsing.
 */
function fuzzDetailParsing(line: string): void {
  const msg = safeParse(line)
  if (!msg) return
  if (msg.type === 'file-history-snapshot') return

  const toolFrequency: Record<string, number> = {}
  const totalTokens = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }

  // Progress message path
  if (msg.type === 'progress' && msg.parentToolUseID) {
    const usage = msg.data?.message?.message?.usage
    if (usage) {
      totalTokens.inputTokens += usage.input_tokens ?? 0
      totalTokens.outputTokens += usage.output_tokens ?? 0
      totalTokens.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
      totalTokens.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
    }

    const content = msg.data?.message?.message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          toolFrequency[block.name] = (toolFrequency[block.name] ?? 0) + 1
        }
      }
    }
    return
  }

  // Assistant message path
  if (msg.type === 'assistant' && msg.message) {
    const content = msg.message.content ?? []
    for (const block of content) {
      if (block.type === 'tool_use' && block.name) {
        toolFrequency[block.name] = (toolFrequency[block.name] ?? 0) + 1

        if (AGENT_DISPATCH_TOOL_NAMES.has(block.name) && block.input) {
          const inp = block.input as Record<string, unknown>
          const _subagentType = inp.subagent_type ?? inp.agent_type
          const _description = String(inp.description ?? inp.prompt ?? '')
        }

        if (block.name === 'Skill' && block.input) {
          const inp = block.input as Record<string, unknown>
          const _skill = inp.skill ? String(inp.skill) : null
          const _args = inp.args ? String(inp.args) : null
        }

        if (block.name === 'TaskCreate' && block.input) {
          const inp = block.input as Record<string, unknown>
          const _subject = String(inp.subject ?? '')
          const _description = inp.description ? String(inp.description) : undefined
        }
      }
    }

    if (msg.message.usage) {
      const u = msg.message.usage
      totalTokens.inputTokens += u.input_tokens ?? 0
      totalTokens.outputTokens += u.output_tokens ?? 0
      totalTokens.cacheReadInputTokens += u.cache_read_input_tokens ?? 0
      totalTokens.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0

      // Context window size computation (mirrors session-parser.ts)
      const _contextSize =
        totalTokens.inputTokens +
        totalTokens.cacheReadInputTokens +
        totalTokens.cacheCreationInputTokens
    }
  }

  // User message / tool_result path
  if (msg.type === 'user' && msg.message?.content) {
    const content = msg.message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== 'tool_result') continue
        const resultText = extractToolResultText(block as Parameters<typeof extractToolResultText>[0])

        if (resultText) {
          // Task ID extraction regex
          const _taskMatch = resultText.match(/Task #(\S+) created successfully/)
          // Agent ID extraction regex
          const _agentIdMatch = resultText.match(/agentId:\s*([\w-]+)/)
        }

        if (msg.toolUseResult) {
          const _agentId = msg.toolUseResult.agentId
          const _retrievalStatus = msg.toolUseResult.retrieval_status
          const _taskId = msg.toolUseResult.task?.task_id
        }
      }
    }
  }

  // System error path
  if (msg.type === 'system' && msg.level === 'error') {
    const _message = msg.slug ?? msg.subtype ?? 'Unknown error'
    const _type = msg.subtype ?? 'system'
  }

  // Text content extraction (used for turn messages)
  if (msg.type === 'user' || msg.type === 'assistant' || msg.type === 'system') {
    extractTextContent(msg)
  }
}

/**
 * Drive the injected-skill detection regex against fuzzed text content.
 * Exercises the COMMAND_NAME_RE pattern used in parseSubagentDetail.
 */
function fuzzSkillInjectionDetection(text: string): void {
  const match = COMMAND_NAME_RE.exec(text)
  if (match) {
    const _skillName = match[1].trim()
  }
}

/**
 * Drive history-entry validation logic with fuzzed JSON.
 */
function fuzzHistoryParsing(line: string): void {
  try {
    const entry = JSON.parse(line) as {
      display?: unknown
      timestamp?: unknown
      sessionId?: unknown
      project?: unknown
    }
    // Mirrors the validation in history-parser.ts parseHistory()
    const _isValid = Boolean(entry.display && entry.timestamp && entry.sessionId)
  } catch {
    // Malformed JSON is expected — ignore
  }
}

// ---------------------------------------------------------------------------
// Jazzer.js entry point
// ---------------------------------------------------------------------------

/**
 * The fuzz target exported for Jazzer.js.
 * Receives a Buffer of arbitrary bytes on each iteration.
 */
export function fuzz(data: Buffer): void {
  const provider = new FuzzedDataProvider(data)

  // Use a byte to pick which parser path to exercise so the fuzzer can
  // explore all branches rather than hammering a single one.
  const selector = provider.consumeIntegralInRange(0, 3)
  const inputString = provider.consumeRemainingAsString()

  switch (selector) {
    case 0:
      fuzzSummaryParsing(inputString)
      break
    case 1:
      fuzzDetailParsing(inputString)
      break
    case 2:
      fuzzSkillInjectionDetection(inputString)
      break
    case 3:
      fuzzHistoryParsing(inputString)
      break
  }
}
