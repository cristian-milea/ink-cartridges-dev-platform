import { useState } from 'react'
import type { ReactNode } from 'react'
import type { DeviceContext } from '../lib/deviceContext'
import { saveDeviceContext } from '../lib/deviceContext'

interface ContextPanelsProps {
  dc: DeviceContext
  onChange: (ctx: DeviceContext) => void
  manifest?: unknown
}

interface ManifestSecret {
  key: string
  label: string
  description?: string
  optional?: boolean
}

const PRESETS = [
  { label: 'Brighton', lat: '50.82', lon: '-0.14' },
  { label: 'Bucharest', lat: '44.43', lon: '26.10' },
  { label: 'NYC', lat: '40.71', lon: '-74.01' },
]

const PERMISSIONS = ['location', 'notifications', 'network']

function getManifestSecrets(manifest: unknown): ManifestSecret[] {
  if (!manifest || typeof manifest !== 'object') return []
  const m = manifest as Record<string, unknown>
  if (!m.requires || typeof m.requires !== 'object') return []
  const requires = m.requires as Record<string, unknown>
  if (!Array.isArray(requires.secrets)) return []
  return requires.secrets.filter((s) => s && typeof s === 'object' && 'key' in s && 'label' in s) as ManifestSecret[]
}

function Section({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="ink-panel context-section">
      <button onClick={onToggle} className="ink-section-header context-section-header">
        {title} {collapsed ? '▶' : '▼'}
      </button>
      {!collapsed && <div className="ink-panel--inset context-section-body">{children}</div>}
    </div>
  )
}

export function ContextPanels({ dc, onChange, manifest }: ContextPanelsProps) {
  const [collapsed, setCollapsed] = useState({
    location: false,
    secrets: false,
    permissions: false,
  })

  const toggleSection = (section: keyof typeof collapsed) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const commit = (updated: DeviceContext) => {
    onChange(updated)
    saveDeviceContext(updated)
  }

  const updateLocation = (key: string, value: string) =>
    commit({ ...dc, location: { ...dc.location, [key]: value } })

  const applyPreset = (preset: (typeof PRESETS)[0]) =>
    commit({ ...dc, location: { ...dc.location, lat: preset.lat, lon: preset.lon, label: preset.label } })

  const updateSecret = (key: string, value: string) => commit({ ...dc, secrets: { ...dc.secrets, [key]: value } })

  const updatePermission = (name: string, value: boolean) =>
    commit({ ...dc, permissions: { ...dc.permissions, [name]: value } })

  const secrets = getManifestSecrets(manifest)

  return (
    <div className="context-panels">
      <Section title="Location" collapsed={collapsed.location} onToggle={() => toggleSection('location')}>
        <div className="context-field-row">
          <input
            type="text"
            placeholder="Latitude"
            value={dc.location.lat ?? ''}
            onChange={(e) => updateLocation('lat', e.target.value)}
            className="context-input"
          />
          <input
            type="text"
            placeholder="Longitude"
            value={dc.location.lon ?? ''}
            onChange={(e) => updateLocation('lon', e.target.value)}
            className="context-input"
          />
        </div>
        <input
          type="text"
          placeholder="Label"
          value={dc.location.label ?? ''}
          onChange={(e) => updateLocation('label', e.target.value)}
          className="context-input context-input-full"
        />
        <div className="context-presets">
          {PRESETS.map((preset) => (
            <button key={preset.label} onClick={() => applyPreset(preset)} className="context-preset-button">
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Secrets" collapsed={collapsed.secrets} onToggle={() => toggleSection('secrets')}>
        {secrets.length === 0 ? (
          <p className="context-empty">No secrets required</p>
        ) : (
          secrets.map((secret) => {
            const isRequired = !secret.optional
            const isSet = Boolean(dc.secrets[secret.key])
            return (
              <div key={secret.key} className="context-secret-row">
                <div className="context-secret-label-row">
                  <label className="context-secret-label">{secret.label}</label>
                  {isRequired && !isSet && <span className="badge context-needed-badge">needed</span>}
                </div>
                {secret.description && <p className="context-secret-description">{secret.description}</p>}
                <input
                  type="password"
                  placeholder="Enter value..."
                  value={dc.secrets[secret.key] ?? ''}
                  onChange={(e) => updateSecret(secret.key, e.target.value)}
                  className="context-input context-input-full"
                />
              </div>
            )
          })
        )}
      </Section>

      <Section title="Permissions" collapsed={collapsed.permissions} onToggle={() => toggleSection('permissions')}>
        {PERMISSIONS.map((name) => (
          <label key={name} className="context-permission-row">
            <input
              type="checkbox"
              checked={dc.permissions[name] ?? false}
              onChange={(e) => updatePermission(name, e.target.checked)}
            />
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </label>
        ))}
      </Section>
    </div>
  )
}
