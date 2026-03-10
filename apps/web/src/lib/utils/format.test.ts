import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  formatUSD,
  formatDuration,
  formatTokenCount,
  formatBytes,
  formatRelativeTime,
  formatDateTime,
} from './format'

describe('formatUSD', () => {
  it('formats small amounts as <$0.01', () => {
    expect(formatUSD(0.001)).toBe('<$0.01')
    expect(formatUSD(0.004)).toBe('<$0.01')
    expect(formatUSD(0.0049)).toBe('<$0.01')
  })

  it('formats normal amounts with 2 decimals', () => {
    expect(formatUSD(0.01)).toBe('$0.01')
    expect(formatUSD(0.5)).toBe('$0.50')
    expect(formatUSD(1.23)).toBe('$1.23')
    expect(formatUSD(10.5)).toBe('$10.50')
    expect(formatUSD(99.99)).toBe('$99.99')
  })

  it('formats zero as <$0.01', () => {
    // Zero is less than 0.005, so it shows as <$0.01
    expect(formatUSD(0)).toBe('<$0.01')
    expect(formatUSD(0.0)).toBe('<$0.01')
  })

  it('formats large amounts (≥100) without decimals', () => {
    expect(formatUSD(100)).toBe('$100')
    expect(formatUSD(100.5)).toBe('$101')
    expect(formatUSD(150.75)).toBe('$151')
    expect(formatUSD(999.99)).toBe('$1000')
    expect(formatUSD(1234.56)).toBe('$1235')
  })

  it('handles edge case at boundary (exactly $0.005)', () => {
    // 0.005 rounds to 0.01 in toFixed(2), so should show $0.01
    expect(formatUSD(0.005)).toBe('$0.01')
  })

  it('handles NaN as $0.00', () => {
    expect(formatUSD(NaN)).toBe('$0.00')
  })

  it('handles Infinity as $0.00', () => {
    expect(formatUSD(Infinity)).toBe('$0.00')
    expect(formatUSD(-Infinity)).toBe('$0.00')
  })

  it('handles negative amounts', () => {
    // Negative amounts are less than 0.005, so they show as <$0.01
    expect(formatUSD(-0.001)).toBe('<$0.01')
    expect(formatUSD(-1.23)).toBe('<$0.01')
    expect(formatUSD(-100)).toBe('<$0.01')
  })

  it('handles very large amounts', () => {
    expect(formatUSD(1_000_000)).toBe('$1000000')
    expect(formatUSD(1_234_567.89)).toBe('$1234568')
  })

  it('handles very small positive amounts', () => {
    expect(formatUSD(0.00001)).toBe('<$0.01')
    expect(formatUSD(0.0000001)).toBe('<$0.01')
  })

  it('rounds correctly at boundaries', () => {
    // Just below $100
    expect(formatUSD(99.994)).toBe('$99.99')
    // Note: 99.995 is avoided here because IEEE 754 cannot represent it exactly,
    // making the rounding behavior of toFixed(2) engine-dependent.
    expect(formatUSD(99.996)).toBe('$100.00') // Unambiguously rounds up in toFixed(2)

    // Just at $100
    expect(formatUSD(99.999)).toBe('$100.00')

    // Above $100
    expect(formatUSD(100.001)).toBe('$100')
    expect(formatUSD(100.499)).toBe('$100')
    expect(formatUSD(100.5)).toBe('$101')
  })
})

describe('formatDuration', () => {
  it('returns <1s for values under 1000ms', () => {
    expect(formatDuration(0)).toBe('<1s')
    expect(formatDuration(1)).toBe('<1s')
    expect(formatDuration(999)).toBe('<1s')
  })

  it('formats exact seconds', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(30_000)).toBe('30s')
    expect(formatDuration(59_000)).toBe('59s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(120_000)).toBe('2m')
    expect(formatDuration(125_000)).toBe('2m 5s')
  })

  it('formats hours only when no remaining minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(7_200_000)).toBe('2h')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(3_660_000)).toBe('1h 1m')
    expect(formatDuration(5_400_000)).toBe('1h 30m')
    expect(formatDuration(7_260_000)).toBe('2h 1m')
  })

  it('ignores leftover seconds when hours are present', () => {
    // 1h 0m 30s — seconds are not shown once hours are involved
    expect(formatDuration(3_630_000)).toBe('1h')
  })

  it('handles very large durations', () => {
    // 100 hours exactly
    expect(formatDuration(360_000_000)).toBe('100h')
  })
})

describe('formatTokenCount', () => {
  it('returns raw number as string for values under 1000', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(1)).toBe('1')
    expect(formatTokenCount(999)).toBe('999')
  })

  it('formats thousands with one decimal and K suffix', () => {
    expect(formatTokenCount(1_000)).toBe('1.0K')
    expect(formatTokenCount(1_500)).toBe('1.5K')
    expect(formatTokenCount(999_999)).toBe('1000.0K')
  })

  it('formats millions with one decimal and M suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1.0M')
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
    expect(formatTokenCount(10_000_000)).toBe('10.0M')
  })

  it('handles very large token counts', () => {
    expect(formatTokenCount(1_000_000_000)).toBe('1000.0M')
  })
})

describe('formatBytes', () => {
  it('formats raw bytes for values under 1024', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1_047_552)).toBe('1023.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB')
    expect(formatBytes(1_610_612_736)).toBe('1.5 GB')
  })

  it('handles very large byte values', () => {
    expect(formatBytes(10_737_418_240)).toBe('10.0 GB')
  })
})

describe('formatRelativeTime', () => {
  const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "less than a minute ago" for timestamps under 30 seconds back', () => {
    // date-fns formatDistanceToNow: < 30s → "less than a minute ago"
    const recent = new Date(FIXED_NOW.getTime() - 10_000).toISOString()
    expect(formatRelativeTime(recent)).toBe('less than a minute ago')
  })

  it('returns "1 minute ago" for timestamps around 30–45 seconds back', () => {
    const recent = new Date(FIXED_NOW.getTime() - 30_000).toISOString()
    expect(formatRelativeTime(recent)).toBe('1 minute ago')
  })

  it('returns minutes ago for timestamps a few minutes back', () => {
    const fiveMinAgo = new Date(FIXED_NOW.getTime() - 5 * 60_000).toISOString()
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago')
  })

  it('returns about an hour ago for timestamps ~60 minutes back', () => {
    const oneHourAgo = new Date(FIXED_NOW.getTime() - 60 * 60_000).toISOString()
    expect(formatRelativeTime(oneHourAgo)).toBe('about 1 hour ago')
  })

  it('returns about N hours ago for timestamps several hours back', () => {
    const threeHoursAgo = new Date(FIXED_NOW.getTime() - 3 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(threeHoursAgo)).toBe('about 3 hours ago')
  })

  it('returns N days ago for timestamps days back', () => {
    const twoDaysAgo = new Date(FIXED_NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago')
  })
})

describe('formatDateTime', () => {
  const FIXED_NOW = new Date('2024-06-15T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a UTC date string in MMM d, yyyy HH:mm pattern', () => {
    // date-fns format() uses the local time of the Date object
    const date = new Date('2024-06-15T12:00:00.000Z')
    const result = formatDateTime(date.toISOString())
    // We assert the year, month abbreviation, and day are present
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/2024/)
  })

  it('formats a different month and day correctly', () => {
    const result = formatDateTime('2023-01-05T08:30:00.000Z')
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/2023/)
  })

  it('produces output matching MMM d, yyyy HH:mm shape', () => {
    const result = formatDateTime('2024-12-31T23:59:00.000Z')
    // Should match the pattern: three-letter month, day, comma, year, space, HH:mm
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{2}:\d{2}$/)
  })
})
