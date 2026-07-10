import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from '../lib/consoleLog'
import { formatTs, levelTag } from '../lib/consoleLog'

export function ConsolePane({ entries, onClear }: { entries: LogEntry[]; onClear: () => void }) {
  const [showVerbose, setShowVerbose] = useState(false)
  const paneRef = useRef<HTMLDivElement>(null)
  // Whether the user was pinned to (near) the bottom before the latest content
  // update. Updated on every scroll so a manual scrollback disables auto-follow.
  const atBottomRef = useRef(true)

  const visible = showVerbose ? entries : entries.filter((e) => e.level !== 'verbose')

  const onScroll = () => {
    const el = paneRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    const el = paneRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <div className="console">
      <div className="console-toolbar">
        <span className="console-title">console</span>
        <label className="console-verbose-toggle">
          <input
            type="checkbox"
            checked={showVerbose}
            onChange={(e) => setShowVerbose(e.target.checked)}
          />{' '}
          verbose
        </label>
        <button type="button" className="ink-btn ink-btn--ghost" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="console-pane" ref={paneRef} onScroll={onScroll}>
        {visible.map((entry, i) => (
          <div key={i} className={`console-line console-line--${entry.level}`}>
            <span className="console-ts">{formatTs(entry.ts)}</span>{' '}
            <span className="console-tag">{levelTag(entry.level)}</span>{' '}
            <span className="console-text">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
