import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Waits for Pyodide, loads the `hello` cartridge, and waits for the e-ink
 * canvas to become visible. Returns the canvas locator.
 *
 * This does NOT drive a push, so the canvas may still be mid-paint when it
 * returns (`EinkCanvas.tsx` draws inside an async `img.onload`). Callers
 * that need to read painted pixels must wait for the frame themselves, e.g.
 * with an `expect(async () => {...}).toPass({ timeout })` retry loop.
 */
export async function loadHelloCartridge(page: Page): Promise<Locator> {
  await page.goto('/')

  // Clicking Load before Pyodide is ready is a silent no-op (App.handleSelect
  // bails while emulatorRef.current is null).
  await expect(page.locator('.console-pane')).toHaveText('pyodide ready', { timeout: 150_000 })

  const card = page.locator('.gallery-card').filter({ has: page.getByText('hello', { exact: true }) })
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('button', { name: 'Load' }).click()

  const canvas = page.getByTestId('eink-canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  return canvas
}
