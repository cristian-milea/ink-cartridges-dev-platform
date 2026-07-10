import { useEffect, useState } from 'react'
import { fetchCatalog, fetchCartridge, type CatalogEntry } from '../lib/catalog'
import type { CartridgeFiles } from '../lib/emulator'
import type { LogEntry } from '../lib/consoleLog'
import { Gallery, downloadTemplate } from '../components/Gallery'
import { LocalBridge, type LocalFiles } from '../components/LocalBridge'
import { ConsolePane } from '../components/ConsolePane'
import { Link } from '../components/Link'

type SelectHandler = (
  files: CartridgeFiles & { manifest?: unknown; ui?: unknown; manifestRaw: string; uiRaw?: string },
  entry: CatalogEntry
) => void

interface StorePageProps {
  onSelect: SelectHandler
  onLocalFiles: (local: LocalFiles) => void
  disabled: boolean
  logEntries: LogEntry[]
  onClearLog: () => void
  /** Bumped by App on "Back to gallery" to remount LocalBridge and drop its folder watch. */
  bridgeKey: number
}

const FEATURED_NAME = 'ricochet-robots'

function needsSecrets(entry: CatalogEntry): boolean {
  return (entry.requires?.secrets ?? []).some((s) => !s.optional)
}

export function StorePage({ onSelect, onLocalFiles, disabled, logEntries, onClearLog, bridgeKey }: StorePageProps) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<string | null>(null)
  const [loadingFeatured, setLoadingFeatured] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((apps) => !cancelled && setEntries(apps))
      .catch((err) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [])

  const categories = entries ? [...new Set(entries.map((e) => e.category))] : []
  const featured = entries?.find((e) => e.name === FEATURED_NAME) ?? entries?.[0]
  const filtered = chip ? (entries ?? []).filter((e) => e.category === chip) : entries ?? []

  async function loadFeatured(entry: CatalogEntry) {
    setLoadingFeatured(true)
    try {
      const c = await fetchCartridge(entry)
      onSelect(c, entry)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingFeatured(false)
    }
  }

  return (
    <main className="store">
      <section className="store-masthead">
        <span className="ink-badge">E-ink cartridge preview</span>
        <h2 className="store-masthead-headline">The cartridge store, in your browser.</h2>
        <p className="store-masthead-lede">
          Load any cartridge to see the real 250×122 e-ink frame and drive the phone-side UI — no
          install, no backend.
        </p>
      </section>

      <nav className="store-chips" aria-label="Categories">
        <button
          className={`store-chip${chip === null ? ' store-chip--active' : ''}`}
          onClick={() => setChip(null)}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`store-chip${chip === cat ? ' store-chip--active' : ''}`}
            onClick={() => setChip(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {chip === null && featured && (
        <section className="ink-panel store-featured">
          <span className="gallery-icon gallery-icon--lg">
            <img src="/img/game_cartridge.png" alt="" />
            <span className="gallery-icon-monogram">{featured.icon.slice(0, 2).toUpperCase()}</span>
          </span>
          <div className="store-featured-body">
            <span className="ink-badge ink-badge--ink">Featured</span>
            <div className="store-featured-name">{featured.name}</div>
            <div className="gallery-meta">
              v{featured.version} · {featured.author} · {featured.category}
            </div>
            <p className="gallery-description">{featured.description}</p>
            <div className="gallery-card-actions">
              <button onClick={() => loadFeatured(featured)} disabled={disabled || loadingFeatured} className="ink-btn">
                {loadingFeatured ? 'Loading…' : 'Load'}
              </button>
              <button onClick={() => downloadTemplate(featured)} className="ink-btn ink-btn--ghost">
                Use as template
              </button>
              {needsSecrets(featured) && <span className="ink-badge ink-badge--yellow">needs secrets</span>}
            </div>
          </div>
        </section>
      )}

      <section className="ink-panel store-dev">
        <div className="store-dev-copy">
          <span className="ink-section-header">Build your own</span>
          <p>
            Point the studio at a local folder for hot reload and the real CI validator, or install the{' '}
            <Link to="/plugin">pwnagotchi plugin</Link> to run cartridges on your device.
          </p>
          <LocalBridge key={bridgeKey} onFiles={onLocalFiles} disabled={disabled} />
        </div>
        <ConsolePane entries={logEntries} onClear={onClearLog} />
      </section>

      {error && <p className="status status-error">Failed to load catalog: {error}</p>}
      {!entries && !error && <p className="status">Loading catalog…</p>}
      {entries && <Gallery entries={filtered} onSelect={onSelect} disabled={disabled} />}
    </main>
  )
}
