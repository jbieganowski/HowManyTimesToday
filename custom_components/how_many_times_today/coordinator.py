"""Central coordinator: owns the schedules' runtime state, moves time forward, and is the
single place that mutates state after a press or a config change.

Besides the periodic refresh (it keeps the colour progress moving) it arms a timer for the
exact next moment anything changes by itself - a term coming due, a window ending, a
term being declared missed, midnight - so those happen on the second, not up to 30 s late.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    CONF_GLOBAL_SOUND,
    CONF_NOTIFY_SERVICE,
    CONF_SCHEDULE_ID,
    CONF_SCHEDULES,
    DOMAIN,
    EVENT_DUE,
    SIGNAL_SCHEDULES_UPDATED,
    UPDATE_INTERVAL_SECONDS,
    AVAILABLE_SOUNDS,
)
from .models import (
    OPEN,
    DueEvent,
    ScheduleNotActive,
    Schedule,
    ScheduleRuntime,
    Status,
    advance,
    apply_schedule_update,
    build_schedule,
    compute_status,
    new_runtime,
    next_boundary,
    press,
    reset_to_on_schedule,
)
from .store import HistoryStore, ScheduleStateStore

_LOGGER = logging.getLogger(__name__)


def dt_now() -> datetime:
    # a thin wrapper so tests can replace the clock in one place
    return dt_util.now()


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
        self.version = ""  # from manifest.json, set by async_setup_entry
        self.state_store = ScheduleStateStore(hass, entry.entry_id)
        self.history = HistoryStore(hass, entry.entry_id)
        self.schedules: dict[str, Schedule] = {}
        self.runtime: dict[str, ScheduleRuntime] = {}
        self._unsub_boundary = None
        self._due_queue: list[tuple[Schedule, DueEvent]] = []
        self._rebuild_schedules()

    # --- configuration ----------------------------------------------------------

    @property
    def schedule_configs(self) -> list[dict]:
        return self.entry.options.get(CONF_SCHEDULES, [])

    @property
    def sound(self) -> str:
        return self.entry.options.get(CONF_GLOBAL_SOUND, AVAILABLE_SOUNDS[0])

    @property
    def notify_service(self) -> str | None:
        return self.entry.options.get(CONF_NOTIFY_SERVICE) or None

    def _rebuild_schedules(self) -> tuple[set[str], set[str]]:
        """Recompute the schedules from the current options, keeping runtime state for
        those that still exist (editing a schedule must not wipe its progress).

        Returns (added_ids, removed_ids) so the entities can follow.
        """
        now = dt_now()
        new: dict[str, Schedule] = {}
        for cfg in self.schedule_configs:
            try:
                schedule = build_schedule(cfg, now.tzinfo)
            except (KeyError, ValueError, TypeError) as err:
                _LOGGER.error("Ignoring invalid schedule %s: %s", cfg.get(CONF_SCHEDULE_ID), err)
                continue
            new[schedule.id] = schedule

        added = set(new) - set(self.schedules)
        removed = set(self.schedules) - set(new)

        for sid, schedule in new.items():
            if sid not in self.runtime:
                self.runtime[sid] = new_runtime(schedule, now)
            elif sid in self.schedules and self.schedules[sid] != schedule:
                # edited: a term resolved in advance may no longer exist in the new
                # pattern, so forget those (open terms stay - they really happened)
                rt = self.runtime[sid]
                rt.occurrences = {
                    k: v for k, v in rt.occurrences.items()
                    if v["status"] == OPEN or datetime.fromisoformat(k) <= now
                }
        for sid in removed:
            self.runtime.pop(sid, None)
        for stale in set(self.runtime) - set(new):
            self.runtime.pop(stale, None)

        self.schedules = new
        return added, removed

    # --- lifecycle --------------------------------------------------------------

    async def async_setup(self) -> None:
        await self.history.async_load()
        saved = await self.state_store.async_load()
        for sid in self.schedules:
            data = saved.get(sid)
            if not data:
                continue
            try:
                self.runtime[sid] = ScheduleRuntime.from_dict(sid, data)
            except (ValueError, TypeError, AttributeError, KeyError):
                _LOGGER.warning("Ignoring unreadable saved state for schedule %s", sid)
        await self._async_process(dt_now())

    async def async_options_updated(self) -> None:
        added, removed = self._rebuild_schedules()
        if added or removed:
            async_dispatcher_send(
                self.hass, SIGNAL_SCHEDULES_UPDATED.format(self.entry.entry_id), added, removed
            )
        if removed:
            await self.history.async_drop(removed)
        await self.state_store.async_save(self.runtime)
        await self.async_refresh()

    def async_unload(self) -> None:
        if self._unsub_boundary is not None:
            self._unsub_boundary()
            self._unsub_boundary = None

    # --- time -------------------------------------------------------------------

    async def _async_update_data(self) -> None:
        await self._async_process(dt_now())

    async def _async_process(self, now: datetime) -> None:
        """Move every schedule up to `now`, persist what changed, send due alerts and arm
        the timer for the next moment something changes by itself."""
        dirty = False
        for sid, schedule in list(self.schedules.items()):
            rt = self.runtime[sid]
            before = rt.to_dict()
            events, entries = advance(schedule, rt, now)
            if entries:
                await self.history.async_append(sid, entries)
            if rt.to_dict() != before:
                dirty = True
            self._due_queue.extend((schedule, event) for event in events)
        if dirty:
            await self.state_store.async_save(self.runtime)
        self._arm_boundary(now)
        if self._due_queue:
            # announce from a separate task: it runs once this refresh has finished and
            # the entities have taken the new state, so whoever reacts to the event
            # (an automation reading the sensor) already sees "red"
            self.hass.async_create_task(self._async_flush_due())

    async def _async_flush_due(self) -> None:
        queue, self._due_queue = self._due_queue, []
        for schedule, event in queue:
            await self._async_announce_due(schedule, event)

    def _arm_boundary(self, now: datetime) -> None:
        if self._unsub_boundary is not None:
            self._unsub_boundary()
            self._unsub_boundary = None
        moments = [
            m for sid, s in self.schedules.items()
            if (m := next_boundary(s, self.runtime[sid], now)) is not None
        ]
        if moments:
            # a second of slack so the timer never fires just before the moment
            self._unsub_boundary = async_track_point_in_time(
                self.hass, self._handle_boundary, min(moments) + timedelta(seconds=1)
            )

    @callback
    def _handle_boundary(self, _now: datetime) -> None:
        self._unsub_boundary = None
        self.hass.async_create_task(self.async_refresh())

    # --- notifications ----------------------------------------------------------

    def entity_id_for(self, schedule_id: str) -> str | None:
        from homeassistant.helpers import entity_registry as er

        return er.async_get(self.hass).async_get_entity_id("sensor", DOMAIN, f"{schedule_id}_schedule")

    async def _async_announce_due(self, schedule: Schedule, event: DueEvent) -> None:
        """A term has just become due: an event (for automations) and, if configured, a
        push through the mobile app. Once per term - there are no repeats."""
        self.hass.bus.async_fire(
            EVENT_DUE,
            {
                "entity_id": self.entity_id_for(schedule.id),
                "name": schedule.name,
                "description": schedule.description,
                "scheduled_at": event.scheduled_at.isoformat(),
            },
        )
        service = self.notify_service
        if not service:
            return
        domain, _, name = service.rpartition(".")
        try:
            await self.hass.services.async_call(
                domain or "notify",
                name,
                {"title": schedule.name, "message": schedule.description or schedule.name},
                blocking=False,
            )
        except Exception:  # noqa: BLE001 - a broken notifier must not break the schedule
            _LOGGER.warning("Could not send the push notification via %s", service, exc_info=True)

    # --- reads for the entities --------------------------------------------------

    def status(self, schedule_id: str) -> Status:
        return compute_status(
            self.schedules[schedule_id], self.runtime[schedule_id], self.history.get(schedule_id), dt_now()
        )

    # --- actions ----------------------------------------------------------------

    def _require(self, schedule_id: str) -> tuple[Schedule, ScheduleRuntime]:
        schedule = self.schedules.get(schedule_id)
        if schedule is None:
            raise ValueError(f"Unknown schedule: {schedule_id}")
        return schedule, self.runtime[schedule_id]

    async def async_press(self, schedule_id: str, answer: str | None = None) -> None:
        """Register a press. Raises AnswerRequired / ScheduleNotActive (see models)."""
        schedule, rt = self._require(schedule_id)
        now = dt_now()
        await self._async_process(now)  # catch up first: terms may have come due
        entries = press(schedule, rt, now, self.history.get(schedule_id), answer)
        await self.history.async_append(schedule_id, entries)
        await self.state_store.async_save(self.runtime)
        await self.async_refresh()

    async def async_update_schedule(self, schedule_id: str, changes: dict) -> None:
        """Change a schedule's name, description, times/interval, start, end or tolerance
        window. The change is validated, written to the config entry's options (so it is
        stored like any other edit) and the update listener rebuilds the schedules.
        Raises models.ScheduleUpdateError for an unacceptable change."""
        self._require(schedule_id)
        configs = [dict(cfg) for cfg in self.schedule_configs]
        index = next(i for i, cfg in enumerate(configs) if cfg[CONF_SCHEDULE_ID] == schedule_id)
        configs[index] = apply_schedule_update(configs[index], changes, dt_now().tzinfo)
        options = dict(self.entry.options)
        options[CONF_SCHEDULES] = configs
        self.hass.config_entries.async_update_entry(self.entry, options=options)

    async def async_reset_to_on_schedule(
        self, schedule_ids: list[str] | None = None, skip_inactive: bool = False
    ) -> list[str]:
        """Set schedules to "everything was done on time" (see models.reset_to_on_schedule):
        today's counter and history match the terms that have come due. `schedule_ids`
        None means every schedule. A schedule that is off or has not started raises
        ScheduleNotActive, or is skipped with `skip_inactive`. Returns the ids reset."""
        now = dt_now()
        done = []
        for sid in (list(self.schedules) if schedule_ids is None else schedule_ids):
            schedule, rt = self._require(sid)
            try:
                entries = reset_to_on_schedule(schedule, rt, now)
            except ScheduleNotActive:
                if skip_inactive or schedule_ids is None:
                    continue
                raise
            await self.history.async_replace_day(sid, now.date(), entries, now.tzinfo)
            done.append(sid)
        await self.state_store.async_save(self.runtime)
        await self.async_refresh()
        return done

    async def async_set_active(self, schedule_id: str, active: bool) -> None:
        _, rt = self._require(schedule_id)
        rt.manually_inactive = not active
        rt.processed_until = dt_now()  # the time spent off is not backfilled
        await self.state_store.async_save(self.runtime)
        await self.async_refresh()

    async def async_clear_history(self, schedule_id: str | None, weeks: list[str] | None) -> None:
        if schedule_id is not None:
            self._require(schedule_id)
        await self.history.async_clear(schedule_id, weeks)
        await self.async_refresh()
