import { test, expect } from '@playwright/test'
import { loadHelloCartridge } from './helpers'

test.setTimeout(180_000)

/** Every canvas pixel, as "r,g,b,a" strings. */
async function distinctPixels(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="eink-canvas"]') as HTMLCanvasElement
    // Same-origin Blob URL, so getImageData does not taint. See EinkCanvas.tsx.
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    const seen = new Set<string>()
    for (let i = 0; i < data.length; i += 4) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
    }
    return [...seen]
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme })

    test('e-ink canvas renders only pure black and pure white', async ({ page }) => {
      await loadHelloCartridge(page)

      // drawImage runs in an async img.onload; retry until the frame lands.
      await expect(async () => {
        const values = await distinctPixels(page)
        // A blank canvas is all (0,0,0,0) and would trivially fail the subset
        // check below, but assert both colours are present so an all-white
        // frame cannot pass either.
        expect(values.sort()).toEqual(['0,0,0,255', '255,255,255,255'])
      }).toPass({ timeout: 30_000 })
    })
  })
}
