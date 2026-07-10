import { useState } from 'react'
import { PhoneMock, type UiAction } from './PhoneMock'
import { SecretsPanel, secretsNeedAttention } from './SecretsPanel'
import type { DeviceContext } from '../lib/deviceContext'

/**
 * Middle column of the dev screen: the cartridge's phone UI and a SECRETS tab,
 * behind a small tab strip. BOTH panels stay mounted (inactive one gets the
 * `hidden` attribute) so PhoneMock's local widget state survives a tab switch
 * and hidden secret inputs stay out of the a11y tree.
 */
export function PhoneTabs({
  ui,
  published,
  dc,
  manifest,
  persistSecrets,
  onAction,
  onDcChange,
  onPersistChange,
}: {
  ui: unknown
  published: Record<string, unknown>
  dc: DeviceContext
  manifest: unknown
  persistSecrets: boolean
  onAction: (action: UiAction) => void
  onDcChange: (dc: DeviceContext) => void
  onPersistChange: (persist: boolean) => void
}) {
  const [tab, setTab] = useState<'ui' | 'secrets'>('ui')
  const secretsAlert = secretsNeedAttention(manifest, dc.secrets)

  return (
    <div className="phone-tabs">
      <div className="phone-tab-strip" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'ui'}
          className={`phone-tab${tab === 'ui' ? ' phone-tab--active' : ''}`}
          onClick={() => setTab('ui')}
        >
          UI
        </button>
        <button
          role="tab"
          aria-selected={tab === 'secrets'}
          className={`phone-tab${tab === 'secrets' ? ' phone-tab--active' : ''}`}
          onClick={() => setTab('secrets')}
        >
          Secrets
          {secretsAlert && <span className="phone-tab-alert" aria-label="secret required" />}
        </button>
      </div>

      <div className="phone-tab-panel" hidden={tab !== 'ui'}>
        {ui ? (
          <PhoneMock ui={ui} published={published} dc={dc} onAction={onAction} />
        ) : (
          <p className="status">No phone UI for this cartridge.</p>
        )}
      </div>
      <div className="phone-tab-panel" hidden={tab !== 'secrets'}>
        <SecretsPanel
          dc={dc}
          manifest={manifest}
          persistSecrets={persistSecrets}
          onChange={onDcChange}
          onPersistChange={onPersistChange}
        />
      </div>
    </div>
  )
}
