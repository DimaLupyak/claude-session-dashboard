import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SessionList } from '@/features/sessions/SessionList'

const sessionsSearchSchema = z.object({
  page: z.number().int().min(1).default(1).catch(1),
  pageSize: z.number().int().min(5).max(100).default(5).catch(5),
  search: z.string().default('').catch(''),
  status: z.enum(['all', 'active', 'completed']).default('all').catch('all'),
  project: z.string().default('').catch(''),
})

export type SessionsSearch = z.infer<typeof sessionsSearchSchema>

export const Route = createFileRoute('/_dashboard/sessions/')({
  validateSearch: sessionsSearchSchema,
  component: SessionsPage,
})

function SessionsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100">Sessions</h1>
      <p className="mt-1 text-sm text-gray-400">
        All Claude Code sessions from ~/.claude
      </p>
      <div className="mt-6">
        <SessionList />
      </div>
    </div>
  )
}
