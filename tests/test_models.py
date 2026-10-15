from datetime import datetime, time, timedelta

import pytest
from how_many_times_today import const, models


def dt(y=2026, m=1, d=15, h=0, mi=0, s=0):
    return datetime(y, m, d, h, mi, s)


# --- build_slots -----------------------------------------------------------


def test_build_slots_fixed_times_single():
    task = {"id": "t1", "name": "Woda", "mode": const.MODE_FIXED_TIMES, "fixed_times": ["09:00"]}
    slots = models.build_slots(task)
    assert len(slots) == 1
    assert slots[0].slot_id == "t1_0"
    assert slots[0].anchor_time == time(9, 0)
    assert slots[0].index == 0
    assert slots[0].task_name == "Woda"


def test_build_slots_fixed_times_multiple_and_hhmmss():
    # HA's TimeSelector returns "HH:MM:SS"; manual entries are "HH:MM" - both must work
    task = {
        "id": "t2",
        "name": "Lek",
        "mode": const.MODE_FIXED_TIMES,
        "fixed_times": ["09:00", "14:30:00", "22:00"],
    }
    slots = models.build_slots(task)
    assert [s.anchor_time for s in slots] == [time(9, 0), time(14, 30), time(22, 0)]
    assert [s.slot_id for s in slots] == ["t2_0", "t2_1", "t2_2"]


def test_build_slots_interval_even_split():
    task = {
        "id": "t3",
        "name": "Antybiotyk",
        "mode": const.MODE_INTERVAL,
        "interval_hours": 12,
        "reference_time": "09:00",
    }
    slots = models.build_slots(task)
    assert [s.anchor_time for s in slots] == [time(9, 0), time(21, 0)]


def test_build_slots_interval_three_times_a_day():
    task = {
        "id": "t4",
        "name": "Karma",
        "mode": const.MODE_INTERVAL,
        "interval_hours": 8,
        "reference_time": "07:00",
    }
    slots = models.build_slots(task)
    assert [s.anchor_time for s in slots] == [time(7, 0), time(15, 0), time(23, 0)]


def test_build_slots_interval_once_a_day():
    task = {
        "id": "t5",
        "name": "Witamina",
        "mode": const.MODE_INTERVAL,
        "interval_hours": 24,
        "reference_time": "10:00",
    }
    slots = models.build_slots(task)
    assert len(slots) == 1
    assert slots[0].anchor_time == time(10, 0)


def test_build_slots_interval_wraps_past_midnight():
    task = {
        "id": "t6",
        "name": "Co 10h",
        "mode": const.MODE_INTERVAL,
        "interval_hours": 10,
        "reference_time": "20:00",
    }
    slots = models.build_slots(task)
    # round(24/10) = 2 occurrences/day: 20:00, then 06:00 wrapping past midnight
    assert [s.anchor_time for s in slots] == [time(20, 0), time(6, 0)]


def test_build_slots_unknown_mode_raises():
    with pytest.raises(ValueError):
        models.build_slots({"id": "t7", "name": "x", "mode": "bogus"})


# --- next_occurrence_from ----------------------------------------------------


def test_next_occurrence_from_later_today():
    now = dt(h=8, mi=0)
    result = models.next_occurrence_from(time(9, 0), now)
    assert result == dt(h=9, mi=0)


def test_next_occurrence_from_already_passed_rolls_to_tomorrow():
    now = dt(h=10, mi=0)
    result = models.next_occurrence_from(time(9, 0), now)
    assert result == dt(d=16, h=9, mi=0)


def test_next_occurrence_from_exact_match_rolls_to_tomorrow():
    now = dt(h=9, mi=0, s=0)
    result = models.next_occurrence_from(time(9, 0), now)
    assert result == dt(d=16, h=9, mi=0)


# --- apply_press: fixed_times mode ------------------------------------------


def test_apply_press_fixed_times_always_anchors_to_clock():
    slot_def = models.SlotDefinition("t_0", "t", "Lek", 0, time(9, 0))
    state = models.SlotRuntimeState(slot_id="t_0")
    task = {"mode": const.MODE_FIXED_TIMES}

    # pressed very late (noon, well past the 9:00 anchor) - still anchors to next 9:00,
    # the delay itself does not shift the fixed schedule
    pressed_at = dt(h=12, mi=0)
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.last_pressed_at == pressed_at
    assert state.next_expected_at == dt(d=16, h=9, mi=0)
    assert state.pending_late_override is None


# --- apply_press: interval mode ----------------------------------------------


def test_apply_press_interval_first_press_has_no_previous_expected():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    state = models.SlotRuntimeState(slot_id="t_0")  # next_expected_at starts as None
    task = {"mode": const.MODE_INTERVAL, "interval_hours": 12}

    pressed_at = dt(h=9, mi=0)
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.next_expected_at == pressed_at + timedelta(hours=12)


def test_apply_press_interval_on_time_press():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    state = models.SlotRuntimeState(slot_id="t_0", next_expected_at=dt(h=9, mi=0))
    task = {"mode": const.MODE_INTERVAL, "interval_hours": 12}

    pressed_at = dt(h=8, mi=55)  # a few minutes early, not late
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.next_expected_at == pressed_at + timedelta(hours=12)


def test_apply_press_interval_late_compress_shortens_next_cycle():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    previous_expected = dt(h=9, mi=0)
    state = models.SlotRuntimeState(slot_id="t_0", next_expected_at=previous_expected)
    task = {
        "mode": const.MODE_INTERVAL,
        "interval_hours": 12,
        "late_policy": const.LATE_POLICY_COMPRESS,
    }

    pressed_at = dt(h=10, mi=0)  # 1h late
    models.apply_press(slot_def, state, pressed_at, task)

    # next cycle is shortened: keeps the original 9:00/21:00 rhythm (11h away, not 12h)
    assert state.next_expected_at == previous_expected + timedelta(hours=12)
    assert state.next_expected_at == dt(h=21, mi=0)


def test_apply_press_interval_late_reset_gives_a_full_fresh_interval():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    previous_expected = dt(h=9, mi=0)
    state = models.SlotRuntimeState(slot_id="t_0", next_expected_at=previous_expected)
    task = {
        "mode": const.MODE_INTERVAL,
        "interval_hours": 12,
        "late_policy": const.LATE_POLICY_RESET,
    }

    pressed_at = dt(h=10, mi=0)  # 1h late
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.next_expected_at == pressed_at + timedelta(hours=12)


def test_apply_press_interval_compress_falls_back_when_delay_exceeds_interval():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    previous_expected = dt(h=9, mi=0)
    state = models.SlotRuntimeState(slot_id="t_0", next_expected_at=previous_expected)
    task = {
        "mode": const.MODE_INTERVAL,
        "interval_hours": 12,
        "late_policy": const.LATE_POLICY_COMPRESS,
    }

    # pressed a day late: previous_expected + 12h would be in the past relative to
    # pressed_at, so compress must fall back to a fresh interval instead of
    # producing a next_expected_at that's already overdue on arrival
    pressed_at = dt(d=16, h=9, mi=0)
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.next_expected_at == pressed_at + timedelta(hours=12)


def test_apply_press_pending_late_override_is_one_shot():
    slot_def = models.SlotDefinition("t_0", "t", "Antybiotyk", 0, time(9, 0))
    previous_expected = dt(h=9, mi=0)
    state = models.SlotRuntimeState(
        slot_id="t_0",
        next_expected_at=previous_expected,
        pending_late_override=const.LATE_POLICY_RESET,
    )
    # task's own default policy is compress, but the one-shot override should win
    task = {
        "mode": const.MODE_INTERVAL,
        "interval_hours": 12,
        "late_policy": const.LATE_POLICY_COMPRESS,
    }

    pressed_at = dt(h=10, mi=0)
    models.apply_press(slot_def, state, pressed_at, task)

    assert state.next_expected_at == pressed_at + timedelta(hours=12)  # reset behavior
    assert state.pending_late_override is None  # consumed, not permanent


# --- compute_color_stage -----------------------------------------------------


def test_color_stage_never_pressed_is_green():
    state = models.SlotRuntimeState(slot_id="t_0")
    result = models.compute_color_stage(state, dt(), blink_threshold_minutes=60)
    assert result.stage == const.STAGE_GREEN
    assert result.progress == 0.0


def test_color_stage_just_pressed_is_green():
    pressed = dt(h=9, mi=0)
    state = models.SlotRuntimeState(
        slot_id="t_0", cycle_started_at=pressed, next_expected_at=pressed + timedelta(hours=12)
    )
    now = pressed + timedelta(seconds=1)
    result = models.compute_color_stage(state, now, blink_threshold_minutes=60)
    assert result.stage == const.STAGE_GREEN


def test_color_stage_halfway_is_transition_with_expected_progress():
    pressed = dt(h=9, mi=0)
    expected = pressed + timedelta(hours=12)
    state = models.SlotRuntimeState(slot_id="t_0", cycle_started_at=pressed, next_expected_at=expected)
    now = pressed + timedelta(hours=6)  # halfway through the 12h cycle
    result = models.compute_color_stage(state, now, blink_threshold_minutes=60)
    assert result.stage == const.STAGE_TRANSITION
    assert result.progress == pytest.approx(0.5)


def test_color_stage_overdue_but_under_threshold():
    pressed = dt(h=9, mi=0)
    expected = pressed + timedelta(hours=12)
    state = models.SlotRuntimeState(slot_id="t_0", cycle_started_at=pressed, next_expected_at=expected)
    now = expected + timedelta(minutes=30)
    result = models.compute_color_stage(state, now, blink_threshold_minutes=60)
    assert result.stage == const.STAGE_OVERDUE
    assert result.progress is None


def test_color_stage_blinking_past_threshold():
    pressed = dt(h=9, mi=0)
    expected = pressed + timedelta(hours=12)
    state = models.SlotRuntimeState(slot_id="t_0", cycle_started_at=pressed, next_expected_at=expected)
    now = expected + timedelta(minutes=61)
    result = models.compute_color_stage(state, now, blink_threshold_minutes=60)
    assert result.stage == const.STAGE_BLINKING


def test_color_stage_exactly_at_threshold_is_blinking():
    pressed = dt(h=9, mi=0)
    expected = pressed + timedelta(hours=12)
    state = models.SlotRuntimeState(slot_id="t_0", cycle_started_at=pressed, next_expected_at=expected)
    now = expected + timedelta(minutes=60)
    result = models.compute_color_stage(state, now, blink_threshold_minutes=60)
    assert result.stage == const.STAGE_BLINKING
