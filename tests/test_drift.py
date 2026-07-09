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
