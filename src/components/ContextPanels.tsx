import { useState } from 'react'
import type { ReactNode } from 'react'
import type { DeviceContext } from '../lib/deviceContext'

interface ContextPanelsProps {
  dc: DeviceContext
  onChange: (ctx: DeviceContext) => void
}

const PRESETS = [
  { label: 'Brighton', lat: '50.82', lon: '-0.14' },
  { label: 'Bucharest', lat: '44.43', lon: '26.10' },
  { label: 'NYC', lat: '40.71', lon: '-74.01' },
]

const PERMISSIONS = ['location', 'notifications', 'network']

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

export function ContextPanels({ dc, onChange }: ContextPanelsProps) {
  const [collapsed, setCollapsed] = useState({
    location: false,
    permissions: false,
  })

  const toggleSection = (section: keyof typeof collapsed) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const commit = (updated: DeviceContext) => {
    onChange(updated)
  }

  const updateLocation = (key: string, value: string) =>
    commit({ ...dc, location: { ...dc.location, [key]: value } })

  const applyPreset = (preset: (typeof PRESETS)[0]) =>
    commit({ ...dc, location: { ...dc.location, lat: preset.lat, lon: preset.lon, label: preset.label } })

  const updatePermission = (name: string, value: boolean) =>
    commit({ ...dc, permissions: { ...dc.permissions, [name]: value } })

  return (
    <div className="context-panels">
      <Section title="Location" collapsed={collapsed.location} onToggle={() => toggleSection('location')}>
        <div className="context-field-row">
          <input
            type="text"
            placeholder="Latitude"
            value={dc.location.lat ?? ''}
            onChange={(e) => updateLocation('lat', e.target.value)}
            className="ink-field"
          />
          <input
            type="text"
            placeholder="Longitude"
            value={dc.location.lon ?? ''}
            onChange={(e) => updateLocation('lon', e.target.value)}
            className="ink-field"
          />
        </div>
        <input
          type="text"
          placeholder="Label"
          value={dc.location.label ?? ''}
          onChange={(e) => updateLocation('label', e.target.value)}
          className="ink-field context-input-full"
        />
        <div className="context-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="ink-btn ink-btn--ghost context-preset-button"
            >
              {preset.label}
            </button>
          ))}
        </div>
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
