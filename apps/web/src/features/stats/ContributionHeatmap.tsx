import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, addDays, getDay, parseISO } from 'date-fns'
import type { DailyActivity, DailyModelTokens } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'

const INTENSITY_COLORS = [
  '#1f2937', // Level 0: gray-800 (no activity)
  '#1e3a5f', // Level 1: dark blue
  '#1d4ed8b3', // Level 2: blue-700 at ~70% opacity
  '#3b82f6cc', // Level 3: blue-500 at ~80% opacity
  '#60a5fa', // Level 4: blue-400 (most intense)
] as const

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''] as const
const CELL_SIZE = 10
const CELL_GAP = 2
const DAY_LABEL_WIDTH = 28

interface DayData {
  date: string
  dateFormatted: string
  sessionCount: number
  totalTokens: number
  intensity: number
  weekIndex: number
  dayOfWeek: number
}

interface MonthLabel {
  label: string
  weekIndex: number
}

interface TooltipData {
  date: string
  dateFormatted: string
  sessionCount: number
  totalTokens: number
  x: number
  y: number
}

function computePercentiles(values: number[]): { p25: number; p50: number; p75: number } {
  if (values.length === 0) return { p25: 0, p50: 0, p75: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number): number => {
    const idx = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  }
  return {
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
  }
}

function getIntensityLevel(
  tokens: number,
  percentiles: { p25: number; p50: number; p75: number },
): number {
  if (tokens === 0) return 0
  if (tokens <= percentiles.p25) return 1
  if (tokens <= percentiles.p50) return 2
  if (tokens <= percentiles.p75) return 3
  return 4
}

/**
 * Convert JS getDay (0=Sun..6=Sat) to Mon-first (0=Mon..6=Sun).
 */
function toMondayFirst(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

export function ContributionHeatmap({
  dailyActivity,
  dailyModelTokens,
}: {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
}) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const { days, monthLabels } = useMemo(() => {
    // Step 1: Build a lookup map joining both data sources by date
    const dataMap = new Map<string, { sessionCount: number; totalTokens: number }>()

    for (const entry of dailyActivity) {
      const existing = dataMap.get(entry.date) ?? { sessionCount: 0, totalTokens: 0 }
      existing.sessionCount = entry.sessionCount
      dataMap.set(entry.date, existing)
    }

    for (const entry of dailyModelTokens) {
      const existing = dataMap.get(entry.date) ?? { sessionCount: 0, totalTokens: 0 }
      existing.totalTokens = Object.values(entry.tokensByModel).reduce((sum, t) => sum + t, 0)
      dataMap.set(entry.date, existing)
    }

    // Step 2: Calculate start date (today - 364 days, adjusted to previous Monday)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let startDate = addDays(today, -364)
    const startDayOfWeek = toMondayFirst(getDay(startDate))
    if (startDayOfWeek !== 0) {
      startDate = addDays(startDate, -startDayOfWeek)
    }

    // Step 3: Generate all days in range
    const allDays: DayData[] = []
    let currentDate = startDate
    while (currentDate <= today) {
      const dateStr = format(currentDate, 'yyyy-MM-dd')
      const dayOfWeek = toMondayFirst(getDay(currentDate))
      const daysSinceStart = Math.floor(
        (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      const weekIndex = Math.floor(daysSinceStart / 7)
      const data = dataMap.get(dateStr)

      allDays.push({
        date: dateStr,
        dateFormatted: format(currentDate, 'MMM d, yyyy'),
        sessionCount: data?.sessionCount ?? 0,
        totalTokens: data?.totalTokens ?? 0,
        intensity: 0, // computed below
        weekIndex,
        dayOfWeek,
      })

      currentDate = addDays(currentDate, 1)
    }

    // Step 4: Compute percentiles from non-zero token days
    const nonZeroTokens = allDays.filter((d) => d.totalTokens > 0).map((d) => d.totalTokens)
    const percentiles = computePercentiles(nonZeroTokens)

    // Step 5: Assign intensity levels
    for (const day of allDays) {
      day.intensity = getIntensityLevel(day.totalTokens, percentiles)
    }

    // Step 6: Generate month labels by detecting month changes at each Monday
    const labels: MonthLabel[] = []
    let lastMonth = -1
    for (const day of allDays) {
      if (day.dayOfWeek === 0) {
        const parsed = parseISO(day.date)
        const month = parsed.getMonth()
        if (month !== lastMonth) {
          labels.push({
            label: format(parsed, 'MMM'),
            weekIndex: day.weekIndex,
          })
          lastMonth = month
        }
      }
    }

    return { days: allDays, monthLabels: labels }
  }, [dailyActivity, dailyModelTokens])

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-gray-300">Activity</h3>
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-gray-500">No activity data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Activity</h3>
      <p className="mt-1 text-xs text-gray-500">Token usage intensity over the past year</p>

      <div className="mt-4 overflow-x-auto">
        <div className="relative w-full">
          {/* Grid container with day labels */}
          <div className="flex">
            {/* Day labels column (spacer for month row + labels for grid rows) */}
            <div
              className="flex flex-col text-[10px] text-gray-500"
              style={{ width: DAY_LABEL_WIDTH }}
            >
              {/* Spacer for month labels row */}
              <div style={{ height: 16, marginBottom: CELL_GAP }} />
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="flex items-center"
                  style={{ height: CELL_SIZE, marginTop: i > 0 ? CELL_GAP : 0 }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Month labels + Heatmap grid (same column structure) */}
            <div className="flex flex-1 flex-col">
              {/* Month labels row - uses matching grid */}
              <div
                className="grid text-[10px] text-gray-500"
                style={{
                  gridAutoFlow: 'column',
                  gridAutoColumns: `minmax(${CELL_SIZE}px, 1fr)`,
                  gap: CELL_GAP,
                  height: 16,
                  marginBottom: CELL_GAP,
                }}
              >
                {monthLabels.map((ml, i) => (
                  <div
                    key={`${ml.label}-${i}`}
                    className="flex items-end"
                    style={{ gridColumn: ml.weekIndex + 1 }}
                  >
                    {ml.label}
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              <div
                className="relative grid"
                style={{
                  gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
                  gridAutoFlow: 'column',
                  gridAutoColumns: `minmax(${CELL_SIZE}px, 1fr)`,
                  gap: CELL_GAP,
                }}
              >
              {days.map((day) => (
                <div
                  key={day.date}
                  className="rounded-sm transition-colors"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: INTENSITY_COLORS[day.intensity],
                    gridRow: day.dayOfWeek + 1,
                    gridColumn: day.weekIndex + 1,
                  }}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    setTooltip({
                      date: day.date,
                      dateFormatted: day.dateFormatted,
                      sessionCount: day.sessionCount,
                      totalTokens: day.totalTokens,
                      x: rect.left + rect.width / 2,
                      y: rect.top - 8,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}

            </div>
            </div>
          </div>

        </div>
      </div>

      {/* Tooltip rendered via portal to escape overflow boundaries */}
      {tooltip && createPortal(
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'nowrap',
          }}
        >
          <p className="font-medium text-gray-300">{tooltip.dateFormatted}</p>
          {tooltip.totalTokens > 0 || tooltip.sessionCount > 0 ? (
            <div className="mt-1 space-y-0.5 text-gray-400">
              <p>
                {tooltip.sessionCount} {tooltip.sessionCount === 1 ? 'session' : 'sessions'}
              </p>
              <p>{formatTokenCount(tooltip.totalTokens)} tokens</p>
            </div>
          ) : (
            <p className="mt-1 text-gray-500">No activity</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
