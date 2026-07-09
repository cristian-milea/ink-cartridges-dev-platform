import { checkNeeds, type DataSource } from '../lib/syncer'
import type { TemplateCtx } from '../lib/template'

const LAST_SYNC_PREFIX = 'studio.lastSync.'

export function getLastSync(appName: string): number | null {
  const raw = localStorage.getItem(LAST_SYNC_PREFIX + appName)
  if (!raw) return null
  const ts = Number(raw)
  return Number.isFinite(ts) ? ts : null
}

export function recordLastSync(appName: string, when: number = Date.now()): void {
  localStorage.setItem(LAST_SYNC_PREFIX + appName, String(when))
}

function timeAgo(ts: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export interface SyncCardProps {
  ds: DataSource
  ctx: TemplateCtx
  lastSync: number | null
  onSync: () => void
  error: string | null
}

export function SyncCard({ ds, ctx, lastSync, onSync, error }: SyncCardProps) {
  const unmet = checkNeeds(ds, ctx)
  return (
    <div className="sync-card">
      <div className="sync-card-row">
        <span className="sync-card-status">
          Last synced: {lastSync === null ? 'never' : timeAgo(lastSync)}
        </span>
        <button onClick={onSync} disabled={unmet !== null} title={unmet ?? undefined}>
          Sync
        </button>
      </div>
      {unmet && <p className="sync-card-reason">{unmet}</p>}
      {error && <p className="sync-card-error">{error}</p>}
    </div>
  )
}
