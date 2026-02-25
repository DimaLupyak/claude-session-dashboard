import { useState, useRef, useEffect } from 'react'

export function SessionIdDisplay({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`claude --resume ${sessionId}`)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable -- silently fail
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-600">
      <span>{sessionId}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded px-1 py-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
        title="Copy resume command"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </span>
  )
}
