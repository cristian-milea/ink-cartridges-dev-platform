import type { TemplateCtx } from './template'

export interface DeviceContext {
  location: Record<string, string>
  secrets: Record<string, string>
  permissions: Record<string, boolean>
}

const KEY = 'studio.deviceContext'

export function loadDeviceContext(): DeviceContext {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { location: {}, secrets: {}, permissions: {}, ...JSON.parse(raw) }
  } catch { /* corrupted -> defaults */ }
  return { location: {}, secrets: {}, permissions: {} }
}

export function saveDeviceContext(ctx: DeviceContext): void {
  localStorage.setItem(KEY, JSON.stringify(ctx))
}

export function toTemplateCtx(
  dc: DeviceContext,
  state: Record<string, unknown>,
  local: Record<string, unknown>
): TemplateCtx {
  return { state, local, secret: dc.secrets, location: dc.location }
}
