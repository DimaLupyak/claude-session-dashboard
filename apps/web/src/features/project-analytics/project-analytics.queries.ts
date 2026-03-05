import { queryOptions } from '@tanstack/react-query'
import { getProjectAnalytics } from './project-analytics.api'

export const projectAnalyticsQuery = queryOptions({
  queryKey: ['projects', 'analytics'],
  queryFn: () => getProjectAnalytics(),
  refetchInterval: 60_000,
})
