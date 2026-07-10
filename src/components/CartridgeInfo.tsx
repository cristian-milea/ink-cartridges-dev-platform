import type { CartridgeMeta } from '../lib/emulator'

export function CartridgeInfo({
  meta,
  hasDataSource,
}: {
  meta: CartridgeMeta
  hasDataSource: boolean
}) {
  return (
    <div className="ink-panel cartridge-info">
      <span className="ink-section-header">Cartridge</span>
      <div className="cartridge-info-row">
        <span>Name</span>
        <span>{meta.name}</span>
      </div>
      <div className="cartridge-info-row">
        <span>Version</span>
        <span>{meta.version ?? '—'}</span>
      </div>
      <div className="cartridge-info-row">
        <span>Refresh</span>
        <span>
          {meta.interval_seconds != null
            ? `every ${meta.interval_seconds}s`
            : 'on interaction only'}
        </span>
      </div>
      <div className="cartridge-info-row">
        <span>Data source</span>
        <span>{hasDataSource ? 'yes' : 'none'}</span>
      </div>
    </div>
  )
}
