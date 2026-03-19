import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '@/routes/_dashboard/sessions/index'
import { usePrivacy } from '@/features/privacy/PrivacyContext'

const SORT_OPTIONS = ['lastActive', 'started', 'duration', 'messages'] as const
type SortOption = typeof SORT_OPTIONS[number]

interface SessionFiltersProps {
  projects: string[]
  activeCount: number
}

export function SessionFilters({ projects, activeCount }: SessionFiltersProps) {
  const navigate = useNavigate()
  const { search: urlSearch, status, project, sort, sortDir } = Route.useSearch()
  const { privacyMode, anonymizeProjectName } = usePrivacy()

  // Local search state with debounce
  const [localSearch, setLocalSearch] = useState(urlSearch)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Sync local search when URL changes externally (e.g. browser back/forward)
  useEffect(() => {
    setLocalSearch(urlSearch)
  }, [urlSearch])

  function handleSearchChange(value: string) {
    setLocalSearch(value)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      navigate({
        to: '/sessions',
        search: (prev) => ({ ...prev, search: value, page: 1 }),
      })
    }, 300)
  }

  function handleStatusChange(newStatus: 'all' | 'active' | 'completed') {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, status: newStatus, page: 1 }),
    })
  }

  function handleSortChange(newSort: string) {
    if (!SORT_OPTIONS.includes(newSort as SortOption)) return
    navigate({
      to: '/sessions',
      search: (prev) => ({
        ...prev,
        sort: newSort as SortOption,
        page: 1,
      }),
    })
  }

  function handleSortDirToggle() {
    navigate({
      to: '/sessions',
      search: (prev) => ({
        ...prev,
        sortDir: sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      }),
    })
  }

  function handleProjectChange(newProject: string) {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, project: newProject, page: 1 }),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Search sessions..."
        value={localSearch}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />

      <div className="flex rounded-lg border border-gray-700 text-xs">
        {(['all', 'active', 'completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1.5 capitalize transition-colors ${
              status === s
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            } ${s === 'all' ? 'rounded-l-lg' : ''} ${s === 'completed' ? 'rounded-r-lg' : ''}`}
          >
            {s}
            {s === 'active' && activeCount > 0 && (
              <span className="ml-1 text-emerald-400">({activeCount})</span>
            )}
          </button>
        ))}
      </div>

      {projects.length > 1 && (
        <select
          value={project}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand-500"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {privacyMode ? anonymizeProjectName(p) : p}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-1">
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand-500"
        >
          <option value="lastActive">Last active</option>
          <option value="started">Started</option>
          <option value="duration">Duration</option>
          <option value="messages">Messages</option>
        </select>
        <button
          type="button"
          onClick={handleSortDirToggle}
          className="rounded-lg border border-gray-700 px-2 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? '\u2191' : '\u2193'}
        </button>
      </div>
    </div>
  )
}
