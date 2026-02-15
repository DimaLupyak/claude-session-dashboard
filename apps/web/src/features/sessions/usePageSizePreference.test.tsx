import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  usePageSizePreference,
  VALID_SIZES,
  DEFAULT_SIZE,
} from './usePageSizePreference'

// Test component that uses the hook and exposes its values
function TestComponent({ onRender }: { onRender?: (state: unknown) => void }) {
  const { storedPageSize, setPageSize } = usePageSizePreference()

  // Call onRender callback if provided
  if (onRender) {
    onRender({ storedPageSize, setPageSize })
  }

  return (
    <div>
      <div data-testid="page-size">{storedPageSize ?? 'null'}</div>
      <button
        data-testid="set-5"
        onClick={() => setPageSize(5)}
      >
        Set 5
      </button>
      <button
        data-testid="set-10"
        onClick={() => setPageSize(10)}
      >
        Set 10
      </button>
      <button
        data-testid="set-25"
        onClick={() => setPageSize(25)}
      >
        Set 25
      </button>
      <button
        data-testid="set-50"
        onClick={() => setPageSize(50)}
      >
        Set 50
      </button>
      <button
        data-testid="set-invalid"
        onClick={() => setPageSize(100)}
      >
        Set Invalid
      </button>
    </div>
  )
}

describe('usePageSizePreference', () => {
  beforeEach(() => {
    // localStorage is cleared in setup.ts
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should return null when localStorage is empty', () => {
      render(<TestComponent />)
      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })

    it('should return stored value when valid (5)', async () => {
      localStorage.setItem('claude-dashboard:page-size', '5')
      render(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('page-size').textContent).toBe('5')
      })
    })

    it('should return stored value when valid (10)', async () => {
      localStorage.setItem('claude-dashboard:page-size', '10')
      render(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('page-size').textContent).toBe('10')
      })
    })

    it('should return stored value when valid (25)', async () => {
      localStorage.setItem('claude-dashboard:page-size', '25')
      render(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('page-size').textContent).toBe('25')
      })
    })

    it('should return stored value when valid (50)', async () => {
      localStorage.setItem('claude-dashboard:page-size', '50')
      render(<TestComponent />)

      await waitFor(() => {
        expect(screen.getByTestId('page-size').textContent).toBe('50')
      })
    })

    it('should return null when stored value is invalid (too small)', () => {
      localStorage.setItem('claude-dashboard:page-size', '3')
      render(<TestComponent />)

      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })

    it('should return null when stored value is invalid (too large)', () => {
      localStorage.setItem('claude-dashboard:page-size', '100')
      render(<TestComponent />)

      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })

    it('should return null when stored value is invalid (not a number)', () => {
      localStorage.setItem('claude-dashboard:page-size', 'invalid')
      render(<TestComponent />)

      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })

    it('should return null when stored value is invalid (negative)', () => {
      localStorage.setItem('claude-dashboard:page-size', '-10')
      render(<TestComponent />)

      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })
  })

  describe('setPageSize', () => {
    it('should write valid size to localStorage', async () => {
      const { getByTestId } = render(<TestComponent />)

      getByTestId('set-25').click()

      await waitFor(() => {
        expect(localStorage.getItem('claude-dashboard:page-size')).toBe('25')
        expect(getByTestId('page-size').textContent).toBe('25')
      })
    })

    it('should update state when setting page size', async () => {
      const { getByTestId } = render(<TestComponent />)

      getByTestId('set-10').click()

      await waitFor(() => {
        expect(getByTestId('page-size').textContent).toBe('10')
      })

      getByTestId('set-50').click()

      await waitFor(() => {
        expect(getByTestId('page-size').textContent).toBe('50')
      })
    })

    it('should not write invalid size to localStorage', async () => {
      const { getByTestId } = render(<TestComponent />)

      getByTestId('set-invalid').click()

      // Wait a bit to ensure any state updates would have happened
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(localStorage.getItem('claude-dashboard:page-size')).toBeNull()
      expect(getByTestId('page-size').textContent).toBe('null')
    })

    it('should not update state with invalid size', async () => {
      const { getByTestId } = render(<TestComponent />)

      // Set a valid size first
      getByTestId('set-25').click()

      await waitFor(() => {
        expect(getByTestId('page-size').textContent).toBe('25')
      })

      // Try to set an invalid size
      getByTestId('set-invalid').click()

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should remain at 25
      expect(getByTestId('page-size').textContent).toBe('25')
      expect(localStorage.getItem('claude-dashboard:page-size')).toBe('25')
    })

    it('should write all valid sizes correctly', async () => {
      const { getByTestId } = render(<TestComponent />)

      for (const size of VALID_SIZES) {
        getByTestId(`set-${size}`).click()

        await waitFor(() => {
          expect(getByTestId('page-size').textContent).toBe(String(size))
          expect(localStorage.getItem('claude-dashboard:page-size')).toBe(String(size))
        })
      }
    })
  })

  describe('error handling', () => {
    it('should handle localStorage read errors gracefully', () => {
      const getItemSpy = vi.spyOn(localStorage, 'getItem')
      getItemSpy.mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })

      render(<TestComponent />)

      expect(screen.getByTestId('page-size').textContent).toBe('null')

      getItemSpy.mockRestore()
    })

    it('should handle localStorage write errors gracefully', async () => {
      const setItemSpy = vi.spyOn(localStorage, 'setItem')
      setItemSpy.mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })

      const { getByTestId } = render(<TestComponent />)

      // Should not throw
      getByTestId('set-25').click()

      await new Promise(resolve => setTimeout(resolve, 50))

      // State should not update on write error
      expect(getByTestId('page-size').textContent).toBe('null')

      setItemSpy.mockRestore()
    })
  })

  describe('SSR safety', () => {
    it('should initialize with null for SSR safety', () => {
      render(<TestComponent />)

      // Before useEffect runs (simulating SSR), should be null
      expect(screen.getByTestId('page-size').textContent).toBe('null')
    })
  })

  describe('constants', () => {
    it('should export VALID_SIZES as expected', () => {
      expect(VALID_SIZES).toEqual([5, 10, 25, 50])
    })

    it('should export DEFAULT_SIZE as expected', () => {
      expect(DEFAULT_SIZE).toBe(5)
    })
  })
})
