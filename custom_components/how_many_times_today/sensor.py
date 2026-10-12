"""One sensor per slot, exposing the color stage as state and everything the
Lovelace card needs (countdown, progress, history, sound choice) as attributes.
"""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_GLOBAL_SOUND, DOMAIN, SIGNAL_SLOTS_UPDATED
from .coordinator import HowManyTimesTodayCoordinator, dt_now


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: HowManyTimesTodayCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        SlotStateSensor(coordinator, slot_id) for slot_id in coordinator.slot_defs
    )

    @callback
    def _handle_slots_updated(added: set[str], removed: set[str]) -> None:
        if added:
            async_add_entities(SlotStateSensor(coordinator, slot_id) for slot_id in added)
        if removed:
            registry = er.async_get(hass)
            for slot_id in removed:
                entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{slot_id}_state")
                if entity_id:
                    registry.async_remove(entity_id)

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, SIGNAL_SLOTS_UPDATED.format(entry.entry_id), _handle_slots_updated
        )
    )


class SlotStateSensor(CoordinatorEntity[HowManyTimesTodayCoordinator], SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: HowManyTimesTodayCoordinator, slot_id: str) -> None:
        super().__init__(coordinator)
        self._slot_id = slot_id
        slot_def = coordinator.slot_defs[slot_id]
        self._attr_unique_id = f"{slot_id}_state"
        self._attr_name = f"{slot_def.task_name} #{slot_def.index + 1} status"

    @property
    def native_value(self) -> str:
        return self.coordinator.color_for(self._slot_id).stage

    @property
    def extra_state_attributes(self) -> dict:
        state = self.coordinator.slot_states[self._slot_id]
        color = self.coordinator.color_for(self._slot_id)
        now = dt_now()
        seconds_to_next = None
        if state.next_expected_at is not None:
            seconds_to_next = int((state.next_expected_at - now).total_seconds())

        history = self.coordinator.history.get_history(self._slot_id)

        return {
            "slot_id": self._slot_id,
            "last_pressed_at": state.last_pressed_at.isoformat()
            if state.last_pressed_at
            else None,
            "next_expected_at": state.next_expected_at.isoformat()
            if state.next_expected_at
            else None,
            "seconds_to_next_expected": seconds_to_next,
            "color_progress": color.progress,
            "sound": self.coordinator.entry.options.get(CONF_GLOBAL_SOUND),
            "press_count": len(history),
            "history": [ts.isoformat() for ts in history[-50:]],
        }
