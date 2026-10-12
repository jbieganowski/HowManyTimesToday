"""Central coordinator: owns slot runtime state, recomputes color stages on a timer,
and is the single place that mutates state after a press or a config change.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    CONF_BLINK_THRESHOLD_MINUTES,
    CONF_TASKS,
    DEFAULT_BLINK_THRESHOLD_MINUTES,
    DOMAIN,
    SIGNAL_SLOTS_UPDATED,
    UPDATE_INTERVAL_SECONDS,
)
from .models import (
    SlotDefinition,
    SlotRuntimeState,
    apply_press,
    build_slots,
    compute_color_stage,
    compute_initial_next_expected,
)
from .store import HistoryStore

_LOGGER = logging.getLogger(__name__)


class HowManyTimesTodayCoordinator(DataUpdateCoordinator[None]):
    """One instance per config entry (the whole integration is a singleton)."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=UPDATE_INTERVAL_SECONDS),
        )
        self.entry = entry
        self.history = HistoryStore(hass, entry.entry_id)
        self.slot_defs: dict[str, SlotDefinition] = {}
        self.slot_states: dict[str, SlotRuntimeState] = {}
        self._rebuild_slots()

    @property
    def tasks(self) -> list[dict]:
        return self.entry.options.get(CONF_TASKS, [])

    @property
    def blink_threshold_minutes(self) -> int:
        return self.entry.options.get(
            CONF_BLINK_THRESHOLD_MINUTES, DEFAULT_BLINK_THRESHOLD_MINUTES
        )

    def _rebuild_slots(self) -> tuple[set[str], set[str]]:
        """Recompute the slot list from current options, keeping runtime state for
        slots that still exist (editing a task must not wipe its history/progress).

        Returns (added_slot_ids, removed_slot_ids) so callers can add/remove the
        corresponding HA entities for slots that appear/disappear after the
        integration's initial setup (e.g. a task added/edited/removed at runtime).
        """
        new_defs: dict[str, SlotDefinition] = {}
        for task in self.tasks:
            for slot_def in build_slots(task):
                new_defs[slot_def.slot_id] = slot_def

        added = set(new_defs) - set(self.slot_defs)
        removed = set(self.slot_defs) - set(new_defs)

        now = dt_now()
        for slot_id, slot_def in new_defs.items():
            if slot_id not in self.slot_states:
                self.slot_states[slot_id] = SlotRuntimeState(
                    slot_id=slot_id,
                    next_expected_at=compute_initial_next_expected(slot_def, now),
                )
        # drop state for slots that no longer exist (task deleted/edited)
        for stale_id in set(self.slot_states) - set(new_defs):
            self.slot_states.pop(stale_id, None)

        self.slot_defs = new_defs
        return added, removed

    async def async_setup(self) -> None:
        await self.history.async_load()

    async def async_options_updated(self) -> None:
        added, removed = self._rebuild_slots()
        if added or removed:
            async_dispatcher_send(
                self.hass, SIGNAL_SLOTS_UPDATED.format(self.entry.entry_id), added, removed
            )
        await self.async_request_refresh()

    async def _async_update_data(self) -> None:
        # Nothing to fetch from the outside world; entities read slot state directly
        # through this coordinator. The periodic refresh just drives entity polling
        # for the color-stage/countdown recalculation.
        return None

    def get_task(self, task_id: str) -> dict | None:
        return next((t for t in self.tasks if t["id"] == task_id), None)

    def color_for(self, slot_id: str):
        state = self.slot_states[slot_id]
        return compute_color_stage(state, dt_now(), self.blink_threshold_minutes)

    async def async_press_slot(self, slot_id: str) -> None:
        slot_def = self.slot_defs.get(slot_id)
        state = self.slot_states.get(slot_id)
        if slot_def is None or state is None:
            raise ValueError(f"Unknown slot_id: {slot_id}")
        task = self.get_task(slot_def.task_id)
        if task is None:
            raise ValueError(f"Slot {slot_id} has no parent task")

        now = dt_now()
        apply_press(slot_def, state, now, task)
        await self.history.async_record_press(slot_id, now)
        await self.async_request_refresh()


def dt_now() -> datetime:
    # kept as a thin wrapper so tests can monkeypatch it in one place
    return datetime.now().astimezone()
