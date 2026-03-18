interface SourceBadgeProps {
  sourceLabel: string
  platform?: 'windows' | 'wsl' | 'macos' | 'linux'
  className?: string
}

const PLATFORM_STYLES: Record<string, string> = {
  windows: 'bg-blue-950 text-blue-400 border border-blue-800',
  wsl: 'bg-purple-950 text-purple-400 border border-purple-800',
}

const DEFAULT_STYLE = 'bg-gray-800 text-gray-400 border border-gray-700'

export function SourceBadge({ sourceLabel, platform, className }: SourceBadgeProps) {
  const platformStyle = platform ? (PLATFORM_STYLES[platform] ?? DEFAULT_STYLE) : DEFAULT_STYLE

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${platformStyle}${className ? ` ${className}` : ''}`}
    >
      {sourceLabel}
    </span>
  )
}
