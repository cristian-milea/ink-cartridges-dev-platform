# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Ink Cartridge Studio** — a 100%-static, browser-based dev/preview platform for
authors of *Ink Cartridge* apps (the cartridges for the pwnagotchi companion app,
`ink-cartridge-app`). A developer builds a cartridge locally and sees exactly how
the Pi's e-ink screen renders it **and** drives the phone-side UI, all in the
browser — without sideloading into the store apps.

Deploys to Cloudflare Pages (`ink-cartridges.cristimilea.ro`). Design/plan docs:
`docs/specs/` and `docs/plans/`.

## The two invariants that shape everything

1. **No backend, ever.** Developer Python runs in the visitor's own browser via
   **Pyodide + Pillow** (WASM). Nothing server-side executes user code. This is
   the security model — do not introduce a server that runs cartridge code, and
   do not add a build step that evaluates fetched content outside the Pyodide
   sandbox. The only optional server piece contemplated is a dumb CORS relay
   Worker (not built; see CORS below).

2. **Pull-on-the-fly, never vendor.** Cartridge files, the device host's
   `host_alias.py`, `validate_cartridges.py`, and the catalog `index.json` are
   **fetched at runtime** from the public `cristian-milea/ink-cartridges` repo
   (base URL is `RAW_BASE` in `src/lib/constants.ts`). Do **not** copy those
   files into this repo. The **one sanctioned exception** is
   `shim/studio_host.py`'s frame-composition code, which is a line-faithful port
   of that repo's `pwnagotchi-plugin/src/apps.py` — and it is fenced by the drift
   guard (below). Adding any other copied logic breaks the design contract.

## Architecture

Data flow: **gallery/local folder → fetch cartridge files → Pyodide shim loads &
renders → `<canvas>` (e-ink) + React `PhoneMock` (phone UI) → phone actions
`push` into the cartridge's `on_data` → re-render.**

- **`shim/studio_host.py`** — the Python "host shim". Replicates the device
  host's e-ink frame composition (250×122, 1-bit; left taskbar `TASKBAR_W=16`,
  `ICON_H=16`, seam line) and the cartridge lifecycle (`Session.load/push/
  published_state/render_png`). `install_host_alias(source_text)` execs the
  **fetched** `host_alias.py` and registers `ink_cartridge_host`. Font resolution
  is monkeypatched so `ImageFont.truetype("DejaVuSansMono-Bold", n)` maps to the
  bundled ttfs (`public/fonts/`, `STUDIO_FONTS_DIR`) — this is why the shim and
  the real host produce identical glyphs.
- **`src/lib/emulator.ts`** — the `Emulator` class: the only stateful bridge to
  Pyodide. `create()` loads Pyodide+Pillow, writes fonts + the shim into the
  virtual FS, fetches+installs `host_alias.py`. `load()` builds the new session
  into a local var and only tears down the old one **on success** (a hot-reload
  with a syntax error keeps the last good session + its repaint interval alive).
  Every transient PyProxy is `.destroy()`-ed. There is **one** long-lived
  `Emulator` per app session — do not create per-cartridge instances.
- **`src/lib/` pure logic (all unit-tested, behavior-ported from the Android
  app):** `template.ts` (`{{scope.key}}` resolution — regex is byte-identical to
  the Android `TemplateEngine`), `whenLogic.ts` (json-logic `when`, **fail-closed**
  → `false` on malformed rules), `syncer.ts` (`data_source` fetch → `{location,
  fetched}` envelope), `dpadGeometry.ts` (swipe→direction), `catalog.ts` (fetch
  index + cartridge files, derive `stem` from the `.py` basename),
  `deviceContext.ts` (location/secrets/permissions, **localStorage only**),
  `constants.ts` (`RAW_BASE`, `PYODIDE_URL`, screen geometry).
- **`src/components/`** — `PhoneMock` renders the cartridge's `ui.json` widget
  tree (all widgets share one local-state map; actions template-resolve then
  bubble via `onAction`); `Dpad`, `EinkCanvas`, `Gallery`, `ContextPanels`,
  `SyncCard`, `ValidationPanel` (runs the real validator in Pyodide),
  `SubmitPanel` (guided PR steps, gated on validation passing), `LocalBridge`
  (File System Access API folder-picker with mtime-polled hot reload; drag-drop
  fallback). `src/App.tsx` wires them to the single `Emulator`.

## Contract facts that differ from the spec's prose

When they conflict, the code below is correct (the spec predates these):
- The cartridge state hook is **`published_state()`** (returns a dict), not
  `state()`.
- A phone **`push`** action delivers its payload to `on_data` **raw**. Only a
  **`sync`** action wraps in the `{location, fetched}` envelope.
- The validator's candidate directory must be named from **`manifest.name`**, not
  the `.py` stem (hyphenated names like `tide-sun` have underscored `.py` files).
- `evalWhen` must stay **fail-closed** (non-object / unknown-operator / null →
  `false`).

## Commands

```sh
npm install
npm run dev            # Vite dev server (localhost:5173)
npm run build          # tsc -b (strict) + vite build → static dist/
npm run lint           # oxlint
npm run test           # vitest (unit)
npm run test -- template   # single file / pattern
npm run test:watch
npm run test:e2e       # Playwright smoke (starts dev server; ~30-60s Pyodide warmup)
```

**Python drift guard / shim tests** (not part of `npm`; needs Python + `pip
install pillow pytest`). Both env vars are required — `INK_CARTRIDGES_DIR` points
at a **local checkout** of the public `ink-cartridges` repo, `STUDIO_FONTS_DIR`
at this repo's fonts:

```sh
STUDIO_FONTS_DIR=$PWD/public/fonts \
INK_CARTRIDGES_DIR=$HOME/projects/ink-cartridges \
python3 -m pytest tests/ -v
```

`tests/test_drift.py` renders every cartridge in `INK_CARTRIDGES_DIR/apps/`
through **both** `shim/studio_host.py` and the **real** `apps.py`, asserting
pixel-identical frames — this is what keeps the shim honest as the upstream host
evolves. It loads two independent instances per cartridge under a frozen
`time.time` (several cartridges self-mutate in `render()` or seed RNG from the
clock). **If a drift test fails, fix the shim to match `apps.py` — never edit the
test to pass.** CI (`.github/workflows/ci.yml`) runs `web` (vitest+build), `drift`
(clones upstream, runs pytest), and `e2e` (Playwright), plus a daily cron so
upstream host changes surface even with no activity here.

**Palette drift guard** — same idea, one layer up: `src/lib/palette.test.ts`
diffs `src/styles/tokens.css` against `ink-cartridge-app`'s
`ios/InkCartridge/Theme/InkPalette.swift` and `Color.kt`, so the studio's
colours can't quietly drift from the native apps'. It needs
`INK_CARTRIDGE_APP_DIR` pointing at a **local checkout** of that sibling repo
(same "fetched/checked-out, never vendored" rule as `INK_CARTRIDGES_DIR`
above) and **skips** without it, so `npm run test` stays green either way:

```sh
INK_CARTRIDGE_APP_DIR=/path/to/ink-cartridge-app npm run test -- palette
```

## Constraints when editing

- TypeScript **strict** + `verbatimModuleSyntax` are on — use `import type` for
  type-only imports. Effectively one justified `any` exists (the `PyProxy`
  escape hatch in `emulator.ts`).
- Styling is a three-layer cascade, the first two `@import`-ed at the top of
  `src/index.css`: **`src/styles/tokens.css`** (colour/spacing/font custom
  properties, declared once in `:root` and overridden for dark in a
  `prefers-color-scheme: dark` block) → **`src/styles/primitives.css`** (the
  `.ink-*` vocabulary — `.ink-panel`, `.ink-btn`, `.ink-field`, `.ink-badge`,
  `.ink-section-header`, `.ink-divider` — ported from the app's `Eink.kt`) →
  **`src/index.css`** (layout plus the remaining semantic classNames —
  `.sync-card`, `.gallery-card`, `.phone-mock`, …). Components compose `.ink-*`
  primitives with their own semantic class, e.g. `className="ink-panel
  submit-panel"`. There is **no Tailwind** — do not use utility classes.
- **The e-ink invariant.** Never `filter`, `opacity`, `mix-blend-mode`, or
  `backdrop-filter` on `.eink` or any of its ancestors, and never any
  `image-rendering` value other than `pixelated`. Any of these can blend a
  crisp black/white pixel into an intermediate grey, which is not how the
  physical e-ink display renders. `e2e/eink-fidelity.spec.ts` enforces this by
  reading every canvas pixel under both colour schemes and asserting only pure
  black and pure white are present.
- Fonts are DejaVu Sans Mono 2.37 in `public/fonts/` (bundling assets is fine;
  bundling *code* from `ink-cartridges` is not).

## CORS reality (browser-verified)

Some `data_source` APIs work from the browser, some don't:
- **Open-Meteo** (weather) — works, CORS headers present.
- **hnrss.org** (rss) — **blocked**, no CORS headers (would need the optional
  relay Worker; not built).
- **WorldTides** (tide-sun) — needs an API key; the Sync button is needs-gated.
