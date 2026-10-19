"""How Many Times Today — track recurring daily confirmations (meds, feeding, ...)."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
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
from .store import async_remove_all
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


# a bare `how_many_times_today:` line in configuration.yaml is all the YAML there is
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """With the line above in configuration.yaml the integration adds itself (once) on
    the next start; without it nothing happens here and it is added in the UI."""
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_IMPORT}, data={})
        )
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """The integration was deleted: remove its stored state and history with it, and the
    dashboard resource it added."""
    await async_remove_all(hass, entry.entry_id)
    await _async_remove_dashboard_resource(hass)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = HowManyTimesTodayCoordinator(hass, entry)
    coordinator.version = str((await async_get_integration(hass, DOMAIN)).version)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    # the version in the URL makes every client fetch the card again after an update (some
    # apps keep a script cached under its address however it is served)
    card_url = f"{CARD_URL_PATH}?v={coordinator.version}"
    await _async_register_frontend_card(hass, card_url)
    await _async_ensure_dashboard_resource(hass, card_url)  # every setup: removed with the entry
    return True


class _CardView(HomeAssistantView):
    """Serves the card's JavaScript from the package.

    The file is re-read on every request and sent in full with `Cache-Control: no-store`,
    so editing the card takes effect on the next page load.
    """

    url = CARD_URL_PATH
    name = f"{DOMAIN}:card"
    requires_auth = False  # a <script> tag cannot send credentials; it is only the card

    def __init__(self, hass: HomeAssistant, path: Path) -> None:
        self._hass = hass
        self._path = path

    async def get(self, request: web.Request) -> web.Response:
        agent = (request.headers.get("User-Agent") or "unknown")[:110]
        # the card reports back (a tiny GET with a query): that it started, or what stopped it
        if "loaded" in request.query:
            _LOGGER.warning("Card started in %s: %s", agent, request.query["loaded"][:60])
            return web.Response(status=204)
        if "report" in request.query:
            _LOGGER.warning("Card script problem in %s: %s", agent, request.query["report"][:300])
            return web.Response(status=204)
        data = await self._hass.async_add_executor_job(self._path.read_bytes)
        # always sent in full and never kept: a client that holds a copy of it
        # (a conditional request answered "not modified") has shown the old or no card
        _LOGGER.warning("Card file requested by %s (%s)", agent, request.remote or "?")
        return web.Response(
            body=data,
            content_type="application/javascript",
            charset="utf-8",
            headers={"Cache-Control": "no-store"},
        )


async def _async_register_frontend_card(hass: HomeAssistant, card_url: str = CARD_URL_PATH) -> None:
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

    add_extra_js_url(hass, card_url)


def _storage_resources(hass: HomeAssistant):
    """The dashboard resource collection when dashboards run in storage mode (the usual
    case), else None (YAML mode: the resources are the user's own file)."""
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None or not hasattr(resources, "async_create_item"):
        return None
    return resources


async def _async_ensure_dashboard_resource(hass: HomeAssistant, card_url: str = CARD_URL_PATH) -> None:
    """Also register the card as a dashboard resource. The dashboard loads its resources
    itself, the way every other custom card is loaded, so the card is defined whatever
    happens to the extra module above (on a busy page that one sometimes never ran and the
    cards showed "Custom element doesn't exist" until the next reload). Both routes load
    the same URL and the card defines its elements only once."""
    try:
        resources = _storage_resources(hass)
        if resources is None:
            return
        await resources.async_get_info()  # makes sure the stored list is loaded
        existing = [item for item in resources.async_items() if _is_card_resource(item)]
        if not existing:
            await resources.async_create_item({"res_type": "module", "url": card_url})
        elif existing[0].get("url") != card_url:  # a new version: the address changes with it
            await resources.async_update_item(existing[0]["id"], {"res_type": "module", "url": card_url})
    except Exception:  # noqa: BLE001 - the extra module still loads the card
        _LOGGER.debug("Could not register the card as a dashboard resource", exc_info=True)


def _is_card_resource(item: dict) -> bool:
    return str(item.get("url", "")).split("?", 1)[0] == CARD_URL_PATH


async def _async_remove_dashboard_resource(hass: HomeAssistant) -> None:
    """Take the resource added by `_async_ensure_dashboard_resource` away again."""
    try:
        resources = _storage_resources(hass)
        if resources is None:
            return
        await resources.async_get_info()
        for item in list(resources.async_items()):
            if _is_card_resource(item):
                await resources.async_delete_item(item["id"])
    except Exception:  # noqa: BLE001
        _LOGGER.debug("Could not remove the card's dashboard resource", exc_info=True)


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
