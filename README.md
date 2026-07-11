# Ink Cartridge Studio

A browser-based dev/preview platform for [Ink Cartridge](https://github.com/cristian-milea/ink-cartridges)
apps — the plugin system for the `ink-cartridge-app` Pwnagotchi companion.
Third-party developers can't sideload unreviewed code into the store builds of
the companion app, and the only real renderer is a physical Pwnagotchi. The
Studio fills that gap: build a cartridge, see exactly how the Pi's e-ink panel
renders it, and drive the phone-side UI mock — all without ever sideloading
into the store app.

## Architecture

The Studio is a **100% static site**, deployed to
[ink-cartridge.cristimilea.ro](https://ink-cartridge.cristimilea.ro) via
Cloudflare Pages. There is no backend, and this is deliberate: it's the
security model. Developer Python never runs on any server — it runs in
**Pyodide** (CPython compiled to WASM, plus Pillow) inside the visitor's own
browser sandbox. Nothing server-side ever executes user code.

- **`shim/studio_host.py`** — a small plain-Python module that replicates the
  device host's e-ink frame composition (250×122 1-bit canvas, taskbar,
  render() exception routing). It's the one piece of logic knowingly
  duplicated from the public `ink-cartridges` host — everything else (the
  `host_alias.py` helpers, `validate_cartridges.py`) is fetched verbatim at
  runtime instead of copied.
- **`tests/` (pytest drift guard)** — CI clones the public `ink-cartridges`
  repo and renders every real cartridge through *both* the shim and the real
  device host, asserting pixel-identical frames. If the device host ever
  changes in a way that would desync the shim, this repo's CI fails — the
  Studio can't silently drift out of sync with the real device.
- **Nothing is vendored.** Cartridge content, `host_alias.py`, and
  `validate_cartridges.py` are all pulled on the fly from
  `raw.githubusercontent.com/cristian-milea/ink-cartridges` — the same public
  repo is the single source of truth, and the Studio always reflects its
  current `main`.

## Data-source / CORS findings

Cartridges with a `data_source` sync fetch directly from the browser. Verified
against the live APIs (see `.superpowers/sdd/task-12-report.md` for the full
writeup):

| API | Cartridge | Works from browser fetch? | Notes |
|---|---|---|---|
| Open-Meteo | `weather` | Yes | Sends CORS headers; syncs end-to-end with no relay. |
| hnrss.org | `rss` | No | CORS-blocked (`TypeError: Failed to fetch`, no CORS headers sent). Would need an optional relay Worker to preview in-browser. |
| WorldTides | `tide-sun` | Needs-gated | Requires an API key (`secret:worldtides`); the Sync button stays disabled until one is set. |

The optional CORS relay Worker for `rss` is **intentionally not built** —
only `weather` needs nothing extra to preview, and the default deployment
stays fully static.

## Local development

```sh
npm install
npm run dev        # vite dev server
npm run test       # vitest unit tests
npm run build      # tsc -b && vite build
```

The pytest suite (host shim unit tests + the drift guard) needs Python plus:

```sh
pip install pillow pytest
```

It also needs two env vars: `INK_CARTRIDGES_DIR` (a local checkout of the
public `cristian-milea/ink-cartridges` repo) and `STUDIO_FONTS_DIR` (the
bundled font directory — `./public/fonts`). Example:

```sh
INK_CARTRIDGES_DIR=~/projects/ink-cartridges STUDIO_FONTS_DIR=./public/fonts pytest tests -v
```

`npm run test:e2e` runs the single Playwright smoke test (loads the Studio,
opens `hello` from the gallery, pushes text, asserts the e-ink canvas
changed).

## Cartridge author quickstart

1. Open the Studio and click **Open local folder** (Chrome/Edge — uses the
   File System Access API) pointed at your cartridge's directory, or drag
   the files onto the drop zone (Safari/Firefox fallback).
2. Edit the cartridge in your own IDE. The Studio polls for file changes and
   hot-reloads the preview on save.
3. Click **Check cartridge** to run the real CI validator
   (`validate_cartridges.py`, fetched verbatim from the public repo) against
   your files — the same errors you'd see in CI, live in the browser.
4. Click **Submit** for copy-paste PR steps: fork link, prefilled git
   commands, and the PR template.

## Fonts

Bundled: DejaVu Sans Mono 2.37 (`public/fonts/DejaVuSansMono.ttf` and
`DejaVuSansMono-Bold.ttf`), used so Pyodide's `ImageFont.truetype(...)`
renders pixel-identical output to the real device. DejaVu fonts are based on
Bitstream Vera and distributed under a permissive, public-domain-like license
— see the [DejaVu Fonts project](https://dejavu-fonts.github.io/) for the
full license text.

## License

MIT — see [LICENSE](LICENSE).
