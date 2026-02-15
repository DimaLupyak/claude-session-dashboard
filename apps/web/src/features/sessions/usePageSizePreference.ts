import { useCallback, useState } from 'react'

const STORAGE_KEY = 'claude-dashboard:page-size'
const VALID_SIZES = [5, 10, 25, 50] as const
const DEFAULT_SIZE = 5

type ValidPageSize = (typeof VALID_SIZES)[number]

function isValidSize(value: number): value is ValidPageSize {
  return (VALID_SIZES as readonly number[]).includes(value)
}

function readStoredPageSize(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const parsed = Number(raw)
      if (isValidSize(parsed)) return parsed
    }
  } catch {
    // localStorage may be unavailable
  }
  return null
}

interface PageSizePreference {
  /** The stored page size from localStorage, or null if not yet loaded / invalid / missing */
  storedPageSize: number | null
  /** Validate and persist a page size to localStorage */
  setPageSize: (size: number) => void
}

export function usePageSizePreference(): PageSizePreference {
  // Use lazy initializer to read from localStorage on mount (client-side only)
  const [storedPageSize, setStoredPageSize] = useState<number | null>(readStoredPageSize)

  const setPageSize = useCallback((size: number) => {
    if (!isValidSize(size)) return
    try {
      localStorage.setItem(STORAGE_KEY, String(size))
      setStoredPageSize(size)
    } catch {
      // Ignore write failures
    }
  }, [])

  return { storedPageSize, setPageSize }
}

export { VALID_SIZES, DEFAULT_SIZE }
