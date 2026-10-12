"""Pure scheduling/data model logic (no Home Assistant imports, easy to unit test)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from typing import Literal

from .const import (
    LATE_POLICY_COMPRESS,
    LATE_POLICY_RESET,
    MODE_FIXED_TIMES,
    MODE_INTERVAL,
    STAGE_BLINKING,
    STAGE_GREEN,
    STAGE_OVERDUE,
    STAGE_TRANSITION,
)


def _parse_hhmm(value: str) -> time:
    # HA's TimeSelector returns "HH:MM:SS"; manually typed fixed_times entries are
    # "HH:MM" - accept both, ignore seconds either way
    parts = value.split(":")
    return time(int(parts[0]), int(parts[1]))


@dataclass
class SlotDefinition:
    """Static definition of a single expected occurrence (one button/sensor pair)."""

    slot_id: str
    task_id: str
    task_name: str
    index: int  # position within the task (0-based), used for naming/ordering
    anchor_time: time  # time-of-day this slot is "due" relative to its cycle


@dataclass
class SlotRuntimeState:
    """Mutable, persisted-ish runtime state for one slot."""

    slot_id: str
    last_pressed_at: datetime | None = None
    next_expected_at: datetime | None = None
    cycle_started_at: datetime | None = None  # start of the green->red gradient
    # one-shot override applied by the user on the most recent late press
    pending_late_override: Literal["compress", "reset"] | None = None


def build_slots(task: dict) -> list[SlotDefinition]:
    """Expand one task definition into its independent slots."""
    task_id = task["id"]
    name = task["name"]
    mode = task["mode"]
    slots: list[SlotDefinition] = []

    if mode == MODE_FIXED_TIMES:
        for i, hhmm in enumerate(task["fixed_times"]):
            slots.append(
                SlotDefinition(
                    slot_id=f"{task_id}_{i}",
                    task_id=task_id,
                    task_name=name,
                    index=i,
                    anchor_time=_parse_hhmm(hhmm),
                )
            )
    elif mode == MODE_INTERVAL:
        interval = float(task["interval_hours"])
        reference = _parse_hhmm(task["reference_time"])
        occurrences_per_day = max(1, round(24 / interval))
        ref_minutes = reference.hour * 60 + reference.minute
        for i in range(occurrences_per_day):
            minutes = (ref_minutes + round(i * interval * 60)) % (24 * 60)
            slots.append(
                SlotDefinition(
                    slot_id=f"{task_id}_{i}",
                    task_id=task_id,
                    task_name=name,
                    index=i,
                    anchor_time=time(minutes // 60, minutes % 60),
                )
            )
    else:
        raise ValueError(f"Unknown schedule mode: {mode}")

    return slots


def next_occurrence_from(anchor: time, now: datetime) -> datetime:
    """Next datetime (today or tomorrow) matching the given time-of-day, after `now`."""
    candidate = now.replace(
        hour=anchor.hour, minute=anchor.minute, second=0, microsecond=0
    )
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def compute_initial_next_expected(slot_def: SlotDefinition, now: datetime) -> datetime:
    return next_occurrence_from(slot_def.anchor_time, now)


def apply_press(
    slot_def: SlotDefinition,
    state: SlotRuntimeState,
    pressed_at: datetime,
    task: dict,
) -> SlotRuntimeState:
    """Update slot state after a confirmation press, handling fixed-time vs interval
    scheduling and the late-press compress/reset policy.
    """
    mode = task["mode"]
    state.last_pressed_at = pressed_at
    state.cycle_started_at = pressed_at

    if mode == MODE_FIXED_TIMES:
        # fixed times always refer back to the clock, delay does not shift them
        state.next_expected_at = next_occurrence_from(slot_def.anchor_time, pressed_at)
        state.pending_late_override = None
        return state

    # interval mode: handle on-time vs late press
    interval = timedelta(hours=float(task["interval_hours"]))
    previous_expected = state.next_expected_at
    policy = state.pending_late_override or task.get("late_policy", LATE_POLICY_COMPRESS)

    if previous_expected is not None and pressed_at > previous_expected:
        delay = pressed_at - previous_expected
        if policy == LATE_POLICY_RESET:
            state.next_expected_at = pressed_at + interval
        else:  # compress: keep the original rhythm, shorten this one cycle only
            state.next_expected_at = previous_expected + interval
            if state.next_expected_at <= pressed_at:
                # delay larger than the interval itself: fall back to a fresh interval
                state.next_expected_at = pressed_at + interval
    else:
        state.next_expected_at = pressed_at + interval

    state.pending_late_override = None
    return state


@dataclass
class ColorResult:
    stage: str
    # 0.0 (green) .. 1.0 (red) while in the "transition" stage, otherwise None
    progress: float | None = None


def compute_color_stage(
    state: SlotRuntimeState, now: datetime, blink_threshold_minutes: int
) -> ColorResult:
    if state.next_expected_at is None or state.cycle_started_at is None:
        # never pressed yet / not initialized: treat as just-started green cycle
        return ColorResult(stage=STAGE_GREEN, progress=0.0)

    if now < state.next_expected_at:
        total = (state.next_expected_at - state.cycle_started_at).total_seconds()
        elapsed = (now - state.cycle_started_at).total_seconds()
        progress = 0.0 if total <= 0 else max(0.0, min(1.0, elapsed / total))
        if progress <= 0.02:
            return ColorResult(stage=STAGE_GREEN, progress=progress)
        return ColorResult(stage=STAGE_TRANSITION, progress=progress)

    overdue_for = now - state.next_expected_at
    if overdue_for >= timedelta(minutes=blink_threshold_minutes):
        return ColorResult(stage=STAGE_BLINKING)
    return ColorResult(stage=STAGE_OVERDUE)
