export interface TemplateCtx {
  state: Record<string, unknown>
  local: Record<string, unknown>
  secret: Record<string, string>
  location: Record<string, string>
}
export const EMPTY_CTX: TemplateCtx = { state: {}, local: {}, secret: {}, location: {} }

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g

function lookup(path: string, ctx: TemplateCtx): string {
  const dot = path.indexOf('.')
  if (dot < 0) return ''
  const scope = path.slice(0, dot)
  const key = path.slice(dot + 1)
  const bag = (ctx as unknown as Record<string, Record<string, unknown>>)[scope]
  if (!bag || !(key in bag)) return ''
  const v = bag[key]
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function resolveString(s: string, ctx: TemplateCtx): string {
  return s.replace(PLACEHOLDER, (_, path: string) => lookup(path, ctx))
}

export function resolveJson(el: unknown, ctx: TemplateCtx): unknown {
  if (typeof el === 'string') return resolveString(el, ctx)
  if (Array.isArray(el)) return el.map((x) => resolveJson(x, ctx))
  if (el !== null && typeof el === 'object')
    return Object.fromEntries(Object.entries(el).map(([k, v]) => [k, resolveJson(v, ctx)]))
  return el
}
