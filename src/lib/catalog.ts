import { RAW_BASE } from './constants'
import type { CartridgeFiles } from './emulator'

export interface CatalogEntry {
  name: string
  icon: string
  version: string
  author: string
  description: string
  category: string
  files: { py: string; manifest: string; ui?: string }
  requires?: { permissions?: string[]; secrets?: { key: string; label: string; optional?: boolean }[] }
}

async function fetchText(path: string, fetchFn: typeof fetch): Promise<string> {
  const url = RAW_BASE + path
  const r = await fetchFn(url)
  if (!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`)
  return r.text()
}

export async function fetchCatalog(fetchFn: typeof fetch = fetch): Promise<CatalogEntry[]> {
  const text = await fetchText('index.json', fetchFn)
  const parsed = JSON.parse(text) as { apps: CatalogEntry[] }
  return parsed.apps
}

export async function fetchCartridge(
  entry: CatalogEntry,
  fetchFn: typeof fetch = fetch
): Promise<CartridgeFiles & { manifestRaw: string; uiRaw?: string }> {
  const py = await fetchText(entry.files.py, fetchFn)
  const manifestRaw = await fetchText(entry.files.manifest, fetchFn)
  const stem = entry.files.py.split('/').pop()!.replace(/\.py$/, '')
  const manifest = JSON.parse(manifestRaw)

  let ui: unknown
  let uiRaw: string | undefined
  if (entry.files.ui) {
    uiRaw = await fetchText(entry.files.ui, fetchFn)
    ui = JSON.parse(uiRaw)
  }

  return { py, stem, manifest, ui, manifestRaw, uiRaw }
}
