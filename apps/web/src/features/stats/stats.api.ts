import { createServerFn } from '@tanstack/react-start'
import { parseStats } from '@/lib/parsers/stats-parser'

export const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  return parseStats()
})
