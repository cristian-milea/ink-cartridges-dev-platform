import { useEffect, useRef, useState } from 'react'
import { Emulator, type CartridgeFiles, type CartridgeMeta } from './lib/emulator'
import { EinkCanvas } from './components/EinkCanvas'
import { Gallery } from './components/Gallery'
import { PhoneMock, type UiAction } from './components/PhoneMock'
import { ContextPanels } from './components/ContextPanels'
import { loadDeviceContext, type DeviceContext } from './lib/deviceContext'
import type { CatalogEntry } from './lib/catalog'

interface Session {
  files: CartridgeFiles
  entry: CatalogEntry
  meta: CartridgeMeta
  ui: unknown
  manifest: unknown
}

function App() {
  const [png, setPng] = useState<Uint8Array | null>(null)
  const [published, setPublished] = useState<Record<string, unknown>>({})
  const [log, setLog] = useState<string[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [dc, setDc] = useState<DeviceContext>(() => loadDeviceContext())
  const emulatorRef = useRef<Emulator | null>(null)

  useEffect(() => {
    // React 19 StrictMode double-invokes effects in dev; the `cancelled` flag
    // discards the throwaway first Emulator. Intentional — do not "fix".
    let cancelled = false
    const appendLog = (line: string) => setLog((prev) => [...prev, line])

    Emulator.create(appendLog)
      .then((emulator) => {
        if (cancelled) return
        emulatorRef.current = emulator
        emulator.onFrame = (frame, pub) => {
          setPng(frame)
          setPublished(pub)
        }
        appendLog('pyodide ready')
      })
      // Surface init failures (CDN load, loadPackage, font/host_alias fetch,
      // or load()) in the log pane instead of an unhandled rejection.
      .catch((err) => appendLog(String(err)))

    return () => {
      cancelled = true
      emulatorRef.current?.stopInterval()
    }
  }, [])

  async function handleSelect(
    files: CartridgeFiles & { manifest?: unknown; ui?: unknown },
    entry: CatalogEntry
  ) {
    const emulator = emulatorRef.current
    if (!emulator) return
    setLog((prev) => [...prev, `loading ${entry.name}…`])
    try {
      const meta = await emulator.load(files)
      setSession({ files, entry, meta, ui: files.ui, manifest: files.manifest })
      setPng(emulator.framePng())
      setPublished(emulator.published())
      emulator.startInterval()
      setLog((prev) => [...prev, `loaded ${meta.name}`])
    } catch (err) {
      setLog((prev) => [...prev, String(err)])
    }
  }

  function handleBack() {
    emulatorRef.current?.stopInterval()
    setSession(null)
    setPng(null)
    setPublished({})
  }

  function handleAction(action: UiAction) {
    const emulator = emulatorRef.current
    if (!emulator) return
    switch (action.type) {
      case 'push':
        emulator.push(action.payload)
        break
      case 'request_permission': {
        const next = { ...dc, permissions: { ...dc.permissions, [action.name]: true } }
        setDc(next)
        break
      }
      case 'sync':
        // TODO(Task 12): wire SyncCard's fetch-and-push pipeline here.
        break
      case 'set_local':
        // Handled entirely inside PhoneMock; never bubbles up.
        break
    }
  }

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <h1>Ink Cartridge Studio</h1>
        {session && (
          <button onClick={handleBack} className="back-button">
            ← Back to gallery
          </button>
        )}
      </header>
      <div className="studio-body">
        <div className="studio-left">
          {session ? (
            <div className="cartridge-session">
              <EinkCanvas png={png} />
              <pre className="console-pane">{log.join('\n')}</pre>
            </div>
          ) : (
            <Gallery onSelect={handleSelect} />
          )}
        </div>
        <div className="studio-right">
          {session ? (
            <>
              {session.ui ? (
                <PhoneMock ui={session.ui} published={published} dc={dc} onAction={handleAction} />
              ) : (
                <p className="status">No phone UI for this cartridge.</p>
              )}
              <ContextPanels dc={dc} onChange={setDc} manifest={session.manifest} />
            </>
          ) : (
            <pre className="console-pane">{log.join('\n')}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
