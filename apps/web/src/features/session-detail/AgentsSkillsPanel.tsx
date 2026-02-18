import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AgentInvocation, SkillInvocation, TokenUsage } from '@/lib/parsers/types'
import { formatTokenCount, formatDuration, formatUSD } from '@/lib/utils/format'
import { format } from 'date-fns'
import { settingsQuery } from '@/features/settings/settings.queries'
import { getMergedPricing, calculateSessionCost } from '@/features/cost-estimation/cost-calculator'

function computeAgentTokens(agent: AgentInvocation): number | undefined {
  if (!agent.tokens) return undefined
  return (
    agent.tokens.inputTokens +
    agent.tokens.outputTokens +
    agent.tokens.cacheReadInputTokens +
    agent.tokens.cacheCreationInputTokens
  )
}

export function AgentDispatchesPanel({
  agents,
}: {
  agents: AgentInvocation[]
}) {
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

  if (agents.length === 0) return null

  const totalAgentTokens = agents.reduce(
    (sum, a) => sum + (a.totalTokens ?? computeAgentTokens(a) ?? 0),
    0,
  )

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Agent Dispatches</h3>
      <p className="mt-1 text-xs text-gray-500">
        {agents.length} agent dispatch{agents.length !== 1 ? 'es' : ''}
        {totalAgentTokens > 0 && (
          <span className="ml-1 text-indigo-400">
            ({formatTokenCount(totalAgentTokens)} tokens
            {totalAgentCost > 0 && ` · ~${formatUSD(totalAgentCost)}`})
          </span>
        )}
      </p>

      <div className="mt-3 space-y-1">
        {agents.map((a, i) => {
          const tokenCount =
            a.totalTokens ?? computeAgentTokens(a)
          const agentCost = agentCosts.get(i)
          return (
            <div key={`a-${i}`} className="flex items-start gap-2 rounded bg-gray-950/40 px-2 py-1.5">
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
    </div>
  )
}

interface SkillGroup {
  skill: string
  count: number
  hasInjected: boolean
  invocations: Array<{ agentSource: string | null; timestamp: string; source?: string }>
}

export function SkillInvocationsPanel({
  agents,
  skills,
}: {
  agents: AgentInvocation[]
  skills: SkillInvocation[]
}) {
  const { groups, totalCount } = useMemo(() => {
    const allSkills = [
      ...skills.map((s) => ({ ...s, agentSource: null as string | null })),
      ...agents.flatMap((a) =>
        (a.skills ?? []).map((s) => ({ ...s, agentSource: a.subagentType })),
      ),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const groupMap = new Map<string, SkillGroup>()

    for (const s of allSkills) {
      let group = groupMap.get(s.skill)
      if (!group) {
        group = { skill: s.skill, count: 0, hasInjected: false, invocations: [] }
        groupMap.set(s.skill, group)
      }
      group.count++
      if (s.source === 'injected') group.hasInjected = true
      group.invocations.push({
        agentSource: s.agentSource,
        timestamp: s.timestamp,
        source: s.source,
      })
    }

    return { groups: Array.from(groupMap.values()), totalCount: allSkills.length }
  }, [skills, agents])

  if (totalCount === 0) return null

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Skill Invocations</h3>
      <p className="mt-1 text-xs text-gray-500">
        {groups.length} unique skill{groups.length !== 1 ? 's' : ''},{' '}
        {totalCount} invocation{totalCount !== 1 ? 's' : ''}
      </p>

      <div className="mt-3 space-y-1">
        {groups.map((group) => (
          <div key={group.skill} className="rounded bg-gray-950/40 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                /{group.skill}
              </span>
              <span className="text-[10px] text-gray-500">
                &times;{group.count}
              </span>
              {group.hasInjected && (
                <span className="shrink-0 rounded bg-gray-800/40 px-1 py-0.5 text-[9px] text-gray-500">
                  context
                </span>
              )}
            </div>
            <div className="mt-1 ml-2 flex flex-wrap gap-x-1 text-[10px] text-gray-500">
              {group.invocations.map((inv, j) => (
                <span key={j}>
                  <span className="text-gray-400">{inv.agentSource ?? 'session'}</span>
                  {', '}
                  <span className="text-gray-600">
                    {format(new Date(inv.timestamp), 'HH:mm:ss')}
                  </span>
                  {j < group.invocations.length - 1 && (
                    <span className="text-gray-700">{'; '}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
