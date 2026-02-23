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
import { usePrivacy } from '@/features/privacy/PrivacyContext'

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
  const { privacyMode, togglePrivacyMode } = usePrivacy()

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
      <h1 className="text-xl font-bold text-gray-100">Settings</h1>
      <p className="mt-1 text-xs text-gray-500">
        Configure your subscription tier and API pricing for cost estimation.
      </p>

      {/* Privacy Mode */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-300">Privacy Mode</h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Hide project names, file paths, and branch names across the dashboard.
          Useful when screen-sharing or recording demos.
        </p>
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Enable privacy mode</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {privacyMode ? 'On' : 'Off'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={privacyMode}
                onClick={togglePrivacyMode}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  privacyMode ? 'bg-brand-600' : 'bg-gray-800'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    privacyMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="mt-3 border-t border-gray-800 pt-3">
            <p className="text-[10px] font-medium text-gray-400">
              What gets hidden:
            </p>
            <ul className="mt-1.5 space-y-1 text-[10px] text-gray-500">
              <li>
                <span className="text-gray-400">Project names</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; project-1, project-2, ...
                </span>
              </li>
              <li>
                <span className="text-gray-400">File paths</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; .../project-1
                </span>
              </li>
              <li>
                <span className="text-gray-400">Branch names</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; branch-1, branch-2, ...
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

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
                ? 'bg-brand-600 text-white hover:bg-brand-500'
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
