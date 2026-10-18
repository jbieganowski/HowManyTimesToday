"""Persistent storage, kept apart from the config entry options because it grows over
time (history) or changes constantly (runtime state).
"""
from __future__ import annotations

from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    LEGACY_STORAGE_HISTORY_PREFIX,
    LEGACY_STORAGE_STATE_PREFIX,
    STORAGE_KEY_HISTORY_PREFIX,
    STORAGE_KEY_STATE_PREFIX,
    STORAGE_VERSION,
)


class ScheduleStateStore:
    """Per-schedule runtime state (last press, open terms, blinking number, switched-off
    flag) as {schedule_id: dict}, so progress survives a Home Assistant restart."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY_STATE_PREFIX}_{entry_id}")

    async def async_load(self) -> dict[str, dict]:
        return await self._store.async_load() or {}

    async def async_save(self, runtimes: dict) -> None:
        """Replace the stored snapshot with {schedule_id: ScheduleRuntime}."""
        await self._store.async_save({sid: rt.to_dict() for sid, rt in runtimes.items()})


class HistoryStore:
    """Press log per schedule: {schedule_id: [entry, ...]}, entries oldest first.

    An entry is {timestamp, kind, scheduled_at, outside_schedule, count_delta}; the day's
    counter is derived from these, so it needs no storage of its own.
    """

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY_HISTORY_PREFIX}_{entry_id}")
        self._data: dict[str, list[dict]] = {}

    async def async_load(self) -> None:
        self._data = await self._store.async_load() or {}

    async def _async_save(self) -> None:
        await self._store.async_save(self._data)

    def get(self, schedule_id: str) -> list[dict]:
        return self._data.get(schedule_id, [])

    async def async_append(self, schedule_id: str, entries: list[dict]) -> None:
        if not entries:
            return
        self._data.setdefault(schedule_id, []).extend(entries)
        await self._async_save()

    async def async_replace(self, schedule_id: str, entries: list[dict]) -> None:
        """Set a schedule's whole history (used by the one-off migration)."""
        self._data[schedule_id] = list(entries)
        await self._async_save()

    async def async_replace_day(self, schedule_id: str, day, entries: list[dict], tz) -> None:
        """Replace everything recorded on the local `day` with `entries`, keeping the
        other days (used by the reset to "everything on time")."""
        kept = [
            e for e in self._data.get(schedule_id, [])
            if datetime.fromisoformat(e["timestamp"]).astimezone(tz).date() != day
        ]
        self._data[schedule_id] = sorted(kept + entries, key=lambda e: e["timestamp"])
        await self._async_save()

    async def async_drop(self, schedule_ids) -> None:
        """Forget the history of deleted schedules."""
        removed = [sid for sid in schedule_ids if sid in self._data]
        for sid in removed:
            del self._data[sid]
        if removed:
            await self._async_save()

    async def async_clear(self, schedule_id: str | None = None, iso_weeks: list[str] | None = None) -> None:
        """Clear history: everything or only the given ISO weeks (e.g. '2026-W41'), for
        one schedule or - with schedule_id None - for every schedule."""
        ids = list(self._data) if schedule_id is None else [schedule_id]
        changed = False
        for sid in ids:
            existing = self._data.get(sid)
            if not existing:
                continue
            if iso_weeks:
                kept = []
                for entry in existing:
                    iso = datetime.fromisoformat(entry["timestamp"]).isocalendar()
                    if f"{iso.year}-W{iso.week:02d}" not in iso_weeks:
                        kept.append(entry)
                self._data[sid] = kept
            else:
                self._data[sid] = []
            changed = True
        if changed:
            await self._async_save()


async def async_remove_all(hass: HomeAssistant, entry_id: str) -> None:
    """Delete every file the integration keeps for a config entry (runtime state, press
    history and what an older version left behind); called when the entry is removed."""
    for prefix in (
        STORAGE_KEY_STATE_PREFIX,
        STORAGE_KEY_HISTORY_PREFIX,
        LEGACY_STORAGE_STATE_PREFIX,
        LEGACY_STORAGE_HISTORY_PREFIX,
    ):
        await Store(hass, STORAGE_VERSION, f"{prefix}_{entry_id}").async_remove()
