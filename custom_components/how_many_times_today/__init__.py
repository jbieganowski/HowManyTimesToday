"""How Many Times Today — track recurring daily confirmations (meds, feeding, ...)."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from . import legacy
from .const import (
    CONF_SCHEDULES,
    DOMAIN,
    LEGACY_CONF_TASKS,
    LEGACY_STORAGE_HISTORY_PREFIX,
    LEGACY_STORAGE_STATE_PREFIX,
    STORAGE_KEY_HISTORY_PREFIX,
    STORAGE_KEY_STATE_PREFIX,
    STORAGE_VERSION,
)
from .coordinator import HowManyTimesTodayCoordinator
from .models import ScheduleRuntime

PLATFORMS = ["sensor"]

_LOGGER = logging.getLogger(__name__)

CARD_URL_PATH = f"/{DOMAIN}_files/how-many-times-today-card.js"


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Version 1 (tasks with slots) -> 2 (schedules): move the tasks, the press history and
    each task's last press, and drop the old slot entities."""
    if entry.version >= 2:
        return True

    now = dt_util.now()
    tasks = entry.options.get(LEGACY_CONF_TASKS, [])
    schedules = legacy.convert_tasks(tasks, now)
    options = legacy.convert_options(dict(entry.options), schedules)

    old_history = await Store(hass, STORAGE_VERSION, f"{LEGACY_STORAGE_HISTORY_PREFIX}_{entry.entry_id}").async_load() or {}
    old_state = await Store(hass, STORAGE_VERSION, f"{LEGACY_STORAGE_STATE_PREFIX}_{entry.entry_id}").async_load() or {}

    history: dict[str, list[dict]] = {}
    runtimes: dict[str, dict] = {}
    for schedule in schedules:
        sid = schedule["id"]
        entries = legacy.convert_history(sid, old_history)
        if entries:
            history[sid] = entries
        runtime = ScheduleRuntime(schedule_id=sid, processed_until=now)
        last = legacy.last_press(sid, old_state)
        if last:
            runtime.last_press_at = dt_util.parse_datetime(last)
        runtimes[sid] = runtime.to_dict()
    await Store(hass, STORAGE_VERSION, f"{STORAGE_KEY_HISTORY_PREFIX}_{entry.entry_id}").async_save(history)
    await Store(hass, STORAGE_VERSION, f"{STORAGE_KEY_STATE_PREFIX}_{entry.entry_id}").async_save(runtimes)

    registry = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
        if entity.unique_id.endswith(("_state", "_button")):
            registry.async_remove(entity.entity_id)

    hass.config_entries.async_update_entry(entry, options=options, version=2)
    _LOGGER.info("Migrated %d task(s) to schedules", len(schedules))
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = HowManyTimesTodayCoordinator(hass, entry)
    coordinator.version = str((await async_get_integration(hass, DOMAIN)).version)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    await _async_register_frontend_card(hass)
    return True


class _CardView(HomeAssistantView):
    """Serves the card's JavaScript from the package.

    The file is re-read on every request and sent with an ETag and
    `Cache-Control: no-cache`: the browser asks "did it change?" on each page load and
    gets a cheap 304 when not. So editing the card takes effect on the next page load -
    no Home Assistant restart and no version number to bump - and there is no versioned
    URL that a service worker or the browser could keep serving stale.
    """

    url = CARD_URL_PATH
    name = f"{DOMAIN}:card"
    requires_auth = False  # a <script> tag cannot send credentials; it is only the card

    def __init__(self, hass: HomeAssistant, path: Path) -> None:
        self._hass = hass
        self._path = path

    async def get(self, request: web.Request) -> web.Response:
        data = await self._hass.async_add_executor_job(self._path.read_bytes)
        etag = f'"{hashlib.md5(data).hexdigest()}"'  # noqa: S324 - a cache validator, not security
        headers = {"Cache-Control": "no-cache", "ETag": etag}
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=304, headers=headers)
        return web.Response(
            body=data, content_type="application/javascript", charset="utf-8", headers=headers
        )


async def _async_register_frontend_card(hass: HomeAssistant) -> None:
    """Serve the bundled Lovelace card and auto-inject it, so users never have to
    add a Resource manually in Settings -> Dashboards (one-click install only).
    """
    if hass.data.get(f"{DOMAIN}_frontend_registered"):
        return
    hass.data[f"{DOMAIN}_frontend_registered"] = True

    # The card ships INSIDE this package (custom_components/how_many_times_today/www/),
    # not under <config>/www/ - HACS (integration category) only deploys the
    # custom_components/<domain>/ tree, so anything outside it would never
    # reach a real installation.
    card_path = Path(__file__).parent / "www" / "how-many-times-today-card.js"

    try:
        hass.http.register_view(_CardView(hass, card_path))
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Could not register the How Many Times Today card; "
            "add it manually as a Lovelace resource: %s",
            CARD_URL_PATH,
        )
        return

    from homeassistant.components.frontend import add_extra_js_url

    add_extra_js_url(hass, CARD_URL_PATH)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        coordinator = hass.data[DOMAIN].pop(entry.entry_id, None)
        if coordinator is not None:
            coordinator.async_unload()
    return unloaded


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    coordinator: HowManyTimesTodayCoordinator = hass.data[DOMAIN][entry.entry_id]
    await coordinator.async_options_updated()
