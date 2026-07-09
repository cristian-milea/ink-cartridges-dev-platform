import { useState } from 'react'
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

export function ContextPanels({ dc, onChange, manifest }: ContextPanelsProps) {
  const [expandedSections, setExpandedSections] = useState({
    location: true,
    secrets: true,
    permissions: true,
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const updateLocation = (key: string, value: string) => {
    const updated = { ...dc, location: { ...dc.location, [key]: value } }
    onChange(updated)
    saveDeviceContext(updated)
  }

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const updated = { ...dc, location: { ...dc.location, lat: preset.lat, lon: preset.lon, label: preset.label } }
    onChange(updated)
    saveDeviceContext(updated)
  }

  const updateSecret = (key: string, value: string) => {
    const updated = { ...dc, secrets: { ...dc.secrets, [key]: value } }
    onChange(updated)
    saveDeviceContext(updated)
  }

  const updatePermission = (name: string, value: boolean) => {
    const updated = { ...dc, permissions: { ...dc.permissions, [name]: value } }
    onChange(updated)
    saveDeviceContext(updated)
  }

  const getManifestSecrets = (): ManifestSecret[] => {
    if (!manifest || typeof manifest !== 'object') return []
    const m = manifest as Record<string, unknown>
    if (!m.requires || typeof m.requires !== 'object') return []
    const requires = m.requires as Record<string, unknown>
    if (!Array.isArray(requires.secrets)) return []
    return requires.secrets.filter((s) => s && typeof s === 'object' && 'key' in s && 'label' in s) as ManifestSecret[]
  }

  const secrets = getManifestSecrets()

  return (
    <div className="space-y-4">
      {/* Location Section */}
      <div className="border rounded">
        <button
          onClick={() => toggleSection('location')}
          className="w-full px-4 py-2 text-left font-semibold hover:bg-gray-100"
        >
          Location {expandedSections.location ? '▼' : '▶'}
        </button>
        {expandedSections.location && (
          <div className="px-4 py-3 space-y-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Latitude"
                value={dc.location.lat ?? ''}
                onChange={(e) => updateLocation('lat', e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              />
              <input
                type="text"
                placeholder="Longitude"
                value={dc.location.lon ?? ''}
                onChange={(e) => updateLocation('lon', e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Label"
              value={dc.location.label ?? ''}
              onChange={(e) => updateLocation('label', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm"
            />
            <div className="space-y-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  className="w-full px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Secrets Section */}
      <div className="border rounded">
        <button
          onClick={() => toggleSection('secrets')}
          className="w-full px-4 py-2 text-left font-semibold hover:bg-gray-100"
        >
          Secrets {expandedSections.secrets ? '▼' : '▶'}
        </button>
        {expandedSections.secrets && (
          <div className="px-4 py-3 space-y-2 bg-gray-50">
            {secrets.length === 0 ? (
              <p className="text-sm text-gray-500">No secrets required</p>
            ) : (
              secrets.map((secret) => {
                const isRequired = !secret.optional
                const isSet = secret.key in dc.secrets
                return (
                  <div key={secret.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">{secret.label}</label>
                      {isRequired && !isSet && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">needed</span>}
                    </div>
                    {secret.description && <p className="text-xs text-gray-600">{secret.description}</p>}
                    <input
                      type="password"
                      placeholder="Enter value..."
                      value={dc.secrets[secret.key] ?? ''}
                      onChange={(e) => updateSecret(secret.key, e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Permissions Section */}
      <div className="border rounded">
        <button
          onClick={() => toggleSection('permissions')}
          className="w-full px-4 py-2 text-left font-semibold hover:bg-gray-100"
        >
          Permissions {expandedSections.permissions ? '▼' : '▶'}
        </button>
        {expandedSections.permissions && (
          <div className="px-4 py-3 space-y-2 bg-gray-50">
            {PERMISSIONS.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dc.permissions[name] ?? false}
                  onChange={(e) => updatePermission(name, e.target.checked)}
                />
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
