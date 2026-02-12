import { Link, useMatches } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PrivacyToggle } from '@/features/privacy/PrivacyToggle'

const NAV_ITEMS = [
  { to: '/sessions', label: 'Sessions', icon: '>' },
  { to: '/stats', label: 'Stats', icon: '#' },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? ''

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
        <div className="flex h-14 items-center border-b border-gray-800 px-4">
          <Link to="/sessions" className="text-sm font-bold text-white">
            <span className="text-blue-400">Claude</span> Dashboard
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
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
              >
                <span className="font-mono text-xs text-gray-500">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <PrivacyToggle />
          <p className="mt-2 text-xs text-gray-600">Read-only observer</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
