import { useState, useMemo, useRef, useEffect } from 'react'
import type {
  Turn,
  AgentInvocation,
  SkillInvocation,
  SessionError,
} from '@/lib/parsers/types'
import type { TooltipItem } from './timeline-types'
import { buildTimelineChartData } from './timeline-data'
import { TimelineChart } from './TimelineChart'
import { TimelineTooltip } from './TimelineTooltip'
import { TimelineLegend } from './TimelineLegend'

interface Props {
  turns: Turn[]
  agents: AgentInvocation[]
  skills: SkillInvocation[]
  errors: SessionError[]
}

export function TimelineEventsChart({
  turns,
  agents,
  skills,
  errors,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [tooltip, setTooltip] = useState<{
    item: TooltipItem
    position: { x: number; y: number }
  } | null>(null)

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const chartData = useMemo(
    () => buildTimelineChartData(turns, agents, skills, errors),
    [turns, agents, skills, errors],
  )

  // Collect all tool names for legend (main lane + agent dots)
  const allToolNames = useMemo(() => {
    const names: string[] = chartData.mainLane.map((e) => e.toolName)
    for (const lane of chartData.agentLanes) {
      for (const dot of lane.toolDots) {
        names.push(dot.toolName)
      }
    }
    // Count frequency and return sorted by most common
    const freq: Record<string, number> = {}
    for (const n of names) {
      freq[n] = (freq[n] ?? 0) + 1
    }
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }, [chartData])

  const handleHover = (
    item: TooltipItem | null,
    position: { x: number; y: number },
  ) => {
    if (item) {
      setTooltip({ item, position })
    } else {
      setTooltip(null)
    }
  }

  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No timeline data available
      </div>
    )
  }

  // Summary stats
  const agentToolUseIds = new Set(agents.map((a) => a.toolUseId))
  const skillToolUseIds = new Set(skills.map((s) => s.toolUseId))
  let userCommands = 0
  let aiResponses = 0
  let toolCalls = 0
  for (const turn of turns) {
    if (turn.type === 'user' && turn.message?.trim()) userCommands++
    if (turn.type === 'assistant') {
      aiResponses++
      for (const tc of turn.toolCalls) {
        if (!agentToolUseIds.has(tc.toolUseId) && !skillToolUseIds.has(tc.toolUseId)) {
          toolCalls++
        }
      }
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      {/* Header stats */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <StatBadge label="User commands" value={userCommands} color="blue" />
        <StatBadge label="AI responses" value={aiResponses} color="purple" />
        {toolCalls > 0 && (
          <StatBadge label="Tool calls" value={toolCalls} color="gray" />
        )}
        {agents.length > 0 && (
          <StatBadge label="Agents" value={agents.length} color="indigo" />
        )}
        {skills.length > 0 && (
          <StatBadge label="Skills" value={skills.length} color="amber" />
        )}
        {errors.length > 0 && (
          <StatBadge label="Errors" value={errors.length} color="red" />
        )}
      </div>

      {/* Legend + Zoom controls */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          {allToolNames.length > 0 && (
            <TimelineLegend toolNames={allToolNames} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            disabled={zoom <= 1}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-[10px] tabular-nums text-gray-500">
            {zoom === 1 ? 'Fit' : `${zoom.toFixed(1)}x`}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z + 0.5))}
            disabled={zoom >= 8}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
            title="Zoom in"
          >
            +
          </button>
          {zoom > 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="ml-1 rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-gray-700"
              title="Reset zoom"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="relative overflow-x-auto">
        {width > 0 && (
          <>
            <TimelineChart
              data={chartData}
              width={Math.max(width * zoom, 400)}
              onHover={handleHover}
            />
            {tooltip && (
              <TimelineTooltip
                item={tooltip.item}
                position={tooltip.position}
              />
            )}
          </>
        )}
      </div>
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
  color: 'blue' | 'purple' | 'gray' | 'indigo' | 'amber' | 'red'
}) {
  const colorMap = {
    blue: 'bg-blue-500/15 text-blue-400',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-gray-800 text-gray-300',
    indigo: 'bg-indigo-500/15 text-indigo-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
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
