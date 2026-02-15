import { useState, useRef, useEffect } from 'react'

interface ExportOption {
  label: string
  onClick: () => void
}

interface ExportDropdownProps {
  options: ExportOption[]
}

export function ExportDropdown({ options }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false)
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
      >
        Export
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {isOpen && (
        <div role="menu" className="absolute right-0 z-10 mt-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              onClick={() => {
                option.onClick()
                setIsOpen(false)
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
