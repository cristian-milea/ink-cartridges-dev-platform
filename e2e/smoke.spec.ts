import { test, expect } from '@playwright/test'
import { loadHelloCartridge } from './helpers'

// Pyodide (WASM Python runtime) loads on first render, which takes ~30-60s in
// CI (more under CDN/network variance). Give this single test generous room.
test.setTimeout(180_000)

test('gallery → hello → push updates the e-ink canvas', async ({ page }) => {
  const canvas = await loadHelloCartridge(page)

  // hello's ui.json (apps/hello/hello.ui.json in cristian-milea/ink-cartridges)
  // is: a text_field (local "msg") + a "Send" button whose action pushes
  // {"text": "{{local.msg}}"} to the device. Drive it and confirm the e-ink
  // frame actually changes.
  const before = await canvas.screenshot()
  await page.getByRole('textbox').first().fill('smoke!')
  await page.getByRole('button', { name: /send/i }).first().click()

  await expect(async () => {
    const after = await canvas.screenshot()
    expect(Buffer.compare(after, before)).not.toBe(0)
  }).toPass({ timeout: 10_000 })
})
