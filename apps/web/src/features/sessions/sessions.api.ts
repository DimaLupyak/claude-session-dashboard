import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessions, getActiveSessions } from '@/lib/scanner/session-scanner'
import type { SessionSummary } from '@/lib/parsers/types'

export const getSessionList = createServerFn({ method: 'GET' }).handler(
  async () => {
    return scanAllSessions()
  },
)

export const getActiveSessionList = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getActiveSessions()
  },
)

const paginatedSessionsInputSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(5).max(100),
  search: z.string(),
  status: z.enum(['all', 'active', 'completed']),
  project: z.string(),
})

type PaginatedSessionsInput = z.infer<typeof paginatedSessionsInputSchema>

export interface PaginatedSessionsResult {
  sessions: SessionSummary[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
  projects: string[]
}

/**
 * Pure business logic for paginating and filtering sessions.
 * Exported for testing purposes.
 */
export async function paginateAndFilterSessions(
  allSessions: SessionSummary[],
  input: PaginatedSessionsInput,
): Promise<PaginatedSessionsResult> {
  const { page, pageSize, search, status, project } = input

  // Extract distinct project names from full unfiltered set
  const projects = Array.from(
    new Set(allSessions.map((s) => s.projectName)),
  ).sort()

  // Apply filters
  let filtered = allSessions

  // Search filter: case-insensitive substring on projectName/branch/sessionId/cwd
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.projectName.toLowerCase().includes(q) ||
        s.branch?.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q) ||
        s.cwd?.toLowerCase().includes(q),
    )
  }

  // Status filter
  if (status === 'active') {
    filtered = filtered.filter((s) => s.isActive)
  } else if (status === 'completed') {
    filtered = filtered.filter((s) => !s.isActive)
  }

  // Project filter: exact match
  if (project) {
    filtered = filtered.filter((s) => s.projectName === project)
  }

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Clamp page to valid range
  const clampedPage = Math.min(Math.max(1, page), totalPages)

  // Slice to page
  const start = (clampedPage - 1) * pageSize
  const end = start + pageSize
  const sessions = filtered.slice(start, end)

  return {
    sessions,
    totalCount,
    totalPages,
    page: clampedPage,
    pageSize,
    projects,
  }
}

export const getPaginatedSessions = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => paginatedSessionsInputSchema.parse(input))
  .handler(async ({ data }): Promise<PaginatedSessionsResult> => {
    const allSessions = await scanAllSessions()
    return paginateAndFilterSessions(allSessions, data)
  })
