import { queryOptions } from '@tanstack/react-query'
import { getAppInfo } from './app-info.server'

export const appInfoQuery = queryOptions({
  queryKey: ['app-info'],
  queryFn: () => getAppInfo(),
  staleTime: Infinity, // Version and path never change at runtime
  refetchOnWindowFocus: false,
})
