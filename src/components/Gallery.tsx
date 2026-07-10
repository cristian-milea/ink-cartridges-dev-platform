import { useState } from 'react'
import { fetchCartridge, type CatalogEntry } from '../lib/catalog'
import type { CartridgeFiles } from '../lib/emulator'

export interface GalleryProps {
  /** Catalog entries, fetched and owned by the parent. */
  entries: CatalogEntry[]
  onSelect: (
    files: CartridgeFiles & { manifest?: unknown; ui?: unknown; manifestRaw: string; uiRaw?: string },
    entry: CatalogEntry
  ) => void
  /** True while the Pyodide runtime is still starting up — Load would be a silent no-op. */
  disabled?: boolean
}

function needsSecrets(entry: CatalogEntry): boolean {
  return (entry.requires?.secrets ?? []).some((s) => !s.optional)
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadTemplate(entry: CatalogEntry): Promise<void> {
  const c = await fetchCartridge(entry)
  download(`${c.stem}.py`, c.py)
  download(`${c.stem}.manifest.json`, c.manifestRaw)
  if (c.uiRaw) download(`${c.stem}.ui.json`, c.uiRaw)
}

export function Gallery({ entries, onSelect, disabled = false }: GalleryProps) {
  const [error, setError] = useState<string | null>(null)
  const [loadingName, setLoadingName] = useState<string | null>(null)

  const byCategory = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? []
    list.push(entry)
    byCategory.set(entry.category, list)
  }

  async function select(entry: CatalogEntry) {
    setLoadingName(entry.name)
    setError(null)
    try {
      const c = await fetchCartridge(entry)
      onSelect(c, entry)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingName(null)
    }
  }

  return (
    <div>
      {disabled && <p className="status">Starting runtime…</p>}
      {[...byCategory.entries()].map(([category, apps]) => (
        <section key={category} className="gallery-category">
          <h2>{category}</h2>
          <div className="gallery-grid">
            {apps.map((entry) => (
              <div key={entry.name} className="ink-panel gallery-card">
                <div className="gallery-card-header">
                  <span className="gallery-icon">
                    <img src="/img/game_cartridge.png" alt="" />
                    <span className="gallery-icon-monogram">{entry.icon.slice(0, 2).toUpperCase()}</span>
                  </span>
                  <div>
                    <div className="gallery-name">{entry.name}</div>
                    <div className="gallery-meta">v{entry.version} · {entry.author}</div>
                    <div className="gallery-meta gallery-category-tag">{entry.category}</div>
                  </div>
                  {needsSecrets(entry) && <span className="ink-badge ink-badge--yellow">needs secrets</span>}
                </div>
                <p className="gallery-description">{entry.description}</p>
                <div className="gallery-card-actions">
                  <button
                    onClick={() => select(entry)}
                    disabled={disabled || loadingName === entry.name}
                    className="ink-btn"
                  >
                    {loadingName === entry.name ? 'Loading…' : 'Load'}
                  </button>
                  <button onClick={() => downloadTemplate(entry)} className="ink-btn ink-btn--ghost">
                    Use as template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {error && <p className="status status-error">{error}</p>}
    </div>
  )
}
