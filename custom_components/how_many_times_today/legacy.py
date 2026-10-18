"""One-off conversion of the previous "task with slots" data to schedules (pure logic;
the Home Assistant side - reading the old stores, writing the new ones, removing the old
entities - lives in __init__.async_migrate_entry).

A task becomes one schedule that keeps its id. A fixed-times task keeps its times, an
interval task keeps its rhythm (it starts at today's reference time). The late-press
policy no longer exists. Every old slot press becomes an on-schedule history entry.
"""
from __future__ import annotations

from datetime import datetime, time

from .const import (
    CONF_GLOBAL_SOUND,
    CONF_NOTIFY_SERVICE,
    CONF_SCHEDULE_DESCRIPTION,
    CONF_SCHEDULE_END_AT,
    CONF_SCHEDULE_FIXED_TIMES,
    CONF_SCHEDULE_ID,
    CONF_SCHEDULE_INTERVAL_HOURS,
    CONF_SCHEDULE_MODE,
    CONF_SCHEDULE_NAME,
    CONF_SCHEDULE_START_AT,
    CONF_SCHEDULE_WINDOW_MINUTES,
    CONF_SCHEDULES,
    DEFAULT_WINDOW_MINUTES,
    KIND_ON_SCHEDULE,
    MODE_FIXED_TIMES,
    MODE_INTERVAL,
)
from .models import _parse_hhmm, make_entry, normalize_hhmm

# the old task keys
_TASK_ID = "id"
_TASK_NAME = "name"
_TASK_MODE = "mode"
_TASK_TIMES = "fixed_times"
_TASK_INTERVAL = "interval_hours"
_TASK_REFERENCE = "reference_time"


def convert_task(task: dict, now: datetime) -> dict | None:
    """One old task -> one schedule dict, or None if the task is unusable."""
    try:
        base = {
            CONF_SCHEDULE_ID: task[_TASK_ID],
            CONF_SCHEDULE_NAME: task[_TASK_NAME],
            CONF_SCHEDULE_DESCRIPTION: "",
            CONF_SCHEDULE_END_AT: None,
            CONF_SCHEDULE_WINDOW_MINUTES: DEFAULT_WINDOW_MINUTES,
        }
        if task[_TASK_MODE] == MODE_FIXED_TIMES:
            times = sorted({normalize_hhmm(t) for t in task[_TASK_TIMES]})
            if not times:
                return None
            return {
                **base,
                CONF_SCHEDULE_MODE: MODE_FIXED_TIMES,
                CONF_SCHEDULE_FIXED_TIMES: times,
                CONF_SCHEDULE_START_AT: now.replace(tzinfo=None, microsecond=0).isoformat(),
            }
        if task[_TASK_MODE] == MODE_INTERVAL:
            reference: time = _parse_hhmm(task[_TASK_REFERENCE])
            start = datetime.combine(now.date(), reference)
            return {
                **base,
                CONF_SCHEDULE_MODE: MODE_INTERVAL,
                CONF_SCHEDULE_INTERVAL_HOURS: float(task[_TASK_INTERVAL]),
                CONF_SCHEDULE_START_AT: start.isoformat(),
            }
    except (KeyError, ValueError, TypeError, IndexError):
        return None
    return None


# the only options that carry over; everything else of the old model is dropped
KEPT_OPTION_KEYS = (CONF_GLOBAL_SOUND, CONF_NOTIFY_SERVICE)


def convert_options(options: dict, schedules: list[dict]) -> dict:
    """The new options: the settings that still exist plus the converted schedules."""
    kept = {key: value for key, value in options.items() if key in KEPT_OPTION_KEYS}
    kept[CONF_SCHEDULES] = schedules
    return kept


def convert_tasks(tasks: list[dict], now: datetime) -> list[dict]:
    return [s for t in tasks if (s := convert_task(t, now)) is not None]


def convert_history(task_id: str, slot_histories: dict[str, list[str]]) -> list[dict]:
    """The press timestamps of all slots of a task (`<task_id>_<n>` keys) as history
    entries, oldest first."""
    stamps: list[str] = []
    for slot_id, presses in slot_histories.items():
        if slot_id.startswith(f"{task_id}_"):
            stamps.extend(presses)
    entries = []
    for stamp in sorted(stamps, key=datetime.fromisoformat):
        entries.append(make_entry(datetime.fromisoformat(stamp), KIND_ON_SCHEDULE, None, False, 1))
    return entries


def last_press(task_id: str, slot_states: dict[str, dict]) -> str | None:
    """The newest `last_pressed_at` among a task's slots, as ISO text, or None."""
    stamps = [
        st["last_pressed_at"]
        for slot_id, st in slot_states.items()
        if slot_id.startswith(f"{task_id}_") and st.get("last_pressed_at")
    ]
    return max(stamps, key=datetime.fromisoformat) if stamps else None
