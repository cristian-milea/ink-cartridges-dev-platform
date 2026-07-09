import { resolveString, type TemplateCtx } from './template'

export interface DataSource {
  type: string; method?: string; url: string; format?: string
  needs?: string[]; auto_sync?: boolean; min_sync_seconds?: number
}

export function decodeFetched(body: string, format?: string): unknown {
  if (!body.trim()) return null
  if (format === 'xml') return body
  return JSON.parse(body)
}

export function locationFromCtx(ctx: TemplateCtx): { lat: number; lon: number; label?: string } | null {
  const lat = parseFloat(ctx.location['lat'] ?? '')
  const lon = parseFloat(ctx.location['lon'] ?? '')
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  const label = ctx.location['label']
  return label ? { lat, lon, label } : { lat, lon }
}

export function buildEnvelope(location: unknown, fetched: unknown): { location: unknown; fetched: unknown } {
  return { location: location ?? null, fetched: fetched ?? null }
}

export function checkNeeds(ds: DataSource, ctx: TemplateCtx): string | null {
  for (const need of ds.needs ?? []) {
    if (need === 'location' && !locationFromCtx(ctx))
      return 'Set a location first (Context → Location)'
    if (need.startsWith('secret:') && !ctx.secret[need.slice(7)])
      return `Set the "${need.slice(7)}" secret first (Context → Secrets)`
  }
  return null
}

export async function runSync(
  ds: DataSource,
  ctx: TemplateCtx,
  fetchFn: typeof fetch = fetch
): Promise<{ location: unknown; fetched: unknown }> {
  if (ds.type !== 'http') throw new Error(`Unsupported data_source type: ${ds.type}`)
  if ((ds.method ?? 'GET').toUpperCase() !== 'GET')
    throw new Error(`Only GET data sources are supported (got ${ds.method})`)
  const unmet = checkNeeds(ds, ctx)
  if (unmet) throw new Error(unmet)
  const url = resolveString(ds.url, ctx)
  const resp = await fetchFn(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return buildEnvelope(locationFromCtx(ctx), decodeFetched(await resp.text(), ds.format))
}
