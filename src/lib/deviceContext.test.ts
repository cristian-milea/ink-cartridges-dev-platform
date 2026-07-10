import { beforeEach } from 'vitest'
import { loadDeviceContext, saveDeviceContext, toTemplateCtx } from './deviceContext'

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

const KEY = 'studio.deviceContext'
const rawBlob = () => JSON.parse(localStorageMock.getItem(KEY) as string)

beforeEach(() => {
  ;(globalThis as unknown as Record<string, unknown>).localStorage = localStorageMock
  localStorageMock.clear()
})

test('persistSecrets=false does not write secrets to storage', () => {
  saveDeviceContext({ location: { lat: '1' }, secrets: { k: 'v' }, permissions: { location: true } }, false)
  const blob = rawBlob()
  expect('secrets' in blob).toBe(false)
  expect(blob.location).toEqual({ lat: '1' })
  expect(blob.permissions).toEqual({ location: true })
  expect(blob.persistSecrets).toBe(false)

  const loaded = loadDeviceContext()
  expect(loaded.dc.secrets).toEqual({})
  expect(loaded.persistSecrets).toBe(false)
  expect(loaded.migratedSecrets).toBe(false)
})

test('persistSecrets=true roundtrips secrets', () => {
  saveDeviceContext({ location: { lat: '1' }, secrets: { k: 'v' }, permissions: {} }, true)
  expect(rawBlob().secrets).toEqual({ k: 'v' })

  const loaded = loadDeviceContext()
  expect(loaded.dc.secrets).toEqual({ k: 'v' })
  expect(loaded.persistSecrets).toBe(true)
  expect(loaded.migratedSecrets).toBe(false)
})

test('legacy blob migrates secrets and scrubs storage', () => {
  // Old format: secrets present, no persistSecrets flag.
  localStorageMock.setItem(KEY, JSON.stringify({ location: { lat: '1' }, secrets: { K: 'v' }, permissions: { p: true } }))

  const loaded = loadDeviceContext()
  expect(loaded.dc.secrets.K).toBe('v')
  expect(loaded.persistSecrets).toBe(false)
  expect(loaded.migratedSecrets).toBe(true)

  // Storage was rewritten without the secrets key.
  const blob = rawBlob()
  expect('secrets' in blob).toBe(false)
  expect(blob.persistSecrets).toBe(false)
  expect(blob.location).toEqual({ lat: '1' })
  expect(blob.permissions).toEqual({ p: true })
})

test('defaults when empty', () => {
  localStorageMock.clear()
  const loaded = loadDeviceContext()
  expect(loaded.dc).toEqual({ location: {}, secrets: {}, permissions: {} })
  expect(loaded.persistSecrets).toBe(false)
  expect(loaded.migratedSecrets).toBe(false)
})

test('toTemplateCtx merges', () => {
  const t = toTemplateCtx({ location: { lat: '1' }, secrets: { s: 'x' }, permissions: {} }, { a: 1 }, { b: 2 })
  expect(t).toEqual({ state: { a: 1 }, local: { b: 2 }, secret: { s: 'x' }, location: { lat: '1' } })
})
