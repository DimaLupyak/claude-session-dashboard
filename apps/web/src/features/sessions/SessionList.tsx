import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { paginatedSessionListQuery, activeSessionsQuery } from './sessions.queries'
import { SessionCard } from './SessionCard'
import { SessionFilters } from './SessionFilters'
import { PaginationControls } from './PaginationControls'
import { usePageSizePreference } from './usePageSizePreference'
import { Route } from '@/routes/_dashboard/sessions/index'

export function SessionList() {
  const navigate = useNavigate()
  const { page, pageSize, search, status, project, sort, sortDir } = Route.useSearch()
  const { storedPageSize, setPageSize } = usePageSizePreference()
  const hasAppliedStoredPreference = useRef(false)

  // On mount, if localStorage has a preference that differs from the URL default,
  // apply it (only once, and only if URL doesn't already have an explicit pageSize).
  // Priority: explicit URL param > localStorage preference > schema default (5)
  useEffect(() => {
    if (
      storedPageSize !== null &&
      !hasAppliedStoredPreference.current &&
      storedPageSize !== pageSize
    ) {
      hasAppliedStoredPreference.current = true
      navigate({
        to: '/sessions',
        search: (prev) => ({ ...prev, pageSize: storedPageSize, page: 1 }),
        replace: true,
      })
    }
  }, [storedPageSize, pageSize, navigate])

  const { data: paginatedData, isLoading } = useQuery(
    paginatedSessionListQuery({ page, pageSize, search, status, project, sort, sortDir }),
  )
  const { data: activeSessions = [] } = useQuery(activeSessionsQuery)

  // Merge active session status from the fast-polling query into current page results
  const mergedSessions = useMemo(() => {
    if (!paginatedData) return []
    const activeIds = new Set(activeSessions.map((s) => s.sessionId))
    return paginatedData.sessions.map((s) => ({
      ...s,
      isActive: activeIds.has(s.sessionId) || s.isActive,
    }))
  }, [paginatedData, activeSessions])

  function handlePageChange(newPage: number) {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, page: newPage }),
    })
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize)
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, pageSize: newSize, page: 1 }),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: pageSize }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-gray-800 bg-gray-900/50"
          />
        ))}
      </div>
    )
  }

  const totalCount = paginatedData?.totalCount ?? 0
  const totalPages = paginatedData?.totalPages ?? 1
  const projects = paginatedData?.projects ?? []
  const activeCount = activeSessions.length

  return (
    <div>
      <SessionFilters projects={projects} activeCount={activeCount} />

      <div className="mt-4 space-y-2">
        {mergedSessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {totalCount === 0 && !search && status === 'all' && !project
              ? 'No sessions found in ~/.claude'
              : 'No sessions match your filters'}
          </div>
        ) : (
          mergedSessions.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))
        )}
      </div>

      <div className="mt-4">
        <PaginationControls
          page={paginatedData?.page ?? page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  )
}
