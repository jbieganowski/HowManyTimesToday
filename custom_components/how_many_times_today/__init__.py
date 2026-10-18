"""How Many Times Today — track recurring daily confirmations (meds, feeding, ...)."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
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
CARD_VERSION = 6  # bump to bust browser/frontend caches whenever the card JS changes


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
    coordinator =HowManyTimesTodayCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    await _async_register_frontend_card(hass)
    return True


async def _async_register_frontend_card(hass: HomeAssistant) -> None:
    """Serve the bundled Lovelace card and auto-inject it, so users never have to
    add a Resource manually in Settings -> Dashboards (one-click install only).
    """
    if hass.data.get(f"{DOMAIN}_frontend_registered"):
        return
    hass.data[f"{DOMAIN}_frontend_registered"] = True

    # The card ships INSIDE this package (custom_components/how_many_times_today/www/),
    # not under <config>/www/ — HACS (integration category) only deploys the
    # custom_components/<domain>/ tree, so anything outside it would never
    # reach a real installation.
    card_path = str(Path(__file__).parent / "www" / "how-many-times-today-card.js")

    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(CARD_URL_PATH, card_path, cache_headers=False)]
        )
    except ImportError:
        # older HA core without StaticPathConfig
        hass.http.register_static_path(CARD_URL_PATH, card_path, cache_headers=False)
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Could not register the How Many Times Today card as a static path; "
            "add it manually as a Lovelace resource: %s",
            CARD_URL_PATH,
        )
        return

    from homeassistant.components.frontend import add_extra_js_url

    add_extra_js_url(hass, f"{CARD_URL_PATH}?v={CARD_VERSION}")


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
