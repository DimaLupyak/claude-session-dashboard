import { beforeEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'

// Extend Vitest's expect with custom matchers
expect.extend({
  toBeInTheDocument(received) {
    const pass = received != null && document.body.contains(received)
    return {
      pass,
      message: () => pass
        ? `expected element not to be in the document`
        : `expected element to be in the document`,
    }
  },
})

// Custom localStorage implementation for tests
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.store).length
  }

  clear(): void {
    this.store = {}
  }

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store)
    return keys[index] || null
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value)
  }
}

// Set up localStorage mock before tests
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  })
}

// Make navigator.clipboard writable so tests can mock it via Object.assign
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => {} },
    writable: true,
    configurable: true,
  })
}

// Clear localStorage and cleanup after each test
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear()
  }
  cleanup()
})
