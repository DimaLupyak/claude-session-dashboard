import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionCard } from './SessionCard'
import { PrivacyProvider } from '@/features/privacy/PrivacyContext'
import type { SessionSummary } from '@/lib/parsers/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

describe('SessionCard', () => {
  const mockSession: SessionSummary = {
    sessionId: 'f656e46e-bfaa-4997-8b69-d2d955ea2bfc',
    projectPath: '/Users/test/projects/my-app',
    projectName: 'my-app',
    branch: 'feature/test-branch',
    cwd: '/Users/test/projects/my-app',
    startedAt: '2026-02-25T10:00:00.000Z',
    lastActiveAt: '2026-02-25T11:30:00.000Z',
    durationMs: 5400000,
    messageCount: 42,
    userMessageCount: 21,
    assistantMessageCount: 21,
    isActive: false,
    toolCallCount: 15,
    model: 'claude-sonnet-4-5-20250929',
    version: '0.4.1',
    fileSizeBytes: 102400,
    isInteractive: true,
  }

  it('renders truncated session ID (first 8 characters)', () => {
    render(
      <PrivacyProvider>
        <SessionCard session={mockSession} />
      </PrivacyProvider>
    )
    expect(screen.getByText(mockSession.sessionId.slice(0, 8))).toBeTruthy()
  })

  it('renders tool call count when greater than zero', () => {
    render(
      <PrivacyProvider>
        <SessionCard session={{ ...mockSession, toolCallCount: 15 }} />
      </PrivacyProvider>
    )
    expect(screen.getByTitle('Tool calls')).toBeTruthy()
    expect(screen.getByText('15 tools')).toBeTruthy()
  })

  it('does not render tool call count when zero', () => {
    render(
      <PrivacyProvider>
        <SessionCard session={{ ...mockSession, toolCallCount: 0 }} />
      </PrivacyProvider>
    )
    expect(screen.queryByTitle('Tool calls')).toBeNull()
  })

  it('does not render the full session ID', () => {
    const { container } = render(
      <PrivacyProvider>
        <SessionCard session={mockSession} />
      </PrivacyProvider>
    )
    expect(container.textContent).not.toContain(mockSession.sessionId)
  })
})
