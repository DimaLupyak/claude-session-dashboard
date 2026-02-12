import type { TooltipItem } from './timeline-types'
import { shortenToolName } from './timeline-colors'
import { formatDuration } from '@/lib/utils/format'
import { formatTokenCount } from '@/lib/utils/format'
import { format } from 'date-fns'

interface Props {
  item: TooltipItem
  position: { x: number; y: number }
}

export function TimelineTooltip({ item, position }: Props) {
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      {item.kind === 'tool' && (
        <div>
          <div className="font-semibold text-gray-100">{shortenToolName(item.toolName)}</div>
          <div className="text-gray-400">
            {format(new Date(item.timestamp), 'HH:mm:ss')}
          </div>
          <div className="font-mono text-[10px] text-gray-600">
            {item.toolUseId.slice(0, 16)}...
          </div>
        </div>
      )}
      {item.kind === 'agent' && (
        <div>
          <div className="font-semibold text-indigo-300">
            {item.agent.subagentType}
          </div>
          <div className="max-w-48 truncate text-gray-400">
            {item.agent.description}
          </div>
          <div className="mt-1 flex items-center gap-2 text-gray-500">
            {item.agent.durationMs != null && (
              <span>
                {format(new Date(item.agent.startMs), 'HH:mm')} -{' '}
                {format(new Date(item.agent.endMs), 'HH:mm')} (
                {formatDuration(item.agent.durationMs)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            {item.agent.totalTokens != null && (
              <span>{formatTokenCount(item.agent.totalTokens)} tokens</span>
            )}
            {item.agent.totalToolUseCount != null && (
              <span>{item.agent.totalToolUseCount} tools</span>
            )}
          </div>
        </div>
      )}
      {item.kind === 'skill' && (
        <div>
          <div className="font-semibold text-amber-300">/{item.skill}</div>
          {item.args && <div className="text-gray-400">{item.args}</div>}
          <div className="text-gray-500">
            {format(new Date(item.timestamp), 'HH:mm:ss')}
          </div>
        </div>
      )}
      {item.kind === 'error' && (
        <div>
          <div className="font-semibold text-red-400">{item.type}</div>
          <div className="max-w-48 truncate text-gray-400">{item.message}</div>
          <div className="text-gray-500">
            {format(new Date(item.timestamp), 'HH:mm:ss')}
          </div>
        </div>
      )}
    </div>
  )
}
