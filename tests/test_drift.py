"""Golden-frame drift guard: shim composition must be pixel-identical to the
real host (apps.py) for every published cartridge."""
import glob, importlib.util, os, sys
from unittest import mock
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
    # Give each compositor its OWN freshly-loaded instance so neither can
    # perturb the other: some cartridges mutate self-state inside render()
    # (ricochet-robots flips _gen_phase, blackjack advances _dealer_step), and
    # sharing one instance would let whichever renders first corrupt the second
    # render's input state.
    #
    # Construction must be deterministic for the two instances to match, but
    # maze + ricochet-robots (and tide-sun, vector-racing) seed themselves from
    # int(time.time()*1000) when no state file exists — two fresh instances
    # loaded microseconds apart would otherwise get different seeds and diverge.
    # Freeze the wall clock across both loads so both instances construct with
    # an identical seed. render() itself reads no clock for any of these
    # cartridges, so freezing only construction is sufficient (we hold it over
    # the renders too, harmlessly, for belt-and-braces).
    with mock.patch("time.time", return_value=1_700_000_000.0):
        app_ours = _load_instance(shim, repo, d)
        app_theirs = _load_instance(shim, repo, d)
        ours = shim.render_frame(app_ours, [app_ours], "left")
        theirs = host._render_app_frame(app_theirs, FakeUi(), "left", [app_theirs])
    assert list(ours.getdata()) == list(theirs.getdata()), \
        f"{os.path.basename(d)}: shim frame differs from host frame"
