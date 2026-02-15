import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-2 rounded-lg border border-gray-800/80 bg-gray-900/60 px-3 py-2 text-sm text-gray-200 transition hover:border-gray-700 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      aria-pressed={isDark}
      aria-label="Toggle color theme"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs">
        {isDark ? '🌙' : '☀️'}
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-xs text-gray-400">{isDark ? 'Dark mode' : 'Light mode'}</span>
        <span className="font-medium">{isDark ? 'Switch to light' : 'Switch to dark'}</span>
      </div>
    </button>
  )
}
