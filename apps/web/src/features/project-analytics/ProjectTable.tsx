import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { formatDuration, formatRelativeTime } from '@/lib/utils/format'
import type { ProjectAnalytics } from './project-analytics.server'

type SortField = 'projectName' | 'totalSessions' | 'totalMessages' | 'totalDurationMs' | 'lastSessionAt'
type SortDir = 'asc' | 'desc'

interface ProjectTableProps {
  projects: ProjectAnalytics[]
}

const COLUMNS: { key: SortField; label: string; align?: 'right' }[] = [
  { key: 'projectName', label: 'Project' },
  { key: 'totalSessions', label: 'Sessions', align: 'right' },
  { key: 'totalMessages', label: 'Messages', align: 'right' },
  { key: 'totalDurationMs', label: 'Duration', align: 'right' },
  { key: 'lastSessionAt', label: 'Last Active', align: 'right' },
]

export function ProjectTable({ projects }: ProjectTableProps) {
  const [sortField, setSortField] = useState<SortField>('lastSessionAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const copy = [...projects]
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'projectName':
          cmp = a.projectName.localeCompare(b.projectName)
          break
        case 'totalSessions':
          cmp = a.totalSessions - b.totalSessions
          break
        case 'totalMessages':
          cmp = a.totalMessages - b.totalMessages
          break
        case 'totalDurationMs':
          cmp = a.totalDurationMs - b.totalDurationMs
          break
        case 'lastSessionAt':
          cmp = a.lastSessionAt.localeCompare(b.lastSessionAt)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [projects, sortField, sortDir])

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  function renderSortIndicator(field: SortField) {
    if (field !== sortField) return null
    return <span className="ml-1">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/50">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`cursor-pointer px-4 py-3 text-xs font-medium text-gray-400 hover:text-gray-200 ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
                {renderSortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((project) => (
            <tr
              key={project.projectPath}
              className="border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
            >
              <td className="px-4 py-3">
                <Link
                  to="/sessions"
                  search={{ project: project.projectName }}
                  className="text-sm text-blue-400 hover:underline"
                >
                  {project.projectName}
                </Link>
                {project.activeSessions > 0 && (
                  <span className="ml-2 rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                    {project.activeSessions} active
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                {project.totalSessions}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                {project.totalMessages.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                {formatDuration(project.totalDurationMs)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-400">
                {formatRelativeTime(project.lastSessionAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
