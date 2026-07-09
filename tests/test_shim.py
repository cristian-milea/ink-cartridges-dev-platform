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
