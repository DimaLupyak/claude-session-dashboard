import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionIdDisplay } from './SessionIdDisplay'

describe('SessionIdDisplay', () => {
  const sessionId = 'f656e46e-bfaa-4997-8b69-d2d955ea2bfc'

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders the full session ID', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    expect(screen.getByText(sessionId)).toBeTruthy()
  })

  it('has a copy button', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('copies resume command to clipboard on click', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    fireEvent.click(screen.getByRole('button'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `claude --resume ${sessionId}`
    )
  })
})
