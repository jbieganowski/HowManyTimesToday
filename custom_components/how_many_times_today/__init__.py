"""How Many Times Today — track recurring daily confirmations (meds, feeding, ...)."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import ATTR_SLOT_ID, ATTR_WEEKS, DOMAIN, SERVICE_CLEAR_HISTORY, SERVICE_PRESS_SLOT
from .coordinator import HowManyTimesTodayCoordinator

PLATFORMS = ["button", "sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = HowManyTimesTodayCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    _async_register_services(hass)
    return True


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
