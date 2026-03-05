import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { discoverSubagentFiles } from './subagent-discovery'
import { parseDetail } from './session-parser'

describe('discoverSubagentFiles', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-subagent-discovery-'))
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should return empty map when session directory does not exist', async () => {
    const result = await discoverSubagentFiles('/nonexistent/path')
    expect(result.size).toBe(0)
  })

  it('should return empty map when session directory has no subagents or agents dir', async () => {
    const result = await discoverSubagentFiles(tempDir)
    expect(result.size).toBe(0)
  })

  it('should discover files in subagents/ directory', async () => {
    const subagentsDir = path.join(tempDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, 'agent-abc123.jsonl'), '{}')
    fs.writeFileSync(path.join(subagentsDir, 'agent-def456.jsonl'), '{}')

    const result = await discoverSubagentFiles(tempDir)

    expect(result.size).toBe(2)
    expect(result.get('abc123')).toBe(path.join(subagentsDir, 'agent-abc123.jsonl'))
    expect(result.get('def456')).toBe(path.join(subagentsDir, 'agent-def456.jsonl'))
  })

  it('should discover files in agents/ directory', async () => {
    const agentsDir = path.join(tempDir, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(path.join(agentsDir, 'agent-xyz789.jsonl'), '{}')

    const result = await discoverSubagentFiles(tempDir)

    expect(result.size).toBe(1)
    expect(result.get('xyz789')).toBe(path.join(agentsDir, 'agent-xyz789.jsonl'))
  })

  it('should prioritize subagents/ over agents/ for same agentId', async () => {
    const subagentsDir = path.join(tempDir, 'subagents')
    const agentsDir = path.join(tempDir, 'agents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.mkdirSync(agentsDir, { recursive: true })

    fs.writeFileSync(path.join(subagentsDir, 'agent-abc123.jsonl'), '{"from":"subagents"}')
    fs.writeFileSync(path.join(agentsDir, 'agent-abc123.jsonl'), '{"from":"agents"}')

    const result = await discoverSubagentFiles(tempDir)

    expect(result.size).toBe(1)
    // Should be from subagents/ (higher priority)
    expect(result.get('abc123')).toBe(path.join(subagentsDir, 'agent-abc123.jsonl'))
  })

  it('should ignore non-matching files', async () => {
    const subagentsDir = path.join(tempDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, 'agent-abc123.jsonl'), '{}')
    fs.writeFileSync(path.join(subagentsDir, 'not-an-agent.jsonl'), '{}')
    fs.writeFileSync(path.join(subagentsDir, 'agent-def456.txt'), '{}')
    fs.writeFileSync(path.join(subagentsDir, 'readme.md'), '# readme')

    const result = await discoverSubagentFiles(tempDir)

    expect(result.size).toBe(1)
    expect(result.has('abc123')).toBe(true)
  })
})

describe('Agent tool name detection', () => {
  let tempDir: string
  let testFiles: string[]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-agent-tool-'))
    testFiles = []
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  function createSessionJSONL(lines: string[]): string {
    const filePath = path.join(tempDir, `session-${Date.now()}-${Math.random()}.jsonl`)
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    testFiles.push(filePath)
    return filePath
  }

  function createSubagentFile(sessionPath: string, agentId: string, lines: string[]): void {
    const subagentDir = sessionPath.replace(/\.jsonl$/, '')
    const subagentsDir = path.join(subagentDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    const subagentPath = path.join(subagentsDir, `agent-${agentId}.jsonl`)
    fs.writeFileSync(subagentPath, lines.join('\n'), 'utf-8')
    testFiles.push(subagentPath)
  }

  it('should detect "Agent" tool name (new format >= 2.1.68)', async () => {
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              id: 'agent-tool-1',
              input: { agent_type: 'implementer', prompt: 'Build it' },
            },
          ],
        },
      }),
      // tool_result with agentId
      JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T10:01:00Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'agent-tool-1',
              content: [
                {
                  type: 'text',
                  text: 'Agent launched.\nagentId: newformat123 (internal ID)',
                },
              ],
            },
          ],
        },
      }),
    ])

    createSubagentFile(sessionPath, 'newformat123', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 5000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [{ type: 'text', text: 'Done' }],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].subagentType).toBe('implementer')
    expect(result.agents[0].agentId).toBe('newformat123')
    expect(result.agents[0].tokens).toBeDefined()
    expect(result.agents[0].tokens!.inputTokens).toBe(5000)
  })

  it('should detect "Task" tool name (legacy format <= 2.1.63)', async () => {
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'task-tool-1',
              input: { subagent_type: 'reviewer', description: 'Review code' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'progress',
        timestamp: '2026-01-01T10:01:00Z',
        parentToolUseID: 'task-tool-1',
        data: { agentId: 'legacy123' },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].subagentType).toBe('reviewer')
    expect(result.agents[0].agentId).toBe('legacy123')
  })
})

describe('new-format session (Agent tool, no progress, subagent JSONL only)', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-newformat-'))
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  function createSessionJSONL(lines: string[]): string {
    const filePath = path.join(tempDir, `session-${Date.now()}-${Math.random()}.jsonl`)
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return filePath
  }

  function createSubagentFile(sessionPath: string, agentId: string, lines: string[]): void {
    const subagentDir = sessionPath.replace(/\.jsonl$/, '')
    const subagentsDir = path.join(subagentDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, `agent-${agentId}.jsonl`), lines.join('\n'), 'utf-8')
  }

  it('should get tokens exclusively from subagent JSONL when no progress messages exist', async () => {
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              id: 'agent-1',
              input: { agent_type: 'implementer', prompt: 'Build feature' },
            },
          ],
        },
      }),
      // toolUseResult with agentId (new format)
      JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T10:05:00Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'agent-1',
              content: 'Agent completed.',
            },
          ],
        },
        toolUseResult: {
          agentId: 'new-agent-1',
          totalTokens: 50000,
          totalToolUseCount: 25,
          totalDurationMs: 60000,
        },
      }),
    ])

    createSubagentFile(sessionPath, 'new-agent-1', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 20000, output_tokens: 5000, cache_read_input_tokens: 3000, cache_creation_input_tokens: 1000 },
          content: [
            { type: 'tool_use', name: 'Read', id: 'r1', input: { file_path: '/a.ts' } },
            { type: 'tool_use', name: 'Write', id: 'w1', input: { file_path: '/b.ts', content: '...' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:03:00Z',
        requestId: 'req-2',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 25000, output_tokens: 6000, cache_read_input_tokens: 4000, cache_creation_input_tokens: 2000 },
          content: [
            { type: 'tool_use', name: 'Read', id: 'r2', input: { file_path: '/c.ts' } },
          ],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    expect(result.agents).toHaveLength(1)
    const agent = result.agents[0]
    expect(agent.agentId).toBe('new-agent-1')
    // Tokens from subagent JSONL (cumulative)
    expect(agent.tokens!.inputTokens).toBe(45000)
    expect(agent.tokens!.outputTokens).toBe(11000)
    // Tool calls from subagent JSONL
    expect(agent.toolCalls).toEqual({ Read: 2, Write: 1 })
    expect(agent.model).toBe('claude-opus-4-6')
    // Session-level totals should include subagent tokens
    expect(result.totalTokens.inputTokens).toBe(45000)
    expect(result.totalTokens.outputTokens).toBe(11000)
  })
})

describe('double-count prevention', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-doublecount-'))
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  function createSessionJSONL(lines: string[]): string {
    const filePath = path.join(tempDir, `session-${Date.now()}-${Math.random()}.jsonl`)
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return filePath
  }

  function createSubagentFile(sessionPath: string, agentId: string, lines: string[]): void {
    const subagentDir = sessionPath.replace(/\.jsonl$/, '')
    const subagentsDir = path.join(subagentDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, `agent-${agentId}.jsonl`), lines.join('\n'), 'utf-8')
  }

  it('should not double-count when session has BOTH progress tokens AND subagent JSONL tokens', async () => {
    // Old-format session: has progress messages with tokens
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'task-dc',
              input: { subagent_type: 'implementer', description: 'Work' },
            },
          ],
        },
      }),
      // Progress message WITH usage (old format behavior)
      JSON.stringify({
        type: 'progress',
        timestamp: '2026-01-01T10:01:00Z',
        parentToolUseID: 'task-dc',
        data: {
          agentId: 'agent-dc',
          message: {
            message: {
              model: 'claude-opus-4-6',
              usage: {
                input_tokens: 10000,
                output_tokens: 2000,
                cache_read_input_tokens: 1000,
                cache_creation_input_tokens: 500,
              },
            },
          },
        },
      }),
    ])

    // Subagent JSONL has the REAL, more accurate tokens
    createSubagentFile(sessionPath, 'agent-dc', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 12000,
            output_tokens: 2500,
            cache_read_input_tokens: 1500,
            cache_creation_input_tokens: 600,
          },
          content: [{ type: 'text', text: 'Done' }],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    expect(result.agents).toHaveLength(1)
    const agent = result.agents[0]

    // Agent should have subagent JSONL tokens (more accurate), NOT progress tokens
    expect(agent.tokens!.inputTokens).toBe(12000)
    expect(agent.tokens!.outputTokens).toBe(2500)

    // Session-level totals should be the subagent tokens ONLY, not progress + subagent
    // (progress tokens were subtracted, then subagent tokens were added)
    expect(result.totalTokens.inputTokens).toBe(12000)
    expect(result.totalTokens.outputTokens).toBe(2500)
    expect(result.totalTokens.cacheReadInputTokens).toBe(1500)
    expect(result.totalTokens.cacheCreationInputTokens).toBe(600)
  })

  it('should not add subagent tool calls to session-level toolFrequency for matched agents', async () => {
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'task-tf',
              input: { subagent_type: 'implementer', description: 'Work' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'progress',
        timestamp: '2026-01-01T10:01:00Z',
        parentToolUseID: 'task-tf',
        data: { agentId: 'agent-tf' },
      }),
    ])

    createSubagentFile(sessionPath, 'agent-tf', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-opus-4-6',
          content: [
            { type: 'tool_use', name: 'Read', id: 'r1', input: { file_path: '/a.ts' } },
            { type: 'tool_use', name: 'Write', id: 'w1', input: { file_path: '/b.ts', content: '...' } },
            { type: 'tool_use', name: 'Read', id: 'r2', input: { file_path: '/c.ts' } },
          ],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    // Session-level toolFrequency should only have "Task" (the dispatch tool),
    // NOT the subagent's Read/Write tool calls
    expect(result.toolFrequency['Task']).toBe(1)
    expect(result.toolFrequency['Read']).toBeUndefined()
    expect(result.toolFrequency['Write']).toBeUndefined()
  })
})

describe('orphan subagent handling', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-orphan-'))
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  function createSessionJSONL(lines: string[]): string {
    const filePath = path.join(tempDir, `session-${Date.now()}-${Math.random()}.jsonl`)
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return filePath
  }

  function createSubagentFile(sessionPath: string, agentId: string, lines: string[]): void {
    const subagentDir = sessionPath.replace(/\.jsonl$/, '')
    const subagentsDir = path.join(subagentDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    fs.writeFileSync(path.join(subagentsDir, `agent-${agentId}.jsonl`), lines.join('\n'), 'utf-8')
  }

  it('should create synthetic agent for orphan subagent file', async () => {
    // Session with NO agent dispatches
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [{ type: 'text', text: 'Hello' }],
        },
      }),
    ])

    // But there IS a subagent file on disk (orphan)
    createSubagentFile(sessionPath, 'orphan-agent-1', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-sonnet-4-20250514',
          usage: { input_tokens: 8000, output_tokens: 1500, cache_read_input_tokens: 500, cache_creation_input_tokens: 200 },
          content: [
            { type: 'tool_use', name: 'Bash', id: 'b1', input: { command: 'ls' } },
          ],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    // Should have the synthetic orphan agent
    const orphan = result.agents.find((a) => a.agentId === 'orphan-agent-1')
    expect(orphan).toBeDefined()
    expect(orphan!.subagentType).toBe('unknown')
    expect(orphan!.toolUseId).toBe('orphan-orphan-agent-1')
    expect(orphan!.tokens!.inputTokens).toBe(8000)
    expect(orphan!.tokens!.outputTokens).toBe(1500)
    expect(orphan!.toolCalls).toEqual({ Bash: 1 })
    expect(orphan!.model).toBe('claude-sonnet-4-20250514')

    // Orphan tokens should be in session totals
    expect(result.totalTokens.inputTokens).toBe(100 + 8000)
    expect(result.totalTokens.outputTokens).toBe(50 + 1500)

    // Orphan tool calls SHOULD be in session-level toolFrequency
    expect(result.toolFrequency['Bash']).toBe(1)
  })

  it('should not create duplicate for matched agent', async () => {
    const sessionPath = createSessionJSONL([
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'task-match',
              input: { subagent_type: 'implementer', description: 'Work' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'progress',
        timestamp: '2026-01-01T10:01:00Z',
        parentToolUseID: 'task-match',
        data: { agentId: 'matched-agent' },
      }),
    ])

    createSubagentFile(sessionPath, 'matched-agent', [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        requestId: 'req-1',
        message: {
          model: 'claude-opus-4-6',
          content: [{ type: 'text', text: 'Done' }],
        },
      }),
    ])

    const result = await parseDetail(sessionPath, 'test', '/test', 'test-project')

    // Should only have 1 agent (the matched one), not a duplicate orphan
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0].agentId).toBe('matched-agent')
    expect(result.agents[0].subagentType).toBe('implementer')
  })
})
