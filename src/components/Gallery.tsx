import { useEffect, useState } from 'react'
import { fetchCatalog, fetchCartridge, type CatalogEntry } from '../lib/catalog'
import type { CartridgeFiles } from '../lib/emulator'

export interface GalleryProps {
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

async function downloadTemplate(entry: CatalogEntry): Promise<void> {
  const c = await fetchCartridge(entry)
  download(`${c.stem}.py`, c.py)
  download(`${c.stem}.manifest.json`, c.manifestRaw)
  if (c.uiRaw) download(`${c.stem}.ui.json`, c.uiRaw)
}

export function Gallery({ onSelect, disabled = false }: GalleryProps) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingName, setLoadingName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((apps) => {
        if (!cancelled) setEntries(apps)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="status status-error">Failed to load catalog: {error}</p>
  if (!entries) return <p className="status">Loading catalog…</p>

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
    <div className="gallery">
      {disabled && <p className="status">Starting runtime…</p>}
      {[...byCategory.entries()].map(([category, apps]) => (
        <section key={category} className="gallery-category">
          <h2>{category}</h2>
          <div className="gallery-grid">
            {apps.map((entry) => (
              <div key={entry.name} className="ink-panel gallery-card">
                <div className="gallery-card-header">
                  <span className="gallery-icon">{entry.icon}</span>
                  <div>
                    <div className="gallery-name">{entry.name}</div>
                    <div className="gallery-meta">v{entry.version} · {entry.author}</div>
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
