import { useEffect, useRef, useState } from 'react'

export interface CopyButtonProps {
  /** Text placed on the clipboard when the button is clicked. */
  text: string
  /** Label shown in the idle state. Defaults to "Copy". */
  label?: string
  /** Extra classes; defaults to the ghost-button styling. */
  className?: string
}

export function CopyButton({
  text,
  label = 'Copy',
  className = 'ink-btn ink-btn--ghost',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending revert on unmount to avoid setState-after-unmount.
  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context); silently ignore.
    }
  }

  return (
    <button className={className} onClick={() => void copy()}>
      {copied ? 'Copied!' : label}
    </button>
  )
}
