import { test, expect } from '@playwright/test'

// Pyodide (WASM Python runtime) loads on first render, which takes ~30-60s in
// CI (more under CDN/network variance). Give this single test generous room.
test.setTimeout(180_000)

test('gallery → hello → push updates the e-ink canvas', async ({ page }) => {
  await page.goto('/')

  // The catalog (gallery cards) loads fast over the network, but Pyodide
  // (WASM Python) is much slower to initialize in the background — clicking
  // "Load" before it's ready is a silent no-op (App.handleSelect bails out
  // while emulatorRef.current is still null). Wait for the "pyodide ready"
  // log line before touching the gallery.
  await expect(page.locator('.console-pane')).toHaveText('pyodide ready', { timeout: 150_000 })

  // The gallery card's name isn't itself clickable — its "Load" button loads
  // the cartridge into the emulator.
  const card = page.locator('.gallery-card').filter({ has: page.getByText('hello', { exact: true }) })
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('button', { name: 'Load' }).click()

  const canvas = page.getByTestId('eink-canvas')
  // Loading fetches the cartridge's 3 files from the live catalog repo and
  // runs it through the Pyodide-hosted Python emulator, so this can be slow.
  await expect(canvas).toBeVisible({ timeout: 60_000 })

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
