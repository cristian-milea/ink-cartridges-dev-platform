import { useState } from 'react'
import { resolveString, resolveJson } from '../lib/template'
import { evalWhen } from '../lib/whenLogic'
import { toTemplateCtx, type DeviceContext } from '../lib/deviceContext'
import { Dpad } from './Dpad'

export type UiAction =
  | { type: 'push'; payload: unknown }
  | { type: 'sync' }
  | { type: 'set_local'; key: string; value: unknown }
  | { type: 'request_permission'; name: string }

export interface PhoneMockProps {
  ui: unknown
  published: Record<string, unknown>
  dc: DeviceContext
  onAction: (action: UiAction, local: Record<string, unknown>) => void
}

type Node = Record<string, unknown>

function asNode(n: unknown): Node | null {
  if (n !== null && typeof n === 'object' && !Array.isArray(n)) return n as Node
  return null
}

function str(n: Node, key: string): string | undefined {
  const v = n[key]
  return typeof v === 'string' ? v : undefined
}

function num(n: Node, key: string): number | undefined {
  const v = n[key]
  return typeof v === 'number' ? v : undefined
}

/** Collects every `default`/`local` seed from the tree, template-resolving `select` defaults. */
function collectDefaults(
  n: unknown,
  ctx: Parameters<typeof resolveString>[1],
  acc: Record<string, unknown>
): void {
  const node = asNode(n)
  if (!node) return
  const local = str(node, 'local')
  if (local && 'default' in node) {
    const type = str(node, 'type')
    const def = node.default
    acc[local] = type === 'select' && typeof def === 'string' ? resolveString(def, ctx) : def
  }
  for (const key of ['children', 'then', 'else']) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((c) => collectDefaults(c, ctx, acc))
    else if (v) collectDefaults(v, ctx, acc)
  }
}

export function PhoneMock({ ui, published, dc, onAction }: PhoneMockProps) {
  const [localState, setLocalState] = useState<Record<string, unknown>>(() => {
    const seedCtx = toTemplateCtx(dc, published, {})
    const acc: Record<string, unknown> = {}
    collectDefaults(ui, seedCtx, acc)
    return acc
  })

  const ctx = toTemplateCtx(dc, published, localState)

  // `localOverride` lets a handler that mutates local state AND fires an action
  // in the same tick resolve against the post-update value (setState is async,
  // so the closure `ctx`/`localState` would otherwise be one toggle stale).
  function fire(action: unknown, localOverride?: Record<string, unknown>) {
    const node = asNode(action)
    if (!node) return
    const fireCtx = localOverride ? toTemplateCtx(dc, published, localOverride) : ctx
    const nextLocal = localOverride ?? localState
    const type = str(node, 'type')
    if (type === 'set_local') {
      const key = str(node, 'key')
      if (!key) return
      const value = resolveJson(node.value, fireCtx)
      setLocalState((prev) => ({ ...prev, [key]: value }))
      return
    }
    const resolved = resolveJson(node, fireCtx) as UiAction
    onAction(resolved, nextLocal)
  }

  function setLocal(key: string, value: unknown) {
    setLocalState((prev) => ({ ...prev, [key]: value }))
  }

  function renderChildren(v: unknown, key: string): React.ReactNode {
    if (Array.isArray(v)) return v.map((c, i) => renderNode(c, `${key}.${i}`))
    if (v) return renderNode(v, key)
    return null
  }

  function renderNode(n: unknown, key: string): React.ReactNode {
    const node = asNode(n)
    if (!node) return null
    const type = str(node, 'type')

    switch (type) {
      case 'column':
      case 'row': {
        const style: React.CSSProperties = {
          display: 'flex',
          flexDirection: type === 'row' ? 'row' : 'column',
          padding: num(node, 'padding'),
          gap: num(node, 'spacing'),
          alignItems: str(node, 'align'),
        }
        return (
          <div key={key} style={style}>
            {renderChildren(node.children, `${key}.c`)}
          </div>
        )
      }
      case 'spacer':
        return (
          <div
            key={key}
            style={{ width: num(node, 'width'), height: num(node, 'height') }}
          />
        )
      case 'divider':
        return (
          <hr key={key} style={{ borderTopWidth: num(node, 'thickness') ?? 1 }} />
        )
      case 'text': {
        const value = str(node, 'value') ?? ''
        return (
          <p
            key={key}
            className={str(node, 'style') ?? 'body'}
            style={{ textAlign: str(node, 'align') as React.CSSProperties['textAlign'] }}
          >
            {resolveString(value, ctx)}
          </p>
        )
      }
      case 'state_text': {
        const binding = str(node, 'binding')
        const v = binding !== undefined && binding in published ? published[binding] : undefined
        const display = v === undefined ? (node.default ?? '') : v
        const format = str(node, 'format')
        const text = format ? format.replace('{}', String(display)) : String(display)
        return <p key={key}>{text}</p>
      }
      case 'image': {
        const source = str(node, 'source') ?? ''
        const src = source.startsWith('state.')
          ? String(published[source.slice('state.'.length)] ?? '')
          : source
        return (
          <img
            key={key}
            src={src}
            alt=""
            width={num(node, 'width')}
            height={num(node, 'height')}
          />
        )
      }
      case 'chart': {
        const binding = str(node, 'binding')
        const data = (binding !== undefined && Array.isArray(published[binding])
          ? (published[binding] as unknown[])
          : []
        ).filter((x): x is number => typeof x === 'number')
        const height = num(node, 'height') ?? 80
        const kind = str(node, 'kind') ?? 'bars'
        const max = Math.max(1, ...data)
        const w = 100
        if (kind === 'line') {
          const points = data
            .map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${height - (v / max) * height}`)
            .join(' ')
          return (
            <svg key={key} width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
              <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1} />
            </svg>
          )
        }
        const barW = w / Math.max(1, data.length)
        return (
          <svg key={key} width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
            {data.map((v, i) => {
              const barH = (v / max) * height
              return (
                <rect
                  key={i}
                  x={i * barW}
                  y={height - barH}
                  width={Math.max(0, barW - 1)}
                  height={barH}
                  fill="currentColor"
                />
              )
            })}
          </svg>
        )
      }
      case 'button': {
        const label = str(node, 'label') ?? ''
        return (
          <button
            key={key}
            className={str(node, 'style') ?? 'primary'}
            onClick={() => fire(node.action)}
          >
            {resolveString(label, ctx)}
          </button>
        )
      }
      case 'switch': {
        const localKey = str(node, 'local')
        const checked = localKey ? Boolean(localState[localKey]) : false
        return (
          <label key={key}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = e.target.checked
                if (localKey) setLocal(localKey, next)
                const action = next ? node.action_on : node.action_off
                if (action) {
                  const merged = localKey ? { ...localState, [localKey]: next } : localState
                  fire(action, merged)
                }
              }}
            />
            {str(node, 'label')}
          </label>
        )
      }
      case 'slider': {
        const localKey = str(node, 'local')
        const value = localKey && typeof localState[localKey] === 'number'
          ? (localState[localKey] as number)
          : (num(node, 'default') ?? num(node, 'min') ?? 0)
        const release = (e: React.SyntheticEvent<HTMLInputElement>) => {
          if (!node.action) return
          const current = Number(e.currentTarget.value)
          const merged = localKey ? { ...localState, [localKey]: current } : localState
          fire(node.action, merged)
        }
        return (
          <input
            key={key}
            type="range"
            min={num(node, 'min')}
            max={num(node, 'max')}
            step={num(node, 'step')}
            value={value}
            onChange={(e) => {
              if (localKey) setLocal(localKey, Number(e.target.value))
            }}
            onMouseUp={release}
            onTouchEnd={release}
          />
        )
      }
      case 'text_field': {
        const localKey = str(node, 'local')
        const isNumber = str(node, 'kind') === 'number'
        const value = localKey ? localState[localKey] : undefined
        return (
          <input
            key={key}
            type={isNumber ? 'number' : 'text'}
            value={(value as string | number | undefined) ?? ''}
            onChange={(e) => {
              if (!localKey) return
              setLocal(localKey, isNumber ? Number(e.target.value) : e.target.value)
            }}
          />
        )
      }
      case 'select': {
        const localKey = str(node, 'local')
        const value = localKey ? (localState[localKey] as string | undefined) : undefined
        const options = Array.isArray(node.options) ? (node.options as unknown[]) : []
        return (
          <select
            key={key}
            value={value ?? ''}
            onChange={(e) => {
              if (localKey) setLocal(localKey, e.target.value)
            }}
          >
            {options.map((o, i) => {
              const opt = asNode(o)
              if (!opt) return null
              const v = str(opt, 'value') ?? ''
              return (
                <option key={i} value={v}>
                  {str(opt, 'label') ?? v}
                </option>
              )
            })}
          </select>
        )
      }
      case 'dpad':
        return <Dpad key={key} node={node} onAction={(action) => fire(action)} />
      case 'when': {
        const branch = evalWhen(node.if, ctx) ? node.then : node.else
        return <div key={key}>{renderChildren(branch, `${key}.w`)}</div>
      }
      default:
        return (
          <div key={key} className="unsupported">
            unsupported widget: {type ?? 'unknown'}
          </div>
        )
    }
  }

  return <div className="phone-mock">{renderNode(ui, 'root')}</div>
}
