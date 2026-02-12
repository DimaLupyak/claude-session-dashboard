import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { statsQuery } from '@/features/stats/stats.queries'
import { ActivityChart } from '@/features/stats/ActivityChart'
import { ModelUsageChart } from '@/features/stats/ModelUsageChart'
import { HourlyDistribution } from '@/features/stats/HourlyDistribution'
import { formatDuration, formatTokenCount, formatUSD } from '@/lib/utils/format'
import { useSessionCost } from '@/features/cost-estimation/useSessionCost'
import type { TokenUsage } from '@/lib/parsers/types'

export const Route = createFileRoute('/_dashboard/stats')({
  component: StatsPage,
})

function StatsPage() {
  const { data: stats, isLoading } = useQuery(statsQuery)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-800" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl bg-gray-900/50"
          />
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        No stats data found. Check ~/.claude/stats-cache.json
      </div>
    )
  }

  const totalTokens = Object.values(stats.modelUsage).reduce(
    (sum, m) => sum + m.inputTokens + m.outputTokens,
    0,
  )

  // Convert stats.modelUsage to Record<string, TokenUsage> for cost calculation
  const tokensByModel = useMemo(() => {
    const result: Record<string, TokenUsage> = {}
    for (const [model, usage] of Object.entries(stats.modelUsage)) {
      result[model] = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
      }
    }
    return result
  }, [stats.modelUsage])

  const { cost } = useSessionCost(tokensByModel)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Stats</h1>
      <p className="mt-1 text-sm text-gray-400">
        Aggregate usage from {stats.firstSessionDate?.split('T')[0]} to{' '}
        {stats.lastComputedDate}
      </p>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Sessions" value={String(stats.totalSessions)} />
        <StatCard
          label="Total Messages"
          value={stats.totalMessages.toLocaleString()}
        />
        <StatCard
          label="Total Tokens"
          value={formatTokenCount(totalTokens)}
          sub={cost ? `~${formatUSD(cost.totalUSD)}` : undefined}
        />
        <StatCard
          label="Total Estimated Cost"
          value={cost ? `~${formatUSD(cost.totalUSD)}` : 'N/A'}
        />
        <StatCard
          label="Longest Session"
          value={formatDuration(stats.longestSession.duration)}
          sub={`${stats.longestSession.messageCount} messages`}
        />
      </div>

      {/* Charts */}
      <div className="mt-6">
        <ActivityChart data={stats.dailyActivity} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModelUsageChart data={stats.modelUsage} />
        <HourlyDistribution hourCounts={stats.hourCounts} />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
