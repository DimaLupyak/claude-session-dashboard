import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '@/routes/_dashboard/sessions/index'
import { usePrivacy } from '@/features/privacy/PrivacyContext'

interface SessionFiltersProps {
  projects: string[]
  activeCount: number
}

export function SessionFilters({ projects, activeCount }: SessionFiltersProps) {
  const navigate = useNavigate()
  const { search: urlSearch, status, project } = Route.useSearch()
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
        className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="flex rounded-lg border border-gray-700 text-xs">
        {(['all', 'active', 'completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1.5 capitalize transition-colors ${
              status === s
                ? 'bg-gray-700 text-white'
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
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {privacyMode ? anonymizeProjectName(p) : p}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
