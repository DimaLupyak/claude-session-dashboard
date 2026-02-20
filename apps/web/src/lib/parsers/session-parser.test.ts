import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { parseDetail } from './session-parser'

describe('parseSubagentSkills', () => {
  let tempDir: string
  let testFiles: string[]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-subagent-skills-'))
    testFiles = []
  })

  afterEach(() => {
    // Clean up test files
    for (const file of testFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    // Clean up temp directory
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

  function createSubagentFile(sessionPath: string, agentId: string, lines: string[]): string {
    const subagentDir = sessionPath.replace(/\.jsonl$/, '')
    const subagentsDir = path.join(subagentDir, 'subagents')
    fs.mkdirSync(subagentsDir, { recursive: true })
    const subagentPath = path.join(subagentsDir, `agent-${agentId}.jsonl`)
    fs.writeFileSync(subagentPath, lines.join('\n'), 'utf-8')
    testFiles.push(subagentPath)
    return subagentPath
  }

  function makeSessionWithAgent(agentId: string): string[] {
    return [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:00:00Z',
        message: {
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              id: 'task1',
              input: { subagent_type: 'implementer', description: 'Do work' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'progress',
        timestamp: '2026-01-01T10:01:00Z',
        parentToolUseID: 'task1',
        data: { agentId },
      }),
    ]
  }

  /** Helper to create a <command-name> style injected skill user message */
  function makeInjectedSkillMessage(skillName: string, timestamp: string): string {
    return JSON.stringify({
      type: 'user',
      timestamp,
      message: {
        content: [
          {
            type: 'text',
            text: `<command-message>${skillName}</command-message>\n<command-name>${skillName}</command-name>\n<skill-format>true</skill-format>`,
          },
          {
            type: 'text',
            text: `Base directory for this skill: /path/to/.claude/skills/${skillName}\n\n# ${skillName} Skill Content\n...`,
          },
        ],
      },
    })
  }

  /** Helper to create a legacy Skill tool_use assistant message */
  function makeLegacySkillMessage(
    skillName: string,
    timestamp: string,
    toolUseId: string,
    args?: string,
  ): string {
    return JSON.stringify({
      type: 'assistant',
      timestamp,
      message: {
        model: 'claude-opus-4-6',
        content: [
          {
            type: 'tool_use',
            name: 'Skill',
            id: toolUseId,
            input: args ? { skill: skillName, args } : { skill: skillName },
          },
        ],
      },
    })
  }

  describe('injected skills via <command-name>', () => {
    it('should detect a single injected skill from user messages', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-001'))

      createSubagentFile(sessionPath, 'agent-001', [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: {
            content: [
              { type: 'text', text: 'You are a Senior Full-Stack Engineer...' },
            ],
          },
        }),
        makeInjectedSkillMessage('testing', '2026-01-01T10:01:01Z'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBe('agent-001')
      expect(result.agents[0].skills).toHaveLength(1)

      const skill = result.agents[0].skills![0]
      expect(skill.skill).toBe('testing')
      expect(skill.args).toBeNull()
      expect(skill.source).toBe('injected')
      expect(skill.timestamp).toBe('2026-01-01T10:01:01Z')
      expect(skill.toolUseId).toContain('injected-testing')
    })

    it('should detect multiple injected skills at same timestamp', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-002'))

      createSubagentFile(sessionPath, 'agent-002', [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: {
            content: [
              { type: 'text', text: 'You are a Senior Full-Stack Engineer...' },
            ],
          },
        }),
        makeInjectedSkillMessage('tanstack-start', '2026-01-01T10:01:01Z'),
        makeInjectedSkillMessage('typescript-rules', '2026-01-01T10:01:01Z'),
        makeInjectedSkillMessage('react-rules', '2026-01-01T10:01:01Z'),
        makeInjectedSkillMessage('uiux', '2026-01-01T10:01:01Z'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toHaveLength(4)

      const skillNames = result.agents[0].skills!.map((s) => s.skill)
      expect(skillNames).toEqual(['tanstack-start', 'typescript-rules', 'react-rules', 'uiux'])

      // All should be marked as injected
      for (const skill of result.agents[0].skills!) {
        expect(skill.source).toBe('injected')
        expect(skill.args).toBeNull()
      }
    })

    it('should return empty array when no injected skills exist', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-003'))

      createSubagentFile(sessionPath, 'agent-003', [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: {
            content: [
              { type: 'text', text: 'You are a Senior Full-Stack Engineer...' },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                id: 'read1',
                input: { file_path: '/test.ts' },
              },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toEqual([])
    })

    it('should only check first 20 messages for injected skills', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-004'))

      // Build 25 messages: skills at lines 2 and 22
      const lines: string[] = [
        // Line 1: initial prompt
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: { content: [{ type: 'text', text: 'Initial prompt' }] },
        }),
        // Line 2: injected skill (within first 20)
        makeInjectedSkillMessage('early-skill', '2026-01-01T10:01:01Z'),
      ]

      // Lines 3-20: filler assistant/user messages
      for (let i = 3; i <= 20; i++) {
        lines.push(
          JSON.stringify({
            type: 'assistant',
            timestamp: `2026-01-01T10:0${Math.floor(i / 10)}:${String(i % 60).padStart(2, '0')}Z`,
            message: {
              model: 'claude-opus-4-6',
              content: [{ type: 'text', text: `Message ${i}` }],
            },
          }),
        )
      }

      // Line 21+: injected skill AFTER the 20-message window (should not be detected as injected)
      lines.push(makeInjectedSkillMessage('late-skill', '2026-01-01T10:30:00Z'))

      createSubagentFile(sessionPath, 'agent-004', lines)

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      const skills = result.agents[0].skills!
      // Only the early skill should be detected (within first 20 lines)
      const skillNames = skills.map((s) => s.skill)
      expect(skillNames).toContain('early-skill')
      expect(skillNames).not.toContain('late-skill')
    })
  })

  describe('legacy Skill tool_use blocks (backward compatibility)', () => {
    it('should still detect legacy Skill tool_use blocks in assistant messages', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-005'))

      createSubagentFile(sessionPath, 'agent-005', [
        makeLegacySkillMessage('testing', '2026-01-01T10:02:00Z', 'skill1', '--coverage'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toHaveLength(1)

      const skill = result.agents[0].skills![0]
      expect(skill.skill).toBe('testing')
      expect(skill.args).toBe('--coverage')
      expect(skill.source).toBe('invoked')
      expect(skill.toolUseId).toBe('skill1')
    })

    it('should handle legacy Skill with null args', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-006'))

      createSubagentFile(sessionPath, 'agent-006', [
        makeLegacySkillMessage('typescript-rules', '2026-01-01T10:02:00Z', 'skill1'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toHaveLength(1)

      const skill = result.agents[0].skills![0]
      expect(skill.skill).toBe('typescript-rules')
      expect(skill.args).toBeNull()
      expect(skill.source).toBe('invoked')
    })
  })

  describe('mixed injected and legacy skills', () => {
    it('should detect both injected and legacy skills in same file', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-007'))

      createSubagentFile(sessionPath, 'agent-007', [
        // Injected skills near the start
        makeInjectedSkillMessage('typescript-rules', '2026-01-01T10:01:01Z'),
        makeInjectedSkillMessage('react-rules', '2026-01-01T10:01:01Z'),
        // Legacy invoked skill later
        makeLegacySkillMessage('testing', '2026-01-01T10:05:00Z', 'skill1', '--verbose'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      const skills = result.agents[0].skills!
      expect(skills).toHaveLength(3)

      // Injected skills
      expect(skills[0].skill).toBe('typescript-rules')
      expect(skills[0].source).toBe('injected')
      expect(skills[1].skill).toBe('react-rules')
      expect(skills[1].source).toBe('injected')

      // Invoked skill
      expect(skills[2].skill).toBe('testing')
      expect(skills[2].source).toBe('invoked')
      expect(skills[2].args).toBe('--verbose')
    })
  })

  describe('empty file', () => {
    it('should return empty array for empty subagent file', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-010'))

      createSubagentFile(sessionPath, 'agent-010', [''])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBe('agent-010')
      expect(result.agents[0].skills).toEqual([])
    })
  })

  describe('malformed JSON lines', () => {
    it('should skip malformed JSON lines and return valid skills', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-011'))

      createSubagentFile(sessionPath, 'agent-011', [
        makeInjectedSkillMessage('testing', '2026-01-01T10:01:01Z'),
        'invalid json line {{{',
        makeInjectedSkillMessage('typescript-rules', '2026-01-01T10:01:01Z'),
        'another bad line',
        makeLegacySkillMessage('react-rules', '2026-01-01T10:05:00Z', 'skill1'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toHaveLength(3)

      const skills = result.agents[0].skills!
      expect(skills[0].skill).toBe('testing')
      expect(skills[0].source).toBe('injected')
      expect(skills[1].skill).toBe('typescript-rules')
      expect(skills[1].source).toBe('injected')
      expect(skills[2].skill).toBe('react-rules')
      expect(skills[2].source).toBe('invoked')
    })
  })

  describe('agentId extraction', () => {
    it('should extract agentId from progress message data', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-alpha'))

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBe('agent-alpha')
    })

    it('should handle missing agentId gracefully (no progress message)', async () => {
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
                id: 'task1',
                input: { subagent_type: 'implementer', description: 'Build feature' },
              },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBeUndefined()
      expect(result.agents[0].skills).toBeUndefined()
    })

    it('should handle progress message without agentId field', async () => {
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
                id: 'task1',
                input: { subagent_type: 'implementer', description: 'Build feature' },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'progress',
          timestamp: '2026-01-01T10:01:00Z',
          parentToolUseID: 'task1',
          data: { someOtherField: 'value' },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBeUndefined()
      expect(result.agents[0].skills).toBeUndefined()
    })
  })

  describe('multiple agents in one session', () => {
    it('should parse skills for multiple agents correctly', async () => {
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
                id: 'task1',
                input: { subagent_type: 'implementer', description: 'Implement feature' },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'progress',
          timestamp: '2026-01-01T10:01:00Z',
          parentToolUseID: 'task1',
          data: { agentId: 'agent-impl' },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T11:00:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [
              {
                type: 'tool_use',
                name: 'Task',
                id: 'task2',
                input: { subagent_type: 'qa', description: 'Test feature' },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'progress',
          timestamp: '2026-01-01T11:01:00Z',
          parentToolUseID: 'task2',
          data: { agentId: 'agent-qa' },
        }),
      ])

      // Implementer agent with injected skills
      createSubagentFile(sessionPath, 'agent-impl', [
        makeInjectedSkillMessage('typescript-rules', '2026-01-01T10:01:01Z'),
        makeInjectedSkillMessage('react-rules', '2026-01-01T10:01:01Z'),
      ])

      // QA agent with injected skill + legacy invoked skill
      createSubagentFile(sessionPath, 'agent-qa', [
        makeInjectedSkillMessage('testing', '2026-01-01T11:01:01Z'),
        makeLegacySkillMessage('quality-check', '2026-01-01T11:05:00Z', 'skill-qc', '--strict'),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(2)

      const implAgent = result.agents.find((a) => a.agentId === 'agent-impl')
      expect(implAgent).toBeDefined()
      expect(implAgent!.skills).toHaveLength(2)
      expect(implAgent!.skills![0].skill).toBe('typescript-rules')
      expect(implAgent!.skills![0].source).toBe('injected')
      expect(implAgent!.skills![1].skill).toBe('react-rules')
      expect(implAgent!.skills![1].source).toBe('injected')

      const qaAgent = result.agents.find((a) => a.agentId === 'agent-qa')
      expect(qaAgent).toBeDefined()
      expect(qaAgent!.skills).toHaveLength(2)
      expect(qaAgent!.skills![0].skill).toBe('testing')
      expect(qaAgent!.skills![0].source).toBe('injected')
      expect(qaAgent!.skills![1].skill).toBe('quality-check')
      expect(qaAgent!.skills![1].source).toBe('invoked')
      expect(qaAgent!.skills![1].args).toBe('--strict')
    })
  })

  describe('background agent agentId extraction', () => {
    /**
     * Helper to create a user message with tool_result text content
     * mimicking a background agent launch result.
     * Background agents (run_in_background: true) emit NO progress messages.
     * Their agentId comes from text content in the tool_result block.
     */
    function makeBackgroundAgentResult(toolUseId: string, agentId: string): string {
      return JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T10:01:30Z',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: [
                {
                  type: 'text',
                  text: `Async agent launched successfully.\nagentId: ${agentId} (internal ID - do not mention to user. Use to resume later if needed.)\nThe agent is working in the background. You will be notified automatically when it completes.\nContinue with other tasks.\noutput_file: /private/tmp/claude-501/task-output.json`,
                },
              ],
            },
          ],
        },
      })
    }

    /**
     * Helper to create a session with a background agent (no progress messages).
     * The Task tool_use is followed by a user message with tool_result text
     * containing the agentId.
     */
    function makeSessionWithBackgroundAgent(toolUseId: string, agentId: string): string[] {
      return [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:00:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [
              {
                type: 'tool_use',
                name: 'Task',
                id: toolUseId,
                input: {
                  subagent_type: 'implementer',
                  description: 'Background work',
                },
              },
            ],
          },
        }),
        makeBackgroundAgentResult(toolUseId, agentId),
      ]
    }

    it('should extract agentId from background agent tool_result text', async () => {
      const sessionPath = createSessionJSONL(
        makeSessionWithBackgroundAgent('bg-task1', 'aa1bbed'),
      )

      createSubagentFile(sessionPath, 'aa1bbed', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [{ type: 'text', text: 'Working on it...' }],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBe('aa1bbed')
      expect(result.agents[0].subagentType).toBe('implementer')
    })

    it('should extract agentId from background agent without any progress messages', async () => {
      // Verify that NO progress message is needed for background agents
      const sessionPath = createSessionJSONL(
        makeSessionWithBackgroundAgent('bg-task2', 'bb2ccef'),
      )

      // Don't create subagent file to isolate just the agentId extraction
      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      // agentId should be extracted from text, even without progress messages
      expect(result.agents[0].agentId).toBe('bb2ccef')
    })

    it('should link background agent to subagent JSONL for skills and tokens', async () => {
      const sessionPath = createSessionJSONL(
        makeSessionWithBackgroundAgent('bg-task3', 'cc3ddef'),
      )

      createSubagentFile(sessionPath, 'cc3ddef', [
        makeInjectedSkillMessage('typescript-rules', '2026-01-01T10:01:01Z'),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          requestId: 'req1',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cache_read_input_tokens: 500,
              cache_creation_input_tokens: 100,
            },
            content: [
              { type: 'tool_use', name: 'Read', id: 'r1', input: { file_path: '/test.ts' } },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      const agent = result.agents[0]
      expect(agent.agentId).toBe('cc3ddef')
      expect(agent.skills).toHaveLength(1)
      expect(agent.skills![0].skill).toBe('typescript-rules')
      // Background agent tokens come from subagent JSONL
      expect(agent.tokens).toBeDefined()
      expect(agent.tokens!.inputTokens).toBe(1000)
      expect(agent.tokens!.outputTokens).toBe(200)
    })
  })

  describe('subagent token accumulation', () => {
    it('should accumulate tokens across multiple requests in subagent JSONL', async () => {
      const sessionPath = createSessionJSONL(
        makeSessionWithAgent('agent-accum'),
      )

      // Subagent file with 3 different requests, each with token usage
      createSubagentFile(sessionPath, 'agent-accum', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          requestId: 'req-1',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 10000,
              output_tokens: 2000,
              cache_read_input_tokens: 5000,
              cache_creation_input_tokens: 1000,
            },
            content: [{ type: 'text', text: 'Response 1' }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:03:00Z',
          requestId: 'req-2',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 20000,
              output_tokens: 3000,
              cache_read_input_tokens: 8000,
              cache_creation_input_tokens: 2000,
            },
            content: [{ type: 'text', text: 'Response 2' }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:04:00Z',
          requestId: 'req-3',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 16000,
              output_tokens: 4000,
              cache_read_input_tokens: 7000,
              cache_creation_input_tokens: 3000,
            },
            content: [{ type: 'text', text: 'Response 3' }],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      const agent = result.agents[0]

      // Foreground agents get tokens from progress messages, not subagent JSONL.
      // The progress tokens are already tracked separately.
      // But if no progress tokens exist, subagent tokens are used.
      // Since makeSessionWithAgent has a progress message without usage data,
      // the agent won't have progress-based tokens, so subagent tokens are used.

      // The key assertion: tokens should be CUMULATIVE (sum of all 3 requests)
      // not just the last request's tokens
      expect(agent.tokens).toBeDefined()
      expect(agent.tokens!.inputTokens).toBe(10000 + 20000 + 16000) // 46000
      expect(agent.tokens!.outputTokens).toBe(2000 + 3000 + 4000) // 9000
      expect(agent.tokens!.cacheReadInputTokens).toBe(5000 + 8000 + 7000) // 20000
      expect(agent.tokens!.cacheCreationInputTokens).toBe(1000 + 2000 + 3000) // 6000
    })

    it('should deduplicate tokens by requestId in subagent JSONL', async () => {
      const sessionPath = createSessionJSONL(
        makeSessionWithAgent('agent-dedup'),
      )

      // Two messages with the SAME requestId should only count once
      createSubagentFile(sessionPath, 'agent-dedup', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          requestId: 'req-same',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 5000,
              output_tokens: 1000,
              cache_read_input_tokens: 2000,
              cache_creation_input_tokens: 500,
            },
            content: [{ type: 'text', text: 'First message of request' }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:01Z',
          requestId: 'req-same',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 5000,
              output_tokens: 1000,
              cache_read_input_tokens: 2000,
              cache_creation_input_tokens: 500,
            },
            content: [
              { type: 'tool_use', name: 'Read', id: 'r1', input: { file_path: '/test.ts' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:03:00Z',
          requestId: 'req-different',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 8000,
              output_tokens: 2000,
              cache_read_input_tokens: 3000,
              cache_creation_input_tokens: 1000,
            },
            content: [{ type: 'text', text: 'Different request' }],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      const agent = result.agents[0]
      expect(agent.tokens).toBeDefined()
      // Only 2 unique requests counted: req-same (once) + req-different
      expect(agent.tokens!.inputTokens).toBe(5000 + 8000) // 13000
      expect(agent.tokens!.outputTokens).toBe(1000 + 2000) // 3000
    })
  })

  describe('edge cases', () => {
    it('should handle non-existent subagent file gracefully', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-nonexistent'))

      // Don't create the subagent file
      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].agentId).toBe('agent-nonexistent')
      expect(result.agents[0].skills).toBeUndefined()
    })

    it('should handle legacy Skill block without input field', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-008'))

      createSubagentFile(sessionPath, 'agent-008', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [
              {
                type: 'tool_use',
                name: 'Skill',
                id: 'skill1',
                // Missing input field
              },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toEqual([])
    })

    it('should handle legacy Skill block with input but missing skill field', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-009'))

      createSubagentFile(sessionPath, 'agent-009', [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-01T10:02:00Z',
          message: {
            model: 'claude-opus-4-6',
            content: [
              {
                type: 'tool_use',
                name: 'Skill',
                id: 'skill1',
                input: { args: '--coverage' }, // Missing skill field
              },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toEqual([])
    })

    it('should handle user messages with text but no <command-name> marker', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-012'))

      createSubagentFile(sessionPath, 'agent-012', [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: {
            content: [
              { type: 'text', text: 'This is just a regular user message with no skill markers.' },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toEqual([])
    })

    it('should handle user message with content that has only tool_result blocks (no text)', async () => {
      const sessionPath = createSessionJSONL(makeSessionWithAgent('agent-013'))

      createSubagentFile(sessionPath, 'agent-013', [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-01-01T10:01:00Z',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'some-id', content: 'result text' },
            ],
          },
        }),
      ])

      const result = await parseDetail(sessionPath, 'test-session', '/test', 'test-project')

      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].skills).toEqual([])
    })
  })
})
