import { shortenToolName } from './timeline-chart/timeline-colors'

export function ToolUsagePanel({
  toolFrequency,
}: {
  toolFrequency: Record<string, number>
}) {
  const sorted = Object.entries(toolFrequency).sort(([, a], [, b]) => b - a)
  const maxCount = sorted[0]?.[1] ?? 1

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-gray-300">Tool Usage</h3>
        <p className="mt-2 text-xs text-gray-500">No tools used</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Tool Usage</h3>
      <p className="mt-1 text-xs text-gray-500">
        {sorted.length} tools, {sorted.reduce((sum, [, n]) => sum + n, 0)} calls
      </p>

      <div className="mt-3 space-y-1.5">
        {sorted.slice(0, 15).map(([tool, count]) => (
          <div key={tool} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs font-mono text-gray-400" title={tool}>
              {shortenToolName(tool)}
            </span>
            <div className="flex-1">
              <div
                className="h-4 rounded bg-blue-500/20"
                style={{ width: `${(count / maxCount) * 100}%` }}
              >
                <span className="px-1.5 text-xs text-blue-300">{count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
