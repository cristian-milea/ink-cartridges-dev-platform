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

test('Studio nav opens /studio, shows the empty state, and deep-links on refresh', async ({ page }) => {
  await page.goto('/')

  await page.locator('.studio-nav').getByRole('link', { name: 'Studio' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  // No cartridge loaded (no Pyodide needed) → the empty-state prompt.
  await expect(page.getByRole('heading', { name: /no cartridge loaded/i })).toBeVisible()

  // Deep link survives a hard refresh, same index.html fallback as /plugin.
  await page.reload()
  await expect(page.getByRole('heading', { name: /no cartridge loaded/i })).toBeVisible()

  // "Browse cartridges" returns to the store.
  await page.locator('.studio-empty-card').getByRole('link', { name: /browse cartridges/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /the cartridge store, in your browser/i })).toBeVisible()
})

test('footer carries the open-source note and GitHub link', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('.studio-footer')
  await expect(footer).toContainText(/open source/i)
  await expect(footer.getByRole('link', { name: /github/i })).toHaveAttribute(
    'href',
    'https://github.com/cristian-milea/ink-cartridges-dev-platform'
  )
})
