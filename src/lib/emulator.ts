import { PYODIDE_URL, RAW_BASE } from './constants'
import shimSource from '../../shim/studio_host.py?raw'

declare global {
  interface Window {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideAPI>
  }
}

/**
 * A Python object crossing into JS becomes a PyProxy: its attributes/methods
 * are reflected as dynamic JS properties, which TypeScript cannot express
 * without `any`. This is the one deliberate escape hatch in this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PyProxy = any

export interface PyodideAPI {
  loadPackage(names: string | string[]): Promise<void>
  runPython(code: string): unknown
  pyimport(name: string): PyProxy
  toPy(obj: unknown): PyProxy
  globals: { get(name: string): PyProxy }
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: Uint8Array | string): void }
}

export interface CartridgeFiles { py: string; stem: string; manifest?: unknown; ui?: unknown }
export interface CartridgeMeta {
  name: string
  icon: string
  version: string | null
  interval_seconds: number | null
}

const DICT_TO_OBJECT = { dict_converter: Object.fromEntries } as const

/** Pull the last line ("ValueError: reason") out of a Pyodide traceback string. */
function pyErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lines = msg.trim().split('\n')
  return lines[lines.length - 1] || msg
}

/** Convert a Python `bytes` PyProxy (returned from runPython/method calls) to a real Uint8Array. */
function bytesToUint8Array(proxy: PyProxy): Uint8Array {
  const js = proxy.toJs()
  proxy.destroy()
  return js instanceof Uint8Array ? js : Uint8Array.from(js as ArrayLike<number>)
}

/** Convert a Python `dict` PyProxy to a plain JS object, destroying the proxy. */
function dictToObject<T>(proxy: PyProxy): T {
  const js = proxy.toJs(DICT_TO_OBJECT) as T
  proxy.destroy()
  return js
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}

export class Emulator {
  private py!: PyodideAPI
  private studioHost!: PyProxy
  private session: PyProxy = null
  private timer: number | null = null
  private intervalSec: number | null = null
  private lastPng: Uint8Array = new Uint8Array()
  private lastPublished: Record<string, unknown> = {}
  private validatorLoaded = false
  onFrame: (png: Uint8Array, published: Record<string, unknown>) => void = () => {}
  private onLog: (line: string) => void

  private constructor(onLog: (line: string) => void) {
    this.onLog = onLog
  }

  static async create(onLog: (line: string) => void): Promise<Emulator> {
    const e = new Emulator(onLog)
    e.py = await window.loadPyodide({ indexURL: PYODIDE_URL })
    await e.py.loadPackage('pillow')

    e.py.FS.mkdirTree('/fonts')
    for (const f of ['DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf'])
      e.py.FS.writeFile(`/fonts/${f}`, await fetchBytes(`/fonts/${f}`))

    e.py.FS.mkdirTree('/shim')
    e.py.FS.writeFile('/shim/studio_host.py', shimSource)
    e.py.runPython("import sys\nsys.path.insert(0, '/shim')")
    e.studioHost = e.py.pyimport('studio_host')

    const aliasResp = await fetch(`${RAW_BASE}pwnagotchi-plugin/src/host_alias.py`)
    if (!aliasResp.ok) throw new Error(`fetch host_alias.py: HTTP ${aliasResp.status}`)
    e.studioHost.install_host_alias(await aliasResp.text())

    return e
  }

  async load(files: CartridgeFiles): Promise<CartridgeMeta> {
    // Build the new session into a LOCAL var first. Only on success do we tear
    // down the old one. If load() throws (e.g. a hot-reload with a syntax
    // error), the previous good session + its running repaint interval are left
    // fully intact — the caller only logs the error, so the old cartridge keeps
    // live-repainting. Do NOT stopInterval() up here.
    const session = this.studioHost.Session()
    let metaProxy: PyProxy
    try {
      metaProxy = session.load(files.py, files.stem)
    } catch (err) {
      session.destroy() // destroy ONLY the half-built new proxy; keep this.session
      throw new Error(pyErrorMessage(err))
    }
    // New session is good — now swap: stop the old interval, destroy the old
    // proxy, install the new one. Caller calls startInterval() next (which
    // stops any prior interval first, so this is belt-and-braces).
    this.stopInterval()
    this.session?.destroy()
    this.session = session
    const meta = dictToObject<CartridgeMeta>(metaProxy)
    this.intervalSec = meta.interval_seconds
    this.repaint()
    return meta
  }

  async push(payload: unknown): Promise<void> {
    if (!this.session) return
    const pyPayload = this.py.toPy(payload ?? null)
    let changed: unknown
    try {
      changed = this.session.push(pyPayload)
    } catch (err) {
      this.onLog(pyErrorMessage(err))
      return
    } finally {
      pyPayload.destroy?.()
    }
    const isProxy = changed !== null && typeof changed === 'object' && typeof (changed as PyProxy).destroy === 'function'
    if (isProxy) (changed as PyProxy).destroy()
    if (isProxy || changed !== false) this.repaint()
  }

  published(): Record<string, unknown> {
    return this.lastPublished
  }

  framePng(): Uint8Array {
    return this.lastPng
  }

  private repaint(): void {
    if (!this.session) return
    this.lastPng = bytesToUint8Array(this.session.render_png())
    this.lastPublished = dictToObject<Record<string, unknown>>(this.session.published_state())
    this.onFrame(this.lastPng, this.lastPublished)
  }

  startInterval(): void {
    this.stopInterval()
    if (this.intervalSec)
      this.timer = window.setInterval(() => this.repaint(), this.intervalSec * 1000)
  }

  stopInterval(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Stop repainting and release the current session's PyProxy (e.g. on navigating back to the gallery). */
  clearSession(): void {
    this.stopInterval()
    this.session?.destroy()
    this.session = null
  }

  /** Run the real CI validator (validate_cartridges.py) against candidate files under Pyodide. */
  async runValidator(files: Record<string, string>): Promise<string[]> {
    if (!this.validatorLoaded) {
      const src = await (await fetch(`${RAW_BASE}validate_cartridges.py`)).text()
      this.py.FS.mkdirTree('/repo')
      this.py.FS.writeFile('/repo/validate_cartridges.py', src)
      this.validatorLoaded = true
    }
    this.py.runPython(`
import json, os, shutil, sys
if '/repo' not in sys.path: sys.path.insert(0, '/repo')
shutil.rmtree('/repo/apps', ignore_errors=True)
_files = json.loads(${JSON.stringify(JSON.stringify(files))})
# validate_cartridge() requires the candidate dir basename == manifest.name.
# Manifest name may be hyphenated while the .py stem is underscored
# (e.g. tide-sun/tide_sun.py), so derive the dir from manifest.name; fall back
# to the .py stem for a malformed manifest so its real errors still surface.
_stem = next(f[:-3] for f in _files if f.endswith('.py'))
_dirname = _stem
try:
    _mf = next(c for f, c in _files.items() if f.endswith('.manifest.json'))
    _dirname = json.loads(_mf).get('name') or _stem
except (StopIteration, ValueError, TypeError):
    pass
_dir = f'/repo/apps/{_dirname}'
os.makedirs(_dir)
for fname, content in _files.items():
    with open(f'{_dir}/{fname}', 'w') as f: f.write(content)
import importlib, validate_cartridges
importlib.reload(validate_cartridges)
_name, _errors = validate_cartridges.validate_cartridge(_dir)
_errors_json = json.dumps(list(_errors))
`)
    return JSON.parse(this.py.runPython('_errors_json') as string)
  }
}
