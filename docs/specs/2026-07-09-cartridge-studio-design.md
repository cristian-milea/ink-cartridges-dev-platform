# Ink Cartridge Studio — design

Date: 2026-07-09
Status: approved (brainstorming session with Cristi)

## Problem

Third-party developers cannot test cartridges today: the store builds of the
companion app can't sideload unreviewed code (store policy), and the only real
renderer is a physical Pwnagotchi. We need a developer environment where anyone
can build a cartridge, see how the Pi renders it, exercise the phone-side UI,
get validation feedback, and submit a PR — without us ever executing their code
on our infrastructure.

## Decision summary

A **fully client-side static web app** ("Ink Cartridge Studio") in this repo
(`ink-cartridges-dev-platform`), deployed to `ink-cartridges.cristimilea.ro`
via Cloudflare Pages (free tier). Developer Python runs in **Pyodide**
(CPython/WASM + Pillow) inside the visitor's own browser — no backend, so
there is nothing server-side to attack and hosting is free forever.

**No code is copied from the public `ink-cartridges` repo.** Everything the
Studio needs from it — the gallery `index.json`, cartridge files, the host
helpers (`host_alias.py`), and the validator (`validate_cartridges.py`) — is
fetched at runtime from `raw.githubusercontent.com`, the same source of truth
the Android app uses. The public repo stays authoritative; the Studio can
never drift on the parts it fetches verbatim.

Guiding principles: KISS, DRY, YAGNI. Prefer existing libraries over bespoke
code (Pyodide, json-logic-js for `when` conditions, an off-the-shelf React
setup). Build only what iteration one needs.

Rejected alternatives:
- **Local CLI simulator** (`pip install`): perfect fidelity but install
  friction kills the "easy first cartridge" goal. Possible phase-2 companion.
- **Server-side sandbox**: means running strangers' Python on our infra — the
  hardest version of the security requirement, plus ops cost.
- **Living inside the public repo**: rejected by owner; pull-on-the-fly gives
  the same no-drift property for the fetched pieces.

Stack: Vite + TypeScript + React, Pyodide, json-logic-js; vitest + one
Playwright smoke test.

## Scope: full support for all existing cartridges

The nine cartridges in the public repo's `apps/` are the acceptance suite.
Feature inventory they require (closed list):

- `render(draw, w, h)` (Pillow, 1-bit), `on_data(payload)`, `state()`,
  `interval_seconds` ticks.
- ui.json widgets: `column, row, spacer, divider, text, state_text, image,
  chart, button, switch, slider, text_field, select, when, dpad`
  (schema_version 1 and 2).
- Actions: `push, sync, set_local, request_permission`.
- Templates: `{{state.X}}, {{local.X}}, {{secret.X}}, {{location.X}}`.
- `data_source` HTTP sync (weather → Open-Meteo, rss → hnrss.org,
  tide-sun → WorldTides with `secret:worldtides` + location).

Definition of done for iteration one: every cartridge in the public `apps/`
loads from the gallery and is fully playable in the Studio.

## Architecture

### 1. Emulator core (e-ink half)

Pyodide with the prebuilt Pillow package plus a **host shim** — a small
plain-Python module replicating the device host contract:

- Registers the `ink_cartridge_host` alias by loading the public repo's
  `pwnagotchi-plugin/src/host_alias.py` **fetched at runtime** (verbatim, so
  helper behavior can't drift).
- Frame composition mirroring `apps.py::_render_app_frame`: 250×122 white
  1-bit image, taskbar geometry + seam line, app sub-image, render()
  exceptions caught and routed to the Studio console pane. (This part is
  reimplemented in the shim — `apps.py` imports pwnagotchi internals and
  can't be loaded verbatim; it is the one knowingly-duplicated piece.)
- Real DejaVuSansMono / DejaVuSansMono-Bold `.ttf`s loaded into Pyodide's
  virtual FS so `ImageFont.truetype("DejaVuSansMono-Bold", 12)` resolves and
  output is pixel-identical to the device.
- `interval_seconds` driven by a JS timer.

Frames blit to a `<canvas>` scaled ~3×, styled like the Waveshare 2.13" panel.

**Drift guard:** this repo's CI clones the public repo and pytest-renders
every `apps/` cartridge through both the real host path and the shim,
asserting pixel-identical frames. A host change that would desync the Studio
fails this repo's CI (scheduled + on PR).

### 2. Phone mock (ui.json half)

A TypeScript/React renderer for the full widget set above, including the dpad
swipe surface (8 directions + center tap) and the template engine. `when`
conditions are evaluated with **json-logic-js** (the schema's condition format
is JsonLogic). After every push/sync/tick the emulator polls `state()` and
re-evaluates `state_text` bindings and `when` conditions — the same loop the
Android app runs. Behavioral parity is the requirement; pixel parity with the
Compose UI is not.

### 3. Simulated device context

- **Location**: picker with presets + manual lat/lon/label.
- **Secrets**: panel keyed by the manifest's declared secrets.
- **Permissions**: toggles that `request_permission` flips.

All stored in `localStorage` only; nothing leaves the browser.

### 4. data_source sync

Replicates the app's `AppSyncer`: resolve URL templates → fetch → wrap as
`{"location": {...}, "fetched": <body>}` → `on_data`. Fetches go straight
from the browser. If a target API blocks CORS (verify per API during
implementation; Open-Meteo is known-good), fall back to a minimal Cloudflare
Worker CORS relay: GET-only, rate-limited, response-size-capped, credentials
stripped, executes nothing. Build the Worker only if a real cartridge needs
it — default deployment is 100% static.

### 5. Gallery

On load, fetch `index.json` + cartridge files from `raw.githubusercontent.com`.
Each approved cartridge is a card; opening one loads it into the emulator,
instantly playable. "Use as template" offers the three files as a download to
start a local cartridge from.

### 6. Local dev bridge

Primary flow: "Open local folder" via the File System Access API
(Chrome/Edge). The Studio polls file mtimes (~1s) and hot-reloads on save from
the dev's own IDE, preserving cartridge state where the module still loads.
Fallback (Safari/Firefox): drag-and-drop the cartridge files; re-drop to
refresh. No CLI in iteration one.

### 7. Validation & PR flow

The public repo's `validate_cartridges.py` runs **verbatim under Pyodide**
(fetched at runtime) against the loaded cartridge — developers see the exact
CI errors locally, live. A Submit screen shows the pass/fail checklist and
guided manual PR steps: fork link, git commands prefilled with the cartridge
name, PR template. No GitHub OAuth, no uploads, no tokens held anywhere.

### 8. Security posture

- User code executes only in the visitor's own browser sandbox (Pyodide WASM
  inside the JS sandbox).
- The site is static; no code-execution endpoint exists.
- Secrets/location live in `localStorage` on the visitor's machine.
- Only potential server surface is the optional CORS relay (dumb byte relay,
  rate-limited, no auth, no private-IP reachability on Workers).

### 9. Testing

- **pytest** (this repo's CI, against a fresh clone of the public repo):
  shim-vs-host golden frames for all `apps/` cartridges; shim unit tests.
- **vitest**: template engine, `when` evaluation, widget renderer, dpad swipe
  classification, AppSyncer wrapper shape.
- **Playwright** (one smoke): load Studio, open `hello` from gallery, push
  text via the phone mock, assert the canvas changed.

## Repo layout

```
ink-cartridges-dev-platform/
  src/               # TS: gallery, phone mock, panels, canvas, pyodide glue
  shim/              # plain-Python host shim (pytest-covered)
  public/fonts/      # DejaVu ttfs
  tests/             # pytest drift-guard (clones public repo in CI)
  docs/specs/        # this spec
```

## Out of scope (iteration one)

- GitHub OAuth / automated PR creation.
- CLI bridge / pip-installable simulator.
- In-browser code editor (devs use their own IDE via the folder bridge).
- Simulating companion-api status data, BLE/RFCOMM transport, or the
  Android app's discovery/polling stack.
- E-ink refresh-artifact cosmetics (nice-to-have, not required).
