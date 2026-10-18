"""Load the integration's pure modules, plus store.py and coordinator.py against small
fake `homeassistant.*` modules, without importing the integration's __init__.py (which
needs homeassistant installed). Keeps the unit tests independent of a real Home Assistant
environment; the code under test is unchanged.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import types
from datetime import datetime, timezone
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


class FakeStore:
    """In-memory stand-in for homeassistant.helpers.storage.Store. Data lives in a
    class-level dict keyed by storage key, so a test can simulate an HA restart by
    building a fresh coordinator that reads what the previous one saved.
    """

    saved: dict[str, object] = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return FakeStore.saved.get(self.key)

    async def async_remove(self):
        FakeStore.saved.pop(self.key, None)

    async def async_save(self, data):
        # round-trip through JSON like the real Store, to catch non-serializable data
        FakeStore.saved[self.key] = json.loads(json.dumps(data))


class FakeDataUpdateCoordinator:
    def __init__(self, hass, logger, *, name, update_interval):
        self.hass = hass
        self.refresh_calls = 0

    def __class_getitem__(cls, item):
        return cls

    async def async_refresh(self):
        started = len(self.hass.tasks)
        self.refresh_calls += 1
        await self._async_update_data()
        # in Home Assistant a task created during the update runs once the entities have
        # taken the new state (right after this coroutine returns); do the same here
        created = self.hass.tasks[started:]
        del self.hass.tasks[started:]
        for task in created:
            await task

    async def async_request_refresh(self):
        await self.async_refresh()


class FakeBus:
    def __init__(self):
        self.fired: list[tuple[str, dict]] = []

    def async_fire(self, event_type, data=None):
        self.fired.append((event_type, data))


class FakeServices:
    def __init__(self):
        self.calls: list[tuple] = []

    async def async_call(self, domain, service, data=None, blocking=False):
        self.calls.append((domain, service, data, blocking))


class FakeConfigEntries:
    def __init__(self):
        self.updates = 0

    def async_update_entry(self, entry, options=None, **_):
        # like Home Assistant: the entry's options are replaced at once (its update listener,
        # which the tests call by hand, follows afterwards)
        self.updates += 1
        if options is not None:
            entry.options = options


class FakeHass:
    def __init__(self):
        self.bus = FakeBus()
        self.services = FakeServices()
        self.config_entries = FakeConfigEntries()
        self.tasks: list = []

    def async_create_task(self, coro):
        self.tasks.append(coro)
        return coro


# what the fakes record, reset by the tests' autouse fixture
DISPATCHED: list[tuple] = []
TIMERS: list[tuple] = []  # (when, callback) of every async_track_point_in_time call
CLOCK = {"now": datetime(2026, 10, 19, 6, 0, tzinfo=timezone.utc)}


def _track_point_in_time(hass, action, point_in_time):
    entry = [point_in_time, action, False]
    TIMERS.append(entry)

    def cancel():
        entry[2] = True

    return cancel


def _install_fake_homeassistant() -> None:
    def module(name, **attrs):
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        sys.modules[name] = mod
        return mod

    module("homeassistant")
    module("homeassistant.config_entries", ConfigEntry=object)
    module("homeassistant.core", HomeAssistant=object, callback=lambda func: func)
    module("homeassistant.helpers")
    module(
        "homeassistant.helpers.dispatcher",
        async_dispatcher_send=lambda hass, signal, *args: DISPATCHED.append((signal, *args)),
    )
    module("homeassistant.helpers.event", async_track_point_in_time=_track_point_in_time)
    module("homeassistant.helpers.update_coordinator", DataUpdateCoordinator=FakeDataUpdateCoordinator)
    module("homeassistant.helpers.storage", Store=FakeStore)
    util = module("homeassistant.util")
    util.dt = module("homeassistant.util.dt", now=lambda: CLOCK["now"])


_install_fake_homeassistant()

if "how_many_times_today" not in sys.modules:
    pkg = types.ModuleType("how_many_times_today")
    pkg.__path__ = [str(INTEGRATION_DIR)]
    sys.modules["how_many_times_today"] = pkg

_pkg = sys.modules["how_many_times_today"]
_pkg.const = _load_submodule("const")
_pkg.models = _load_submodule("models")
_pkg.store = _load_submodule("store")
_pkg.coordinator = _load_submodule("coordinator")
