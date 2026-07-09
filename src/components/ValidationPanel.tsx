import { useEffect, useState } from 'react'
import type { Emulator } from '../lib/emulator'

export interface ValidationPanelProps {
  emulator: Emulator | null
  files: Record<string, string>
  /** Bump this (e.g. after a local-bridge reload) to trigger an automatic re-check. */
  trigger?: number
}

type Result = { status: 'idle' } | { status: 'checking' } | { status: 'valid' } | { status: 'invalid'; errors: string[] } | { status: 'error'; message: string }

export function ValidationPanel({ emulator, files, trigger }: ValidationPanelProps) {
  const [result, setResult] = useState<Result>({ status: 'idle' })

  async function check() {
    if (!emulator) return
    setResult({ status: 'checking' })
    try {
      const errors = await emulator.runValidator(files)
      setResult(errors.length === 0 ? { status: 'valid' } : { status: 'invalid', errors })
    } catch (err) {
      setResult({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  useEffect(() => {
    // Deps are intentionally just `trigger`: re-check only when the parent
    // explicitly bumps it (e.g. a Task 14 local-bridge reload), NOT on every
    // `files`/`check` identity change, which would fire on each keystroke edit.
    if (trigger !== undefined) void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  return (
    <div className="validation-panel">
      <div className="validation-panel-row">
        <span className="validation-panel-title">CI validator</span>
        <button onClick={() => void check()} disabled={!emulator || result.status === 'checking'}>
          {result.status === 'checking' ? 'Checking…' : 'Check cartridge'}
        </button>
      </div>
      {result.status === 'valid' && <p className="validation-panel-valid">✓ valid</p>}
      {result.status === 'invalid' && (
        <ul className="validation-panel-errors">
          {result.errors.map((e, i) => (
            <li key={i}>✗ {e}</li>
          ))}
        </ul>
      )}
      {result.status === 'error' && <p className="validation-panel-errors">✗ {result.message}</p>}
    </div>
  )
}
