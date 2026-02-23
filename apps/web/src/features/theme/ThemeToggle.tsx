import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-800 transition hover:border-gray-400 hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      aria-pressed={isDark}
      aria-label="Toggle color theme"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs">
        {isDark ? '🌙' : '☀️'}
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-xs text-gray-600">{isDark ? 'Dark mode' : 'Light mode'}</span>
        <span className="font-medium">{isDark ? 'Switch to light' : 'Switch to dark'}</span>
      </div>
    </button>
  )
}
