import type { DeviceContext } from '../lib/deviceContext'

interface ManifestSecret {
  key: string
  label: string
  description?: string
  optional?: boolean
}

export function getManifestSecrets(manifest: unknown): ManifestSecret[] {
  if (!manifest || typeof manifest !== 'object') return []
  const m = manifest as Record<string, unknown>
  if (!m.requires || typeof m.requires !== 'object') return []
  const requires = m.requires as Record<string, unknown>
  if (!Array.isArray(requires.secrets)) return []
  return requires.secrets.filter((s) => s && typeof s === 'object' && 'key' in s && 'label' in s) as ManifestSecret[]
}

/** True when a required secret is still unset — drives the SECRETS tab alert dot. */
export function secretsNeedAttention(manifest: unknown, secrets: Record<string, string>): boolean {
  return getManifestSecrets(manifest).some((s) => !s.optional && !secrets[s.key])
}

export function SecretsPanel({
  dc,
  manifest,
  persistSecrets,
  onChange,
  onPersistChange,
}: {
  dc: DeviceContext
  manifest?: unknown
  persistSecrets: boolean
  onChange: (dc: DeviceContext) => void
  onPersistChange: (persist: boolean) => void
}) {
  const secrets = getManifestSecrets(manifest)

  const updateSecret = (key: string, value: string) =>
    onChange({ ...dc, secrets: { ...dc.secrets, [key]: value } })

  return (
    <div className="secrets-panel">
      {secrets.length === 0 ? (
        <p className="context-empty">No secrets required by this cartridge.</p>
      ) : (
        secrets.map((secret) => {
          const isRequired = !secret.optional
          const isSet = Boolean(dc.secrets[secret.key])
          return (
            <div key={secret.key} className="context-secret-row">
              <div className="context-secret-label-row">
                <label className="context-secret-label">{secret.label}</label>
                {isRequired && !isSet && <span className="ink-badge ink-badge--red">needed</span>}
              </div>
              {secret.description && <p className="context-secret-description">{secret.description}</p>}
              <input
                type="password"
                placeholder="Enter value..."
                value={dc.secrets[secret.key] ?? ''}
                onChange={(e) => updateSecret(secret.key, e.target.value)}
                className="ink-field context-input-full"
              />
            </div>
          )
        })
      )}

      <p className="secrets-note">
        {persistSecrets
          ? "Saved in this browser's localStorage. Untick to remove from storage."
          : 'Secrets stay in memory for this browser session only — never uploaded, lost when you refresh or close the tab.'}
      </p>

      <label className="secrets-persist-row">
        <input
          type="checkbox"
          checked={persistSecrets}
          onChange={(e) => onPersistChange(e.target.checked)}
        />
        Save in this browser's localStorage so secrets survive refresh
      </label>
    </div>
  )
}
