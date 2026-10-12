"""How Many Times Today — track recurring daily confirmations (meds, feeding, ...)."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import ATTR_SLOT_ID, ATTR_WEEKS, DOMAIN, SERVICE_CLEAR_HISTORY, SERVICE_PRESS_SLOT
from .coordinator import HowManyTimesTodayCoordinator

PLATFORMS = ["button", "sensor"]

_LOGGER = logging.getLogger(__name__)

CARD_URL_PATH = f"/{DOMAIN}_files/how-many-times-today-card.js"
CARD_VERSION = 1  # bump to bust browser/frontend caches whenever the card JS changes


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = HowManyTimesTodayCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    _async_register_services(hass)
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
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unloaded


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    coordinator: HowManyTimesTodayCoordinator = hass.data[DOMAIN][entry.entry_id]
    await coordinator.async_options_updated()


def _async_register_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_PRESS_SLOT):
        return

    async def _handle_press(call: ServiceCall) -> None:
        slot_id = call.data[ATTR_SLOT_ID]
        for coordinator in hass.data.get(DOMAIN, {}).values():
            if slot_id in coordinator.slot_defs:
                await coordinator.async_press_slot(slot_id)
                return
        raise ValueError(f"Unknown slot_id: {slot_id}")

    async def _handle_clear_history(call: ServiceCall) -> None:
        slot_id = call.data.get(ATTR_SLOT_ID)
        weeks = call.data.get(ATTR_WEEKS)
        for coordinator in hass.data.get(DOMAIN, {}).values():
            if slot_id is None or slot_id in coordinator.slot_defs:
                if weeks:
                    await coordinator.history.async_clear_weeks(slot_id, weeks)
                else:
                    await coordinator.history.async_clear_all(slot_id)
                await coordinator.async_request_refresh()

    hass.services.async_register(
        DOMAIN,
        SERVICE_PRESS_SLOT,
        _handle_press,
        schema=vol.Schema({vol.Required(ATTR_SLOT_ID): cv.string}),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CLEAR_HISTORY,
        _handle_clear_history,
        schema=vol.Schema(
            {
                vol.Optional(ATTR_SLOT_ID): cv.string,
                vol.Optional(ATTR_WEEKS): vol.All(cv.ensure_list, [cv.string]),
            }
        ),
    )
