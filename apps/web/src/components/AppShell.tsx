import { Link, useMatches } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ActiveSessionsBadge } from '@/features/sessions/ActiveSessionsBadge'
import { ThemeToggle } from '@/features/theme/ThemeToggle'

const NAV_ITEMS = [
  {
    to: '/sessions',
    label: 'Sessions',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="2" y1="4" x2="14" y2="4" />
        <line x1="2" y1="8" x2="14" y2="8" />
        <line x1="2" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="8" width="3" height="7" rx="0.5" />
        <rect x="6.5" y="4" width="3" height="11" rx="0.5" />
        <rect x="12" y="1" width="3" height="14" rx="0.5" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.5.8a1 1 0 011-.8h1a1 1 0 011 .8l.15.9a5.5 5.5 0 011.1.64l.86-.36a1 1 0 011.17.36l.5.86a1 1 0 01-.18 1.17l-.7.55a5.5 5.5 0 010 1.27l.7.55a1 1 0 01.18 1.17l-.5.86a1 1 0 01-1.17.36l-.86-.36a5.5 5.5 0 01-1.1.64l-.14.9a1 1 0 01-1 .8h-1a1 1 0 01-1-.8l-.14-.9a5.5 5.5 0 01-1.1-.64l-.87.36a1 1 0 01-1.17-.36l-.5-.86a1 1 0 01.18-1.17l.7-.55a5.5 5.5 0 010-1.27l-.7-.55a1 1 0 01-.18-1.17l.5-.86a1 1 0 011.17-.36l.87.36a5.5 5.5 0 011.1-.64L6.5.8zM8 11a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? ''

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="flex h-14 items-center border-b border-gray-200 px-4">
          <Link to="/sessions" className="text-sm font-bold text-gray-900">
            <span className="text-brand-500">Claude</span> Dashboard
          </Link>
        </div>

        <nav className="flex-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <span className="text-gray-500">
                  {item.icon}
                </span>
                {item.label}
                {item.to === '/sessions' && <ActiveSessionsBadge />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gray-200 p-3 space-y-3">
          <ThemeToggle />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/dlupiak/claude-session-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="GitHub Repository"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
              <a
                href="https://www.npmjs.com/package/claude-session-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="npm Package"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 0v16h16V0H0zm13 13H8V5H5v8H3V3h10v10z" />
                </svg>
              </a>
            </div>
            <p className="text-xs text-gray-600">Read-only</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
