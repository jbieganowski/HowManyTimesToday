"""Load models.py/const.py as plain modules, without importing the integration's
__init__.py (which needs homeassistant installed). Keeps unit tests independent
of a real Home Assistant environment.
"""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

INTEGRATION_DIR = (
    Path(__file__).resolve().parents[1] / "custom_components" / "how_many_times_today"
)


def _load_submodule(name: str):
    full_name = f"how_many_times_today.{name}"
    if full_name in sys.modules:
        return sys.modules[full_name]
    spec = importlib.util.spec_from_file_location(full_name, INTEGRATION_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    spec.loader.exec_module(module)
    return module


if "how_many_times_today" not in sys.modules:
    pkg = types.ModuleType("how_many_times_today")
    pkg.__path__ = [str(INTEGRATION_DIR)]
    sys.modules["how_many_times_today"] = pkg

_pkg = sys.modules["how_many_times_today"]
_pkg.const = _load_submodule("const")
_pkg.models = _load_submodule("models")
