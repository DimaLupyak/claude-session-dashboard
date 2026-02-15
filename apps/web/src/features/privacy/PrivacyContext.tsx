import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { anonymizePath as anonymizePathUtil } from './anonymize'

const STORAGE_KEY = 'claude-dashboard:privacy-mode'

function readStoredPrivacyMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

interface PrivacyContextValue {
  privacyMode: boolean
  togglePrivacyMode: () => void
  anonymizePath: (path: string) => string
  anonymizeProjectName: (name: string) => string
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Use lazy initializer to read from localStorage on mount (client-side only)
  const [privacyMode, setPrivacyMode] = useState(readStoredPrivacyMode)

  // Ref-based map for stable project name anonymization within a session.
  // Using a ref (not state) because the map is a lookup cache, not render-driving data.
  // The map grows as new project names are encountered and resets on toggle.
  const projectNameMapRef = useRef<Map<string, string>>(new Map())
  const nextIndexRef = useRef(1)

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Ignore write failures
      }
      // Clear the project name map on toggle so indices reset
      projectNameMapRef.current = new Map()
      nextIndexRef.current = 1
      return next
    })
  }, [])

  const anonymizePath = useCallback(
    (path: string): string => {
      if (!privacyMode) return path
      return anonymizePathUtil(path)
    },
    [privacyMode],
  )

  const anonymizeProjectName = useCallback(
    (name: string): string => {
      if (!privacyMode) return name
      const existing = projectNameMapRef.current.get(name)
      if (existing) return existing
      const anonymized = `project-${nextIndexRef.current}`
      nextIndexRef.current += 1
      projectNameMapRef.current.set(name, anonymized)
      return anonymized
    },
    [privacyMode],
  )

  return (
    <PrivacyContext.Provider
      value={{
        privacyMode,
        togglePrivacyMode,
        anonymizePath,
        anonymizeProjectName,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) {
    throw new Error('usePrivacy must be used within a PrivacyProvider')
  }
  return ctx
}
