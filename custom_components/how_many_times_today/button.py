"""One confirm button per slot."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, SIGNAL_SLOTS_UPDATED
from .coordinator import HowManyTimesTodayCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: HowManyTimesTodayCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        SlotConfirmButton(coordinator, slot_id) for slot_id in coordinator.slot_defs
    )

    @callback
    def _handle_slots_updated(added: set[str], removed: set[str]) -> None:
        if added:
            async_add_entities(SlotConfirmButton(coordinator, slot_id) for slot_id in added)
        if removed:
            registry = er.async_get(hass)
            for slot_id in removed:
                entity_id = registry.async_get_entity_id("button", DOMAIN, f"{slot_id}_button")
                if entity_id:
                    registry.async_remove(entity_id)

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, SIGNAL_SLOTS_UPDATED.format(entry.entry_id), _handle_slots_updated
        )
    )


class SlotConfirmButton(CoordinatorEntity[HowManyTimesTodayCoordinator], ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: HowManyTimesTodayCoordinator, slot_id: str) -> None:
        super().__init__(coordinator)
        self._slot_id = slot_id
        slot_def = coordinator.slot_defs[slot_id]
        self._attr_unique_id = f"{slot_id}_button"
        self._attr_name = f"{slot_def.task_name} #{slot_def.index + 1}"

    async def async_press(self) -> None:
        await self.coordinator.async_press_slot(self._slot_id)
