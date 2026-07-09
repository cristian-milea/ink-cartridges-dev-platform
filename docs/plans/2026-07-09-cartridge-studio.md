# Ink Cartridge Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully client-side static web app (Cloudflare Pages) where cartridge developers preview the e-ink render (Pyodide + Pillow in-browser), drive the phone-side ui.json mock, validate with the real CI validator, and get guided PR steps — with all `ink-cartridges` repo content pulled on the fly, never copied.

**Architecture:** React SPA (Vite + TS). Python (developer cartridges, `host_alias.py`, `validate_cartridges.py`) runs in Pyodide; a small Python shim (`shim/studio_host.py`) replicates the device host's frame composition and lifecycle. TS side ports the Android app's TemplateEngine / AppSyncer / widget renderer behavior. A pytest drift-guard renders every public cartridge through the shim AND the real host code and asserts pixel-identical frames.

**Tech Stack:** Vite, React 18, TypeScript (strict), json-logic-js, Pyodide 0.26 (CDN) + Pillow, vitest + @testing-library/react, pytest, Playwright (1 smoke test).

**Context:** Approved spec at `docs/specs/2026-07-09-cartridge-studio-design.md` in this repo (`/Users/xis/projects/ink-cartridges-dev-platform`). Store apps can't sideload unreviewed cartridges; the only real renderer is a physical Pwnagotchi. The Studio gives third-party devs a zero-install browser dev loop with nothing executing server-side. Spec corrections discovered during contract extraction (apply these, not the spec's wording): the cartridge state hook is **`published_state()`** (not `state()`); phone-side state comes from the host's `state` command shape `{active, apps, published, now}`; `push` payloads reach `on_data` **raw** (only `sync` wraps in `{"location":…, "fetched":…}`).

## Global Constraints

- **No code copied from `ink-cartridges`.** Runtime-fetch base: `https://raw.githubusercontent.com/cristian-milea/ink-cartridges/main/` — used for `index.json`, cartridge files, `pwnagotchi-plugin/src/host_alias.py`, `validate_cartridges.py`.
- 100% static deployment; no backend. (CORS relay Worker only if a cartridge API actually blocks browser fetch — verify first, don't build preemptively.)
- KISS / DRY / YAGNI; prefer existing libraries over bespoke code.
- Display geometry: 250×122, 1-bit, white=255. `TASKBAR_W = 16`, `ICON_H = 16`, taskbar side `"left"` default.
- Fonts: DejaVuSansMono + DejaVuSansMono-Bold `.ttf` bundled in `public/fonts/` (fonts are assets, not repo code — bundling is allowed).
- Template placeholder regex (must match Android exactly): `\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}`; missing key → empty string; only **string** JSON leaves are template-resolved.
- Secrets/location/permissions live in `localStorage` only.
- All tests green before each commit. Node ≥ 20, Python ≥ 3.11 for pytest.
- pytest drift guard reads a local checkout via env `INK_CARTRIDGES_DIR` (CI clones the public repo; never vendored).

## File Structure

```
ink-cartridges-dev-platform/
  package.json  vite.config.ts  tsconfig.json  index.html
  public/fonts/DejaVuSansMono.ttf  public/fonts/DejaVuSansMono-Bold.ttf
  shim/studio_host.py          # Python host shim (runs in Pyodide AND under pytest)
  src/lib/constants.ts         # RAW_BASE, geometry constants
  src/lib/template.ts          # TemplateEngine port
  src/lib/whenLogic.ts         # json-logic-js wrapper
  src/lib/syncer.ts            # AppSyncer port (decodeFetched, envelope, sync)
  src/lib/catalog.ts           # index.json + cartridge file fetching
  src/lib/deviceContext.ts     # location/secrets/permissions stores (localStorage)
  src/lib/emulator.ts          # Pyodide glue: load, push, tick, frame, validate
  src/lib/dpadGeometry.ts      # swipe → direction classification (pure)
  src/components/EinkCanvas.tsx
  src/components/PhoneMock.tsx # ui.json widget renderer (all widgets except dpad)
  src/components/Dpad.tsx
  src/components/SyncCard.tsx
  src/components/ContextPanels.tsx  # location / secrets / permissions
  src/components/Gallery.tsx
  src/components/LocalBridge.tsx    # FS Access API + drag-drop
  src/components/ValidationPanel.tsx
  src/components/SubmitPanel.tsx
  src/App.tsx  src/main.tsx
  tests/test_shim.py  tests/test_drift.py   # pytest
  e2e/smoke.spec.ts                         # Playwright
  docs/specs/…                              # existing spec
```

---

### Task 1: Scaffold, fonts, constants

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/lib/constants.ts`, `public/fonts/*.ttf`, `.gitignore`
- Test: `src/lib/constants.test.ts` (trivial, proves vitest wiring)

**Interfaces:**
- Produces: `RAW_BASE`, `SCREEN_W=250`, `SCREEN_H=122`, `TASKBAR_W=16`, `ICON_H=16`, `PYODIDE_URL` consumed by all later tasks.

- [ ] **Step 1: Scaffold Vite app + deps**

```bash
cd /Users/xis/projects/ink-cartridges-dev-platform
npm create vite@latest . -- --template react-ts
npm i json-logic-js
npm i -D vitest @testing-library/react @testing-library/user-event jsdom @types/json-logic-js
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.
Add to `vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
})
```

- [ ] **Step 2: Download DejaVu fonts into public/fonts/**

```bash
mkdir -p public/fonts /tmp/dejavu && cd /tmp/dejavu
curl -sL -o dejavu.tar.bz2 https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2
tar xjf dejavu.tar.bz2
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono-Bold.ttf \
   /Users/xis/projects/ink-cartridges-dev-platform/public/fonts/
```

(If the URL 404s, `brew list --verbose font-dejavu` or copy from the macOS install — any DejaVu 2.37 ttf is fine; record provenance in README later.)

- [ ] **Step 3: Write constants + trivial test**

`src/lib/constants.ts`:
```ts
export const RAW_BASE =
  'https://raw.githubusercontent.com/cristian-milea/ink-cartridges/main/'
export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
export const SCREEN_W = 250
export const SCREEN_H = 122
export const TASKBAR_W = 16
export const ICON_H = 16
```

`src/lib/constants.test.ts`:
```ts
import { RAW_BASE, SCREEN_W } from './constants'
test('constants sane', () => {
  expect(RAW_BASE.endsWith('/')).toBe(true)
  expect(SCREEN_W).toBe(250)
})
```

- [ ] **Step 4: Verify** — Run: `npm run test` → PASS; `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold vite+react+ts, vitest, fonts, constants"
```

---

### Task 2: Template engine (TS port of Android `TemplateEngine`)

**Files:**
- Create: `src/lib/template.ts`
- Test: `src/lib/template.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TemplateCtx {
    state: Record<string, unknown>
    local: Record<string, unknown>
    secret: Record<string, string>
    location: Record<string, string>   // keys: lat, lon, label
  }
  export function resolveString(s: string, ctx: TemplateCtx): string
  export function resolveJson(el: unknown, ctx: TemplateCtx): unknown
  export const EMPTY_CTX: TemplateCtx
  ```

- [ ] **Step 1: Write failing tests** (`src/lib/template.test.ts`) — port the Android semantics:

```ts
import { resolveString, resolveJson, TemplateCtx } from './template'

const ctx: TemplateCtx = {
  state: { count: 42, msg: 'hi' },
  local: { bet: '10' },
  secret: { worldtides: 'KEY' },
  location: { lat: '50.82', lon: '-0.14', label: 'Brighton' },
}

test('resolves all four scopes', () => {
  expect(resolveString('{{state.msg}} {{local.bet}} {{secret.worldtides}} {{location.lat}}', ctx))
    .toBe('hi 10 KEY 50.82')
})
test('numbers render as literal text', () => {
  expect(resolveString('n={{state.count}}', ctx)).toBe('n=42')
})
test('missing key or unknown scope -> empty string', () => {
  expect(resolveString('[{{state.nope}}][{{bogus.x}}][{{noDot}}]', ctx)).toBe('[][][]')
})
test('whitespace inside braces tolerated', () => {
  expect(resolveString('{{ state.msg }}', ctx)).toBe('hi')
})
test('resolveJson resolves only string leaves, keys untouched', () => {
  const payload = { action: 'deal', bet: '{{local.bet}}', n: 7, deep: ['{{state.msg}}', true] }
  expect(resolveJson(payload, ctx)).toEqual({ action: 'deal', bet: '10', n: 7, deep: ['hi', true] })
})
```

- [ ] **Step 2: Run** `npm run test -- template` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/template.ts`:

```ts
export interface TemplateCtx {
  state: Record<string, unknown>
  local: Record<string, unknown>
  secret: Record<string, string>
  location: Record<string, string>
}
export const EMPTY_CTX: TemplateCtx = { state: {}, local: {}, secret: {}, location: {} }

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g

function lookup(path: string, ctx: TemplateCtx): string {
  const dot = path.indexOf('.')
  if (dot < 0) return ''
  const scope = path.slice(0, dot)
  const key = path.slice(dot + 1)
  const bag = (ctx as unknown as Record<string, Record<string, unknown>>)[scope]
  if (!bag || !(key in bag)) return ''
  const v = bag[key]
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function resolveString(s: string, ctx: TemplateCtx): string {
  return s.replace(PLACEHOLDER, (_, path: string) => lookup(path, ctx))
}

export function resolveJson(el: unknown, ctx: TemplateCtx): unknown {
  if (typeof el === 'string') return resolveString(el, ctx)
  if (Array.isArray(el)) return el.map((x) => resolveJson(x, ctx))
  if (el !== null && typeof el === 'object')
    return Object.fromEntries(Object.entries(el).map(([k, v]) => [k, resolveJson(v, ctx)]))
  return el
}
```

- [ ] **Step 4: Run** `npm run test -- template` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: template engine (Android TemplateEngine port)"`

---

### Task 3: `when` condition evaluation (json-logic-js)

**Files:**
- Create: `src/lib/whenLogic.ts`
- Test: `src/lib/whenLogic.test.ts`

**Interfaces:**
- Consumes: `TemplateCtx` from Task 2.
- Produces: `export function evalWhen(rule: unknown, ctx: TemplateCtx): boolean` — fail-closed (malformed rule → `false`, i.e. the `else` branch renders).

- [ ] **Step 1: Failing tests** `src/lib/whenLogic.test.ts`:

```ts
import { evalWhen } from './whenLogic'
import { TemplateCtx } from './template'

const ctx: TemplateCtx = { state: { bank: 90 }, local: { bets_on: true }, secret: {}, location: {} }

test('var over local/state scopes', () => {
  expect(evalWhen({ '==': [{ var: 'local.bets_on' }, true] }, ctx)).toBe(true)
  expect(evalWhen({ '>': [{ var: 'state.bank' }, 100] }, ctx)).toBe(false)
})
test('fail-closed on garbage', () => {
  expect(evalWhen({ frobnicate: [1] }, ctx)).toBe(false)
  expect(evalWhen(undefined, ctx)).toBe(false)
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/whenLogic.ts`:

```ts
import jsonLogic from 'json-logic-js'
import type { TemplateCtx } from './template'

export function evalWhen(rule: unknown, ctx: TemplateCtx): boolean {
  if (rule === null || rule === undefined) return false
  try {
    return Boolean(
      jsonLogic.apply(rule as Parameters<typeof jsonLogic.apply>[0], {
        state: ctx.state, local: ctx.local, secret: ctx.secret, location: ctx.location,
      }),
    )
  } catch {
    return false
  }
}
```

Note: json-logic-js throws "Unrecognized operation" for unknown operators — the catch gives us fail-closed.

- [ ] **Step 4: Run** → PASS.  **Step 5: Commit** `git commit -am "feat: when-condition evaluation via json-logic-js"`

---

### Task 4: Syncer pure functions (AppSyncer port)

**Files:**
- Create: `src/lib/syncer.ts`
- Test: `src/lib/syncer.test.ts`

**Interfaces:**
- Consumes: `resolveString`, `TemplateCtx` (Task 2).
- Produces:
  ```ts
  export interface DataSource { type: string; method?: string; url: string; format?: string;
    needs?: string[]; auto_sync?: boolean; min_sync_seconds?: number }
  export function decodeFetched(body: string, format?: string): unknown          // blank→null, xml→raw string, else JSON.parse
  export function buildEnvelope(location: {lat:number,lon:number,label?:string}|null, fetched: unknown): {location: unknown; fetched: unknown}
  export function locationFromCtx(ctx: TemplateCtx): {lat:number,lon:number,label?:string}|null
  export function checkNeeds(ds: DataSource, ctx: TemplateCtx): string | null    // error message or null
  export async function runSync(ds: DataSource, ctx: TemplateCtx, fetchFn?: typeof fetch): Promise<{location:unknown; fetched:unknown}>  // throws Error with user-facing message
  ```

- [ ] **Step 1: Failing tests** `src/lib/syncer.test.ts`:

```ts
import { decodeFetched, buildEnvelope, locationFromCtx, checkNeeds, runSync, DataSource } from './syncer'
import { TemplateCtx, EMPTY_CTX } from './template'

const locCtx: TemplateCtx = { ...EMPTY_CTX, location: { lat: '50.8', lon: '-0.1', label: 'Brighton' } }

test('decodeFetched: blank -> null, xml -> raw string, default -> parsed JSON', () => {
  expect(decodeFetched('  ')).toBeNull()
  expect(decodeFetched('<rss/>', 'xml')).toBe('<rss/>')
  expect(decodeFetched('{"a":1}')).toEqual({ a: 1 })
})
test('locationFromCtx parses doubles, null when empty/unparseable', () => {
  expect(locationFromCtx(locCtx)).toEqual({ lat: 50.8, lon: -0.1, label: 'Brighton' })
  expect(locationFromCtx(EMPTY_CTX)).toBeNull()
})
test('envelope shape', () => {
  expect(buildEnvelope(null, { a: 1 })).toEqual({ location: null, fetched: { a: 1 } })
})
test('checkNeeds: location required but unset', () => {
  const ds: DataSource = { type: 'http', url: 'x', needs: ['location'] }
  expect(checkNeeds(ds, EMPTY_CTX)).toMatch(/location/i)
  expect(checkNeeds(ds, locCtx)).toBeNull()
})
test('runSync resolves templates in url and wraps result', async () => {
  const ds: DataSource = { type: 'http', url: 'https://x/?lat={{location.lat}}' }
  const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
    expect(String(url)).toBe('https://x/?lat=50.8')
    return new Response('{"t":7}', { status: 200 })
  }) as unknown as typeof fetch
  await expect(runSync(ds, locCtx, fakeFetch)).resolves.toEqual({
    location: { lat: 50.8, lon: -0.1, label: 'Brighton' }, fetched: { t: 7 },
  })
})
test('runSync rejects non-GET, non-http, HTTP errors', async () => {
  await expect(runSync({ type: 'ftp', url: 'x' }, locCtx)).rejects.toThrow(/Unsupported/)
  await expect(runSync({ type: 'http', method: 'POST', url: 'x' }, locCtx)).rejects.toThrow(/GET/)
  const err404 = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
  await expect(runSync({ type: 'http', url: 'https://x/' }, locCtx, err404)).rejects.toThrow(/404/)
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/lib/syncer.ts`:

```ts
import { resolveString, TemplateCtx } from './template'

export interface DataSource {
  type: string; method?: string; url: string; format?: string
  needs?: string[]; auto_sync?: boolean; min_sync_seconds?: number
}

export function decodeFetched(body: string, format?: string): unknown {
  if (!body.trim()) return null
  if (format === 'xml') return body
  return JSON.parse(body)
}

export function locationFromCtx(ctx: TemplateCtx): { lat: number; lon: number; label?: string } | null {
  const lat = parseFloat(ctx.location['lat'] ?? '')
  const lon = parseFloat(ctx.location['lon'] ?? '')
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  const label = ctx.location['label']
  return label ? { lat, lon, label } : { lat, lon }
}

export function buildEnvelope(location: unknown, fetched: unknown) {
  return { location: location ?? null, fetched: fetched ?? null }
}

export function checkNeeds(ds: DataSource, ctx: TemplateCtx): string | null {
  for (const need of ds.needs ?? []) {
    if (need === 'location' && !locationFromCtx(ctx))
      return 'Set a location first (Context → Location)'
    if (need.startsWith('secret:') && !ctx.secret[need.slice(7)])
      return `Set the "${need.slice(7)}" secret first (Context → Secrets)`
  }
  return null
}

export async function runSync(ds: DataSource, ctx: TemplateCtx, fetchFn: typeof fetch = fetch) {
  if (ds.type !== 'http') throw new Error(`Unsupported data_source type: ${ds.type}`)
  if ((ds.method ?? 'GET').toUpperCase() !== 'GET')
    throw new Error(`Only GET data sources are supported (got ${ds.method})`)
  const unmet = checkNeeds(ds, ctx)
  if (unmet) throw new Error(unmet)
  const url = resolveString(ds.url, ctx)
  const resp = await fetchFn(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return buildEnvelope(locationFromCtx(ctx), decodeFetched(await resp.text(), ds.format))
}
```

- [ ] **Step 4: Run** → PASS.  **Step 5: Commit** `git commit -am "feat: data_source syncer (AppSyncer port)"`

---

### Task 5: Python host shim

**Files:**
- Create: `shim/studio_host.py`
- Test: `tests/test_shim.py` (pytest; needs `pip install pillow pytest` and env `INK_CARTRIDGES_DIR=$HOME/projects/ink-cartridges`)

**Interfaces:**
- Consumes: `host_alias.py` **source text** (injected by caller — JS fetches it at runtime; pytest reads it from `$INK_CARTRIDGES_DIR`).
- Produces (used by Task 6 drift test and Task 7 emulator glue):
  ```python
  install_host_alias(source_text: str) -> None     # exec into module 'host_alias' + sys.modules['ink_cartridge_host']
  class Session:
      load(py_source: str, stem: str) -> dict      # {"name","icon","version","interval_seconds"} ; raises ValueError with reason
      push(payload) -> bool                         # returns "repaint?" (on_data result is not False); raises ValueError like host
      published_state() -> dict                     # {} if hook absent/bad
      render_png(taskbar_side="left") -> bytes      # full composed 250x122 frame as PNG bytes
  # module-level, mirrors apps.py exactly:
  taskbar_geometry(side, w, h); render_frame(app, apps_in_order, side="left") -> PIL.Image
  ```

- [ ] **Step 1: Failing tests** `tests/test_shim.py`:

```python
import os, sys, pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "shim"))
import studio_host

REPO = os.environ.get("INK_CARTRIDGES_DIR", os.path.expanduser("~/projects/ink-cartridges"))
ALIAS_SRC = open(f"{REPO}/pwnagotchi-plugin/src/host_alias.py").read()

@pytest.fixture(autouse=True)
def alias():
    studio_host.install_host_alias(ALIAS_SRC)

def load_hello():
    src = open(f"{REPO}/apps/hello/hello.py").read()
    s = studio_host.Session()
    meta = s.load(src, "hello")
    return s, meta

def test_load_and_meta():
    s, meta = load_hello()
    assert meta["name"] == "hello" and 1 <= len(meta["icon"]) <= 2

def test_render_produces_250x122_png():
    s, _ = load_hello()
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(s.render_png()))
    assert img.size == (250, 122)

def test_push_reaches_on_data_and_changes_frame():
    s, _ = load_hello()
    before = s.render_png()
    assert s.push({"text": "studio!"}) is not False
    assert s.render_png() != before

def test_validation_rejects_missing_render():
    s = studio_host.Session()
    with pytest.raises(ValueError, match="render"):
        s.load("class Bad:\n    name = 'bad'\n    icon = 'B'\n", "bad")

def test_broken_render_yields_err_frame_not_crash():
    s = studio_host.Session()
    s.load("class Boom:\n    name='boom'\n    icon='!'\n"
           "    def render(self, d, w, h):\n        raise RuntimeError('x')\n", "boom")
    assert s.render_png()  # ERR frame, no exception
```

- [ ] **Step 2: Run** `INK_CARTRIDGES_DIR=~/projects/ink-cartridges pytest tests/test_shim.py -v` → FAIL (module missing). (Local system needs the DejaVu fonts findable — see `_truetype` patch below, which the tests exercise via `public/fonts/`; set `STUDIO_FONTS_DIR` accordingly.)

- [ ] **Step 3: Implement** `shim/studio_host.py` — geometry/taskbar/frame code is a **line-faithful port of `apps.py`** (see the verbatim originals in `pwnagotchi-plugin/src/apps.py`: `taskbar_geometry`, `icon_positions`, `_font`, `_draw_taskbar`, `_render_app_frame`; keep them behaviorally identical — the drift test in Task 6 enforces it):

```python
"""Studio-side replica of the device host (ink-cartridge plugin) contract.

Runs both under Pyodide (browser) and CPython (pytest drift guard).
Only frame composition + lifecycle live here; text helpers come from the
real host_alias.py source, injected at runtime — never copied.
"""
import io, os, sys, types

from PIL import Image, ImageDraw, ImageFont

TASKBAR_W = 16
ICON_H = 16
SCREEN_W, SCREEN_H = 250, 122

# --- font resolution -------------------------------------------------------
# The device resolves ImageFont.truetype("DejaVuSansMono-Bold", n) via system
# fontconfig. Neither Pyodide nor CI has that, so map bare DejaVu names to our
# bundled ttfs. FONTS_DIR: /fonts in Pyodide (JS writes ttfs there), else env.
FONTS_DIR = os.environ.get("STUDIO_FONTS_DIR", "/fonts")
_real_truetype = ImageFont.truetype

def _truetype(font=None, size=10, *args, **kwargs):
    if isinstance(font, str) and "/" not in font and not font.endswith(".ttf"):
        candidate = os.path.join(FONTS_DIR, font + ".ttf")
        if os.path.exists(candidate):
            return _real_truetype(candidate, size, *args, **kwargs)
    return _real_truetype(font, size, *args, **kwargs)

ImageFont.truetype = _truetype

_FONT_CACHE = {}

def _font(size):
    cached = _FONT_CACHE.get(size)
    if cached is None:
        cached = _FONT_CACHE[size] = ImageFont.truetype("DejaVuSansMono-Bold", size)
    return cached

# --- host_alias injection (fetched at runtime, executed verbatim) ----------
def install_host_alias(source_text):
    mod = types.ModuleType("host_alias")
    exec(compile(source_text, "host_alias.py", "exec"), mod.__dict__)
    sys.modules["host_alias"] = mod
    sys.modules.pop("ink_cartridge_host", None)
    mod.register_host_alias()

# --- geometry + composition: line-faithful ports of apps.py ---------------
def taskbar_geometry(taskbar_side, screen_w, screen_h):
    if taskbar_side == "right":
        taskbar = (screen_w - TASKBAR_W, 0, screen_w, screen_h)
        app = (0, 0, screen_w - TASKBAR_W, screen_h)
    else:
        taskbar = (0, 0, TASKBAR_W, screen_h)
        app = (TASKBAR_W, 0, screen_w, screen_h)
    return taskbar, app

def icon_positions(taskbar_box, n):
    x0, y0, x1, _y1 = taskbar_box
    return [(x0, y0 + i * ICON_H, x1, y0 + (i + 1) * ICON_H) for i in range(n)]

def _draw_taskbar(draw, taskbar_box, apps_in_order, active_name):
    boxes = icon_positions(taskbar_box, len(apps_in_order))
    font = _font(11)
    for app, box in zip(apps_in_order, boxes):
        x0, y0, x1, y1 = box
        if app.name == active_name:
            draw.rectangle(box, fill=0, outline=0)
            fill = 255
        else:
            fill = 0
        text = app.icon
        tw = draw.textlength(text, font=font)
        tx = x0 + max(0, ((x1 - x0) - int(tw)) // 2)
        ty = y0 + max(0, ((y1 - y0) - 12) // 2)
        draw.text((tx, ty), text, font=font, fill=fill)

def render_frame(app, apps_in_order, taskbar_side="left",
                 screen_w=SCREEN_W, screen_h=SCREEN_H):
    taskbar_box, app_box = taskbar_geometry(taskbar_side, screen_w, screen_h)
    img = Image.new('1', (screen_w, screen_h), 255)
    ax0, ay0, ax1, ay1 = app_box
    app_w, app_h = ax1 - ax0, ay1 - ay0
    app_img = Image.new('1', (app_w, app_h), 255)
    app_draw = ImageDraw.Draw(app_img)
    try:
        app.render(app_draw, app_w, app_h)
    except Exception as e:  # ERR frame, mirroring the host
        app_img = Image.new('1', (app_w, app_h), 255)
        ad = ImageDraw.Draw(app_img)
        ad.text((4, 4), f"ERR {app.name}", font=_font(12), fill=0)
        ad.text((4, 20), str(e)[:40], font=_font(10), fill=0)
    img.paste(app_img, (ax0, ay0))
    draw = ImageDraw.Draw(img)
    tx0, ty0, tx1, ty1 = taskbar_box
    seam_x = tx0 if taskbar_side == "right" else tx1 - 1
    draw.line([(seam_x, ty0), (seam_x, ty1 - 1)], fill=0, width=1)
    _draw_taskbar(draw, taskbar_box, apps_in_order, app.name)
    return img

# --- cartridge loading + lifecycle: mirrors apps.py semantics --------------
def _validate_app(obj):
    name = getattr(obj, "name", None)
    icon = getattr(obj, "icon", None)
    if not isinstance(name, str) or not name:
        return False, "missing or empty .name"
    if not all(c.isalnum() or c in "-_" for c in name):
        return False, f"invalid characters in name: {name!r}"
    if not isinstance(icon, str) or not (1 <= len(icon) <= 2):
        return False, "icon must be a 1-2 character string"
    if not callable(getattr(obj, "render", None)):
        return False, "missing .render(draw, w, h)"
    return True, ""

class Session:
    """One loaded cartridge + its lifecycle, like a 1-app AppsRuntime."""

    def __init__(self):
        self.app = None
        self._last_error = None

    def load(self, py_source, stem):
        mod = types.ModuleType("ink_cartridge_app_" + stem.replace("-", "_"))
        exec(compile(py_source, stem + ".py", "exec"), mod.__dict__)
        instances = []
        for attr in vars(mod).values():
            if isinstance(attr, type) and attr.__module__ == mod.__name__ \
                    and isinstance(getattr(attr, "name", None), str):
                instances.append(attr())
        if not instances:
            raise ValueError("no class with a string .name attribute found")
        app = instances[0]
        ok, reason = _validate_app(app)
        if not ok:
            raise ValueError(reason)
        self.app = app
        iv = getattr(app, "interval_seconds", None)
        return {
            "name": app.name, "icon": app.icon,
            "version": getattr(app, "version", None),
            "interval_seconds": float(iv) if isinstance(iv, (int, float)) and iv > 0 else None,
        }

    def push(self, payload):
        if not callable(getattr(self.app, "on_data", None)):
            raise ValueError(f"cartridge {self.app.name} does not accept data")
        try:
            return self.app.on_data(payload)
        except Exception as e:
            raise ValueError(f"on_data raised: {e}")

    def published_state(self):
        fn = getattr(self.app, "published_state", None)
        if not callable(fn):
            return {}
        try:
            v = fn()
        except Exception:
            return {}
        return v if isinstance(v, dict) else {}

    def render_png(self, taskbar_side="left"):
        img = render_frame(self.app, [self.app], taskbar_side)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
```

- [ ] **Step 4: Run** `STUDIO_FONTS_DIR=$PWD/public/fonts INK_CARTRIDGES_DIR=~/projects/ink-cartridges pytest tests/test_shim.py -v` → PASS. Add a `pytest.ini` with `[pytest]` and an `env` note in README later; simplest: export both vars in the command.
- [ ] **Step 5: Commit** `git commit -am "feat: python host shim (frame composition + lifecycle)"`

---

### Task 6: Drift guard — shim vs real host, all public cartridges

**Files:**
- Create: `tests/test_drift.py`, `tests/conftest.py`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `studio_host.render_frame`, `install_host_alias` (Task 5); real repo at `$INK_CARTRIDGES_DIR`.

- [ ] **Step 1: Write the drift test** `tests/conftest.py`:

```python
import os, sys, pathlib
import pytest

REPO = os.environ.get("INK_CARTRIDGES_DIR", os.path.expanduser("~/projects/ink-cartridges"))

@pytest.fixture(scope="session")
def repo():
    if not os.path.isdir(os.path.join(REPO, "apps")):
        pytest.skip("INK_CARTRIDGES_DIR not pointing at an ink-cartridges checkout")
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "shim"))
    return REPO
```

`tests/test_drift.py`:

```python
"""Golden-frame drift guard: shim composition must be pixel-identical to the
real host (apps.py) for every published cartridge."""
import glob, importlib.util, os, random, sys
import pytest

def _load_host(repo):
    src = os.path.join(repo, "pwnagotchi-plugin", "src")
    sys.path.insert(0, src)
    spec = importlib.util.spec_from_file_location("apps", os.path.join(src, "apps.py"))
    host = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(host)
    return host

class FakeUi:
    def width(self): return 250
    def height(self): return 122

def _cartridge_dirs(repo):
    return sorted(d for d in glob.glob(os.path.join(repo, "apps", "*")) if os.path.isdir(d))

def _load_instance(shim, repo, d):
    pys = [p for p in glob.glob(os.path.join(d, "*.py"))]
    assert len(pys) == 1, d
    stem = os.path.splitext(os.path.basename(pys[0]))[0]
    s = shim.Session()
    s.load(open(pys[0]).read(), stem)
    return s.app

@pytest.mark.parametrize("d", _cartridge_dirs(
    os.environ.get("INK_CARTRIDGES_DIR", os.path.expanduser("~/projects/ink-cartridges"))),
    ids=os.path.basename)
def test_frame_matches_host(repo, d):
    import studio_host as shim
    alias_src = open(os.path.join(repo, "pwnagotchi-plugin", "src", "host_alias.py")).read()
    shim.install_host_alias(alias_src)
    host = _load_host(repo)
    app = _load_instance(shim, repo, d)   # ONE instance, rendered by both compositors
    random.seed(0)
    ours = shim.render_frame(app, [app], "left")
    random.seed(0)
    theirs = host._render_app_frame(app, FakeUi(), "left", [app])
    assert list(ours.getdata()) == list(theirs.getdata()), \
        f"{os.path.basename(d)}: shim frame differs from host frame"
```

Note: the host's `_font()` resolves `"DejaVuSansMono-Bold"` through PIL's search; our `_truetype` patch (Task 5, module-level in `studio_host`) is applied before `apps.py` runs, so **both** paths use the bundled ttfs — identical glyphs on any machine. Same instance is rendered twice so internal state matches.

- [ ] **Step 2: Run** `STUDIO_FONTS_DIR=$PWD/public/fonts INK_CARTRIDGES_DIR=~/projects/ink-cartridges pytest tests/test_drift.py -v` → expect 9 PASS. If a cartridge fails: fix the shim (not the test) until pixel-identical.

- [ ] **Step 3: CI workflow** `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [master] }
  pull_request:
  schedule: [{ cron: "17 6 * * *" }]   # daily — catches upstream host changes
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test
      - run: npm run build
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with: { repository: cristian-milea/ink-cartridges, path: upstream }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install pillow pytest
      - run: pytest tests -v
        env:
          INK_CARTRIDGES_DIR: ${{ github.workspace }}/upstream
          STUDIO_FONTS_DIR: ${{ github.workspace }}/public/fonts
```

- [ ] **Step 4: Verify** both pytest suites pass locally. **Step 5: Commit** `git commit -am "test: drift guard vs real host + CI"`

---

### Task 7: Pyodide glue — `Emulator` + e-ink canvas

**Files:**
- Create: `src/lib/emulator.ts`, `src/components/EinkCanvas.tsx`
- Modify: `src/App.tsx` (wire a bare-bones page: load hello from a hardcoded string, show canvas + a "push" input)

**Interfaces:**
- Consumes: `PYODIDE_URL`, `RAW_BASE` (Task 1); `shim/studio_host.py` (served as a static asset — add `shim` to Vite `publicDir` copies via `vite-plugin-static-copy` or simply import as raw: `import shimSource from '../../shim/studio_host.py?raw'` — use `?raw`, zero plugins).
- Produces (single stateful class; all later UI tasks consume this):
  ```ts
  export interface CartridgeFiles { py: string; stem: string; manifest?: unknown; ui?: unknown }
  export interface CartridgeMeta { name: string; icon: string; version: string | null; interval_seconds: number | null }
  export class Emulator {
    static async create(onLog: (line: string) => void): Promise<Emulator>  // loads pyodide+Pillow, fonts→/fonts, host_alias→install_host_alias
    async load(files: CartridgeFiles): Promise<CartridgeMeta>              // throws Error(reason) on invalid cartridge
    async push(payload: unknown): Promise<void>                            // on_data + repaint; logs ValueError to onLog
    published(): Record<string, unknown>                                   // latest published_state()
    framePng(): Uint8Array                                                  // current frame
    onFrame: (png: Uint8Array, published: Record<string, unknown>) => void  // fired after every repaint (push/tick/load)
    startInterval(): void; stopInterval(): void                             // drives interval_seconds ticks
    async runValidator(files: Record<string, string>): Promise<string[]>    // Task 13 fills this in; stub now
  }
  ```

- [ ] **Step 1: Implement** `src/lib/emulator.ts` (no unit test — exercised by the Playwright smoke in Task 15; keep all pure logic OUT of this file):

```ts
import { PYODIDE_URL, RAW_BASE } from './constants'
import shimSource from '../../shim/studio_host.py?raw'

declare global { interface Window { loadPyodide: (o: { indexURL: string }) => Promise<PyodideAPI> } }
export interface PyodideAPI {
  loadPackage(p: string): Promise<void>
  runPython(code: string): unknown
  globals: { get(name: string): PyProxyLike }
  FS: { mkdirTree(p: string): void; writeFile(p: string, data: Uint8Array | string): void }
}
type PyProxyLike = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}

export class Emulator {
  private py!: PyodideAPI
  private session: PyProxyLike = null
  private timer: number | null = null
  private intervalSec: number | null = null
  private lastPng: Uint8Array = new Uint8Array()
  private lastPublished: Record<string, unknown> = {}
  onFrame: (png: Uint8Array, published: Record<string, unknown>) => void = () => {}
  private constructor(private onLog: (line: string) => void) {}

  static async create(onLog: (line: string) => void): Promise<Emulator> {
    const e = new Emulator(onLog)
    // pyodide.js from CDN (script tag in index.html: <script src=".../pyodide.js">)
    e.py = await window.loadPyodide({ indexURL: PYODIDE_URL })
    await e.py.loadPackage('pillow')
    e.py.FS.mkdirTree('/fonts')
    for (const f of ['DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf'])
      e.py.FS.writeFile(`/fonts/${f}`, await fetchBytes(`/fonts/${f}`))
    e.py.FS.mkdirTree('/shim')
    e.py.FS.writeFile('/shim/studio_host.py', shimSource)
    const alias = await (await fetch(`${RAW_BASE}pwnagotchi-plugin/src/host_alias.py`)).text()
    e.py.runPython(`
import sys; sys.path.insert(0, '/shim')
import studio_host
studio_host.install_host_alias(${JSON.stringify(alias)})
`)
    return e
  }

  async load(files: CartridgeFiles): Promise<CartridgeMeta> {
    this.stopInterval()
    this.py.runPython(`
import json, studio_host
_session = studio_host.Session()
_meta = _session.load(${JSON.stringify(files.py)}, ${JSON.stringify(files.stem)})
_meta_json = json.dumps(_meta)
`)
    this.session = this.py.globals.get('_session')
    const meta = JSON.parse(this.py.runPython('_meta_json') as string) as CartridgeMeta
    this.intervalSec = meta.interval_seconds
    this.repaint()
    return meta
  }

  async push(payload: unknown): Promise<void> {
    try {
      this.py.runPython(`
import json
_changed = _session.push(json.loads(${JSON.stringify(JSON.stringify(payload ?? null))}))
`)
      const changed = this.py.runPython('_changed is not False')
      if (changed) this.repaint()
    } catch (err) {
      this.onLog(String(err))
    }
  }

  private repaint(): void {
    const png = this.py.runPython('bytes(_session.render_png())') as { toJs(): Uint8Array }
    this.lastPng = (png as unknown as Uint8Array).slice
      ? (png as unknown as Uint8Array)
      : png.toJs()
    this.lastPublished = JSON.parse(
      this.py.runPython('json.dumps(_session.published_state())') as string,
    )
    this.onFrame(this.lastPng, this.lastPublished)
  }

  published() { return this.lastPublished }
  framePng() { return this.lastPng }

  startInterval(): void {
    this.stopInterval()
    if (this.intervalSec)
      this.timer = window.setInterval(() => this.repaint(), this.intervalSec * 1000)
  }
  stopInterval(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }
}
export interface CartridgeFiles { py: string; stem: string; manifest?: unknown; ui?: unknown }
export interface CartridgeMeta { name: string; icon: string; version: string | null; interval_seconds: number | null }
```

Add to `index.html` `<head>`: `<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"></script>`. (Exact PyProxy/bytes-conversion calls may need adjustment against Pyodide 0.26 docs — `runPython` returning `bytes` yields a PyProxy with `.toJs()`; consult https://pyodide.org/en/stable/usage/type-conversions.html while implementing.)

- [ ] **Step 2: Implement** `src/components/EinkCanvas.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { SCREEN_W, SCREEN_H } from '../lib/constants'

export function EinkCanvas({ png, scale = 3 }: { png: Uint8Array | null; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!png?.length || !ref.current) return
    const ctx = ref.current.getContext('2d')!
    const img = new Image()
    const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }))
    img.onload = () => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, SCREEN_W * scale, SCREEN_H * scale)
      ctx.drawImage(img, 0, 0, SCREEN_W * scale, SCREEN_H * scale)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [png, scale])
  return (
    <canvas ref={ref} width={SCREEN_W * scale} height={SCREEN_H * scale}
            className="eink" data-testid="eink-canvas" />
  )
}
```

Minimal `.eink` CSS (in `src/index.css`): light-gray bezel border, slight sepia backdrop `background:#e8e6e0`, `image-rendering:pixelated`.

- [ ] **Step 3: Manual verification** — wire `App.tsx` to create the Emulator, `load()` a hardcoded copy of a trivial inline test cartridge (5-line class drawing "IT WORKS"), and render `EinkCanvas`. Run `npm run dev`, open the page, confirm the frame draws with taskbar + seam. Then delete the hardcoded cartridge string (Gallery replaces it in Task 11).
- [ ] **Step 4: Run** `npm run test && npm run build` → PASS. **Step 5: Commit** `git commit -am "feat: pyodide emulator glue + e-ink canvas"`

---

### Task 8: Device context stores + panels (location / secrets / permissions)

**Files:**
- Create: `src/lib/deviceContext.ts`, `src/components/ContextPanels.tsx`
- Test: `src/lib/deviceContext.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DeviceContext { location: Record<string,string>; secrets: Record<string,string>; permissions: Record<string,boolean> }
  export function loadDeviceContext(): DeviceContext              // from localStorage, defaults empty
  export function saveDeviceContext(ctx: DeviceContext): void
  export function toTemplateCtx(dc: DeviceContext, state: Record<string,unknown>, local: Record<string,unknown>): TemplateCtx
  ```
- Consumes: `TemplateCtx` (Task 2).

- [ ] **Step 1: Failing tests** `src/lib/deviceContext.test.ts`:

```ts
import { loadDeviceContext, saveDeviceContext, toTemplateCtx } from './deviceContext'

test('roundtrip via localStorage', () => {
  saveDeviceContext({ location: { lat: '1', lon: '2', label: 'X' }, secrets: { k: 'v' }, permissions: { location: true } })
  expect(loadDeviceContext().secrets.k).toBe('v')
})
test('defaults when empty', () => {
  localStorage.clear()
  expect(loadDeviceContext()).toEqual({ location: {}, secrets: {}, permissions: {} })
})
test('toTemplateCtx merges', () => {
  const t = toTemplateCtx({ location: { lat: '1' }, secrets: { s: 'x' }, permissions: {} }, { a: 1 }, { b: 2 })
  expect(t).toEqual({ state: { a: 1 }, local: { b: 2 }, secret: { s: 'x' }, location: { lat: '1' } })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/deviceContext.ts`:

```ts
import type { TemplateCtx } from './template'

export interface DeviceContext {
  location: Record<string, string>
  secrets: Record<string, string>
  permissions: Record<string, boolean>
}
const KEY = 'studio.deviceContext'

export function loadDeviceContext(): DeviceContext {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { location: {}, secrets: {}, permissions: {}, ...JSON.parse(raw) }
  } catch { /* corrupted -> defaults */ }
  return { location: {}, secrets: {}, permissions: {} }
}
export function saveDeviceContext(ctx: DeviceContext): void {
  localStorage.setItem(KEY, JSON.stringify(ctx))
}
export function toTemplateCtx(dc: DeviceContext,
    state: Record<string, unknown>, local: Record<string, unknown>): TemplateCtx {
  return { state, local, secret: dc.secrets, location: dc.location }
}
```

- [ ] **Step 4: Implement panel component** `src/components/ContextPanels.tsx` — three collapsible sections: Location (lat/lon/label inputs + 3 preset buttons e.g. Brighton/Bucharest/NYC), Secrets (rows generated from the loaded manifest's `requires.secrets` — label, masked input, save; unset required secrets get a "needed" badge), Permissions (checkbox per allowlisted name: location/notifications/network). Props: `{ dc, onChange, manifest }`. Controlled inputs writing through `saveDeviceContext`. ~120 lines of plain React; no test beyond the store tests (UI covered by smoke).
- [ ] **Step 5: Run** `npm run test` → PASS. **Commit** `git commit -am "feat: device context (location/secrets/permissions) + panels"`

---

### Task 9: Widget renderer — PhoneMock (all widgets except dpad)

**Files:**
- Create: `src/components/PhoneMock.tsx`
- Test: `src/components/PhoneMock.test.tsx`

**Interfaces:**
- Consumes: `resolveString`/`resolveJson` (T2), `evalWhen` (T3), `TemplateCtx`.
- Produces:
  ```tsx
  export interface PhoneMockProps {
    ui: unknown                                   // parsed ui.json root node
    published: Record<string, unknown>            // published_state of the loaded app
    dc: DeviceContext
    onAction: (action: UiAction, local: Record<string, unknown>) => void  // push/sync/request_permission bubble up
  }
  export type UiAction = { type: 'push'; payload: unknown } | { type: 'sync' }
    | { type: 'set_local'; key: string; value: unknown }
    | { type: 'request_permission'; name: string }
  export function PhoneMock(props: PhoneMockProps): JSX.Element
  ```
- Local widget state (`local.*`) lives inside PhoneMock (one `useState<Record<string,unknown>>`), seeded from widget `default`s (select `default` is template-resolved first, per schema). `set_local` mutates it directly; other actions are template-resolved (`resolveJson` on `push.payload`) then bubbled via `onAction`.

- [ ] **Step 1: Failing tests** `src/components/PhoneMock.test.tsx` (behavioral parity essentials):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { PhoneMock, UiAction } from './PhoneMock'

const dc = { location: {}, secrets: {}, permissions: {} }
const noop = () => {}

test('state_text formats published binding with default fallback', () => {
  const ui = { type: 'column', children: [
    { type: 'state_text', binding: 'bank', format: 'Bank: ${}' },
    { type: 'state_text', binding: 'missing', default: 'n/a' },
  ]}
  render(<PhoneMock ui={ui} published={{ bank: 90 }} dc={dc} onAction={noop} />)
  expect(screen.getByText('Bank: $90')).toBeTruthy()
  expect(screen.getByText('n/a')).toBeTruthy()
})

test('button push resolves templates against local state', () => {
  const actions: UiAction[] = []
  const ui = { type: 'column', children: [
    { type: 'select', local: 'bet', default: '10', options: [
      { value: '5', label: '$5' }, { value: '10', label: '$10' }] },
    { type: 'button', label: 'Deal', action: { type: 'push', payload: { action: 'deal', bet: '{{local.bet}}' } } },
  ]}
  render(<PhoneMock ui={ui} published={{}} dc={dc} onAction={(a) => actions.push(a)} />)
  fireEvent.click(screen.getByText('Deal'))
  expect(actions).toEqual([{ type: 'push', payload: { action: 'deal', bet: '10' } }])
})

test('when re-evaluates on local change (switch)', () => {
  const ui = { type: 'column', children: [
    { type: 'switch', local: 'on', label: 'Chips', default: false },
    { type: 'when', if: { '==': [{ var: 'local.on' }, true] },
      then: [{ type: 'text', value: 'BETTING' }],
      else: [{ type: 'text', value: 'CASUAL' }] },
  ]}
  render(<PhoneMock ui={ui} published={{}} dc={dc} onAction={noop} />)
  expect(screen.getByText('CASUAL')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByText('BETTING')).toBeTruthy()
})

test('unknown widget type renders placeholder, does not crash', () => {
  render(<PhoneMock ui={{ type: 'hologram' }} published={{}} dc={dc} onAction={noop} />)
  expect(screen.getByText(/unsupported widget/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `PhoneMock.tsx`. Structure: one `renderNode(node, key)` switch inside the component so all widgets share `localState` + `ctx`. Per-widget behavior (from the schema doc — keep each arm short):
  - `column`/`row`: flex containers, `padding`/`spacing`/`align` → inline styles (1dp = 1px).
  - `spacer` (width/height px), `divider` (hr, `thickness`).
  - `text`: `resolveString(value)`, `style` → CSS class (`headline`/`title`/`body`/`caption`), `align`.
  - `state_text`: `v = published[binding]`; absent → `default ?? ''`; `format` `'x {}'` → `format.replace('{}', String(v))`.
  - `image`: `source` starting `state.` reads `published[key]` (data-URL/base64), else literal URL; `width`/`height`.
  - `chart`: `published[binding]` as number[]; render inline SVG bars or polyline (`kind`), `height` (default 80). ~20 lines, no chart lib (YAGNI).
  - `button`: label template-resolved; `style` primary/secondary class; click → `fire(action)`.
  - `switch`: checkbox; toggling sets local[key] and fires `action_on`/`action_off` if present.
  - `slider`: range input min/max/step; sets local; fires `action` on release (`onMouseUp`/`onTouchEnd`).
  - `text_field`: input (`kind==='number'` → type number); sets local on change.
  - `select`: `default` resolved as template then seeds local; options render as `<select>`.
  - `when`: `evalWhen(if, ctx)` picks `then`/`else` (node or array; absent → nothing).
  - `dpad`: delegate to `<Dpad …/>` (Task 10; until then render the unsupported placeholder).
  - default: `<div className="unsupported">unsupported widget: {type}</div>`.
  - `fire(action)`: resolve via `resolveJson` for push payloads; `set_local` handled internally; everything else `onAction(resolved, localState)`.
  - `ctx = toTemplateCtx(dc, published, localState)` recomputed each render.
- [ ] **Step 4: Run** `npm run test -- PhoneMock` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: ui.json widget renderer (phone mock)"`

---

### Task 10: Dpad — swipe classification + component

**Files:**
- Create: `src/lib/dpadGeometry.ts`, `src/components/Dpad.tsx`
- Test: `src/lib/dpadGeometry.test.ts`
- Modify: `src/components/PhoneMock.tsx` (route `type:'dpad'` to `<Dpad/>`)

**Interfaces:**
- Produces:
  ```ts
  export type DpadDirection = 'up'|'down'|'left'|'right'|'up_left'|'up_right'|'down_left'|'down_right'
  export function classifySwipe(dx: number, dy: number, opts: { vertical: boolean; horizontal: boolean; diagonal: boolean },
                                minDistance?: number): DpadDirection | 'tap' | null
  ```
  `Dpad` props: `{ node, onAction }` — fires `node.actions[dir]` for classified swipes, `node.center` on tap.

- [ ] **Step 1: Failing tests** `src/lib/dpadGeometry.test.ts`:

```ts
import { classifySwipe } from './dpadGeometry'
const all = { vertical: true, horizontal: true, diagonal: true }

test('cardinal swipes', () => {
  expect(classifySwipe(0, -80, all)).toBe('up')
  expect(classifySwipe(80, 0, all)).toBe('right')
})
test('diagonals only when enabled; else snap to nearest enabled cardinal', () => {
  expect(classifySwipe(60, -60, all)).toBe('up_right')
  expect(classifySwipe(60, -60, { vertical: true, horizontal: true, diagonal: false })).toMatch(/^(up|right)$/)
})
test('axis disabled -> snap to enabled axis', () => {
  expect(classifySwipe(80, -10, { vertical: true, horizontal: false, diagonal: false })).toBe('up')
})
test('sub-threshold drag is a tap; nothing enabled -> null', () => {
  expect(classifySwipe(3, 4, all)).toBe('tap')
  expect(classifySwipe(80, 0, { vertical: false, horizontal: false, diagonal: false })).toBeNull()
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/dpadGeometry.ts`:

```ts
export type DpadDirection = 'up'|'down'|'left'|'right'|'up_left'|'up_right'|'down_left'|'down_right'

const ANGLES: [DpadDirection, number][] = [
  ['right', 0], ['down_right', 45], ['down', 90], ['down_left', 135],
  ['left', 180], ['up_left', 225], ['up', 270], ['up_right', 315],
]
const isDiagonal = (d: DpadDirection) => d.includes('_')
const isVertical = (d: DpadDirection) => d === 'up' || d === 'down'
const isHorizontal = (d: DpadDirection) => d === 'left' || d === 'right'

export function classifySwipe(dx: number, dy: number,
    opts: { vertical: boolean; horizontal: boolean; diagonal: boolean },
    minDistance = 24): DpadDirection | 'tap' | null {
  if (Math.hypot(dx, dy) < minDistance) return 'tap'
  const enabled = ANGLES.filter(([d]) =>
    (isDiagonal(d) && opts.diagonal) || (isVertical(d) && opts.vertical) || (isHorizontal(d) && opts.horizontal),
  )
  if (!enabled.length) return null
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  let best: DpadDirection = enabled[0][0]
  let bestDelta = 361
  for (const [d, a] of enabled) {
    const delta = Math.min(Math.abs(angle - a), 360 - Math.abs(angle - a))
    if (delta < bestDelta) { bestDelta = delta; best = d }
  }
  return best
}
```

- [ ] **Step 4: Implement** `Dpad.tsx`: a large bordered square div; pointer events record `pointerdown` origin and on `pointerup` compute `classifySwipe(dx, dy, axesFromNode)`; `'tap'` fires `node.center` (if any), a direction fires `node.actions[dir]` (if bound); shows the last-fired direction as a big arrow glyph until the next gesture (matches Android behavior). Route from PhoneMock.
- [ ] **Step 5: Run** `npm run test` → PASS. **Commit** `git commit -am "feat: dpad swipe surface"`

---

### Task 11: Gallery + catalog fetching, App shell wiring

**Files:**
- Create: `src/lib/catalog.ts`, `src/components/Gallery.tsx`
- Modify: `src/App.tsx` — real shell: left = Gallery / cartridge session (EinkCanvas + console pane), right = PhoneMock + ContextPanels; a session reducer holding `{files, meta, published, ui, manifest}`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `RAW_BASE`; `Emulator` (T7), `PhoneMock` (T9), panels (T8).
- Produces:
  ```ts
  export interface CatalogEntry { name: string; icon: string; version: string; author: string;
    description: string; category: string; files: { py: string; manifest: string; ui?: string };
    requires?: { permissions?: string[]; secrets?: {key:string;label:string;optional?:boolean}[] } }
  export async function fetchCatalog(fetchFn?: typeof fetch): Promise<CatalogEntry[]>   // GET RAW_BASE + 'index.json' -> .apps
  export async function fetchCartridge(entry: CatalogEntry, fetchFn?: typeof fetch): Promise<CartridgeFiles & { manifestRaw: string; uiRaw?: string }>
  ```

- [ ] **Step 1: Failing tests** `src/lib/catalog.test.ts` (fake fetch):

```ts
import { fetchCatalog, fetchCartridge } from './catalog'
const index = { apps: [{ name: 'hello', icon: 'Hi', version: '1.1.0', author: 'a', description: 'd',
  category: 'utilities', files: { py: 'apps/hello/hello.py', manifest: 'apps/hello/hello.manifest.json' } }] }

const fake = (async (url: RequestInfo | URL) => {
  const u = String(url)
  if (u.endsWith('index.json')) return new Response(JSON.stringify(index))
  if (u.endsWith('.py')) return new Response('class Hello:\n    name="hello"')
  if (u.endsWith('.manifest.json')) return new Response('{"name":"hello"}')
  return new Response('', { status: 404 })
}) as unknown as typeof fetch

test('fetchCatalog returns apps array', async () => {
  expect((await fetchCatalog(fake))[0].name).toBe('hello')
})
test('fetchCartridge pulls files and derives stem from py path', async () => {
  const c = await fetchCartridge(index.apps[0] as never, fake)
  expect(c.stem).toBe('hello')
  expect(c.py).toContain('class Hello')
  expect(c.manifest).toEqual({ name: 'hello' })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/lib/catalog.ts` (straightforward: `fetch(RAW_BASE + path)`, error on !ok; `stem = basename(files.py, '.py')`; parse manifest/ui JSON, keep raw strings too for the validator/submit).
- [ ] **Step 4: Gallery component** — card grid grouped by `category`: icon monogram, name, version, author, description, "needs secrets" badge when `requires.secrets` has required entries. Click → `fetchCartridge` → `emulator.load` → session state. "Use as template" button on each card downloads the three files (Blob + `<a download>`). Loading/error states are a simple status line.
- [ ] **Step 5: App shell** — wire everything: on push-action from PhoneMock → `emulator.push(payload)`; on frame → update canvas + published; on `request_permission` → flip the permission in DeviceContext; console pane = scrollback of `onLog` lines (Python tracebacks, sync errors). `startInterval()` after load.
- [ ] **Step 6: Verify manually** `npm run dev` — open gallery, load **hello**, push text from its ui.json, see the e-ink update. Load **blackjack**, play a hand. Load **maze** (dpad), swipe. This is the acceptance loop for 6 of 9 cartridges (non-sync ones).
- [ ] **Step 7: Run** `npm run test && npm run build` → PASS. **Commit** `git commit -am "feat: gallery + app shell wiring"`

---

### Task 12: SyncCard + sync wiring (weather / rss / tide-sun)

**Files:**
- Create: `src/components/SyncCard.tsx`
- Modify: `src/App.tsx` (render SyncCard when manifest has `data_source`; handle `{type:'sync'}` actions from PhoneMock)

**Interfaces:**
- Consumes: `runSync`, `checkNeeds`, `DataSource` (T4); `toTemplateCtx` (T8); `emulator.push`.
- Produces: `SyncCard` props `{ ds: DataSource; ctx: TemplateCtx; lastSync: number | null; onSync: () => void; error: string | null }`.

- [ ] **Step 1: Implement SyncCard** — "Last synced X ago" (or "never"), Sync button (disabled with reason from `checkNeeds`), error line. Last-sync timestamp in `localStorage` key `studio.lastSync.<app>`. No auto-sync loop (YAGNI — the device/phone do auto-sync; the Studio dev loop is manual, keeps the code and API quotas safe).
- [ ] **Step 2: Wire in App**: `onSync = async () => emulator.push(await runSync(ds, ctx))` with try/catch → console pane + SyncCard error. Note `ctx.state` for URL templates = current `published` (tide-sun uses `{{state.tide_start}}`).
- [ ] **Step 3: Manual verify (CORS reality check)** — `npm run dev`; load **weather**, set a location, Sync → frame shows forecast (Open-Meteo sends CORS headers). Load **rss**, Sync — if hnrss.org blocks CORS, log it in README + console with a friendly "this API blocks browser fetch; test on-device or run a relay" message (do NOT build the relay now; record the finding). tide-sun requires a WorldTides key — verify template resolution + needs-gating without a real key (error path), full fetch only if you have a key.
- [ ] **Step 4: Run** `npm run test && npm run build` → PASS. **Commit** `git commit -am "feat: sync card + data_source wiring"`

---

### Task 13: Validation panel (validate_cartridges.py under Pyodide)

**Files:**
- Create: `src/components/ValidationPanel.tsx`
- Modify: `src/lib/emulator.ts` (implement `runValidator`)

**Interfaces:**
- Consumes: `RAW_BASE`; Pyodide FS.
- Produces: `Emulator.runValidator(files: Record<string,string>): Promise<string[]>` — empty array = valid; else human-readable error bullets (exactly the CI validator's output).

- [ ] **Step 1: Implement `runValidator`** in `emulator.ts`:

```ts
async runValidator(files: Record<string, string>): Promise<string[]> {
  if (!this.validatorLoaded) {
    const src = await (await fetch(`${RAW_BASE}validate_cartridges.py`)).text()
    this.py.FS.mkdirTree('/repo')
    this.py.FS.writeFile('/repo/validate_cartridges.py', src)
    this.validatorLoaded = true
  }
  this.py.runPython(`
import json, os, shutil, sys
if '/repo' not in sys.path: sys.path.insert(0, '/repo')
shutil.rmtree('/repo/apps', ignore_errors=True)
os.makedirs('/repo/apps/_candidate')
for fname, content in json.loads(${JSON.stringify(JSON.stringify(files))}).items():
    with open(f'/repo/apps/_candidate/{fname}', 'w') as f: f.write(content)
import importlib, validate_cartridges
importlib.reload(validate_cartridges)
_name, _errors = validate_cartridges.validate_cartridge('/repo/apps/_candidate')
_errors_json = json.dumps(list(_errors))
`)
  return JSON.parse(this.py.runPython('_errors_json') as string)
}
```

(`validate_cartridge(dir)` takes an explicit path, sidestepping the script's CWD-relative `apps/*` glob — confirmed against the upstream source.)

- [ ] **Step 2: ValidationPanel** — "Check cartridge" button; runs validator on the session's raw file strings (`<stem>.py`, `<stem>.manifest.json`, `<stem>.ui.json`); renders ✓ green or ✗ red bullet list. Re-runs automatically after every local-bridge reload (Task 14).
- [ ] **Step 3: Manual verify** — load `hello` from gallery → valid; break the manifest name in a local copy → see the exact CI error text.
- [ ] **Step 4: Run** `npm run test && npm run build` → PASS. **Commit** `git commit -am "feat: in-browser CI validator"`

---

### Task 14: Local dev bridge (FS Access API + drag-drop)

**Files:**
- Create: `src/components/LocalBridge.tsx`
- Modify: `src/App.tsx` (add "Open local folder" / drop zone; local session replaces gallery session)

**Interfaces:**
- Consumes: `Emulator.load`, `runValidator`.
- Produces: `<LocalBridge onFiles={(files: {py: string; stem: string; manifestRaw?: string; uiRaw?: string}) => void} />` — fires on initial pick AND on every detected change.

- [ ] **Step 1: Implement LocalBridge**:
  - `showDirectoryPicker()` (feature-detect; hide button when unavailable). Scan the picked dir for `*.py` + optional `<stem>.manifest.json` / `<stem>.ui.json` (ignore `_`-prefixed files, mirror host `_is_app_file`).
  - Poll every 1000 ms: `file.lastModified` via `getFile()`; when any changed, re-read all three and call `onFiles`.
  - Fallback: a drop zone accepting multi-file drag (2–3 files); re-drop to refresh. Safari/Firefox get only this.
- [ ] **Step 2: Wire**: `onFiles` → `emulator.load` (errors → console pane, keep previous good frame) → auto-run validator → status line "reloaded HH:MM:SS".
- [ ] **Step 3: Manual verify** — point at `~/projects/ink-cartridges/apps/hello`, edit the py in an editor, save → preview updates within ~1s; introduce a syntax error → console shows the Python traceback, frame stays.
- [ ] **Step 4: Run** `npm run test && npm run build` → PASS. **Commit** `git commit -am "feat: local folder bridge with hot reload"`

---

### Task 15: Submit panel + Playwright smoke

**Files:**
- Create: `src/components/SubmitPanel.tsx`, `e2e/smoke.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: validator results (T13), session files.

- [ ] **Step 1: SubmitPanel** — gated on validator passing (else shows the errors). Steps rendered with copy buttons:
  1. Fork: link `https://github.com/cristian-milea/ink-cartridges/fork`
  2. ```bash
     git clone https://github.com/<your-user>/ink-cartridges
     mkdir ink-cartridges/apps/<name>
     # copy <name>.py, <name>.manifest.json, <name>.ui.json into it
     cd ink-cartridges && python3 validate_cartridges.py apps/<name>
     git checkout -b add-<name> && git add apps/<name> && git commit -m "apps: add <name>" && git push -u origin add-<name>
     ```
  3. PR link: `https://github.com/cristian-milea/ink-cartridges/compare/main...<your-user>:add-<name>?expand=1`
  `<name>` interpolated from the loaded manifest.
- [ ] **Step 2: Playwright** — `npm i -D @playwright/test && npx playwright install chromium`. `playwright.config.ts` with `webServer: { command: 'npm run dev', port: 5173 }`. `e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('gallery → hello → push updates the e-ink canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByText('hello', { exact: true }).click()          // gallery card
  const canvas = page.getByTestId('eink-canvas')
  await expect(canvas).toBeVisible()
  const before = await canvas.screenshot()
  // hello's ui.json exposes a text field + push button; drive them generically:
  await page.getByRole('textbox').first().fill('smoke!')
  await page.getByRole('button', { name: /send|push|show/i }).first().click()
  await expect(async () => {
    expect(Buffer.compare(await canvas.screenshot(), before)).not.toBe(0)
  }).toPass({ timeout: 10_000 })
})
```

(Adjust the two selectors to hello's actual ui.json — read it from the public repo when implementing; if hello has no ui.json, use the Studio's raw-payload console input instead.) Note: Pyodide load makes this test ~30–60 s; set `test.setTimeout(120_000)`.
- [ ] **Step 3: Run** `npx playwright test` → PASS. Add an `e2e` job to `.github/workflows/ci.yml` (chromium only).
- [ ] **Step 4: Commit** `git commit -am "feat: submit panel + playwright smoke"`

---

### Task 16: Deploy to Cloudflare Pages + README

**Files:**
- Create: `README.md`
- Modify: none (Pages config lives in the CF dashboard/wrangler)

- [ ] **Step 1: Create the GitHub repo + push** (`gh repo create` — ask Cristi private vs public at execution time; spec assumed this repo may stay private, which is fine since it's static assets).
- [ ] **Step 2: Cloudflare Pages project** — connect the repo (or `npx wrangler pages deploy dist`): build command `npm run build`, output `dist`, then custom domain `ink-cartridges.cristimilea.ro` (CNAME in the cristimilea.ro zone). Use the `cloudflare:wrangler` skill when executing this step.
- [ ] **Step 3: README** — what the Studio is, architecture sketch (Pyodide, pull-on-the-fly, no backend), local dev (`npm run dev`; pytest needs `INK_CARTRIDGES_DIR` + `STUDIO_FONTS_DIR`), font provenance (DejaVu 2.37, license), CORS findings from Task 12, cartridge-developer quickstart (open studio → open local folder → iterate → validate → submit).
- [ ] **Step 4: Verify production** — load the deployed URL, open `weather`, sync with a location, confirm frame. **Commit + push** `git commit -am "docs: README" && git push`.

---

## Verification (end-to-end acceptance)

1. `npm run test` (vitest), `pytest tests -v` (shim + 9-cartridge drift guard), `npx playwright test` — all green.
2. On the deployed site, for **each of the 9 cartridges**: open from gallery, confirm it renders, drive its primary interaction (blackjack Deal/Hit, magic8 shake, maze/vector-racing/ricochet-robots dpad, hello push, weather/rss/tide-sun sync or documented CORS finding), confirm `state_text` bindings update.
3. Local bridge: edit a cartridge in an IDE → sub-second hot reload; syntax error → traceback in console pane, frame preserved.
4. Validator: a deliberately broken manifest shows the same error text as `python3 validate_cartridges.py` in the public repo.
5. Nothing in the repo is copied from `ink-cartridges` (grep for `wrap_text` implementation etc. — only the shim's declared `apps.py` composition port exists, guarded by the drift test).

## Execution notes

- Tasks 2–5 are independent of each other after Task 1; Tasks 7+ are sequential.
- The one knowingly-duplicated code (apps.py frame composition in the shim) is fenced by the daily drift CI — any upstream host change breaks this repo's build, not the Studio silently.
