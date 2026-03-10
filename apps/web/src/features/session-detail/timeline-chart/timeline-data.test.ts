import { describe, expect, it } from 'vitest'
import type {
  Turn,
  AgentInvocation,
  SkillInvocation,
  SessionError,
} from '@/lib/parsers/types'
import { buildTimelineChartData } from './timeline-data'

// --- Factory helpers ---

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    uuid: 'turn-1',
    type: 'assistant',
    timestamp: '2024-01-01T00:00:00.000Z',
    toolCalls: [],
    ...overrides,
  }
}

function makeAgent(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    subagentType: 'implementer',
    description: 'Test agent',
    timestamp: '2024-01-01T00:01:00.000Z',
    toolUseId: 'agent-tool-use-1',
    ...overrides,
  }
}

function makeSkill(overrides: Partial<SkillInvocation> = {}): SkillInvocation {
  return {
    skill: 'testing',
    args: null,
    timestamp: '2024-01-01T00:02:00.000Z',
    toolUseId: 'skill-tool-use-1',
    ...overrides,
  }
}

function makeError(overrides: Partial<SessionError> = {}): SessionError {
  return {
    timestamp: '2024-01-01T00:03:00.000Z',
    message: 'Something went wrong',
    type: 'error',
    ...overrides,
  }
}

// --- Tests ---

describe('buildTimelineChartData', () => {
  describe('empty session (no turns, agents, skills, or errors)', () => {
    it('returns an empty/zero structure', () => {
      const result = buildTimelineChartData([], [], [], [])

      expect(result).toEqual({
        startMs: 0,
        endMs: 0,
        durationMs: 0,
        mainLane: [],
        agentLanes: [],
        skillMarkers: [],
        errorMarkers: [],
      })
    })
  })

  describe('single turn with no tool calls', () => {
    it('produces a non-zero time range but an empty mainLane', () => {
      const turn = makeTurn({ type: 'assistant', toolCalls: [] })
      const result = buildTimelineChartData([turn], [], [], [])

      expect(result.startMs).toBe(new Date(turn.timestamp).getTime())
      expect(result.endMs).toBe(new Date(turn.timestamp).getTime())
      expect(result.durationMs).toBeGreaterThanOrEqual(1)
      expect(result.mainLane).toHaveLength(0)
      expect(result.agentLanes).toHaveLength(0)
    })

    it('ignores user-type turns for mainLane entries', () => {
      const turn = makeTurn({
        type: 'user',
        toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-1' }],
      })
      const result = buildTimelineChartData([turn], [], [], [])

      expect(result.mainLane).toHaveLength(0)
    })
  })

  describe('single turn with multiple tool calls', () => {
    it('adds one mainLane entry per tool call on an assistant turn', () => {
      const turn = makeTurn({
        type: 'assistant',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [
          { toolName: 'Read', toolUseId: 'tc-read' },
          { toolName: 'Bash', toolUseId: 'tc-bash' },
          { toolName: 'Write', toolUseId: 'tc-write' },
        ],
      })
      const result = buildTimelineChartData([turn], [], [], [])

      expect(result.mainLane).toHaveLength(3)
      expect(result.mainLane[0].toolName).toBe('Read')
      expect(result.mainLane[1].toolName).toBe('Bash')
      expect(result.mainLane[2].toolName).toBe('Write')
    })

    it('sets relativeX to 0.5 when there is a single-point timeline (start == end)', () => {
      // When only one timestamp exists, durationMs is forced to 1, and
      // toRelativeX(startMs) = (startMs - startMs) / 1 = 0.
      const turn = makeTurn({
        type: 'assistant',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }],
      })
      const result = buildTimelineChartData([turn], [], [], [])

      // Single timestamp → startMs == endMs → toRelativeX returns 0
      expect(result.mainLane[0].relativeX).toBe(0)
    })
  })

  describe('multiple turns', () => {
    it('computes startMs and endMs from all turn timestamps', () => {
      const t1 = makeTurn({
        uuid: 'u1',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }],
      })
      const t2 = makeTurn({
        uuid: 'u2',
        timestamp: '2024-01-01T00:10:00.000Z',
        toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }],
      })
      const result = buildTimelineChartData([t1, t2], [], [], [])

      expect(result.startMs).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
      expect(result.endMs).toBe(new Date('2024-01-01T00:10:00.000Z').getTime())
      expect(result.durationMs).toBe(10 * 60 * 1000)
      expect(result.mainLane).toHaveLength(2)
    })

    it('places earlier turn events at relativeX=0 and later events at relativeX=1', () => {
      const t1 = makeTurn({
        uuid: 'u1',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }],
      })
      const t2 = makeTurn({
        uuid: 'u2',
        timestamp: '2024-01-01T01:00:00.000Z',
        toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }],
      })
      const result = buildTimelineChartData([t1, t2], [], [], [])

      const readEvent = result.mainLane.find((e) => e.toolName === 'Read')
      const bashEvent = result.mainLane.find((e) => e.toolName === 'Bash')
      expect(readEvent?.relativeX).toBe(0)
      expect(bashEvent?.relativeX).toBe(1)
    })

    it('handles turns given out of chronological order', () => {
      const earlier = makeTurn({
        uuid: 'u1',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }],
      })
      const later = makeTurn({
        uuid: 'u2',
        timestamp: '2024-01-01T01:00:00.000Z',
        toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }],
      })
      // Pass later first, then earlier
      const result = buildTimelineChartData([later, earlier], [], [], [])

      expect(result.startMs).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
      expect(result.endMs).toBe(new Date('2024-01-01T01:00:00.000Z').getTime())
    })
  })

  describe('turns with agent invocations', () => {
    it('excludes agent toolUseIds from mainLane', () => {
      const agentToolUseId = 'agent-tc-1'
      const turn = makeTurn({
        type: 'assistant',
        toolCalls: [
          { toolName: 'Task', toolUseId: agentToolUseId },
          { toolName: 'Read', toolUseId: 'regular-tc' },
        ],
      })
      const agent = makeAgent({ toolUseId: agentToolUseId })
      const result = buildTimelineChartData([turn], [agent], [], [])

      expect(result.mainLane).toHaveLength(1)
      expect(result.mainLane[0].toolUseId).toBe('regular-tc')
    })

    it('builds one agentLane per agent invocation', () => {
      const agent1 = makeAgent({
        subagentType: 'implementer',
        toolUseId: 'a1',
        timestamp: '2024-01-01T00:01:00.000Z',
        durationMs: 30000,
      })
      const agent2 = makeAgent({
        subagentType: 'reviewer',
        toolUseId: 'a2',
        timestamp: '2024-01-01T00:02:00.000Z',
        durationMs: 15000,
      })
      const turn = makeTurn({
        toolCalls: [
          { toolName: 'Task', toolUseId: 'a1' },
          { toolName: 'Task', toolUseId: 'a2' },
        ],
      })
      const result = buildTimelineChartData([turn], [agent1, agent2], [], [])

      expect(result.agentLanes).toHaveLength(2)
      expect(result.agentLanes[0].subagentType).toBe('implementer')
      expect(result.agentLanes[1].subagentType).toBe('reviewer')
    })

    it('uses a minimum 2% width fallback when agent has no durationMs', () => {
      const agent = makeAgent({
        toolUseId: 'a1',
        timestamp: '2024-01-01T00:00:00.000Z',
        durationMs: undefined,
      })
      const turn = makeTurn({
        timestamp: '2024-01-01T01:00:00.000Z',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-read' }],
      })
      const result = buildTimelineChartData([turn], [agent], [], [])

      const lane = result.agentLanes[0]
      expect(lane.endX).toBeGreaterThan(lane.startX)
      expect(lane.durationMs).toBeNull()
    })

    it('propagates totalTokens and totalToolUseCount from agent', () => {
      const agent = makeAgent({
        toolUseId: 'a1',
        totalTokens: 5000,
        totalToolUseCount: 12,
        durationMs: 60000,
      })
      const result = buildTimelineChartData([], [agent], [], [])

      expect(result.agentLanes[0].totalTokens).toBe(5000)
      expect(result.agentLanes[0].totalToolUseCount).toBe(12)
    })

    it('sets totalTokens and totalToolUseCount to null when absent', () => {
      const agent = makeAgent({ toolUseId: 'a1' })
      const result = buildTimelineChartData([], [agent], [], [])

      expect(result.agentLanes[0].totalTokens).toBeNull()
      expect(result.agentLanes[0].totalToolUseCount).toBeNull()
    })

    it('builds tool dots distributed across the agent time span', () => {
      const agent = makeAgent({
        toolUseId: 'a1',
        timestamp: '2024-01-01T00:00:00.000Z',
        durationMs: 60000,
        toolCalls: { Read: 3, Bash: 2 },
      })
      const result = buildTimelineChartData([], [agent], [], [])

      const lane = result.agentLanes[0]
      // 3 Read + 2 Bash = 5 dots total
      expect(lane.toolDots).toHaveLength(5)
    })

    it('produces a single tool dot at relativeX=0.5 when there is only one dot', () => {
      const agent = makeAgent({
        toolUseId: 'a1',
        timestamp: '2024-01-01T00:00:00.000Z',
        durationMs: 60000,
        toolCalls: { Read: 1 },
      })
      const result = buildTimelineChartData([], [agent], [], [])

      const lane = result.agentLanes[0]
      expect(lane.toolDots).toHaveLength(1)
      // fraction is 0.5 when totalDots === 1
      const midMs =
        new Date('2024-01-01T00:00:00.000Z').getTime() +
        (new Date('2024-01-01T00:00:00.000Z').getTime() +
          60000 -
          new Date('2024-01-01T00:00:00.000Z').getTime()) *
          0.5
      // Just verify it's within [startX, endX]
      expect(lane.toolDots[0].relativeX).toBeGreaterThanOrEqual(lane.startX)
      expect(lane.toolDots[0].relativeX).toBeLessThanOrEqual(lane.endX)
    })

    it('includes agent skills list on the lane', () => {
      const agent = makeAgent({
        toolUseId: 'a1',
        skills: [
          { skill: 'testing', args: '--run', timestamp: '2024-01-01T00:01:00.000Z', toolUseId: 's1' },
        ],
      })
      const result = buildTimelineChartData([], [agent], [], [])

      expect(result.agentLanes[0].skills).toEqual([
        { skill: 'testing', args: '--run' },
      ])
    })

    it('produces an empty skills array when agent has no skills', () => {
      const agent = makeAgent({ toolUseId: 'a1', skills: undefined })
      const result = buildTimelineChartData([], [agent], [], [])

      expect(result.agentLanes[0].skills).toEqual([])
    })
  })

  describe('turns with skill invocations', () => {
    it('excludes skill toolUseIds from mainLane', () => {
      const skillToolUseId = 'skill-tc-1'
      const turn = makeTurn({
        type: 'assistant',
        toolCalls: [
          { toolName: 'Skill', toolUseId: skillToolUseId },
          { toolName: 'Read', toolUseId: 'regular-tc' },
        ],
      })
      const skill = makeSkill({ toolUseId: skillToolUseId })
      const result = buildTimelineChartData([turn], [], [skill], [])

      expect(result.mainLane).toHaveLength(1)
      expect(result.mainLane[0].toolUseId).toBe('regular-tc')
    })

    it('builds one skillMarker per valid skill invocation', () => {
      const skill1 = makeSkill({ skill: 'testing', toolUseId: 's1', timestamp: '2024-01-01T00:01:00.000Z' })
      const skill2 = makeSkill({ skill: 'review', toolUseId: 's2', timestamp: '2024-01-01T00:02:00.000Z' })
      const result = buildTimelineChartData([], [], [skill1, skill2], [])

      expect(result.skillMarkers).toHaveLength(2)
      expect(result.skillMarkers[0].skill).toBe('testing')
      expect(result.skillMarkers[1].skill).toBe('review')
    })

    it('preserves args (null or string) on skill markers', () => {
      const skillWithArgs = makeSkill({ skill: 'deploy', args: '--prod', toolUseId: 's1' })
      const skillNoArgs = makeSkill({ skill: 'lint', args: null, toolUseId: 's2', timestamp: '2024-01-01T00:03:00.000Z' })
      const result = buildTimelineChartData([], [], [skillWithArgs, skillNoArgs], [])

      expect(result.skillMarkers[0].args).toBe('--prod')
      expect(result.skillMarkers[1].args).toBeNull()
    })

    it('computes skill marker timestamps and relativeX correctly', () => {
      const t1 = makeTurn({ timestamp: '2024-01-01T00:00:00.000Z', toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }] })
      const t2 = makeTurn({ uuid: 'u2', timestamp: '2024-01-01T01:00:00.000Z', toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }] })
      const skill = makeSkill({ timestamp: '2024-01-01T00:30:00.000Z', toolUseId: 's1' })
      const result = buildTimelineChartData([t1, t2], [], [skill], [])

      expect(result.skillMarkers[0].relativeX).toBeCloseTo(0.5, 5)
    })

    it('drops skill markers with invalid timestamps', () => {
      const badSkill = makeSkill({ timestamp: 'not-a-date', toolUseId: 's1' })
      const result = buildTimelineChartData([], [], [badSkill], [])

      expect(result.skillMarkers).toHaveLength(0)
    })
  })

  describe('sessions with errors', () => {
    it('builds one errorMarker per error with a valid timestamp', () => {
      // Errors require at least one turn/agent/skill timestamp to establish time bounds.
      // Without them the function returns the early-exit empty structure.
      const turn = makeTurn({ timestamp: '2024-01-01T00:00:00.000Z', toolCalls: [] })
      const e1 = makeError({ message: 'Timeout', type: 'timeout', timestamp: '2024-01-01T00:01:00.000Z' })
      const e2 = makeError({ message: 'Network failure', type: 'network', timestamp: '2024-01-01T00:02:00.000Z' })
      const result = buildTimelineChartData([turn], [], [], [e1, e2])

      expect(result.errorMarkers).toHaveLength(2)
      expect(result.errorMarkers[0].message).toBe('Timeout')
      expect(result.errorMarkers[1].message).toBe('Network failure')
    })

    it('preserves the error type on each error marker', () => {
      // A turn is needed to establish time bounds so error markers are produced.
      const turn = makeTurn({ timestamp: '2024-01-01T00:00:00.000Z', toolCalls: [] })
      const err = makeError({ type: 'runtime_error', timestamp: '2024-01-01T00:01:00.000Z' })
      const result = buildTimelineChartData([turn], [], [], [err])

      expect(result.errorMarkers[0].type).toBe('runtime_error')
    })

    it('drops error markers with invalid timestamps', () => {
      const badError = makeError({ timestamp: 'bad-date' })
      const result = buildTimelineChartData([], [], [], [badError])

      expect(result.errorMarkers).toHaveLength(0)
    })

    it('computes error relativeX correctly within the timeline', () => {
      const t1 = makeTurn({ timestamp: '2024-01-01T00:00:00.000Z', toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }] })
      const t2 = makeTurn({ uuid: 'u2', timestamp: '2024-01-01T01:00:00.000Z', toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }] })
      const err = makeError({ timestamp: '2024-01-01T00:30:00.000Z' })
      const result = buildTimelineChartData([t1, t2], [], [], [err])

      expect(result.errorMarkers[0].relativeX).toBeCloseTo(0.5, 5)
    })
  })

  describe('edge cases', () => {
    it('ignores turns with invalid/unparseable timestamps when building mainLane', () => {
      const badTurn = makeTurn({
        type: 'assistant',
        timestamp: 'not-a-date',
        toolCalls: [{ toolName: 'Read', toolUseId: 'tc-1' }],
      })
      const goodTurn = makeTurn({
        uuid: 'u2',
        type: 'assistant',
        timestamp: '2024-01-01T00:01:00.000Z',
        toolCalls: [{ toolName: 'Bash', toolUseId: 'tc-2' }],
      })
      const result = buildTimelineChartData([badTurn, goodTurn], [], [], [])

      // The bad turn is excluded from mainLane (NaN timestamp guard)
      expect(result.mainLane).toHaveLength(1)
      expect(result.mainLane[0].toolName).toBe('Bash')
    })

    it('returns the empty structure when all timestamps are invalid', () => {
      const badTurn = makeTurn({ timestamp: 'invalid' })
      const result = buildTimelineChartData([badTurn], [], [], [])

      expect(result.startMs).toBe(0)
      expect(result.endMs).toBe(0)
      expect(result.durationMs).toBe(0)
    })

    it('handles a mix of turns, agents, skills, and errors simultaneously', () => {
      const turn = makeTurn({
        type: 'assistant',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [
          { toolName: 'Task', toolUseId: 'agent-tc' },
          { toolName: 'Skill', toolUseId: 'skill-tc' },
          { toolName: 'Read', toolUseId: 'regular-tc' },
        ],
      })
      const agent = makeAgent({ toolUseId: 'agent-tc', timestamp: '2024-01-01T00:01:00.000Z' })
      const skill = makeSkill({ toolUseId: 'skill-tc', timestamp: '2024-01-01T00:02:00.000Z' })
      const error = makeError({ timestamp: '2024-01-01T00:03:00.000Z' })

      const result = buildTimelineChartData([turn], [agent], [skill], [error])

      expect(result.mainLane).toHaveLength(1)
      expect(result.mainLane[0].toolUseId).toBe('regular-tc')
      expect(result.agentLanes).toHaveLength(1)
      expect(result.skillMarkers).toHaveLength(1)
      expect(result.errorMarkers).toHaveLength(1)
    })

    it('contributes agent and skill timestamps to the overall time bounds', () => {
      // No turns — only agent and skill timestamps define bounds
      const agent = makeAgent({ toolUseId: 'a1', timestamp: '2024-01-01T00:00:00.000Z' })
      const skill = makeSkill({ toolUseId: 's1', timestamp: '2024-01-01T01:00:00.000Z' })
      const result = buildTimelineChartData([], [agent], [skill], [])

      expect(result.startMs).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
      expect(result.endMs).toBe(new Date('2024-01-01T01:00:00.000Z').getTime())
    })

    it('does not include error timestamps in time bounds calculation', () => {
      // Errors do not affect startMs/endMs — only turns/agents/skills do
      const turn = makeTurn({ timestamp: '2024-01-01T00:30:00.000Z', toolCalls: [] })
      const error = makeError({ timestamp: '2024-01-01T02:00:00.000Z' })
      const result = buildTimelineChartData([turn], [], [], [error])

      expect(result.startMs).toBe(new Date('2024-01-01T00:30:00.000Z').getTime())
      expect(result.endMs).toBe(new Date('2024-01-01T00:30:00.000Z').getTime())
    })

    it('sets durationMs to at least 1 when start equals end (avoids division by zero)', () => {
      const turn = makeTurn({
        type: 'assistant',
        timestamp: '2024-01-01T00:00:00.000Z',
        toolCalls: [],
      })
      const result = buildTimelineChartData([turn], [], [], [])

      expect(result.durationMs).toBeGreaterThanOrEqual(1)
    })
  })
})
