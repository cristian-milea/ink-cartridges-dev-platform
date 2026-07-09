import { useEffect, useRef, useState } from 'react'

/**
 * The File System Access API isn't in TS's default DOM lib. Minimal ambient
 * types for just what this file uses — not a full types package.
 */
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemHandle {
    readonly kind: 'file' | 'directory'
    readonly name: string
  }
  interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>
  }
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    values(): AsyncIterableIterator<FileSystemHandle>
  }
}

export interface LocalFiles {
  py: string
  stem: string
  manifestRaw?: string
  uiRaw?: string
}

export interface LocalBridgeProps {
  onFiles: (files: LocalFiles) => void
}

interface Handles {
  py: FileSystemFileHandle
  manifest?: FileSystemFileHandle
  ui?: FileSystemFileHandle
  stem: string
}

interface ReadResult {
  files: LocalFiles
  mtimes: { py: number; manifest?: number; ui?: number }
}

const POLL_MS = 1000

/** Mirrors the host's `_is_app_file`: a python file we should load as a cartridge. */
function isAppFile(name: string): boolean {
  return name.endsWith('.py') && !name.startsWith('_') && !name.startsWith('.') && name !== '__init__.py'
}

async function scanDir(dir: FileSystemDirectoryHandle): Promise<Handles> {
  const files = new Map<string, FileSystemFileHandle>()
  let py: FileSystemFileHandle | undefined
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue
    const handle = entry as FileSystemFileHandle
    files.set(entry.name, handle)
    if (!py && isAppFile(entry.name)) py = handle
  }
  if (!py) throw new Error('No cartridge .py file found in that folder')
  const stem = py.name.replace(/\.py$/, '')
  return { py, manifest: files.get(`${stem}.manifest.json`), ui: files.get(`${stem}.ui.json`), stem }
}

async function readAll(handles: Handles): Promise<ReadResult> {
  const pyFile = await handles.py.getFile()
  const manifestFile = handles.manifest ? await handles.manifest.getFile() : undefined
  const uiFile = handles.ui ? await handles.ui.getFile() : undefined
  return {
    files: {
      py: await pyFile.text(),
      stem: handles.stem,
      manifestRaw: manifestFile ? await manifestFile.text() : undefined,
      uiRaw: uiFile ? await uiFile.text() : undefined,
    },
    mtimes: { py: pyFile.lastModified, manifest: manifestFile?.lastModified, ui: uiFile?.lastModified },
  }
}

export function sameMtimes(a: ReadResult['mtimes'], b: ReadResult['mtimes']): boolean {
  return a.py === b.py && a.manifest === b.manifest && a.ui === b.ui
}

export function LocalBridge({ onFiles }: LocalBridgeProps) {
  const [supported] = useState(() => typeof window.showDirectoryPicker === 'function')
  const [watching, setWatching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<number | null>(null)
  const handlesRef = useRef<Handles | null>(null)
  const lastMtimesRef = useRef<ReadResult['mtimes']>({ py: 0 })
  // Bumped on every re-pick and on unmount. Each async op (poll tick, initial
  // read-on-pick) captures the generation before awaiting and bails without
  // firing onFiles if it changed while the await was in flight — otherwise a
  // stale read from the previous folder (or after unmount) would clobber the
  // current session.
  const generationRef = useRef(0)

  function stopPolling(): void {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // Stop the poll and invalidate any in-flight async on unmount. A new pick
  // bumps the generation + calls stopPolling() itself, so nothing leaks.
  useEffect(
    () => () => {
      generationRef.current++
      stopPolling()
    },
    []
  )

  async function poll(): Promise<void> {
    const handles = handlesRef.current
    if (!handles) return
    const generation = generationRef.current
    try {
      const result = await readAll(handles)
      if (generation !== generationRef.current) return // re-picked or unmounted mid-read
      if (sameMtimes(result.mtimes, lastMtimesRef.current)) return
      lastMtimesRef.current = result.mtimes
      onFiles(result.files)
    } catch (err) {
      if (generation !== generationRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function pickFolder(): Promise<void> {
    setError(null)
    // Invalidate any prior folder's in-flight reads before we start.
    generationRef.current++
    stopPolling()
    const generation = generationRef.current
    try {
      const dir = await window.showDirectoryPicker!()
      const handles = await scanDir(dir)
      const result = await readAll(handles)
      if (generation !== generationRef.current) return // re-picked/unmounted during the awaits
      handlesRef.current = handles
      lastMtimesRef.current = result.mtimes
      setWatching(dir.name)
      onFiles(result.files)
      intervalRef.current = window.setInterval(() => void poll(), POLL_MS)
    } catch (err) {
      if (generation !== generationRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the picker
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    const dropped = Array.from(e.dataTransfer.files)
    const pyFile = dropped.find((f) => isAppFile(f.name))
    if (!pyFile) {
      setError('Drop a cartridge .py file (+ optional <stem>.manifest.json / <stem>.ui.json)')
      return
    }
    const stem = pyFile.name.replace(/\.py$/, '')
    const manifestFile = dropped.find((f) => f.name === `${stem}.manifest.json`)
    const uiFile = dropped.find((f) => f.name === `${stem}.ui.json`)
    const py = await pyFile.text()
    const manifestRaw = manifestFile ? await manifestFile.text() : undefined
    const uiRaw = uiFile ? await uiFile.text() : undefined
    setWatching(stem)
    onFiles({ py, stem, manifestRaw, uiRaw })
  }

  return (
    <div className="local-bridge">
      {supported ? (
        <div className="local-bridge-row">
          <button onClick={() => void pickFolder()}>Open local folder</button>
          {watching && <span className="local-bridge-status">watching {watching}/</span>}
        </div>
      ) : (
        <div className="local-bridge-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void handleDrop(e)}>
          {watching ? `loaded ${watching} — re-drop to refresh` : 'Drop cartridge files here (.py + optional manifest/ui json)'}
        </div>
      )}
      {error && <p className="status status-error">{error}</p>}
    </div>
  )
}
