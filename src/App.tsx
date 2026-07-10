import { useEffect, useRef, useState } from 'react'
import { Emulator, type CartridgeFiles, type CartridgeMeta, type LogEvent } from './lib/emulator'
import { type LocalFiles } from './components/LocalBridge'
import { type UiAction } from './components/PhoneMock'
import { ContextPanels } from './components/ContextPanels'
import { SyncCard, getLastSync, recordLastSync } from './components/SyncCard'
import { ValidationPanel, type ValidationResult } from './components/ValidationPanel'
import { SubmitPanel } from './components/SubmitPanel'
import { ScreenPane, type SessionOrigin } from './components/ScreenPane'
import { PhoneTabs } from './components/PhoneTabs'
import { CartridgeInfo } from './components/CartridgeInfo'
import { HowToModal } from './components/HowToModal'
import { Link } from './components/Link'
import { StorePage } from './pages/StorePage'
import { PluginInstallPage } from './pages/PluginInstallPage'
import { CartridgeOsPage } from './pages/CartridgeOsPage'
import { loadDeviceContext, saveDeviceContext, toTemplateCtx, type DeviceContext } from './lib/deviceContext'
import { appendEntry, type LogEntry } from './lib/consoleLog'
import { usePath } from './lib/router'
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
  origin: SessionOrigin
}

/** Manifests are `unknown` until validated; this is the same defensive-parse pattern as ContextPanels. */
function getDataSource(manifest: unknown): DataSource | null {
  if (!manifest || typeof manifest !== 'object') return null
  const ds = (manifest as Record<string, unknown>).data_source
  if (!ds || typeof ds !== 'object') return null
  return ds as DataSource
}

function App() {
  const path = usePath()
  const [emulatorReady, setEmulatorReady] = useState(false)
  const [png, setPng] = useState<Uint8Array | null>(null)
  const [published, setPublished] = useState<Record<string, unknown>>({})
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loaded] = useState(() => loadDeviceContext())
  const [dc, setDc] = useState<DeviceContext>(loaded.dc)
  const [persistSecrets, setPersistSecrets] = useState<boolean>(loaded.persistSecrets)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [howToOpen, setHowToOpen] = useState(false)
  // Bumped on "Back to gallery" to remount LocalBridge (inside StorePage) and drop its folder watch.
  const [bridgeKey, setBridgeKey] = useState(0)
  // Undefined until the first local-bridge reload — ValidationPanel only
  // auto-checks once this is bumped, so a plain gallery load stays as before.
  const [validationTrigger, setValidationTrigger] = useState<number | undefined>(undefined)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const emulatorRef = useRef<Emulator | null>(null)
  const ds = session ? getDataSource(session.manifest) : null

  const appendLog = (event: LogEvent) =>
    setLogEntries((prev) => appendEntry(prev, { ts: Date.now(), level: event.level, text: event.text }))

  useEffect(() => {
    // React 19 StrictMode double-invokes effects in dev; the `cancelled` flag
    // discards the throwaway first Emulator. Intentional — do not "fix".
    let cancelled = false

    Emulator.create(appendLog)
      .then((emulator) => {
        if (cancelled) return
        emulatorRef.current = emulator
        emulator.onFrame = (frame, pub, reason) => {
          setPng(frame)
          setPublished(pub)
          appendLog({ level: 'verbose', text: `repaint (${reason})` })
        }
        setEmulatorReady(true)
        appendLog({ level: 'sys', text: 'pyodide ready' })
        if (loaded.migratedSecrets)
          appendLog({
            level: 'sys',
            text: 'previously saved secrets moved to session-only memory — tick "save" in Secrets to persist',
          })
      })
      // Surface init failures (CDN load, loadPackage, font/host_alias fetch,
      // or load()) in the log pane instead of an unhandled rejection.
      .catch((err) => appendLog({ level: 'error', text: String(err) }))

    return () => {
      cancelled = true
      emulatorRef.current?.stopInterval()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** App owns secret persistence now: update state and re-persist under the current opt-in. */
  function updateDc(next: DeviceContext) {
    setDc(next)
    saveDeviceContext(next, persistSecrets)
  }

  function handlePersistChange(persist: boolean) {
    setPersistSecrets(persist)
    saveDeviceContext(dc, persist)
  }

  async function handleSelect(
    files: CartridgeFiles & { manifest?: unknown; ui?: unknown; manifestRaw: string; uiRaw?: string },
    entry: CatalogEntry
  ) {
    const emulator = emulatorRef.current
    if (!emulator) return
    appendLog({ level: 'sys', text: `loading ${entry.name}…` })
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
        origin: 'gallery',
      })
      setPng(emulator.framePng())
      setPublished(emulator.published())
      setLastSync(getLastSync(meta.name))
      setSyncError(null)
      setValidationResult(null)
      emulator.startInterval()
      appendLog({ level: 'sys', text: `loaded ${meta.name}` })
    } catch (err) {
      appendLog({ level: 'error', text: String(err) })
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
      appendLog({ level: 'error', text: `manifest.json parse error: ${String(err)}` })
    }
    try {
      ui = local.uiRaw ? JSON.parse(local.uiRaw) : undefined
    } catch (err) {
      appendLog({ level: 'error', text: `ui.json parse error: ${String(err)}` })
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
        origin: local.origin,
      })
      setPng(emulator.framePng())
      setPublished(emulator.published())
      setLastSync(getLastSync(meta.name))
      setSyncError(null)
      emulator.startInterval()
      appendLog({ level: 'sys', text: `reloaded ${meta.name}` })
      setValidationTrigger((t) => (t ?? 0) + 1)
    } catch (err) {
      appendLog({ level: 'error', text: String(err) })
    }
  }

  function handleBack() {
    emulatorRef.current?.clearSession()
    setSession(null)
    setPng(null)
    setPublished({})
    setLastSync(null)
    setSyncError(null)
    setValidationResult(null)
    setHowToOpen(false)
    setBridgeKey((k) => k + 1)
  }

  async function handleSync() {
    const emulator = emulatorRef.current
    if (!emulator || !session || !ds) return
    setSyncError(null)
    const ctx = toTemplateCtx(dc, published, {})
    try {
      const envelope = await runSync(ds, ctx)
      await emulator.push(envelope)
      recordLastSync(session.meta.name)
      setLastSync(getLastSync(session.meta.name))
      appendLog({ level: 'sys', text: 'synced' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSyncError(message)
      appendLog({ level: 'error', text: `sync error: ${message}` })
    }
  }

  function handleAction(action: UiAction) {
    const emulator = emulatorRef.current
    if (!emulator) return
    switch (action.type) {
      case 'push':
        emulator.push(action.payload)
        break
      case 'request_permission':
        updateDc({ ...dc, permissions: { ...dc.permissions, [action.name]: true } })
        break
      case 'sync':
        void handleSync()
        break
      case 'set_local':
        // Handled entirely inside PhoneMock; never bubbles up.
        break
    }
  }

  const isPlugin = path === '/plugin'
  const isCartridgeOs = path === '/cartridge-os'
  const isStoreRoute = !isPlugin && !isCartridgeOs // '/' and any unknown path
  const showStore = isStoreRoute && !session
  const showDev = isStoreRoute && !!session

  return (
    <div className={`studio-shell${showDev ? ' studio-shell--app' : ''}`}>
      <header className="studio-header">
        <h1>
          <Link to="/">Ink Cartridge Studio</Link>
        </h1>
        <nav className="studio-nav">
          <Link to="/" onClick={() => session && handleBack()}>
            Store
          </Link>
          <Link to="/plugin">Pwnagotchi plugin</Link>
          <Link to="/cartridge-os" className="studio-nav-os">
            Cartridge OS
            <span className="studio-nav-soon">soon</span>
          </Link>
        </nav>
      </header>

      {/* Kept mounted (hidden) across routes/session so LocalBridge's folder-watch poll survives. */}
      <div className="store-wrap" hidden={!showStore}>
        <StorePage
          onSelect={handleSelect}
          onLocalFiles={handleLocalFiles}
          disabled={!emulatorReady}
          logEntries={logEntries}
          onClearLog={() => setLogEntries([])}
          bridgeKey={bridgeKey}
        />
      </div>

      {isPlugin && <PluginInstallPage />}
      {isCartridgeOs && <CartridgeOsPage />}

      {showDev && session && (
        <div className="studio-body studio-body--session">
          <div className="studio-col studio-col-screen">
            <ScreenPane
              png={png}
              origin={session.origin}
              entries={logEntries}
              onClearLog={() => setLogEntries([])}
              onBack={handleBack}
            />
          </div>
          <div className="studio-col studio-col-phone">
            <PhoneTabs
              ui={session.ui}
              published={published}
              dc={dc}
              manifest={session.manifest}
              persistSecrets={persistSecrets}
              onAction={handleAction}
              onDcChange={updateDc}
              onPersistChange={handlePersistChange}
            />
          </div>
          <div className="studio-col studio-col-info">
            <button onClick={() => setHowToOpen(true)} className="ink-btn ink-btn--ghost studio-howto-btn">
              How to use this screen
            </button>
            <CartridgeInfo meta={session.meta} hasDataSource={!!ds} />
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
            {ds && (
              <SyncCard
                ds={ds}
                ctx={toTemplateCtx(dc, published, {})}
                lastSync={lastSync}
                onSync={handleSync}
                error={syncError}
              />
            )}
            <ContextPanels dc={dc} onChange={updateDc} />
          </div>
        </div>
      )}

      <HowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  )
}

export default App
