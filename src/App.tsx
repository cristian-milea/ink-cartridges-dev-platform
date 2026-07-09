import { useEffect, useRef, useState } from 'react'
import { Emulator, type CartridgeFiles, type CartridgeMeta } from './lib/emulator'
import { EinkCanvas } from './components/EinkCanvas'
import { Gallery } from './components/Gallery'
import { LocalBridge, type LocalFiles } from './components/LocalBridge'
import { PhoneMock, type UiAction } from './components/PhoneMock'
import { ContextPanels } from './components/ContextPanels'
import { SyncCard, getLastSync, recordLastSync } from './components/SyncCard'
import { ValidationPanel, type ValidationResult } from './components/ValidationPanel'
import { SubmitPanel } from './components/SubmitPanel'
import { loadDeviceContext, saveDeviceContext, toTemplateCtx, type DeviceContext } from './lib/deviceContext'
import { runSync, type DataSource } from './lib/syncer'
import type { CatalogEntry } from './lib/catalog'

interface Session {
  files: CartridgeFiles
  /** Absent for a local-folder session — there's no catalog entry to speak of. */
  entry: CatalogEntry | null
  meta: CartridgeMeta
  ui: unknown
  manifest: unknown
  manifestRaw: string
  uiRaw?: string
}

/** Manifests are `unknown` until validated; this is the same defensive-parse pattern as ContextPanels. */
function getDataSource(manifest: unknown): DataSource | null {
  if (!manifest || typeof manifest !== 'object') return null
  const ds = (manifest as Record<string, unknown>).data_source
  if (!ds || typeof ds !== 'object') return null
  return ds as DataSource
}

function App() {
  const [emulatorReady, setEmulatorReady] = useState(false)
  const [png, setPng] = useState<Uint8Array | null>(null)
  const [published, setPublished] = useState<Record<string, unknown>>({})
  const [log, setLog] = useState<string[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [dc, setDc] = useState<DeviceContext>(() => loadDeviceContext())
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [reloadedAt, setReloadedAt] = useState<string | null>(null)
  // Undefined until the first local-bridge reload — ValidationPanel only
  // auto-checks once this is bumped, so a plain gallery load stays as before.
  const [validationTrigger, setValidationTrigger] = useState<number | undefined>(undefined)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
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
        setEmulatorReady(true)
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
    files: CartridgeFiles & { manifest?: unknown; ui?: unknown; manifestRaw: string; uiRaw?: string },
    entry: CatalogEntry
  ) {
    const emulator = emulatorRef.current
    if (!emulator) return
    setLog((prev) => [...prev, `loading ${entry.name}…`])
    try {
      const meta = await emulator.load(files)
      setSession({
        files,
        entry,
        meta,
        ui: files.ui,
        manifest: files.manifest,
        manifestRaw: files.manifestRaw,
        uiRaw: files.uiRaw,
      })
      setPng(emulator.framePng())
      setPublished(emulator.published())
      setLastSync(getLastSync(meta.name))
      setSyncError(null)
      setReloadedAt(null)
      setValidationResult(null)
      emulator.startInterval()
      setLog((prev) => [...prev, `loaded ${meta.name}`])
    } catch (err) {
      setLog((prev) => [...prev, String(err)])
    }
  }

  /** LocalBridge fires this on the initial folder pick and on every detected file change. */
  async function handleLocalFiles(local: LocalFiles) {
    const emulator = emulatorRef.current
    if (!emulator) return

    let manifest: unknown
    let ui: unknown
    try {
      manifest = local.manifestRaw ? JSON.parse(local.manifestRaw) : undefined
    } catch (err) {
      setLog((prev) => [...prev, `manifest.json parse error: ${String(err)}`])
    }
    try {
      ui = local.uiRaw ? JSON.parse(local.uiRaw) : undefined
    } catch (err) {
      setLog((prev) => [...prev, `ui.json parse error: ${String(err)}`])
    }

    const files: CartridgeFiles = { py: local.py, stem: local.stem, manifest, ui }
    try {
      // On failure, everything below is skipped — the previous session/png/log
      // (last good frame) is left exactly as-is, per the design constraint.
      const meta = await emulator.load(files)
      setSession({
        files,
        entry: null,
        meta,
        ui,
        manifest,
        manifestRaw: local.manifestRaw ?? '',
        uiRaw: local.uiRaw,
      })
      setPng(emulator.framePng())
      setPublished(emulator.published())
      setLastSync(getLastSync(meta.name))
      setSyncError(null)
      emulator.startInterval()
      const stamp = new Date().toLocaleTimeString()
      setReloadedAt(stamp)
      setLog((prev) => [...prev, `reloaded ${meta.name} ${stamp}`])
      setValidationTrigger((t) => (t ?? 0) + 1)
    } catch (err) {
      setLog((prev) => [...prev, String(err)])
    }
  }

  function handleBack() {
    emulatorRef.current?.stopInterval()
    setSession(null)
    setPng(null)
    setPublished({})
    setLastSync(null)
    setSyncError(null)
    setReloadedAt(null)
    setValidationResult(null)
  }

  async function handleSync() {
    const emulator = emulatorRef.current
    const ds = session && getDataSource(session.manifest)
    if (!emulator || !session || !ds) return
    setSyncError(null)
    const ctx = toTemplateCtx(dc, published, {})
    try {
      const envelope = await runSync(ds, ctx)
      await emulator.push(envelope)
      recordLastSync(session.meta.name)
      setLastSync(getLastSync(session.meta.name))
      setLog((prev) => [...prev, 'synced'])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSyncError(message)
      setLog((prev) => [...prev, `sync error: ${message}`])
    }
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
        saveDeviceContext(next)
        break
      }
      case 'sync':
        void handleSync()
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
              {reloadedAt && <p className="local-bridge-status">reloaded {reloadedAt}</p>}
              <pre className="console-pane">{log.join('\n')}</pre>
            </div>
          ) : (
            <>
              <LocalBridge onFiles={handleLocalFiles} disabled={!emulatorReady} />
              <Gallery onSelect={handleSelect} disabled={!emulatorReady} />
            </>
          )}
        </div>
        <div className="studio-right">
          {session ? (
            <>
              <ValidationPanel
                emulator={emulatorRef.current}
                files={{
                  [`${session.files.stem}.py`]: session.files.py,
                  [`${session.files.stem}.manifest.json`]: session.manifestRaw,
                  ...(session.uiRaw ? { [`${session.files.stem}.ui.json`]: session.uiRaw } : {}),
                }}
                trigger={validationTrigger}
                onResult={setValidationResult}
              />
              <SubmitPanel validation={validationResult} name={session.meta.name} />
              {getDataSource(session.manifest) && (
                <SyncCard
                  ds={getDataSource(session.manifest)!}
                  ctx={toTemplateCtx(dc, published, {})}
                  lastSync={lastSync}
                  onSync={handleSync}
                  error={syncError}
                />
              )}
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
