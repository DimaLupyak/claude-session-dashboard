import { useState } from 'react'
import type {
  Turn,
  AgentInvocation,
  SkillInvocation,
} from '@/lib/parsers/types'
import { formatTokenCount, formatDuration } from '@/lib/utils/format'

interface Props {
  turns: Turn[]
  agents?: AgentInvocation[]
  skills?: SkillInvocation[]
}

interface ConversationStats {
  userCommands: number
  aiResponses: number
  toolFrequency: Record<string, number>
  skillList: Array<{ skill: string; args: string | null }>
  totalToolCalls: number
}

function computeStats(
  turns: Turn[],
  agents: AgentInvocation[],
  skills: SkillInvocation[],
): ConversationStats {
  const agentToolUseIds = new Set(agents.map((a) => a.toolUseId))
  const skillToolUseIds = new Set(skills.map((s) => s.toolUseId))

  let userCommands = 0
  let aiResponses = 0
  const toolFrequency: Record<string, number> = {}
  let totalToolCalls = 0

  for (const turn of turns) {
    if (turn.type === 'user' && turn.message?.trim()) {
      userCommands++
    }
    if (turn.type === 'assistant') {
      aiResponses++
      for (const tc of turn.toolCalls) {
        if (!agentToolUseIds.has(tc.toolUseId) && !skillToolUseIds.has(tc.toolUseId)) {
          toolFrequency[tc.toolName] = (toolFrequency[tc.toolName] ?? 0) + 1
          totalToolCalls++
        }
      }
    }
  }

  const skillList = skills.map((s) => ({ skill: s.skill, args: s.args }))

  return { userCommands, aiResponses, toolFrequency, skillList, totalToolCalls }
}

export function SessionTimeline({ turns, agents = [], skills = [] }: Props) {
  const stats = computeStats(turns, agents, skills)

  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No conversation data found
      </div>
    )
  }

  const toolEntries = Object.entries(stats.toolFrequency).sort(
    ([, a], [, b]) => b - a,
  )

  return (
    <div className="space-y-4">
      {/* Root-level summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        {/* Counts row */}
        <div className="flex items-center gap-4">
          <StatBadge
            label="User commands"
            value={stats.userCommands}
            color="blue"
          />
          <StatBadge
            label="AI responses"
            value={stats.aiResponses}
            color="purple"
          />
          {stats.totalToolCalls > 0 && (
            <StatBadge
              label="Tool calls"
              value={stats.totalToolCalls}
              color="gray"
            />
          )}
          {agents.length > 0 && (
            <StatBadge
              label="Agents"
              value={agents.length}
              color="indigo"
            />
          )}
        </div>

        {/* Tools used */}
        {toolEntries.length > 0 && (
          <div className="mt-3">
            <span className="text-[11px] font-medium text-gray-500">Tools</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {toolEntries.map(([name, count]) => (
                <ToolBadge key={name} name={name} count={count} />
              ))}
            </div>
          </div>
        )}

        {/* Skills used */}
        {stats.skillList.length > 0 && (
          <div className="mt-3">
            <span className="text-[11px] font-medium text-gray-500">Skills</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {stats.skillList.map((s, i) => (
                <span
                  key={`${s.skill}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
                >
                  /{s.skill}
                  {s.args && (
                    <span className="font-normal text-amber-400/60">
                      {s.args}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent blocks */}
      {agents.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-medium text-gray-500">
            Agent dispatches
          </span>
          {agents.map((agent, i) => (
            <CollapsibleAgentBlock key={agent.toolUseId || i} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'blue' | 'purple' | 'gray' | 'indigo'
}) {
  const colorMap = {
    blue: 'bg-blue-500/15 text-blue-400',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-gray-800 text-gray-300',
    indigo: 'bg-indigo-500/15 text-indigo-400',
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-md px-2 py-1 text-sm font-bold tabular-nums ${colorMap[color]}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  )
}

function ToolBadge({ name, count }: { name: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-gray-800 px-1.5 py-0.5 text-[11px] font-mono text-gray-400">
      {name}
      {count > 1 && <span className="text-gray-500">&times;{count}</span>}
    </span>
  )
}

function CollapsibleAgentBlock({ agent }: { agent: AgentInvocation }) {
  const [isOpen, setIsOpen] = useState(false)

  const tokenCount =
    agent.totalTokens ??
    (agent.tokens
      ? agent.tokens.inputTokens + agent.tokens.outputTokens
      : undefined)

  const toolEntries = agent.toolCalls
    ? Object.entries(agent.toolCalls).sort(([, a], [, b]) => b - a)
    : []

  const totalAgentToolCalls = toolEntries.reduce((sum, [, c]) => sum + c, 0)

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/15">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-xl p-3 text-left transition-colors hover:bg-indigo-950/30"
      >
        <span className="text-[10px] text-gray-500 select-none">
          {isOpen ? '▼' : '▶'}
        </span>
        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-300">
          {agent.subagentType}
        </span>
        <span className="min-w-0 truncate text-xs text-gray-400">
          {agent.description}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {tokenCount != null && tokenCount > 0 && (
            <span className="text-[10px] font-mono text-indigo-400/80">
              {formatTokenCount(tokenCount)} tok
            </span>
          )}
          {agent.totalToolUseCount != null && (
            <span className="text-[10px] text-gray-500">
              {agent.totalToolUseCount} tools
            </span>
          )}
          {agent.durationMs != null && (
            <span className="text-[10px] text-gray-600">
              {formatDuration(agent.durationMs)}
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isOpen && (
        <div className="border-t border-indigo-500/10 px-3 pb-3 pt-2">
          {/* Agent stats */}
          <div className="flex items-center gap-3">
            {totalAgentToolCalls > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-400">
                  {totalAgentToolCalls}
                </span>
                <span className="text-[11px] text-gray-500">tool calls</span>
              </div>
            )}
            {tokenCount != null && tokenCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-400">
                  {formatTokenCount(tokenCount)}
                </span>
                <span className="text-[11px] text-gray-500">tokens</span>
              </div>
            )}
            {agent.durationMs != null && (
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-400">
                  {formatDuration(agent.durationMs)}
                </span>
                <span className="text-[11px] text-gray-500">duration</span>
              </div>
            )}
            {agent.model && (
              <span className="text-[10px] font-mono text-gray-600">
                {agent.model.replace(/^claude-/, '').split('-202')[0]}
              </span>
            )}
          </div>

          {/* Agent tool breakdown */}
          {toolEntries.length > 0 && (
            <div className="mt-2">
              <span className="text-[11px] font-medium text-gray-500">
                Tools
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {toolEntries.map(([name, count]) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-0.5 rounded bg-indigo-900/30 px-1.5 py-0.5 text-[11px] font-mono text-indigo-300/70"
                  >
                    {name}
                    {count > 1 && (
                      <span className="text-indigo-400/50">
                        &times;{count}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
