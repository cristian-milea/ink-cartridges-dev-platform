import { test, expect } from '@playwright/test'

// These are pure client-side routing checks — no Pyodide needed, so they're fast.
test('header nav routes to the plugin and Cartridge OS pages and survives refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /the cartridge store, in your browser/i })).toBeVisible()

  const nav = page.locator('.studio-nav')
  await nav.getByRole('link', { name: 'Pwnagotchi plugin' }).click()
  await expect(page).toHaveURL(/\/plugin$/)
  await expect(page.getByRole('heading', { name: /install the ink cartridge plugin/i })).toBeVisible()

  // History-API deep link must survive a hard refresh (dev server + Cloudflare
  // Pages both fall back to index.html when no 404.html exists).
  await page.reload()
  await expect(page.getByRole('heading', { name: /install the ink cartridge plugin/i })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('heading', { name: /the cartridge store, in your browser/i })).toBeVisible()

  await page.goto('/cartridge-os')
  await expect(page.getByRole('heading', { name: /^cartridge os$/i })).toBeVisible()
  // Coming-soon page content must not leak the pwnagotchi origin (the header
  // nav's "Pwnagotchi plugin" link is separate chrome, so scope to .page).
  await expect(page.locator('.page')).not.toContainText(/pwnagotchi/i)
})
