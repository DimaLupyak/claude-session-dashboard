import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionIdDisplay } from './SessionIdDisplay'

describe('SessionIdDisplay', () => {
  const sessionId = 'f656e46e-bfaa-4997-8b69-d2d955ea2bfc'

  beforeEach(() => {
    // Mock navigator.clipboard.writeText
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('should render the full session ID', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    expect(screen.getByText(sessionId)).toBeInTheDocument()
  })

  it('should have a copy button', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    const copyButton = screen.getByRole('button')
    expect(copyButton).toBeInTheDocument()
  })

  it('should copy resume command to clipboard when button is clicked', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    const copyButton = screen.getByRole('button')

    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `claude --resume ${sessionId}`
    )
  })

  it('should copy resume command exactly once per click', () => {
    render(<SessionIdDisplay sessionId={sessionId} />)
    const copyButton = screen.getByRole('button')

    fireEvent.click(copyButton)
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2)
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(
      1,
      `claude --resume ${sessionId}`
    )
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(
      2,
      `claude --resume ${sessionId}`
    )
  })

  it('should handle different session IDs', () => {
    const differentSessionId = 'abc12345-6789-1234-5678-90abcdef1234'
    render(<SessionIdDisplay sessionId={differentSessionId} />)

    expect(screen.getByText(differentSessionId)).toBeInTheDocument()

    const copyButton = screen.getByRole('button')
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `claude --resume ${differentSessionId}`
    )
  })
})
