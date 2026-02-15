import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { statsQuery } from '@/features/stats/stats.queries'
import { ActivityChart } from '@/features/stats/ActivityChart'
import { ContributionHeatmap } from '@/features/stats/ContributionHeatmap'
import { TokenTrendChart } from '@/features/stats/TokenTrendChart'
import { ModelUsageChart } from '@/features/stats/ModelUsageChart'
import { HourlyDistribution } from '@/features/stats/HourlyDistribution'
import { ProjectAnalytics } from '@/features/project-analytics/ProjectAnalytics'
import { formatDuration, formatTokenCount, formatUSD } from '@/lib/utils/format'
import {
  dailyActivityToCSV,
  dailyTokensToCSV,
  modelUsageToCSV,
  statsToJSON,
  downloadFile,
} from '@/lib/utils/export-utils'
import { ExportDropdown } from '@/components/ExportDropdown'
import { useSessionCost } from '@/features/cost-estimation/useSessionCost'
import type { TokenUsage, StatsCache } from '@/lib/parsers/types'

const statsSearchSchema = z.object({
  tab: z.enum(['overview', 'projects']).default('overview').catch('overview'),
})

export const Route = createFileRoute('/_dashboard/stats')({
  validateSearch: statsSearchSchema,
  component: StatsPage,
})

const EMPTY_TOKENS_BY_MODEL: Record<string, TokenUsage> = {}

function StatsPage() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: stats, isLoading } = useQuery(statsQuery)

  // Convert stats.modelUsage to Record<string, TokenUsage> for cost calculation
  // All hooks must be called before any early returns
  const tokensByModel = useMemo(() => {
    if (!stats) return EMPTY_TOKENS_BY_MODEL
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
  }, [stats])

  const { cost } = useSessionCost(tokensByModel)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Stats</h1>
          <p className="mt-1 text-sm text-gray-400">
            Usage analytics and project insights
          </p>
        </div>
        {tab === 'overview' && stats && (
          <ExportDropdown
            options={[
              {
                label: 'Daily Activity (CSV)',
                onClick: () =>
                  downloadFile(
                    dailyActivityToCSV(stats),
                    'daily-activity.csv',
                    'text/csv',
                  ),
              },
              {
                label: 'Token Usage (CSV)',
                onClick: () =>
                  downloadFile(
                    dailyTokensToCSV(stats),
                    'daily-tokens.csv',
                    'text/csv',
                  ),
              },
              {
                label: 'Model Usage (CSV)',
                onClick: () =>
                  downloadFile(
                    modelUsageToCSV(stats),
                    'model-usage.csv',
                    'text/csv',
                  ),
              },
              {
                label: 'Full Stats (JSON)',
                onClick: () =>
                  downloadFile(
                    statsToJSON(stats),
                    'stats.json',
                    'application/json',
                  ),
              },
            ]}
          />
        )}
      </div>

      {/* Tab bar */}
      <div className="mt-4 flex gap-1 border-b border-gray-800">
        <button
          onClick={() => navigate({ search: { tab: 'overview' } })}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'overview'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => navigate({ search: { tab: 'projects' } })}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'projects'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Projects
        </button>
      </div>

      {/* Tab content */}
      {tab === 'overview' ? (
        <StatsOverview stats={stats} isLoading={isLoading} cost={cost} />
      ) : (
        <div className="mt-6">
          <ProjectAnalytics />
        </div>
      )}
    </div>
  )
}

function StatsOverview({
  stats,
  isLoading,
  cost,
}: {
  stats: StatsCache | null | undefined
  isLoading: boolean
  cost: { totalUSD: number } | null
}) {
  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-gray-900/50"
            />
          ))}
        </div>
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

  return (
    <>
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

      {/* Contribution heatmap */}
      <div className="mt-6">
        <ContributionHeatmap
          dailyActivity={stats.dailyActivity}
          dailyModelTokens={stats.dailyModelTokens}
        />
      </div>

      {/* Charts */}
      <div className="mt-4">
        <ActivityChart data={stats.dailyActivity} />
      </div>

      <div className="mt-4">
        <TokenTrendChart data={stats.dailyModelTokens} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModelUsageChart data={stats.modelUsage} />
        <HourlyDistribution hourCounts={stats.hourCounts} />
      </div>
    </>
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
