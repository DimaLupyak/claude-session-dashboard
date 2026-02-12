import { usePrivacy } from './PrivacyContext'

export function PrivacyToggle() {
  const { privacyMode, togglePrivacyMode } = usePrivacy()

  return (
    <button
      type="button"
      onClick={togglePrivacyMode}
      title={privacyMode ? 'Privacy mode on' : 'Privacy mode off'}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors ${
        privacyMode
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:text-gray-200'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        {privacyMode ? (
          // Eye-off icon
          <path
            fillRule="evenodd"
            d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z"
            clipRule="evenodd"
          />
        ) : (
          // Eye icon
          <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
        )}
        {privacyMode ? (
          <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
        ) : (
          <path
            fillRule="evenodd"
            d="M.458 10a9.996 9.996 0 019.542-6c4.258 0 7.894 2.66 9.337 6.41a1.651 1.651 0 010 1.186A10.004 10.004 0 0110 17.5c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186L.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
            clipRule="evenodd"
          />
        )}
      </svg>
      Privacy
    </button>
  )
}
