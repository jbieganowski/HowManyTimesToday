"""Persistent press-history storage, separate from config entry options because it
grows over time and needs selective (per-week) clearing.
"""
from __future__ import annotations

from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY_PREFIX, STORAGE_VERSION


class HistoryStore:
    """Wraps a HA Store holding {slot_id: [iso_timestamp, ...]} for one config entry."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}_{entry_id}"
        )
        self._data: dict[str, list[str]] = {}

    async def async_load(self) -> None:
        self._data = await self._store.async_load() or {}

    async def _async_save(self) -> None:
        await self._store.async_save(self._data)

    def get_history(self, slot_id: str) -> list[datetime]:
        return [datetime.fromisoformat(ts) for ts in self._data.get(slot_id, [])]

    async def async_record_press(self, slot_id: str, pressed_at: datetime) -> None:
        self._data.setdefault(slot_id, []).append(pressed_at.isoformat())
        await self._async_save()

    async def async_clear_all(self, slot_id: str | None = None) -> None:
        if slot_id is None:
            self._data = {}
        else:
            self._data.pop(slot_id, None)
        await self._async_save()

    async def async_clear_weeks(self, slot_id: str, iso_weeks: list[str]) -> None:
        """Remove entries whose ISO calendar week (e.g. '2026-W41') is in iso_weeks."""
        existing = self._data.get(slot_id, [])
        if not existing:
            return
        kept = []
        for ts in existing:
            dt = datetime.fromisoformat(ts)
            iso = dt.isocalendar()
            week_key = f"{iso.year}-W{iso.week:02d}"
            if week_key not in iso_weeks:
                kept.append(ts)
        self._data[slot_id] = kept
        await self._async_save()
