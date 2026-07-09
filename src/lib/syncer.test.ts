import { decodeFetched, buildEnvelope, locationFromCtx, checkNeeds, runSync } from './syncer'
import { type DataSource } from './syncer'
import { EMPTY_CTX, type TemplateCtx } from './template'

const locCtx: TemplateCtx = { ...EMPTY_CTX, location: { lat: '50.8', lon: '-0.1', label: 'Brighton' } }

test('decodeFetched: blank -> null, xml -> raw string, default -> parsed JSON', () => {
  expect(decodeFetched('  ')).toBeNull()
  expect(decodeFetched('<rss/>', 'xml')).toBe('<rss/>')
  expect(decodeFetched('{"a":1}')).toEqual({ a: 1 })
})
test('locationFromCtx parses doubles, null when empty/unparseable', () => {
  expect(locationFromCtx(locCtx)).toEqual({ lat: 50.8, lon: -0.1, label: 'Brighton' })
  expect(locationFromCtx(EMPTY_CTX)).toBeNull()
})
test('envelope shape', () => {
  expect(buildEnvelope(null, { a: 1 })).toEqual({ location: null, fetched: { a: 1 } })
})
test('checkNeeds: location required but unset', () => {
  const ds: DataSource = { type: 'http', url: 'x', needs: ['location'] }
  expect(checkNeeds(ds, EMPTY_CTX)).toMatch(/location/i)
  expect(checkNeeds(ds, locCtx)).toBeNull()
})
test('runSync resolves templates in url and wraps result', async () => {
  const ds: DataSource = { type: 'http', url: 'https://x/?lat={{location.lat}}' }
  const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
    expect(String(url)).toBe('https://x/?lat=50.8')
    return new Response('{"t":7}', { status: 200 })
  }) as unknown as typeof fetch
  await expect(runSync(ds, locCtx, fakeFetch)).resolves.toEqual({
    location: { lat: 50.8, lon: -0.1, label: 'Brighton' }, fetched: { t: 7 },
  })
})
test('runSync rejects non-GET, non-http, HTTP errors', async () => {
  await expect(runSync({ type: 'ftp', url: 'x' }, locCtx)).rejects.toThrow(/Unsupported/)
  await expect(runSync({ type: 'http', method: 'POST', url: 'x' }, locCtx)).rejects.toThrow(/GET/)
  const err404 = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
  await expect(runSync({ type: 'http', url: 'https://x/' }, locCtx, err404)).rejects.toThrow(/404/)
})
