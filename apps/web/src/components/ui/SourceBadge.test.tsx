import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SourceBadge } from './SourceBadge'

describe('SourceBadge', () => {
  it('renders the source label text', () => {
    render(<SourceBadge sourceLabel="Windows" />)
    expect(screen.getByText('Windows')).toBeTruthy()
  })

  it('renders with default gray styling when no platform is specified', () => {
    const { container } = render(<SourceBadge sourceLabel="Unknown" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-gray-800')
    expect(badge.className).toContain('text-gray-400')
  })

  it('applies blue tint styling for windows platform', () => {
    const { container } = render(<SourceBadge sourceLabel="Windows" platform="windows" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-blue-950')
    expect(badge.className).toContain('text-blue-400')
    expect(badge.className).toContain('border-blue-800')
  })

  it('applies purple tint styling for wsl platform', () => {
    const { container } = render(<SourceBadge sourceLabel="WSL - Ubuntu" platform="wsl" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-purple-950')
    expect(badge.className).toContain('text-purple-400')
    expect(badge.className).toContain('border-purple-800')
  })

  it('applies default gray styling for macos platform', () => {
    const { container } = render(<SourceBadge sourceLabel="macOS" platform="macos" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-gray-800')
    expect(badge.className).toContain('text-gray-400')
  })

  it('applies default gray styling for linux platform', () => {
    const { container } = render(<SourceBadge sourceLabel="Linux" platform="linux" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('bg-gray-800')
    expect(badge.className).toContain('text-gray-400')
  })

  it('uses text-xs for compact sizing', () => {
    const { container } = render(<SourceBadge sourceLabel="Windows" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('text-xs')
  })

  it('merges additional className', () => {
    const { container } = render(<SourceBadge sourceLabel="Windows" className="mt-2" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className).toContain('mt-2')
  })
})
