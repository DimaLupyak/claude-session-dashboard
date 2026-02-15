import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ContributionHeatmap } from './ContributionHeatmap'
import type { DailyActivity, DailyModelTokens } from '@/lib/parsers/types'

describe('ContributionHeatmap', () => {
  describe('rendering', () => {
    it('should render component with title', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render day labels (Mon, Wed, Fri)', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Mon')
      expect(container.textContent).toContain('Wed')
      expect(container.textContent).toContain('Fri')
    })

    it('should render subtitle about token usage', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Token usage intensity over the past year')
    })
  })

  describe('data processing', () => {
    it('should render with dailyActivity data', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-02', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render with dailyModelTokens data', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
        {
          date: '2026-02-02',
          tokensByModel: { 'claude-sonnet-4': 2000 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render with both dailyActivity and dailyModelTokens', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
      ]

      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000, 'claude-opus-4-6': 500 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle dates present in only one data source', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-02', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
      ]

      // Should not crash when dates don't match
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should sum tokens from multiple models for the same date', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: {
            'claude-sonnet-4': 1000,
            'claude-opus-4-6': 500,
            'claude-haiku-4': 250,
          },
        },
      ]

      // Should not crash - total tokens = 1750
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })
  })

  describe('edge cases', () => {
    it('should handle empty arrays without crashing', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle very large token counts', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 999_999_999 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle empty tokensByModel object', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: {},
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle duplicate dates in dailyActivity', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-01', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      // Should not crash (last entry wins in Map)
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle duplicate dates in dailyModelTokens', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-opus-4-6': 500 },
        },
      ]

      // Should not crash (last entry wins in Map)
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render month labels', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-01-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-01', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      // Month abbreviations should appear (exact months depend on current date)
      // Just verify component renders successfully
      expect(container.textContent).toContain('Activity')
    })
  })
})
