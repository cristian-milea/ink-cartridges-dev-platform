import type { TemplateCtx } from './template'

export interface DeviceContext {
  location: Record<string, string>
  secrets: Record<string, string>
  permissions: Record<string, boolean>
}

export interface LoadedDeviceContext {
  dc: DeviceContext
  persistSecrets: boolean
  migratedSecrets: boolean
}

const KEY = 'studio.deviceContext'

interface StoredBlob {
  location?: Record<string, string>
  permissions?: Record<string, boolean>
  persistSecrets?: boolean
  secrets?: Record<string, string>
}

export function loadDeviceContext(): LoadedDeviceContext {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const stored = JSON.parse(raw) as StoredBlob
      const dc: DeviceContext = {
        location: stored.location ?? {},
        secrets: stored.secrets ?? {},
        permissions: stored.permissions ?? {},
      }
      // Legacy migration: old format always saved secrets and had no
      // persistSecrets flag. Keep the secrets for this session but scrub disk.
      const hasSecrets = stored.secrets && Object.keys(stored.secrets).length > 0
      if (hasSecrets && stored.persistSecrets === undefined) {
        saveDeviceContext(dc, false)
        return { dc, persistSecrets: false, migratedSecrets: true }
      }
      return { dc, persistSecrets: stored.persistSecrets ?? false, migratedSecrets: false }
    }
  } catch { /* corrupted -> defaults */ }
  return {
    dc: { location: {}, secrets: {}, permissions: {} },
    persistSecrets: false,
    migratedSecrets: false,
  }
}

export function saveDeviceContext(dc: DeviceContext, persistSecrets: boolean): void {
  const blob: StoredBlob = {
    location: dc.location,
    permissions: dc.permissions,
    persistSecrets,
  }
  if (persistSecrets) blob.secrets = dc.secrets
  localStorage.setItem(KEY, JSON.stringify(blob))
}

export function toTemplateCtx(
  dc: DeviceContext,
  state: Record<string, unknown>,
  local: Record<string, unknown>
): TemplateCtx {
  return { state, local, secret: dc.secrets, location: dc.location }
}
