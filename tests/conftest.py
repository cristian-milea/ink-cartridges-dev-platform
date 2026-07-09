import os, sys, pathlib
import pytest

REPO = os.environ.get("INK_CARTRIDGES_DIR", os.path.expanduser("~/projects/ink-cartridges"))

@pytest.fixture(scope="session")
def repo():
    if not os.path.isdir(os.path.join(REPO, "apps")):
        pytest.skip("INK_CARTRIDGES_DIR not pointing at an ink-cartridges checkout")
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "shim"))
    return REPO
