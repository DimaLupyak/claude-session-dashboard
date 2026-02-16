import { useState } from 'react'
import {
  AreaChart,
  Area,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
  Tooltip,
} from 'recharts'
import type { ContextWindowData, TokenUsage } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'

interface Props {
  contextWindow: ContextWindowData | null
  tokens: TokenUsage
}

export function ContextWindowPanel({ contextWindow, tokens }: Props) {
  const [showTokenDetails, setShowTokenDetails] = useState(false)

  if (!contextWindow) {
    return <TokenFallback tokens={tokens} />
  }

  const {
    contextLimit,
    modelName,
    systemOverhead,
    currentContextSize,
    messagesEstimate,
    freeSpace,
    autocompactBuffer,
    usagePercent,
    snapshots,
  } = contextWindow

  const systemPct = (systemOverhead / contextLimit) * 100
  const messagesPct = (messagesEstimate / contextLimit) * 100
  const bufferPct = (autocompactBuffer / contextLimit) * 100
  const freePct = Math.max(0, 100 - systemPct - messagesPct)

  const shortModel = modelName
    .replace(/^claude-/, '')
    .split('-202')[0]

  const chartData = snapshots.map((s) => ({
    turn: s.turnIndex,
    context: s.contextSize,
  }))

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Context Window</h3>
        <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
          {shortModel}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">
          {formatTokenCount(currentContextSize)}
        </span>
        <span className="text-sm text-gray-500">
          / {formatTokenCount(contextLimit)}
        </span>
        <span className="text-sm text-gray-400">
          ({usagePercent}%)
        </span>
      </div>
      <p className="text-[10px] text-gray-500">~estimated from token usage</p>

      {/* Usage bar */}
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-gray-800">
        <div
          className="bg-purple-500"
          style={{ width: `${systemPct}%` }}
          title={`System: ~${formatTokenCount(systemOverhead)}`}
        />
        <div
          className="bg-brand-500"
          style={{ width: `${messagesPct}%` }}
          title={`Messages: ~${formatTokenCount(messagesEstimate)}`}
        />
        {/* Autocompact buffer shown as striped region within free space */}
        {freePct > 0 && (
          <>
            {freePct > bufferPct ? (
              <>
                <div
                  className="bg-gray-700"
                  style={{ width: `${freePct - bufferPct}%` }}
                />
                <div
                  className="autocompact-stripe"
                  style={{ width: `${Math.min(bufferPct, freePct)}%` }}
                />
              </>
            ) : (
              <div
                className="autocompact-stripe"
                style={{ width: `${freePct}%` }}
              />
            )}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-purple-500" />
          system
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-brand-500" />
          messages
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-gray-700" />
          free
        </span>
      </div>

      {/* Category breakdown */}
      <div className="mt-3 space-y-1.5">
        <CategoryRow
          label="System overhead"
          value={systemOverhead}
          total={contextLimit}
          color="bg-purple-500"
          prefix="~"
        />
        <CategoryRow
          label="Messages"
          value={messagesEstimate}
          total={contextLimit}
          color="bg-brand-500"
          prefix="~"
        />
        <CategoryRow
          label="Autocompact buffer"
          value={autocompactBuffer}
          total={contextLimit}
          color="bg-amber-500"
        />
        <CategoryRow
          label="Free space"
          value={freeSpace}
          total={contextLimit}
          color="bg-gray-600"
        />
      </div>

      {/* Sparkline */}
      {chartData.length > 1 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] text-gray-500">Context growth</p>
          <ResponsiveContainer width="100%" height={96}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="contextGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97757" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#d97757" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <YAxis
                domain={[0, contextLimit]}
                hide
              />
              <Tooltip
                contentStyle={{
                  background: '#1c1c1a',
                  border: '1px solid #3d3b36',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelFormatter={(v) => `Turn ${v}`}
                formatter={(v) => [formatTokenCount(v as number), 'Context']}
              />
              <ReferenceLine
                y={contextLimit}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <ReferenceLine
                y={contextLimit - autocompactBuffer}
                stroke="#f59e0b"
                strokeDasharray="2 4"
                strokeOpacity={0.3}
              />
              <Area
                type="stepAfter"
                dataKey="context"
                stroke="#d97757"
                fill="url(#contextGrad)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Collapsible token details */}
      <button
        onClick={() => setShowTokenDetails(!showTokenDetails)}
        className="mt-3 flex w-full items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        <span className="text-[10px]">{showTokenDetails ? '\u25BE' : '\u25B8'}</span>
        Token Details
      </button>

      {showTokenDetails && <TokenBreakdown tokens={tokens} />}

      <style>{`
        .autocompact-stripe {
          background: repeating-linear-gradient(
            -45deg,
            #78716c,
            #78716c 2px,
            #f59e0b 2px,
            #f59e0b 4px
          );
          opacity: 0.4;
        }
      `}</style>
    </div>
  )
}

function CategoryRow({
  label,
  value,
  total,
  color,
  prefix = '',
}: {
  label: string
  value: number
  total: number
  color: string
  prefix?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / total) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-xs text-gray-400 shrink-0">{label}</span>
      <span className="w-16 text-right text-xs font-mono text-gray-300 shrink-0">
        {prefix}{formatTokenCount(value)}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, opacity: 0.7 }}
        />
      </div>
    </div>
  )
}

function TokenBreakdown({ tokens }: { tokens: TokenUsage }) {
  const allTotal =
    tokens.inputTokens +
    tokens.outputTokens +
    tokens.cacheReadInputTokens +
    tokens.cacheCreationInputTokens

  const items = [
    { label: 'Input', value: tokens.inputTokens, color: 'bg-brand-400' },
    { label: 'Output', value: tokens.outputTokens, color: 'bg-emerald-400' },
    { label: 'Cache Read', value: tokens.cacheReadInputTokens, color: 'bg-amber-400' },
    { label: 'Cache Create', value: tokens.cacheCreationInputTokens, color: 'bg-purple-400' },
  ]

  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{item.label}</span>
          <span className="text-xs font-mono text-gray-300">
            {formatTokenCount(item.value)}
          </span>
        </div>
      ))}
      {allTotal > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-gray-800">
          {items
            .filter((i) => i.value > 0)
            .map((item) => (
              <div
                key={item.label}
                className={`${item.color} opacity-60`}
                style={{ width: `${(item.value / allTotal) * 100}%` }}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function TokenFallback({ tokens }: { tokens: TokenUsage }) {
  const activeTotal = tokens.inputTokens + tokens.outputTokens
  const allTotal =
    activeTotal +
    tokens.cacheReadInputTokens +
    tokens.cacheCreationInputTokens

  const items = [
    { label: 'Input', value: tokens.inputTokens, color: 'text-brand-400' },
    { label: 'Output', value: tokens.outputTokens, color: 'text-emerald-400' },
    { label: 'Cache Read', value: tokens.cacheReadInputTokens, color: 'text-amber-400' },
    { label: 'Cache Create', value: tokens.cacheCreationInputTokens, color: 'text-purple-400' },
  ]

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Token Usage</h3>
      <p className="mt-1 text-2xl font-bold text-white">
        {formatTokenCount(activeTotal)}
      </p>
      <p className="text-[10px] text-gray-500">
        input + output ({formatTokenCount(allTotal)} incl. cache)
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{item.label}</span>
            <span className={`text-xs font-mono ${item.color}`}>
              {formatTokenCount(item.value)}
            </span>
          </div>
        ))}
      </div>
      {allTotal > 0 && (
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-gray-800">
          {items
            .filter((i) => i.value > 0)
            .map((item) => (
              <div
                key={item.label}
                className={`${item.color.replace('text-', 'bg-')} opacity-60`}
                style={{ width: `${(item.value / allTotal) * 100}%` }}
              />
            ))}
        </div>
      )}
    </div>
  )
}
