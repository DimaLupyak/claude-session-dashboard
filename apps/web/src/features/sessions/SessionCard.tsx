import { Link } from '@tanstack/react-router'
import type { SessionSummary } from '@/lib/parsers/types'
import { formatDuration, formatRelativeTime, formatBytes } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { StatusBadge } from './StatusBadge'
import { RunningTimer } from './RunningTimer'

export function SessionCard({ session }: { session: SessionSummary }) {
  const { privacyMode, anonymizePath, anonymizeProjectName } = usePrivacy()
  const displayName = privacyMode
    ? anonymizeProjectName(session.projectName)
    : session.projectName
  const displayCwd = session.cwd
    ? privacyMode
      ? anonymizePath(session.cwd)
      : session.cwd
    : null

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.sessionId }}
      search={{ project: session.projectPath }}
      className="group block rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-gray-700 hover:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">
              {displayName}
            </h3>
            <StatusBadge isActive={session.isActive} />
          </div>

          {session.branch && (
            <p className="mt-1 truncate text-xs text-gray-500">
              <span className="font-mono">{session.branch}</span>
            </p>
          )}
        </div>

        <span className="shrink-0 text-xs text-gray-500">
          {formatRelativeTime(session.lastActiveAt)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span title="Duration">
          {session.isActive ? (
            <RunningTimer startedAt={session.startedAt} />
          ) : (
            formatDuration(session.durationMs)
          )}
        </span>
        <span title="Messages">{session.messageCount} msgs</span>
        {session.model && (
          <span title="Model" className="truncate font-mono text-gray-500">
            {session.model.replace(/^claude-/, '').split('-202')[0]}
          </span>
        )}
        <span title="File size" className="text-gray-500">
          {formatBytes(session.fileSizeBytes)}
        </span>
      </div>

      {displayCwd && (
        <p className="mt-2 truncate text-xs font-mono text-gray-600">
          {displayCwd}
        </p>
      )}
    </Link>
  )
}
