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
        # Surface render exceptions to stderr, then re-raise so render_frame's
        # existing try/except still paints the identical ERR frame (pixels
        # unchanged). Instance-level wrap only; the class method is untouched.
        _orig_render = app.render
        def _render_logged(*args, __orig=_orig_render, **kwargs):
            try:
                return __orig(*args, **kwargs)
            except Exception:
                import traceback
                print("render error:\n" + traceback.format_exc(), file=sys.stderr)
                raise
        app.render = _render_logged
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
            import traceback
            print(traceback.format_exc(), file=sys.stderr)
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
