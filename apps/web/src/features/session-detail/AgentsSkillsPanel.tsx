import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AgentInvocation, SkillInvocation, TokenUsage } from '@/lib/parsers/types'
import { formatTokenCount, formatDuration, formatUSD } from '@/lib/utils/format'
import { format } from 'date-fns'
import { settingsQuery } from '@/features/settings/settings.queries'
import { getMergedPricing, calculateSessionCost } from '@/features/cost-estimation/cost-calculator'

export function AgentsSkillsPanel({
  agents,
  skills,
}: {
  agents: AgentInvocation[]
  skills: SkillInvocation[]
}) {
  // Cost calculation per agent (hooks must be called before any early returns)
  const { data: settings } = useQuery(settingsQuery)

  const { agentCosts, totalAgentCost } = useMemo(() => {
    if (!settings) return { agentCosts: new Map<number, number>(), totalAgentCost: 0 }

    const pricingTable = getMergedPricing(settings)
    const costs = new Map<number, number>()
    let total = 0

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      if (!agent.tokens) continue

      const modelKey = agent.model ?? 'claude-sonnet-4'
      const tokensByModel: Record<string, TokenUsage> = {
        [modelKey]: agent.tokens,
      }
      const breakdown = calculateSessionCost(tokensByModel, pricingTable)
      costs.set(i, breakdown.totalUSD)
      total += breakdown.totalUSD
    }

    return { agentCosts: costs, totalAgentCost: total }
  }, [settings, agents])

  if (agents.length === 0 && skills.length === 0) return null

  // Count agent types for summary
  const agentCounts = new Map<string, number>()
  for (const a of agents) {
    agentCounts.set(a.subagentType, (agentCounts.get(a.subagentType) ?? 0) + 1)
  }
  const sortedAgentCounts = [...agentCounts.entries()].sort(
    ([, a], [, b]) => b - a,
  )

  // Total agent tokens
  const totalAgentTokens = agents.reduce(
    (sum, a) => sum + (a.totalTokens ?? computeAgentTokens(a) ?? 0),
    0,
  )

  // Count skills for summary
  const skillCounts = new Map<string, number>()
  for (const s of skills) {
    skillCounts.set(s.skill, (skillCounts.get(s.skill) ?? 0) + 1)
  }
  const sortedSkillCounts = [...skillCounts.entries()].sort(
    ([, a], [, b]) => b - a,
  )

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Agents & Skills</h3>
      <p className="mt-1 text-xs text-gray-500">
        {agents.length} agent dispatch{agents.length !== 1 ? 'es' : ''}
        {totalAgentTokens > 0 && (
          <span className="ml-1 text-indigo-400">
            ({formatTokenCount(totalAgentTokens)} tokens
            {totalAgentCost > 0 && ` · ~${formatUSD(totalAgentCost)}`})
          </span>
        )}
        {skills.length > 0 &&
          `, ${skills.length} skill invocation${skills.length !== 1 ? 's' : ''}`}
      </p>

      {/* Agent type summary badges */}
      {sortedAgentCounts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Agent Types
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedAgentCounts.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300"
              >
                {type}
                {count > 1 && (
                  <span className="text-indigo-400/60">&times;{count}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Skill summary badges */}
      {sortedSkillCounts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedSkillCounts.map(([skill, count]) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
              >
                /{skill}
                {count > 1 && (
                  <span className="text-amber-400/60">&times;{count}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Agent detail rows */}
      {agents.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Agent Dispatches
          </p>
          {agents.map((a, i) => {
            const tokenCount =
              a.totalTokens ?? computeAgentTokens(a)
            const agentCost = agentCosts.get(i)
            return (
              <div
                key={`a-${i}`}
                className="flex items-start gap-2 rounded bg-gray-950/40 px-2 py-1.5"
              >
                <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                  {a.subagentType}
                </span>
                {a.model && (
                  <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
                    {a.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                  {a.description}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {tokenCount != null && tokenCount > 0 && (
                    <span className="text-[10px] font-mono text-indigo-400/80">
                      {formatTokenCount(tokenCount)}
                    </span>
                  )}
                  {agentCost != null && agentCost > 0 && (
                    <span className="text-[10px] font-mono text-emerald-400/80">
                      ~{formatUSD(agentCost)}
                    </span>
                  )}
                  {a.totalToolUseCount != null && (
                    <span className="text-[10px] text-gray-500">
                      {a.totalToolUseCount} tools
                    </span>
                  )}
                  {a.durationMs != null && (
                    <span className="text-[10px] text-gray-600">
                      {formatDuration(a.durationMs)}
                    </span>
                  )}
                  {a.timestamp && (
                    <span className="text-[10px] text-gray-600">
                      {format(new Date(a.timestamp), 'HH:mm:ss')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Skill detail rows */}
      {skills.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Skill Invocations
          </p>
          {skills.map((s, i) => (
            <div
              key={`s-${i}`}
              className="flex items-start gap-2 rounded bg-gray-950/40 px-2 py-1.5"
            >
              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                /{s.skill}
              </span>
              {s.args && (
                <span className="min-w-0 flex-1 truncate text-xs font-mono text-gray-500">
                  {s.args}
                </span>
              )}
              {s.timestamp && (
                <span className="ml-auto shrink-0 text-[10px] text-gray-600">
                  {format(new Date(s.timestamp), 'HH:mm:ss')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function computeAgentTokens(agent: AgentInvocation): number | undefined {
  if (!agent.tokens) return undefined
  return agent.tokens.inputTokens + agent.tokens.outputTokens
}
