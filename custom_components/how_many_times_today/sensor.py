"""One sensor per schedule: the state is the button's look (pending, green, transition,
red, blinking_brown, exceeded, inactive) and the attributes carry everything the card
shows. The entity services (press, clear history, switch on/off) live here too.
"""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_platform
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    ANSWERS,
    ATTR_ACTIVE,
    ATTR_ANSWER,
    ATTR_WEEKS,
    DOMAIN,
    HISTORY_ATTRIBUTE_LIMIT,
    MODE_FIXED_TIMES,
    SCHEDULE_STATES,
    SERVICE_CLEAR_HISTORY,
    SERVICE_PRESS_SCHEDULE,
    SERVICE_SET_SCHEDULE_ACTIVE,
    SERVICE_UPDATE_SCHEDULE,
    SIGNAL_SCHEDULES_UPDATED,
)
from .coordinator import HowManyTimesTodayCoordinator, dt_now
from .models import AnswerRequired, ScheduleNotActive, ScheduleUpdateError


def _unique_id(schedule_id: str) -> str:
    return f"{schedule_id}_schedule"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: HowManyTimesTodayCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(ScheduleSensor(coordinator, sid) for sid in coordinator.schedules)

    @callback
    def _handle_schedules_updated(added: set[str], removed: set[str]) -> None:
        if added:
            async_add_entities(ScheduleSensor(coordinator, sid) for sid in added)
        if removed:
            registry = er.async_get(hass)
            for sid in removed:
                entity_id = registry.async_get_entity_id("sensor", DOMAIN, _unique_id(sid))
                if entity_id:
                    registry.async_remove(entity_id)

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, SIGNAL_SCHEDULES_UPDATED.format(entry.entry_id), _handle_schedules_updated
        )
    )

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        SERVICE_PRESS_SCHEDULE,
        {vol.Optional(ATTR_ANSWER): vol.In(ANSWERS)},
        "async_press_schedule",
    )
    platform.async_register_entity_service(
        SERVICE_CLEAR_HISTORY,
        {vol.Optional(ATTR_WEEKS): vol.All(cv.ensure_list, [cv.string])},
        "async_clear_schedule_history",
    )
    # the values are validated by the backend (models.apply_schedule_update), which answers
    # with a translated error, so the schema stays loose on purpose
    platform.async_register_entity_service(
        SERVICE_UPDATE_SCHEDULE,
        {
            vol.Optional("name"): vol.Any(None, cv.string),
            vol.Optional("description"): vol.Any(None, cv.string),
            vol.Optional("fixed_times"): vol.Any(None, list, cv.string),
            vol.Optional("interval_hours"): vol.Any(None, int, float, cv.string),
            vol.Optional("start_at"): vol.Any(None, cv.string),
            vol.Optional("end_at"): vol.Any(None, cv.string),
            vol.Optional("window_minutes"): vol.Any(None, int, float, cv.string),
        },
        "async_update_schedule",
    )
    platform.async_register_entity_service(
        SERVICE_SET_SCHEDULE_ACTIVE,
        {vol.Required(ATTR_ACTIVE): cv.boolean},
        "async_set_schedule_active",
    )


class ScheduleSensor(CoordinatorEntity[HowManyTimesTodayCoordinator], SensorEntity):
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = SCHEDULE_STATES
    _attr_translation_key = "schedule"

    def __init__(self, coordinator: HowManyTimesTodayCoordinator, schedule_id: str) -> None:
        super().__init__(coordinator)
        self._schedule_id = schedule_id
        self._attr_unique_id = _unique_id(schedule_id)

    @property
    def name(self) -> str:
        # follows a rename in the options; the entity_id stays as first created
        return self.coordinator.schedules[self._schedule_id].name

    @property
    def native_value(self) -> str:
        return self.coordinator.status(self._schedule_id).state

    @property
    def extra_state_attributes(self) -> dict:
        coordinator = self.coordinator
        sid = self._schedule_id
        schedule = coordinator.schedules[sid]
        runtime = coordinator.runtime[sid]
        status = coordinator.status(sid)
        seconds_to_next = None
        if status.next_expected_at is not None:
            seconds_to_next = int((status.next_expected_at - dt_now()).total_seconds())

        attrs = {
            "schedule_id": sid,
            "name": schedule.name,
            "description": schedule.description,
            "mode": schedule.mode,
            "start_at": schedule.start_at.isoformat(),
            "end_at": schedule.end_at.isoformat() if schedule.end_at else None,
            "window_minutes": schedule.window_minutes,
            "active": status.active,
            "manually_inactive": runtime.manually_inactive,
            "count_today": status.count_today,
            "planned_count": status.planned_count,
            "count_exceeded": status.count_exceeded,
            "number_blinking": status.number_blinking,
            "answer_required": status.answer_required,
            "color_progress": status.color_progress,
            "last_pressed_at": runtime.last_press_at.isoformat() if runtime.last_press_at else None,
            "next_expected_at": status.next_expected_at.isoformat() if status.next_expected_at else None,
            "seconds_to_next_expected": seconds_to_next,
            "open_slots": status.open_slots,
            "history": coordinator.history.get(sid)[-HISTORY_ATTRIBUTE_LIMIT:],
            "sound": coordinator.sound,
        }
        if schedule.mode == MODE_FIXED_TIMES:
            attrs["times"] = [t.strftime("%H:%M") for t in schedule.fixed_times]
        else:
            attrs["interval_hours"] = schedule.interval_hours
        return attrs

    # --- entity services ----------------------------------------------------

    async def async_press_schedule(self, answer: str | None = None) -> None:
        try:
            await self.coordinator.async_press(self._schedule_id, answer)
        except AnswerRequired as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="answer_required"
            ) from err
        except ScheduleNotActive as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="schedule_not_active"
            ) from err

    async def async_clear_schedule_history(self, weeks: list[str] | None = None) -> None:
        await self.coordinator.async_clear_history(self._schedule_id, weeks)

    async def async_update_schedule(self, **changes) -> None:
        try:
            await self.coordinator.async_update_schedule(self._schedule_id, changes)
        except ScheduleUpdateError as err:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key=err.key) from err

    async def async_set_schedule_active(self, active: bool) -> None:
        await self.coordinator.async_set_active(self._schedule_id, active)
