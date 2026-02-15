import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { format, parseISO, startOfISOWeek } from 'date-fns'
import type { DailyModelTokens } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1']

type Granularity = 'daily' | 'weekly'

function normalizeModelName(model: string): string {
  return model.replace(/^claude-/, '').split('-202')[0]
}

interface ProcessedEntry {
  dateLabel: string
  sortKey: string
  [model: string]: string | number
}

function getTopModels(
  data: DailyModelTokens[],
  limit: number,
): { topModels: string[]; hasOther: boolean } {
  const totals: Record<string, number> = {}
  for (const day of data) {
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      const normalized = normalizeModelName(model)
      totals[normalized] = (totals[normalized] ?? 0) + tokens
    }
  }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const topModels = sorted.slice(0, limit).map(([name]) => name)
  const hasOther = sorted.length > limit

  return { topModels, hasOther }
}

function processDaily(
  data: DailyModelTokens[],
  topModels: string[],
  hasOther: boolean,
): ProcessedEntry[] {
  return data.map((day) => {
    const entry: ProcessedEntry = {
      dateLabel: format(parseISO(day.date), 'MMM d'),
      sortKey: day.date,
    }

    // Initialize all models to 0
    for (const model of topModels) {
      entry[model] = 0
    }
    if (hasOther) {
      entry['Other'] = 0
    }

    for (const [rawModel, tokens] of Object.entries(day.tokensByModel)) {
      const normalized = normalizeModelName(rawModel)
      if (topModels.includes(normalized)) {
        entry[normalized] = (entry[normalized] as number) + tokens
      } else if (hasOther) {
        entry['Other'] = (entry['Other'] as number) + tokens
      }
    }

    return entry
  })
}

function processWeekly(
  data: DailyModelTokens[],
  topModels: string[],
  hasOther: boolean,
): ProcessedEntry[] {
  const weekMap = new Map<string, ProcessedEntry>()

  for (const day of data) {
    const weekStart = startOfISOWeek(parseISO(day.date))
    const weekKey = format(weekStart, 'yyyy-MM-dd')

    if (!weekMap.has(weekKey)) {
      const entry: ProcessedEntry = {
        dateLabel: `Week of ${format(weekStart, 'MMM d')}`,
        sortKey: weekKey,
      }
      for (const model of topModels) {
        entry[model] = 0
      }
      if (hasOther) {
        entry['Other'] = 0
      }
      weekMap.set(weekKey, entry)
    }

    const entry = weekMap.get(weekKey)!
    for (const [rawModel, tokens] of Object.entries(day.tokensByModel)) {
      const normalized = normalizeModelName(rawModel)
      if (topModels.includes(normalized)) {
        entry[normalized] = (entry[normalized] as number) + tokens
      } else if (hasOther) {
        entry['Other'] = (entry['Other'] as number) + tokens
      }
    }
  }

  return Array.from(weekMap.values()).sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey),
  )
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    color: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 text-xs shadow-lg">
      <p className="mb-2 font-medium text-gray-300">{label}</p>
      {payload
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-400">{entry.name}</span>
            </div>
            <span className="font-mono text-gray-300">
              {formatTokenCount(entry.value)}
            </span>
          </div>
        ))}
      <div className="mt-1.5 border-t border-gray-700 pt-1.5 flex justify-between">
        <span className="text-gray-400">Total</span>
        <span className="font-mono font-medium text-white">
          {formatTokenCount(total)}
        </span>
      </div>
    </div>
  )
}

export function TokenTrendChart({ data }: { data: DailyModelTokens[] }) {
  const [granularity, setGranularity] = useState<Granularity>('daily')

  const { topModels, hasOther } = useMemo(
    () => getTopModels(data, 5),
    [data],
  )

  const allModelKeys = useMemo(() => {
    const keys = [...topModels]
    if (hasOther) keys.push('Other')
    return keys
  }, [topModels, hasOther])

  const chartData = useMemo(() => {
    if (granularity === 'weekly') {
      return processWeekly(data, topModels, hasOther)
    }
    return processDaily(data, topModels, hasOther)
  }, [data, topModels, hasOther, granularity])

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-gray-300">
          Token Usage Over Time
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Total tokens by model per day
        </p>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-gray-500">No data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">
            Token Usage Over Time
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Total tokens by model per day
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-700 text-xs">
          <button
            type="button"
            onClick={() => setGranularity('daily')}
            className={`rounded-l-lg px-3 py-1 ${
              granularity === 'daily'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Daily
          </button>
          <button
            type="button"
            onClick={() => setGranularity('weekly')}
            className={`rounded-r-lg px-3 py-1 ${
              granularity === 'weekly'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Weekly
          </button>
        </div>
      </div>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatTokenCount(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            {allModelKeys.map((model, i) => (
              <Area
                key={model}
                type="monotone"
                dataKey={model}
                stackId="1"
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
