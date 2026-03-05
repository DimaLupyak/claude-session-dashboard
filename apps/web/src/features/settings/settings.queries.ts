import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, saveSettings } from './settings.api'
import type { Settings } from './settings.types'

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => getSettings(),
  staleTime: 300_000, // 5 minutes -- settings rarely change
  refetchOnWindowFocus: false,
})

export function useSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: Settings) =>
      saveSettings({ data: settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
