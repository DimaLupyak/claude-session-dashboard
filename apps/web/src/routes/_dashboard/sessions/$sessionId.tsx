import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { sessionDetailQuery } from '@/features/session-detail/session-detail.queries'
import { TimelineEventsChart } from '@/features/session-detail/timeline-chart'
import { ContextWindowPanel } from '@/features/session-detail/ContextWindowPanel'
import { ToolUsagePanel } from '@/features/session-detail/ToolUsagePanel'
import { ErrorPanel } from '@/features/session-detail/ErrorPanel'
import { AgentsSkillsPanel } from '@/features/session-detail/AgentsSkillsPanel'
import { TasksPanel } from '@/features/session-detail/TasksPanel'
import { formatDuration, formatDateTime } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { z } from 'zod'

const searchSchema = z.object({
  project: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/sessions/$sessionId')({
  validateSearch: searchSchema,
  component: SessionDetailPage,
})

function SessionDetailPage() {
  const { sessionId } = Route.useParams()
  const { project = '' } = Route.useSearch()

  const { privacyMode, anonymizeProjectName } = usePrivacy()

  const { data: detail, isLoading, error } = useQuery(
    sessionDetailQuery(sessionId, project),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-400">
          Failed to load session: {error?.message ?? 'Not found'}
        </p>
        <Link
          to="/sessions"
          className="mt-2 inline-block text-sm text-blue-400 hover:underline"
        >
          Back to sessions
        </Link>
      </div>
    )
  }

  const startedAt = detail.turns[0]?.timestamp
  const endedAt = detail.turns[detail.turns.length - 1]?.timestamp
  const durationMs =
    startedAt && endedAt
      ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
      : 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/sessions"
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            &larr; Sessions
          </Link>
          <h1 className="mt-1 text-xl font-bold text-white">
            {privacyMode
              ? anonymizeProjectName(detail.projectName)
              : detail.projectName}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            {detail.branch && (
              <span className="font-mono">{detail.branch}</span>
            )}
            {startedAt && <span>{formatDateTime(startedAt)}</span>}
            <span>{formatDuration(durationMs)}</span>
            <span>{detail.turns.length} turns</span>
          </div>
          {detail.models.length > 0 && (
            <div className="mt-1 flex gap-1">
              {detail.models.map((m) => (
                <span
                  key={m}
                  className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400"
                >
                  {m.replace(/^claude-/, '').split('-202')[0]}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="font-mono text-xs text-gray-600">
          {sessionId.slice(0, 8)}
        </span>
      </div>

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ContextWindowPanel contextWindow={detail.contextWindow} tokens={detail.totalTokens} />
        <ToolUsagePanel toolFrequency={detail.toolFrequency} />
      </div>

      {/* Agents & Skills */}
      {(detail.agents.length > 0 || detail.skills.length > 0) && (
        <div className="mt-4">
          <AgentsSkillsPanel agents={detail.agents} skills={detail.skills} />
        </div>
      )}

      {/* Tasks */}
      {detail.tasks.length > 0 && (
        <div className="mt-4">
          <TasksPanel tasks={detail.tasks} />
        </div>
      )}

      <ErrorPanel errors={detail.errors} />

      {/* Timeline Events Chart */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-300">Timeline</h2>
        <TimelineEventsChart
          turns={detail.turns}
          agents={detail.agents}
          skills={detail.skills}
          errors={detail.errors}
        />
      </div>

    </div>
  )
}
