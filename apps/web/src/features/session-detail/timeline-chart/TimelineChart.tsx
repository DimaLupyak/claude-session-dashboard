import { useRef, useCallback } from 'react'
import { format } from 'date-fns'
import type {
  TimelineChartData,
  TooltipItem,
  AgentLaneData,
} from './timeline-types'
import { getToolColor, shortenToolName } from './timeline-colors'

const LEFT_MARGIN = 90
const RIGHT_MARGIN = 16
const TOP_MARGIN = 24
const LANE_HEIGHT = 32
const LANE_GAP = 8
const DOT_RADIUS = 4

interface Props {
  data: TimelineChartData
  width: number
  onHover: (item: TooltipItem | null, position: { x: number; y: number }) => void
}

function computeTimeTicks(
  startMs: number,
  endMs: number,
  chartWidth: number,
): Array<{ ms: number; label: string; x: number }> {
  const durationMs = endMs - startMs
  if (durationMs <= 0) return []

  // Aim for ~1 tick per 100-150px
  const targetTickCount = Math.max(3, Math.round(chartWidth / 120))

  // Find a nice interval
  const rawIntervalMs = durationMs / targetTickCount
  const niceIntervals = [
    5_000, 10_000, 15_000, 30_000, // seconds
    60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000, // minutes
    60 * 60_000, 2 * 60 * 60_000, // hours
  ]
  const intervalMs =
    niceIntervals.find((i) => i >= rawIntervalMs) ??
    niceIntervals[niceIntervals.length - 1]

  // Use seconds format for durations under 5 minutes
  const useSeconds = durationMs < 5 * 60_000
  const fmt = useSeconds ? 'HH:mm:ss' : 'HH:mm'

  const firstTickMs = Math.ceil(startMs / intervalMs) * intervalMs
  const ticks: Array<{ ms: number; label: string; x: number }> = []

  for (let ms = firstTickMs; ms <= endMs; ms += intervalMs) {
    const fraction = (ms - startMs) / durationMs
    ticks.push({
      ms,
      label: format(new Date(ms), fmt),
      x: LEFT_MARGIN + fraction * (chartWidth - LEFT_MARGIN - RIGHT_MARGIN),
    })
  }

  return ticks
}

export function TimelineChart({ data, width, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const chartWidth = width
  const innerWidth = chartWidth - LEFT_MARGIN - RIGHT_MARGIN

  // Calculate total height
  const hasSkills = data.skillMarkers.length > 0
  const hasErrors = data.errorMarkers.length > 0
  let currentY = TOP_MARGIN

  const mainLaneY = currentY
  currentY += LANE_HEIGHT

  const agentLaneYs: number[] = []
  for (let i = 0; i < data.agentLanes.length; i++) {
    currentY += LANE_GAP
    agentLaneYs.push(currentY)
    currentY += LANE_HEIGHT
  }

  let skillRowY = 0
  if (hasSkills) {
    currentY += LANE_GAP
    skillRowY = currentY
    currentY += LANE_HEIGHT
  }

  let errorRowY = 0
  if (hasErrors) {
    currentY += LANE_GAP
    errorRowY = currentY
    currentY += LANE_HEIGHT
  }

  const totalHeight = Math.max(currentY + 8, 80)

  function toX(relativeX: number): number {
    return LEFT_MARGIN + relativeX * innerWidth
  }

  const getPosition = useCallback(
    (event: React.MouseEvent) => {
      if (!svgRef.current) return { x: 0, y: 0 }
      const rect = svgRef.current.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    },
    [],
  )

  const ticks = computeTimeTicks(data.startMs, data.endMs, chartWidth)

  return (
    <svg
      ref={svgRef}
      width={chartWidth}
      height={totalHeight}
      className="select-none"
      role="img"
      aria-label="Session timeline showing tool calls, agent runs, and skill invocations"
      onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
    >
      {/* Time axis */}
      <line
        x1={LEFT_MARGIN}
        y1={TOP_MARGIN - 4}
        x2={chartWidth - RIGHT_MARGIN}
        y2={TOP_MARGIN - 4}
        stroke="#374151"
        strokeWidth={1}
      />
      {ticks.map((tick) => (
        <g key={tick.ms}>
          <line
            x1={tick.x}
            y1={TOP_MARGIN - 8}
            x2={tick.x}
            y2={TOP_MARGIN - 4}
            stroke="#4b5563"
            strokeWidth={1}
          />
          <text
            x={tick.x}
            y={TOP_MARGIN - 12}
            textAnchor="middle"
            className="fill-gray-500 text-[10px]"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* Main lane */}
      <text
        x={4}
        y={mainLaneY + LANE_HEIGHT / 2 + 4}
        className="fill-gray-500 text-[11px] font-medium"
      >
        Main
      </text>
      <line
        x1={LEFT_MARGIN}
        y1={mainLaneY + LANE_HEIGHT / 2}
        x2={chartWidth - RIGHT_MARGIN}
        y2={mainLaneY + LANE_HEIGHT / 2}
        stroke="#1f2937"
        strokeWidth={1}
        strokeDasharray="2,4"
      />
      {data.mainLane.map((event) => (
        <circle
          key={event.toolUseId}
          cx={toX(event.relativeX)}
          cy={mainLaneY + LANE_HEIGHT / 2}
          r={DOT_RADIUS}
          fill={getToolColor(event.toolName)}
          opacity={0.85}
          className="cursor-pointer transition-transform hover:opacity-100"
          onMouseEnter={(e) =>
            onHover(
              {
                kind: 'tool',
                toolName: event.toolName,
                timestamp: new Date(event.timestampMs).toISOString(),
                toolUseId: event.toolUseId,
              },
              getPosition(e),
            )
          }
          onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
        >
          <title>{event.toolName}</title>
        </circle>
      ))}

      {/* Agent swim lanes */}
      {data.agentLanes.map((lane, i) => (
        <AgentLaneSVG
          key={`${lane.subagentType}-${i}`}
          lane={lane}
          y={agentLaneYs[i]}
          toX={toX}
          laneHeight={LANE_HEIGHT}
          leftMargin={LEFT_MARGIN}
          onHover={onHover}
          getPosition={getPosition}
        />
      ))}

      {/* Skill markers row */}
      {hasSkills && (
        <>
          <text
            x={4}
            y={skillRowY + LANE_HEIGHT / 2 + 4}
            className="fill-amber-400/70 text-[11px] font-medium"
          >
            Skills
          </text>
          <line
            x1={LEFT_MARGIN}
            y1={skillRowY + LANE_HEIGHT / 2}
            x2={chartWidth - RIGHT_MARGIN}
            y2={skillRowY + LANE_HEIGHT / 2}
            stroke="#1f2937"
            strokeWidth={1}
            strokeDasharray="2,4"
          />
          {data.skillMarkers.map((skill, i) => {
            const cx = toX(skill.relativeX)
            const cy = skillRowY + LANE_HEIGHT / 2
            const size = 5
            return (
              <polygon
                key={`${skill.skill}-${i}`}
                points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                fill="#fbbf24"
                opacity={0.85}
                className="cursor-pointer hover:opacity-100"
                onMouseEnter={(e) =>
                  onHover(
                    {
                      kind: 'skill',
                      skill: skill.skill,
                      args: skill.args,
                      timestamp: new Date(skill.timestampMs).toISOString(),
                    },
                    getPosition(e),
                  )
                }
                onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
              >
                <title>/{skill.skill}</title>
              </polygon>
            )
          })}
        </>
      )}

      {/* Error markers row */}
      {hasErrors && (
        <>
          <text
            x={4}
            y={errorRowY + LANE_HEIGHT / 2 + 4}
            className="fill-red-400/70 text-[11px] font-medium"
          >
            Errors
          </text>
          <line
            x1={LEFT_MARGIN}
            y1={errorRowY + LANE_HEIGHT / 2}
            x2={chartWidth - RIGHT_MARGIN}
            y2={errorRowY + LANE_HEIGHT / 2}
            stroke="#1f2937"
            strokeWidth={1}
            strokeDasharray="2,4"
          />
          {data.errorMarkers.map((err, i) => {
            const cx = toX(err.relativeX)
            const cy = errorRowY + LANE_HEIGHT / 2
            const size = 5
            return (
              <g
                key={`err-${i}`}
                className="cursor-pointer hover:opacity-100"
                opacity={0.85}
                onMouseEnter={(e) =>
                  onHover(
                    {
                      kind: 'error',
                      message: err.message,
                      type: err.type,
                      timestamp: new Date(err.timestampMs).toISOString(),
                    },
                    getPosition(e),
                  )
                }
                onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
              >
                <line
                  x1={cx - size}
                  y1={cy - size}
                  x2={cx + size}
                  y2={cy + size}
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <line
                  x1={cx + size}
                  y1={cy - size}
                  x2={cx - size}
                  y2={cy + size}
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <title>{err.type}: {err.message}</title>
              </g>
            )
          })}
        </>
      )}
    </svg>
  )
}

function AgentLaneSVG({
  lane,
  y,
  toX,
  laneHeight,
  leftMargin,
  onHover,
  getPosition,
}: {
  lane: AgentLaneData
  y: number
  toX: (relX: number) => number
  laneHeight: number
  leftMargin: number
  onHover: Props['onHover']
  getPosition: (e: React.MouseEvent) => { x: number; y: number }
}) {
  const barX = toX(lane.startX)
  const barWidth = Math.max(toX(lane.endX) - barX, 8) // Minimum 8px width
  const midY = y + laneHeight / 2

  // Truncate label to fit in left margin
  const label =
    lane.subagentType.length > 10
      ? lane.subagentType.slice(0, 10) + '...'
      : lane.subagentType

  return (
    <g>
      {/* Label */}
      <text
        x={4}
        y={midY + 4}
        className="fill-indigo-400/70 text-[11px] font-medium"
      >
        {label}
      </text>

      {/* Lane background bar */}
      <rect
        x={barX}
        y={y + 2}
        width={barWidth}
        height={laneHeight - 4}
        rx={6}
        fill="rgba(99, 102, 241, 0.08)"
        stroke="rgba(99, 102, 241, 0.2)"
        strokeWidth={1}
        className="cursor-pointer hover:fill-indigo-500/15"
        onMouseEnter={(e) =>
          onHover({ kind: 'agent', agent: lane }, getPosition(e))
        }
        onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
      >
        <title>
          {lane.subagentType}: {lane.description}
        </title>
      </rect>

      {/* Baseline within lane */}
      <line
        x1={barX + 4}
        y1={midY}
        x2={barX + barWidth - 4}
        y2={midY}
        stroke="rgba(99, 102, 241, 0.15)"
        strokeWidth={1}
      />

      {/* Tool dots within agent */}
      {lane.toolDots.map((dot, i) => (
        <circle
          key={`${dot.toolName}-${i}`}
          cx={toX(dot.relativeX)}
          cy={midY}
          r={DOT_RADIUS - 0.5}
          fill={getToolColor(dot.toolName)}
          opacity={0.75}
          className="cursor-pointer hover:opacity-100"
          onMouseEnter={(e) =>
            onHover(
              {
                kind: 'tool',
                toolName: dot.toolName,
                timestamp: new Date(
                  lane.startMs +
                    (dot.relativeX - lane.startX) /
                      (lane.endX - lane.startX) *
                      (lane.endMs - lane.startMs),
                ).toISOString(),
                toolUseId: `${lane.subagentType}-${dot.toolName}-${i}`,
              },
              getPosition(e),
            )
          }
          onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
        >
          <title>
            {dot.toolName} ({lane.subagentType})
          </title>
        </circle>
      ))}
    </g>
  )
}
