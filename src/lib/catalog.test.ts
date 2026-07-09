import { fetchCatalog, fetchCartridge } from './catalog'

const index = { apps: [{ name: 'hello', icon: 'Hi', version: '1.1.0', author: 'a', description: 'd',
  category: 'utilities', files: { py: 'apps/hello/hello.py', manifest: 'apps/hello/hello.manifest.json' } }] }

const fake = (async (url: RequestInfo | URL) => {
  const u = String(url)
  if (u.endsWith('index.json')) return new Response(JSON.stringify(index))
  if (u.endsWith('.py')) return new Response('class Hello:\n    name="hello"')
  if (u.endsWith('.manifest.json')) return new Response('{"name":"hello"}')
  return new Response('', { status: 404 })
}) as unknown as typeof fetch

test('fetchCatalog returns apps array', async () => {
  expect((await fetchCatalog(fake))[0].name).toBe('hello')
})
test('fetchCartridge pulls files and derives stem from py path', async () => {
  const c = await fetchCartridge(index.apps[0] as never, fake)
  expect(c.stem).toBe('hello')
  expect(c.py).toContain('class Hello')
  expect(c.manifest).toEqual({ name: 'hello' })
})
test('fetchCatalog throws on non-ok response', async () => {
  const notOk = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
  await expect(fetchCatalog(notOk)).rejects.toThrow()
})
test('fetchCartridge includes raw manifest/ui strings and parses optional ui', async () => {
  const entryWithUi = { ...index.apps[0], files: { ...index.apps[0].files, ui: 'apps/hello/hello.ui.json' } }
  const withUi = (async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.endsWith('.ui.json')) return new Response('{"type":"column"}')
    return fake(url)
  }) as unknown as typeof fetch
  const c = await fetchCartridge(entryWithUi as never, withUi)
  expect(c.manifestRaw).toBe('{"name":"hello"}')
  expect(c.ui).toEqual({ type: 'column' })
  expect(c.uiRaw).toBe('{"type":"column"}')
})
