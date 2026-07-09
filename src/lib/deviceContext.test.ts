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

beforeEach(() => {
  ;(globalThis as unknown as Record<string, unknown>).localStorage = localStorageMock
  localStorageMock.clear()
})

test('roundtrip via localStorage', () => {
  saveDeviceContext({ location: { lat: '1', lon: '2', label: 'X' }, secrets: { k: 'v' }, permissions: { location: true } })
  expect(loadDeviceContext().secrets.k).toBe('v')
})
test('defaults when empty', () => {
  localStorageMock.clear()
  expect(loadDeviceContext()).toEqual({ location: {}, secrets: {}, permissions: {} })
})
test('toTemplateCtx merges', () => {
  const t = toTemplateCtx({ location: { lat: '1' }, secrets: { s: 'x' }, permissions: {} }, { a: 1 }, { b: 2 })
  expect(t).toEqual({ state: { a: 1 }, local: { b: 2 }, secret: { s: 'x' }, location: { lat: '1' } })
})
