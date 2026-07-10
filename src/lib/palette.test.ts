/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP_DIR = process.env.INK_CARTRIDGE_APP_DIR

const __dirname = dirname(fileURLToPath(import.meta.url))

/** `--paper-dim` → `paperDim`, so CSS names line up with InkPalette.swift. */
function toCamel(token: string): string {
  return token.replace(/^--/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

function hexesIn(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of css.matchAll(/(--[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out[m[1]] = m[2].toUpperCase()
  }
  return out
}

function readTokens() {
  const css = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8')
  // The dark overrides live in the one @media block; everything before it is light.
  const [lightSrc, darkSrc = ''] = css.split('@media')
  return { light: hexesIn(lightSrc), dark: hexesIn(darkSrc) }
}

describe('token layer', () => {
  it('declares every colour token in both modes', () => {
    const { light, dark } = readTokens()
    for (const t of ['--paper', '--paper-dim', '--ink', '--ink-dim', '--red', '--yellow']) {
      expect(light[t], `${t} missing from :root`).toMatch(/^#[0-9A-F]{6}$/)
      expect(dark[t], `${t} missing from the dark @media block`).toMatch(/^#[0-9A-F]{6}$/)
    }
    expect(light['--red-dim']).toMatch(/^#[0-9A-F]{6}$/)
  })
})

// The app repo is a sibling checkout, never vendored — same contract as
// tests/test_drift.py and INK_CARTRIDGES_DIR.
describe.skipIf(!APP_DIR)('palette drift vs ink-cartridge-app', () => {
  it('matches InkPalette.swift for all six shared colours', () => {
    const swift = readFileSync(join(APP_DIR!, 'ios/InkCartridge/Theme/InkPalette.swift'), 'utf8')
    const { light, dark } = readTokens()

    const pairs = [...swift.matchAll(
      /static let (\w+) = dynamic\(light: 0x([0-9A-Fa-f]{6}), dark: 0x([0-9A-Fa-f]{6})\)/g
    )]
    expect(pairs.length, 'InkPalette.swift parse failed').toBe(6)

    for (const [, name, lightHex, darkHex] of pairs) {
      const token = Object.keys(light).find((t) => toCamel(t) === name)
      expect(token, `no CSS token for InkPalette.${name}`).toBeDefined()
      expect(light[token!], `${token} light`).toBe(`#${lightHex.toUpperCase()}`)
      expect(dark[token!], `${token} dark`).toBe(`#${darkHex.toUpperCase()}`)
    }
  })

  it('--red-dim matches Color.kt EinkRedDim', () => {
    // --red-dim has no iOS counterpart; Color.kt is its only source of truth.
    const kt = readFileSync(
      join(APP_DIR!, 'app/app/src/main/java/io/github/cristianmilea/inkcartridgeapp/ui/theme/Color.kt'),
      'utf8'
    )
    const m = kt.match(/val EinkRedDim = Color\(0xFF([0-9A-Fa-f]{6})\)/)
    expect(m, 'EinkRedDim not found in Color.kt').not.toBeNull()
    expect(readTokens().light['--red-dim']).toBe(`#${m![1].toUpperCase()}`)
  })
})
