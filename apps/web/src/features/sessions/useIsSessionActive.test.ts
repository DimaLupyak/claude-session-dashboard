import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import * as ReactQuery from '@tanstack/react-query'
import { useIsSessionActive } from './useIsSessionActive'
import type { SessionSummary } from '@/lib/parsers/types'

// Mock the entire module
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: vi.fn(),
  }
})

describe('useIsSessionActive', () => {
  const createMockSession = (sessionId: string): SessionSummary => ({
    sessionId,
    projectPath: '/path/to/project',
    projectName: 'test-project',
    branch: 'main',
    cwd: '/path/to/project',
    startedAt: '2026-01-01T10:00:00Z',
    lastActiveAt: '2026-01-01T11:00:00Z',
    durationMs: 3600000,
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    isActive: true,
    model: 'claude-opus-4-6',
    version: '1.0.0',
    fileSizeBytes: 1024,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when session is in active list', () => {
    const activeSessions = [
      createMockSession('session-1'),
      createMockSession('session-2'),
      createMockSession('session-3'),
    ]

    vi.mocked(ReactQuery.useQuery).mockReturnValue({
      data: activeSessions,
    } as ReturnType<typeof ReactQuery.useQuery>)

    const { result } = renderHook(() => useIsSessionActive('session-2'))

    expect(result.current).toBe(true)
  })

  it('should return false when session is not in active list', () => {
    const activeSessions = [
      createMockSession('session-1'),
      createMockSession('session-2'),
    ]

    vi.mocked(ReactQuery.useQuery).mockReturnValue({
      data: activeSessions,
    } as ReturnType<typeof ReactQuery.useQuery>)

    const { result } = renderHook(() => useIsSessionActive('session-999'))

    expect(result.current).toBe(false)
  })

  it('should return false when data is undefined', () => {
    vi.mocked(ReactQuery.useQuery).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof ReactQuery.useQuery>)

    const { result } = renderHook(() => useIsSessionActive('session-1'))

    expect(result.current).toBe(false)
  })

  it('should return false when active sessions list is empty', () => {
    vi.mocked(ReactQuery.useQuery).mockReturnValue({
      data: [],
    } as ReturnType<typeof ReactQuery.useQuery>)

    const { result } = renderHook(() => useIsSessionActive('session-1'))

    expect(result.current).toBe(false)
  })

  it('should handle multiple calls with different session IDs', () => {
    const activeSessions = [
      createMockSession('session-active-1'),
      createMockSession('session-active-2'),
    ]

    vi.mocked(ReactQuery.useQuery).mockReturnValue({
      data: activeSessions,
    } as ReturnType<typeof ReactQuery.useQuery>)

    const { result: result1 } = renderHook(() => useIsSessionActive('session-active-1'))
    const { result: result2 } = renderHook(() => useIsSessionActive('session-active-2'))
    const { result: result3 } = renderHook(() => useIsSessionActive('session-inactive'))

    expect(result1.current).toBe(true)
    expect(result2.current).toBe(true)
    expect(result3.current).toBe(false)
  })
})
