import { getToolColor, shortenToolName } from './timeline-colors'

interface Props {
  toolNames: string[]
}

export function TimelineLegend({ toolNames }: Props) {
  // Deduplicate and take top tool names
  const unique = [...new Set(toolNames)].slice(0, 12)

  if (unique.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-gray-500">
      {unique.map((name) => (
        <div key={name} className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: getToolColor(name) }}
          />
          <span>{shortenToolName(name)}</span>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rotate-45 bg-amber-400" />
        <span>Skill</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-red-400 font-bold leading-none">×</span>
        <span>Error</span>
      </div>
    </div>
  )
}
