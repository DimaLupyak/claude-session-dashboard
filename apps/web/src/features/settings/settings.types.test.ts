import { describe, it, expect } from 'vitest'
import { normalizeModelId, SettingsSchema } from './settings.types'

describe('normalizeModelId', () => {
  it('strips date suffix from model ID', () => {
    expect(normalizeModelId('claude-sonnet-4-20250514')).toBe('claude-sonnet-4')
    expect(normalizeModelId('claude-opus-4-6-20260101')).toBe('claude-opus-4-6')
    expect(normalizeModelId('claude-haiku-3-5-20241215')).toBe('claude-haiku-3-5')
  })

  it('handles already-normalized IDs (no change)', () => {
    expect(normalizeModelId('claude-sonnet-4')).toBe('claude-sonnet-4')
    expect(normalizeModelId('claude-opus-4-6')).toBe('claude-opus-4-6')
    expect(normalizeModelId('claude-haiku-3')).toBe('claude-haiku-3')
  })

  it('handles IDs with version numbers and date suffixes', () => {
    expect(normalizeModelId('claude-opus-4-6-20260101')).toBe('claude-opus-4-6')
    expect(normalizeModelId('claude-haiku-3-5-20241215')).toBe('claude-haiku-3-5')
  })

  it('handles edge cases', () => {
    // ID with no date suffix
    expect(normalizeModelId('custom-model')).toBe('custom-model')

    // ID with numbers that are not date suffixes
    expect(normalizeModelId('model-123')).toBe('model-123')

    // ID with partial date (not 8 digits)
    expect(normalizeModelId('claude-sonnet-4-2025')).toBe('claude-sonnet-4-2025')
  })

  it('only strips exactly 8-digit suffixes', () => {
    expect(normalizeModelId('claude-sonnet-4-2025051')).toBe('claude-sonnet-4-2025051') // 7 digits
    expect(normalizeModelId('claude-sonnet-4-202505144')).toBe('claude-sonnet-4-202505144') // 9 digits
  })
})

describe('SettingsSchema', () => {
  it('validates correct input', () => {
    const input = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {},
      updatedAt: '2025-01-01T00:00:00Z',
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ ...input, dataSources: [] })
    }
  })

  it('applies defaults for missing optional fields', () => {
    const input = {
      version: 1,
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subscriptionTier).toBe('pro')
      expect(result.data.pricingOverrides).toEqual({})
    }
  })

  it('rejects invalid tier', () => {
    const input = {
      version: 1,
      subscriptionTier: 'invalid-tier',
      pricingOverrides: {},
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts all valid tiers', () => {
    const validTiers = ['free', 'pro', 'max-5x', 'max-20x', 'teams', 'enterprise', 'api']

    for (const tier of validTiers) {
      const input = {
        version: 1,
        subscriptionTier: tier,
        pricingOverrides: {},
      }

      const result = SettingsSchema.safeParse(input)
      expect(result.success).toBe(true)
    }
  })

  it('validates pricing overrides with positive numbers', () => {
    const input = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {
        'claude-sonnet-4': {
          inputPerMTok: 5.0,
          outputPerMTok: 20.0,
          cacheReadPerMTok: 0.5,
          cacheWritePerMTok: 6.0,
        },
      },
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects negative pricing values', () => {
    const input = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {
        'claude-sonnet-4': {
          inputPerMTok: -1.0,
          outputPerMTok: 20.0,
          cacheReadPerMTok: 0.5,
          cacheWritePerMTok: 6.0,
        },
      },
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts zero pricing values', () => {
    const input = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {
        'free-model': {
          inputPerMTok: 0,
          outputPerMTok: 0,
          cacheReadPerMTok: 0,
          cacheWritePerMTok: 0,
        },
      },
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('validates datetime format for updatedAt', () => {
    const validInput = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {},
      updatedAt: '2025-01-01T12:30:45.123Z',
    }

    const result = SettingsSchema.safeParse(validInput)
    expect(result.success).toBe(true)

    const invalidInput = {
      version: 1,
      subscriptionTier: 'pro',
      pricingOverrides: {},
      updatedAt: '2025-01-01', // Not a datetime string
    }

    const invalidResult = SettingsSchema.safeParse(invalidInput)
    expect(invalidResult.success).toBe(false)
  })

  it('requires version to be exactly 1', () => {
    const input = {
      version: 2,
      subscriptionTier: 'pro',
      pricingOverrides: {},
    }

    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('defaults dataSources to empty array when not provided', () => {
    const input = { version: 1 }
    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dataSources).toEqual([])
    }
  })

  it('accepts valid dataSources entries', () => {
    const input = {
      version: 1,
      dataSources: [
        { id: 'ds-1', label: 'Work laptop', path: '/home/user/.claude', enabled: true },
        { id: 'ds-2', label: 'Server', path: '/opt/claude', enabled: false },
      ],
    }
    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dataSources).toHaveLength(2)
      expect(result.data.dataSources[0]).toEqual({
        id: 'ds-1',
        label: 'Work laptop',
        path: '/home/user/.claude',
        enabled: true,
      })
    }
  })

  it('defaults enabled to true in dataSources entries', () => {
    const input = {
      version: 1,
      dataSources: [{ id: 'ds-1', label: 'Default', path: '/tmp/.claude' }],
    }
    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dataSources[0].enabled).toBe(true)
    }
  })

  it('rejects dataSources entries missing required fields', () => {
    const input = {
      version: 1,
      dataSources: [{ id: 'ds-1' }], // missing label and path
    }
    const result = SettingsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
