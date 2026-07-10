import { useState } from 'react'
import { EinkCanvas } from './EinkCanvas'
import { EinkGrid } from './EinkGrid'
import { ConsolePane } from './ConsolePane'
import type { LogEntry } from '../lib/consoleLog'

export type SessionOrigin = 'gallery' | 'local-folder' | 'local-drop'

const ORIGIN_COPY: Record<Exclude<SessionOrigin, 'gallery'>, string> = {
  'local-folder': 'Watching your folder — edit in your IDE; saves reload here automatically (~1s).',
  'local-drop': "Loaded from dropped files — live reload isn't available in this browser. Re-drop the files to refresh.",
}

/**
 * Left column of the dev screen: the e-ink display (capped at 500px, rendered
 * at 2× native so CSS px map 1:1 to device px), an optional pixel-grid inspector
 * overlay, and the developer console below it.
 */
export function ScreenPane({
  png,
  origin,
  entries,
  onClearLog,
  onBack,
}: {
  png: Uint8Array | null
  origin: SessionOrigin
  entries: LogEntry[]
  onClearLog: () => void
  onBack: () => void
}) {
  const [grid, setGrid] = useState(false)

  return (
    <div className="screen-pane">
      <button onClick={onBack} className="ink-btn ink-btn--ghost screen-back">
        ← Back to gallery
      </button>
      <div className="screen-toolbar">
        {origin !== 'gallery' && <span className="ink-badge ink-badge--yellow">Local</span>}
        <button
          className="ink-btn ink-btn--ghost screen-grid-toggle"
          aria-pressed={grid}
          onClick={() => setGrid((v) => !v)}
        >
          px grid: {grid ? 'on' : 'off'}
        </button>
      </div>
      {origin !== 'gallery' && <p className="origin-note">{ORIGIN_COPY[origin]}</p>}
      <div className={`eink-stage${grid ? ' eink-stage--inspect' : ''}`}>
        <EinkCanvas png={png} scale={2} />
        <EinkGrid active={grid} />
      </div>
      <ConsolePane entries={entries} onClear={onClearLog} />
    </div>
  )
}
