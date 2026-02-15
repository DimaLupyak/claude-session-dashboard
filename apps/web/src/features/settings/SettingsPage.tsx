import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsQuery, useSettingsMutation } from './settings.queries'
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SubscriptionTierId,
  type ModelPricingOverride,
} from './settings.types'
import { TierSelector } from './TierSelector'
import { PricingTableEditor } from './PricingTableEditor'

export function SettingsPage() {
  const { data: settings, isLoading } = useQuery(settingsQuery)

  if (isLoading || !settings) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
      </div>
    )
  }

  return <SettingsForm settings={settings} />
}

function SettingsForm({ settings }: { settings: Settings }) {
  const mutation = useSettingsMutation()

  const [tier, setTier] = useState<SubscriptionTierId>(settings.subscriptionTier)
  const [overrides, setOverrides] = useState<Record<string, ModelPricingOverride>>(settings.pricingOverrides)
  const [isDirty, setIsDirty] = useState(false)

  function handleTierChange(newTier: SubscriptionTierId) {
    setTier(newTier)
    setIsDirty(true)
  }

  function handleOverridesChange(newOverrides: Record<string, ModelPricingOverride>) {
    setOverrides(newOverrides)
    setIsDirty(true)
  }

  function handleReset() {
    setTier(DEFAULT_SETTINGS.subscriptionTier)
    setOverrides(DEFAULT_SETTINGS.pricingOverrides)
    setIsDirty(true)
  }

  function handleSave() {
    const updated: Settings = {
      version: 1,
      subscriptionTier: tier,
      pricingOverrides: overrides,
    }
    mutation.mutate(updated, {
      onSuccess: () => {
        setIsDirty(false)
      },
    })
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-white">Settings</h1>
      <p className="mt-1 text-xs text-gray-500">
        Configure your subscription tier and API pricing for cost estimation.
      </p>

      {/* Subscription Tier */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-300">Subscription Tier</h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Select your Claude subscription plan. This is informational only and does not
          affect cost calculations.
        </p>
        <div className="mt-3">
          <TierSelector value={tier} onChange={handleTierChange} />
        </div>
      </div>

      {/* Pricing Table */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-300">
          API Pricing (per million tokens)
        </h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Default prices from Anthropic. Override any value to match your negotiated
          rates.
        </p>
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <PricingTableEditor
            overrides={overrides}
            onChange={handleOverridesChange}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          Reset to Defaults
        </button>

        <div className="flex items-center gap-3">
          {mutation.isSuccess && !isDirty && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          {mutation.isError && (
            <span className="text-xs text-red-400">
              Failed to save: {mutation.error?.message ?? 'Unknown error'}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || mutation.isPending}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
              isDirty && !mutation.isPending
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'cursor-not-allowed bg-gray-800 text-gray-500'
            }`}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
