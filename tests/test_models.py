"""The scheduling engine (models.py): terms, windows, open/missed terms, the A/B/C
answers, the counter, the state priority and the persisted runtime."""
from datetime import datetime, timedelta, timezone
from itertools import islice

import pytest
from how_many_times_today import const, models

TZ = timezone.utc


def at(h=0, mi=0, d=19, s=0):
    """2026-10-19 (a Monday) at h:mi unless another day is given."""
    return datetime(2026, 10, d, h, mi, s, tzinfo=TZ)


def fixed(times=("07:00", "16:00"), start="2026-10-19T00:00:00", end=None, window=30, sid="s"):
    return models.build_schedule(
        {
            "id": sid, "name": "Lek", "description": "Wez lek", "mode": const.MODE_FIXED_TIMES,
            "fixed_times": list(times), "start_at": start, "end_at": end, "window_minutes": window,
        },
        TZ,
    )


def interval(hours, start="2026-10-19T09:00:00", end=None, window=30, sid="s"):
    return models.build_schedule(
        {
            "id": sid, "name": "Woda", "description": "", "mode": const.MODE_INTERVAL,
            "interval_hours": hours, "start_at": start, "end_at": end, "window_minutes": window,
        },
        TZ,
    )


class Sim:
    """A schedule with its runtime and history, driven by explicit clock readings."""

    def __init__(self, schedule, created=at(6, 0)):
        self.s = schedule
        self.rt = models.new_runtime(schedule, created)
        self.hist: list[dict] = []

    def tick(self, now):
        events, entries = models.advance(self.s, self.rt, now)
        self.hist.extend(entries)
        return events

    def press(self, now, answer=None):
        self.tick(now)
        entries = models.press(self.s, self.rt, now, self.hist, answer)
        self.hist.extend(entries)
        return entries

    def status(self, now):
        return models.compute_status(self.s, self.rt, self.hist, now)

    def state(self, now):
        self.tick(now)
        return self.status(now).state

    def kinds(self):
        return [(e["kind"], e["count_delta"]) for e in self.hist]


# --- terms ---------------------------------------------------------------------------


def test_fixed_terms_follow_the_clock_across_days():
    s = fixed()
    got = list(islice(models.occurrences_after(s, at(0, 0)), 4))
    assert got == [at(7), at(16), at(7, d=20), at(16, d=20)]


def test_fixed_terms_before_the_start_are_skipped():
    s = fixed(start="2026-10-19T08:00:00")
    assert next(models.occurrences_after(s, at(0, 0))) == at(16)


def test_fixed_terms_stop_at_the_end_inclusive():
    s = fixed(end="2026-10-19T16:00:00")
    assert list(models.occurrences_after(s, at(0, 0))) == [at(7), at(16)]
    s = fixed(end="2026-10-19T15:59:00")
    assert list(models.occurrences_after(s, at(0, 0))) == [at(7)]


def test_fixed_times_are_sorted_and_deduplicated():
    s = fixed(times=("16:00", "07:00", "07:00:00"))
    assert [t.strftime("%H:%M") for t in s.fixed_times] == ["07:00", "16:00"]
    assert s.planned_count == 2


def test_interval_first_term_is_exactly_the_start():
    s = interval(12, start="2026-10-19T09:30:00")
    assert list(islice(models.occurrences_after(s, at(0, 0)), 3)) == [at(9, 30), at(21, 30), at(9, 30, d=20)]


def test_interval_terms_after_a_given_moment():
    s = interval(12, start="2026-10-19T09:30:00")
    assert next(models.occurrences_after(s, at(10, 0))) == at(21, 30)
    assert next(models.occurrences_after(s, at(21, 30))) == at(9, 30, d=20)  # strictly after
    assert next(models.occurrences_after(s, at(9, 29))) == at(9, 30)


def test_interval_fractional_hours_and_end():
    s = interval(1.5, start="2026-10-19T09:00:00", end="2026-10-19T12:00:00")
    assert list(models.occurrences_after(s, at(0, 0))) == [at(9), at(10, 30), at(12)]


@pytest.mark.parametrize("hours, expected", [(12, 2), (8, 3), (5, 5), (7, 4), (24, 1), (30, 1), (1, 24)])
def test_interval_planned_count_is_ceil_of_24_over_x(hours, expected):
    assert interval(hours).planned_count == expected


def test_fixed_planned_count_is_the_number_of_times():
    assert fixed(times=("07:00", "12:00", "16:00", "21:00")).planned_count == 4


def test_gap_for_fixed_times_wraps_to_the_next_day():
    s = fixed()
    assert models.gap_after(s, at(7)) == timedelta(hours=9)
    assert models.gap_after(s, at(16)) == timedelta(hours=15)  # last one of the day -> first of the next


def test_gap_for_interval_is_x_and_missed_is_three_quarters_of_it():
    assert models.gap_after(interval(12), at(9)) == timedelta(hours=12)
    assert models.missed_at(fixed(), at(7)) == at(13, 45)  # 3/4 of 9 h = 6 h 45 min


def test_interval_terms_are_absolute_across_a_dst_change():
    zoneinfo = pytest.importorskip("zoneinfo")
    try:
        warsaw = zoneinfo.ZoneInfo("Europe/Warsaw")
    except zoneinfo.ZoneInfoNotFoundError:
        pytest.skip("no tz database")
    s = models.build_schedule(
        {"id": "s", "name": "x", "mode": const.MODE_INTERVAL, "interval_hours": 12,
         "start_at": "2026-10-24T20:00:00", "window_minutes": 30},
        warsaw,
    )
    terms = list(islice(models.occurrences_after(s, datetime(2026, 10, 24, 0, 0, tzinfo=warsaw)), 3))
    # clocks go back on 2026-10-25 at 03:00: 12 real hours after 20:00 is 07:00 the next morning
    assert [t.strftime("%d %H:%M") for t in terms] == ["24 20:00", "25 07:00", "25 19:00"]
    assert all((models._utc(b) - models._utc(a)) == timedelta(hours=12) for a, b in zip(terms, terms[1:]))


def test_build_schedule_rejects_bad_definitions():
    with pytest.raises(ValueError):
        models.build_schedule({"id": "s", "name": "x", "mode": "weekly", "start_at": "2026-10-19T00:00:00"}, TZ)
    with pytest.raises(ValueError):
        fixed(times=())
    with pytest.raises(ValueError):
        interval(0)


# --- the example from the requirements: 07:00 and 16:00, window 30 min ------------------


def test_press_inside_the_window_before_the_term_is_on_schedule_and_resolves_it_in_advance():
    sim = Sim(fixed())
    entries = sim.press(at(6, 45))
    assert [(e["kind"], e["count_delta"], e["outside_schedule"]) for e in entries] == [("on_schedule", 1, False)]
    assert entries[0]["scheduled_at"] == at(7).isoformat()
    # the 07:00 term is already done: nothing turns red, the next one is 16:00
    assert sim.state(at(7)) != const.STATE_RED
    assert sim.status(at(7)).next_expected_at == at(16)
    assert sim.state(at(8)) != const.STATE_BLINKING_BLACK


def test_a_term_comes_due_red_inside_the_window_then_blinks_black():
    sim = Sim(fixed())
    events = sim.tick(at(7))
    assert [e.scheduled_at for e in events] == [at(7)]
    assert sim.status(at(7)).state == const.STATE_RED
    assert sim.status(at(7, 30)).state == const.STATE_RED  # the window is inclusive
    assert sim.state(at(7, 31)) == const.STATE_BLINKING_BLACK


def test_unanswered_term_is_logged_missed_after_three_quarters_of_the_gap_and_keeps_blinking():
    sim = Sim(fixed())
    sim.tick(at(7))
    sim.tick(at(13, 44))
    assert not [e for e in sim.hist if e["kind"] == "missed"]
    sim.tick(at(13, 46))
    missed = [e for e in sim.hist if e["kind"] == "missed"]
    assert len(missed) == 1
    assert missed[0]["scheduled_at"] == at(7).isoformat()
    assert missed[0]["timestamp"] == at(13, 45).isoformat()  # when it was declared
    assert missed[0]["count_delta"] == 0
    assert sim.status(at(13, 46)).state == const.STATE_BLINKING_BLACK
    sim.tick(at(14))
    assert len([e for e in sim.hist if e["kind"] == "missed"]) == 1  # logged once


def test_open_slots_are_listed_oldest_first_with_overdue_minutes_and_missed_flag():
    sim = Sim(fixed())
    sim.tick(at(16, 5))
    slots = sim.status(at(16, 5)).open_slots
    assert [(x["scheduled_at"], x["missed"]) for x in slots] == [(at(7).isoformat(), True), (at(16).isoformat(), False)]
    assert slots[1]["overdue_minutes"] == 5


def test_press_outside_the_window_with_an_open_term_needs_an_answer():
    sim = Sim(fixed())
    sim.tick(at(12))
    assert sim.status(at(12)).answer_required is True
    with pytest.raises(models.AnswerRequired):
        sim.press(at(12))
    assert sim.hist == [] and sim.rt.last_press_at is None  # nothing changed


def test_press_inside_the_window_of_the_open_term_needs_no_answer():
    sim = Sim(fixed())
    sim.tick(at(7, 10))
    assert sim.status(at(7, 10)).answer_required is False
    entries = sim.press(at(7, 10))
    assert entries[0]["kind"] == "on_schedule" and entries[0]["outside_schedule"] is False
    assert sim.status(at(7, 10)).open_slots == []


def test_answer_a_was_done_but_not_recorded():
    sim = Sim(fixed())
    sim.tick(at(12))
    entries = sim.press(at(12), const.ANSWER_ALREADY_DONE)
    assert [(e["kind"], e["count_delta"], e["outside_schedule"]) for e in entries] == [("registered_late", 1, False)]
    assert entries[0]["scheduled_at"] == at(7).isoformat()
    st = sim.status(at(12))
    assert st.open_slots == [] and st.count_today == 1
    assert st.number_blinking is False  # it was only a record, not a new execution


def test_answer_b_not_done_then_doing_it_now():
    sim = Sim(fixed())
    sim.tick(at(12))
    entries = sim.press(at(12), const.ANSWER_DO_NOW)
    assert [(e["kind"], e["count_delta"], e["outside_schedule"]) for e in entries] == [("outside", 1, True)]
    assert entries[0]["scheduled_at"] == at(7).isoformat()
    st = sim.status(at(12))
    assert st.open_slots == [] and st.count_today == 1
    assert st.number_blinking is True  # an out-of-window execution within the planned count


def test_answer_c_done_at_the_term_and_once_more_now():
    sim = Sim(fixed())
    sim.tick(at(12))
    entries = sim.press(at(12), const.ANSWER_EXTRA)
    assert [(e["kind"], e["count_delta"], e["outside_schedule"]) for e in entries] == [
        ("registered_late", 1, False), ("extra", 1, True)
    ]
    st = sim.status(at(12))
    assert st.open_slots == [] and st.count_today == 2
    assert st.number_blinking is True  # 2 of 2 planned: still within the count


def test_an_answer_that_is_not_needed_is_ignored_and_an_unknown_one_is_rejected():
    sim = Sim(fixed())
    sim.tick(at(7, 10))
    entries = sim.press(at(7, 10), const.ANSWER_EXTRA)  # inside the window: no question
    assert [e["kind"] for e in entries] == ["on_schedule"]
    sim.tick(at(16, 40))
    with pytest.raises(ValueError):
        models.press(sim.s, sim.rt, at(16, 40), sim.hist, "maybe")


def test_several_open_terms_are_closed_one_per_press_oldest_first():
    sim = Sim(fixed())
    sim.tick(at(16, 5))  # 07:00 missed and 16:00 red
    assert sim.status(at(16, 5)).answer_required is True  # the question is about 07:00
    first = sim.press(at(16, 5), const.ANSWER_DO_NOW)
    assert first[0]["scheduled_at"] == at(7).isoformat()
    # now only the 16:00 term is open and we are inside its window
    assert sim.status(at(16, 5)).answer_required is False
    second = sim.press(at(16, 6))
    assert second[0]["kind"] == "on_schedule" and second[0]["scheduled_at"] == at(16).isoformat()
    assert sim.status(at(16, 6)).open_slots == []


def test_press_with_no_open_term_outside_every_window_is_an_extra_and_the_number_blinks():
    sim = Sim(fixed(), created=at(12))
    entries = sim.press(at(12), const.ANSWER_EXTRA)
    assert [(e["kind"], e["outside_schedule"], e["scheduled_at"]) for e in entries] == [("outside", True, None)]
    assert sim.status(at(12)).number_blinking is True


def test_the_next_press_stops_the_number_blinking_and_is_judged_afresh():
    sim = Sim(fixed(), created=at(12))
    sim.press(at(12), const.ANSWER_EXTRA)
    assert sim.status(at(12)).number_blinking is True
    sim.press(at(12, 5), const.ANSWER_EXTRA)  # another extra: 2 of 2, still within the count -> blinks again
    assert sim.status(at(12, 5)).number_blinking is True
    sim.press(at(12, 10), const.ANSWER_EXTRA)  # 3 of 2: over the planned count, no blinking
    st = sim.status(at(12, 10))
    assert st.number_blinking is False and st.state == const.STATE_EXCEEDED


def test_a_second_press_inside_an_already_closed_window_is_an_extra():
    sim = Sim(fixed())
    sim.press(at(7))  # closes the 07:00 term in time
    entries = sim.press(at(7, 5), const.ANSWER_EXTRA)
    assert entries[0]["kind"] == "outside" and entries[0]["outside_schedule"] is True


# --- state priority, the counter, midnight ----------------------------------------------


def test_exceeding_the_planned_count_is_red_with_no_blinking_until_midnight():
    sim = Sim(fixed(times=("07:00", "16:00", "21:00")), created=at(12))
    for minute in (0, 1, 2, 3, 4):
        sim.press(at(12, minute), const.ANSWER_EXTRA)
    st = sim.status(at(12, 4))
    assert (st.count_today, st.planned_count) == (5, 3)
    assert st.count_exceeded is True and st.state == const.STATE_EXCEEDED
    assert st.number_blinking is False
    # a new day: the counter starts again from zero
    st_next_day = models.compute_status(sim.s, sim.rt, sim.hist, at(0, 1, d=20))
    assert st_next_day.count_today == 0 and st_next_day.state != const.STATE_EXCEEDED


def test_black_takes_priority_over_exceeded():
    sim = Sim(fixed(times=("07:00",)), created=at(0))
    sim.press(at(1), const.ANSWER_EXTRA)
    sim.press(at(2), const.ANSWER_EXTRA)  # 2 of 1: exceeded
    assert sim.state(at(3)) == const.STATE_EXCEEDED
    assert sim.state(at(7, 31)) == const.STATE_BLINKING_BLACK


def test_the_counter_counts_todays_entries_by_their_delta():
    hist = [
        models.make_entry(at(23, 59, d=18), "on_schedule", None, False, 1),  # yesterday
        models.make_entry(at(0, 1), "on_schedule", None, False, 1),
        models.make_entry(at(8), "extra", None, True, 1),
        models.make_entry(at(9), "missed", at(7), False, 0),
    ]
    assert models.count_today(hist, at(12)) == 2
    assert models.count_today([], at(12)) == 0


def test_an_open_term_from_yesterday_stays_open_after_midnight():
    sim = Sim(fixed(times=("22:00",)))
    sim.tick(at(22))
    sim.tick(at(1, d=20))
    st = sim.status(at(1, d=20))
    assert st.state == const.STATE_BLINKING_BLACK
    assert [x["scheduled_at"] for x in st.open_slots] == [at(22).isoformat()]
    assert not [e for e in sim.hist if e["kind"] == "missed"]  # 3/4 of 24 h is 18 h
    sim.tick(at(17, d=20))
    missed = [e for e in sim.hist if e["kind"] == "missed"]
    assert [e["timestamp"] for e in missed] == [at(16, d=20).isoformat()]


# --- colour progress ----------------------------------------------------------------------


def test_colour_progress_runs_from_the_last_press_to_the_next_term():
    sim = Sim(fixed(times=("16:00",)), created=at(0, 0))
    sim.press(at(8), const.ANSWER_EXTRA)  # outside the window: an extra, but it still restarts the fade
    assert sim.status(at(8)).state == const.STATE_GREEN and sim.status(at(8)).color_progress == 0.0
    st = sim.status(at(12))  # half way between 08:00 and 16:00
    assert st.state == const.STATE_TRANSITION and st.color_progress == pytest.approx(0.5)
    assert st.next_expected_at == at(16)


def test_colour_progress_is_null_outside_green_and_transition():
    sim = Sim(fixed())
    sim.tick(at(7))
    assert sim.status(at(7)).color_progress is None  # red


def test_before_any_press_the_fade_starts_at_the_schedule_start():
    sim = Sim(fixed(times=("16:00",), start="2026-10-19T08:00:00"), created=at(8, 0))
    st = sim.status(at(12))
    assert st.state == const.STATE_TRANSITION and st.color_progress == pytest.approx(0.5)


# --- start, end, switching off -------------------------------------------------------------


def test_before_the_start_the_schedule_is_pending_and_takes_no_presses():
    sim = Sim(fixed(start="2026-10-20T00:00:00"), created=at(6, 0))
    st = sim.status(at(12))
    assert st.state == const.STATE_PENDING and st.active is False
    assert st.next_expected_at == at(7, d=20)
    with pytest.raises(models.ScheduleNotActive):
        sim.press(at(12))


def test_an_interval_schedule_has_its_first_term_exactly_at_the_start():
    sim = Sim(interval(12, start="2026-10-19T10:00:00"), created=at(8, 0))
    assert sim.state(at(9, 59)) == const.STATE_PENDING
    events = sim.tick(at(10))
    assert [e.scheduled_at for e in events] == [at(10)]
    assert sim.status(at(10)).state == const.STATE_RED


def test_a_schedule_created_just_after_its_start_still_shows_the_first_term_as_due():
    s = interval(12, start="2026-10-19T09:00:00")
    sim = Sim(s, created=at(9, 4))  # the form's default start was a few minutes ago
    events = sim.tick(at(9, 4))
    assert [e.scheduled_at for e in events] == [at(9)]
    assert sim.status(at(9, 4)).state == const.STATE_RED


def test_terms_older_than_the_window_are_not_backfilled_at_creation():
    sim = Sim(fixed(), created=at(12, 0))  # 07:00 is long gone
    sim.tick(at(12, 0))
    assert sim.status(at(12)).open_slots == []


def test_after_the_end_the_schedule_is_inactive_without_new_terms_or_missed_entries():
    sim = Sim(fixed(end="2026-10-19T08:00:00"))
    sim.tick(at(7))
    sim.press(at(7, 5))
    assert sim.state(at(20)) == const.STATE_INACTIVE
    assert sim.status(at(20)).active is False
    assert [e["kind"] for e in sim.hist] == ["on_schedule"]  # no POMINIETE for 16:00
    assert sim.status(at(20)).next_expected_at is None


def test_manually_inactive_has_no_alerts_and_no_backfill_when_switched_on_again():
    sim = Sim(fixed())
    sim.rt.manually_inactive = True
    assert sim.tick(at(7)) == [] and sim.state(at(8)) == const.STATE_INACTIVE
    assert sim.rt.occurrences == {}
    with pytest.raises(models.ScheduleNotActive):
        sim.press(at(8))
    sim.rt.manually_inactive = False
    sim.rt.processed_until = at(15)  # what the coordinator does on re-activation
    sim.tick(at(15, 30))
    assert sim.status(at(15, 30)).open_slots == []  # 07:00 (skipped while off) did not reopen
    assert [e.scheduled_at for e in sim.tick(at(16))] == [at(16)]


# --- notifications and downtime -----------------------------------------------------------------


def test_a_due_event_is_only_raised_for_a_fresh_term():
    sim = Sim(fixed())
    assert [e.scheduled_at for e in sim.tick(at(7, 0, s=30))] == [at(7)]
    stale = Sim(fixed())
    assert stale.tick(at(7, 20)) == []  # HA was down at 07:00: no late alert
    assert stale.status(at(7, 20)).state == const.STATE_RED  # still shown, just not announced


def test_after_a_long_downtime_old_terms_are_open_and_missed_entries_keep_their_real_time():
    sim = Sim(fixed())
    sim.tick(at(20))  # 14 hours with nobody looking
    slots = sim.status(at(20)).open_slots
    assert [x["scheduled_at"] for x in slots] == [at(7).isoformat(), at(16).isoformat()]
    stamps = {e["scheduled_at"]: e["timestamp"] for e in sim.hist if e["kind"] == "missed"}
    # only 07:00 is declared missed: 16:00 needs 3/4 of its 15 h gap (until 03:15 next day)
    assert stamps == {at(7).isoformat(): at(13, 45).isoformat()}
    assert models.missed_at(sim.s, at(16)) == datetime(2026, 10, 20, 3, 15, tzinfo=TZ)


def test_old_resolved_terms_are_forgotten():
    sim = Sim(fixed())
    sim.press(at(7))
    assert sim.rt.occurrences  # kept for a while
    sim.tick(at(7, d=24))
    assert at(7).isoformat() not in sim.rt.occurrences


# --- the next moment something changes ----------------------------------------------------


def test_next_boundary_is_the_nearest_change():
    sim = Sim(fixed())
    assert models.next_boundary(sim.s, sim.rt, at(6)) == at(7)  # the term comes due
    sim.tick(at(7))
    assert models.next_boundary(sim.s, sim.rt, at(7)) == at(7, 30)  # the window ends
    sim.tick(at(7, 31))
    assert models.next_boundary(sim.s, sim.rt, at(7, 31)) == at(13, 45)  # declared missed
    sim.tick(at(13, 46))
    assert models.next_boundary(sim.s, sim.rt, at(13, 46)) == at(16)


def test_next_boundary_includes_the_start_the_end_and_midnight():
    pending = Sim(fixed(start="2026-10-19T10:00:00"), created=at(6))
    assert models.next_boundary(pending.s, pending.rt, at(6)) == at(10)  # the start
    s = fixed(times=("23:00",), end="2026-10-19T23:30:00")
    sim = Sim(s, created=at(22))
    sim.tick(at(23, 31))  # past the end
    assert models.next_boundary(s, sim.rt, at(23, 40)) == at(0, d=20)  # only midnight is left


# --- persistence of the runtime -------------------------------------------------------------


def test_runtime_roundtrip():
    sim = Sim(fixed())
    sim.tick(at(16, 5))
    sim.press(at(16, 5), const.ANSWER_DO_NOW)
    restored = models.ScheduleRuntime.from_dict("s", sim.rt.to_dict())
    assert restored == sim.rt


def test_runtime_from_dict_rejects_a_garbage_timestamp():
    with pytest.raises(ValueError):
        models.ScheduleRuntime.from_dict("s", {"last_press_at": "not-a-date"})


# --- changing a stored schedule ------------------------------------------------------------


def stored_fixed():
    return {
        "id": "s", "name": "Lek", "description": "", "mode": const.MODE_FIXED_TIMES,
        "fixed_times": ["07:00", "16:00"], "start_at": "2026-10-19T00:00:00", "end_at": None,
        "window_minutes": 30,
    }


def stored_interval():
    return {
        "id": "i", "name": "Woda", "description": "", "mode": const.MODE_INTERVAL,
        "interval_hours": 12.0, "start_at": "2026-10-19T09:00:00", "end_at": None, "window_minutes": 30,
    }


def update_error(cfg, changes):
    with pytest.raises(models.ScheduleUpdateError) as err:
        models.apply_schedule_update(cfg, changes, TZ)
    return err.value.key


def test_update_changes_only_what_is_given_and_leaves_the_original_alone():
    cfg = stored_fixed()
    new = models.apply_schedule_update(
        cfg, {"name": " Lek na serce ", "description": "Po jedzeniu", "window_minutes": 45, "interval_hours": None}, TZ
    )
    assert new["name"] == "Lek na serce" and new["description"] == "Po jedzeniu" and new["window_minutes"] == 45
    assert new["fixed_times"] == ["07:00", "16:00"] and new["mode"] == const.MODE_FIXED_TIMES
    assert cfg == stored_fixed()
    models.build_schedule(new, TZ)  # the result is a schedule the engine accepts


def test_update_normalises_sorts_and_deduplicates_the_times():
    new = models.apply_schedule_update(stored_fixed(), {"fixed_times": ["20:00", "8:05", "08:05"]}, TZ)
    assert new["fixed_times"] == ["08:05", "20:00"]


def test_update_sets_and_clears_the_end():
    new = models.apply_schedule_update(stored_fixed(), {"end_at": "2026-11-01T12:00"}, TZ)
    assert new["end_at"] == "2026-11-01T12:00:00"
    assert models.apply_schedule_update(new, {"end_at": ""}, TZ)["end_at"] is None
    assert models.apply_schedule_update(new, {"end_at": None}, TZ)["end_at"] is None


def test_update_changes_the_interval_of_an_interval_schedule():
    assert models.apply_schedule_update(stored_interval(), {"interval_hours": "6"}, TZ)["interval_hours"] == 6.0


@pytest.mark.parametrize(
    "changes,key",
    [
        ({}, "nothing_to_update"),
        ({"name": None, "unknown": 1}, "nothing_to_update"),
        ({"name": "   "}, "invalid_name"),
        ({"fixed_times": []}, "no_times"),
        ({"fixed_times": ["25:00"]}, "invalid_time"),
        ({"fixed_times": "08:00"}, "invalid_time"),
        ({"fixed_times": [f"{h:02d}:00" for h in range(24)] + ["23:30"]}, "too_many_times"),
        ({"interval_hours": 3}, "wrong_mode"),
        ({"start_at": "yesterday"}, "invalid_datetime"),
        ({"end_at": "2026-10-18T10:00"}, "end_before_start"),
        ({"start_at": "2026-12-01T00:00"}, None),
        ({"window_minutes": 0}, "invalid_window"),
        ({"window_minutes": 241}, "invalid_window"),
        ({"window_minutes": "abc"}, "invalid_window"),
    ],
)
def test_update_rejects_what_cannot_work(changes, key):
    cfg = stored_fixed()
    if key is None:  # a start moved past an existing end
        cfg["end_at"] = "2026-11-01T00:00:00"
        key = "end_before_start"
    assert update_error(cfg, changes) == key


def test_update_of_an_interval_schedule_rejects_times_and_a_bad_interval():
    assert update_error(stored_interval(), {"fixed_times": ["08:00"]}) == "wrong_mode"
    assert update_error(stored_interval(), {"interval_hours": 0.2}) == "invalid_interval"
    assert update_error(stored_interval(), {"interval_hours": 49}) == "invalid_interval"
    assert update_error(stored_interval(), {"interval_hours": "x"}) == "invalid_interval"


# --- reset to "everything on time" --------------------------------------------------------


def test_reset_closes_every_term_due_today_and_writes_a_normal_entry_for_each():
    sim = Sim(fixed(("07:00", "13:00", "20:00")), created=at(6))
    sim.tick(at(14))  # 07:00 missed, 13:00 open, 20:00 still to come
    assert models.compute_status(sim.s, sim.rt, [], at(14)).state == const.STATE_BLINKING_BLACK
    entries = models.reset_to_on_schedule(sim.s, sim.rt, at(14))
    assert [(e["timestamp"], e["kind"], e["count_delta"], e["outside_schedule"]) for e in entries] == [
        (at(7).isoformat(), const.KIND_ON_SCHEDULE, 1, False),
        (at(13).isoformat(), const.KIND_ON_SCHEDULE, 1, False),
    ]
    status = models.compute_status(sim.s, sim.rt, entries, at(14))
    assert status.count_today == 2 and status.planned_count == 3 and status.open_slots == []
    assert status.state in (const.STATE_GREEN, const.STATE_TRANSITION) and not status.number_blinking
    assert sim.rt.last_press_at == at(13)


def test_reset_forgets_terms_resolved_in_advance_and_stops_the_blinking_number():
    sim = Sim(fixed(("07:00", "13:00")), created=at(6))
    sim.tick(at(6, 45))
    sim.press(at(6, 45))  # 07:00 closed in advance
    sim.tick(at(10))
    sim.rt.number_blinking = True
    models.reset_to_on_schedule(sim.s, sim.rt, at(10))
    assert not sim.rt.number_blinking
    assert at(13).isoformat() not in sim.rt.occurrences


def test_reset_with_no_term_due_yet_gives_an_empty_day_and_refuses_an_inactive_schedule():
    sim = Sim(fixed(("16:00",)), created=at(6))
    assert models.reset_to_on_schedule(sim.s, sim.rt, at(8)) == []
    sim.rt.manually_inactive = True
    with pytest.raises(models.ScheduleNotActive):
        models.reset_to_on_schedule(sim.s, sim.rt, at(8))


def test_reset_of_an_interval_schedule_counts_the_terms_of_today_only():
    sim = Sim(interval(8, start="2026-10-18T22:00:00"), created=at(0))  # 22:00, 06:00, 14:00, 22:00 ...
    entries = models.reset_to_on_schedule(sim.s, sim.rt, at(15))
    assert [e["timestamp"] for e in entries] == [at(6).isoformat(), at(14).isoformat()]


# --- the early press (2.0.0): the last tenth of the gap before the tolerance window --------


def test_a_press_a_little_too_early_asks_whether_it_was_done_ahead_of_time():
    # the gap before 16:00 is 9 h: the zone is 15:06 - 15:30 (window 30 min, a tenth = 54 min)
    sim = Sim(fixed(), created=at(14, 0))
    with pytest.raises(models.EarlyAnswerRequired) as asked:
        sim.press(at(15, 15))
    assert asked.value.term == at(16)
    assert asked.value.early_by == timedelta(minutes=45)
    assert sim.status(at(15, 15)).early_by_seconds == 45 * 60


def test_done_ahead_of_time_closes_the_coming_term_on_schedule():
    sim = Sim(fixed(), created=at(14, 0))
    entries = sim.press(at(15, 15), const.ANSWER_DONE_EARLY)
    assert [(e["kind"], e["count_delta"]) for e in entries] == [(const.KIND_ON_SCHEDULE, 1)]
    sim.tick(at(16, 5))
    assert sim.status(at(16, 5)).state != const.STATE_BLINKING_BLACK  # the 16:00 term is not open any more


def test_an_extra_at_the_early_question_is_outside_the_schedule_and_the_term_stays_due():
    sim = Sim(fixed(), created=at(14, 0))
    entries = sim.press(at(15, 15), const.ANSWER_EXTRA)
    assert [e["kind"] for e in entries] == [const.KIND_OUTSIDE]
    sim.tick(at(16, 1))
    assert sim.state(at(16, 1)) == const.STATE_RED


def test_a_press_far_before_the_term_asks_the_same_question():
    """There is no limit of time: any press between two terms asks, not only a late one."""
    sim = Sim(fixed(), created=at(8, 0))
    with pytest.raises(models.EarlyAnswerRequired):
        sim.press(at(9, 0))
    entries = sim.press(at(9, 0), const.ANSWER_EXTRA)
    assert [e["kind"] for e in entries] == [const.KIND_OUTSIDE]
    assert sim.status(at(9, 0)).early_by_seconds is not None  # the 16:00 term stays due and ahead


def test_an_answer_of_the_late_question_does_not_fit_the_early_one():
    sim = Sim(fixed(), created=at(8, 0))
    with pytest.raises(models.EarlyAnswerRequired):
        sim.press(at(9, 0), const.ANSWER_DO_NOW)


def test_done_far_ahead_skips_the_coming_term_and_the_cycle_goes_on_from_green():
    sim = Sim(fixed(), created=at(8, 0))
    entries = sim.press(at(9, 0), const.ANSWER_DONE_EARLY)
    assert [(e["kind"], e["scheduled_at"], e["count_delta"]) for e in entries] == [("on_schedule", at(16).isoformat(), 1)]
    st = sim.status(at(9, 0))
    assert st.state == const.STATE_GREEN and st.count_today == 1
    assert st.next_expected_at == at(7, d=20)  # the next feeding is the one after the skipped term
    sim.tick(at(16, 5))
    assert sim.state(at(16, 5)) != const.STATE_BLINKING_BLACK  # 16:00 never turns red


def test_when_the_coming_term_is_already_closed_a_press_is_simply_an_extra():
    sim = Sim(fixed(), created=at(8, 0))
    sim.press(at(9, 0), const.ANSWER_DONE_EARLY)  # closes 16:00
    assert sim.status(at(10, 0)).early_by_seconds is None
    entries = sim.press(at(10, 0))  # no question: the coming term is done already
    assert [e["kind"] for e in entries] == [const.KIND_OUTSIDE]


def test_between_two_terms_every_press_asks_until_the_coming_window_opens():
    sim = Sim(interval(8, start="2026-10-19T00:00:00"), created=at(10, 0))  # terms 00:00, 08:00, 16:00
    sim.tick(at(14, 0))
    assert sim.status(at(14, 0)).early_by_seconds == 2 * 3600
    assert sim.status(at(15, 45)).early_by_seconds is None  # inside the window of 16:00: on time


def test_nothing_is_asked_early_while_a_term_is_open():
    sim = Sim(fixed(), created=at(6, 59))
    sim.tick(at(8, 0))  # 07:00 is open and past its window
    assert sim.status(at(15, 15)).early_by_seconds is None


# --- the reminder sounds (2.0.0) ----------------------------------------------------------


def test_the_default_sound_is_the_bell_at_volume_three():
    assert models.global_sound_settings({}) == ("dzwonek", 3)


def test_the_sound_names_of_version_1_are_still_read():
    assert models.global_sound_settings({"global_sound": "none"}) == ("dzwonek", 0)
    assert models.global_sound_settings({"global_sound": "alert"}) == ("alarm", 3)
    assert models.global_sound_settings({"global_sound": "gentle", "global_volume": 1}) == ("delikatny_dzwonek", 1)
    assert models.global_sound_settings({"global_sound": "unknown"}) == ("dzwonek", 3)


def test_a_schedule_rings_with_its_own_sound_else_with_the_default():
    plain = fixed()
    own = models.build_schedule(
        {"id": "o", "name": "x", "mode": const.MODE_FIXED_TIMES, "fixed_times": ["08:00"],
         "start_at": "2026-10-19T00:00:00", "sound_id": "harfa", "volume_level": 0}, TZ)
    assert models.sound_for(plain, "alarm", 4) == ("alarm", 4)
    assert models.sound_for(own, "alarm", 4) == ("harfa", 0)


def test_a_stored_unknown_sound_or_volume_falls_back_to_the_default():
    s = models.build_schedule(
        {"id": "o", "name": "x", "mode": const.MODE_FIXED_TIMES, "fixed_times": ["08:00"],
         "start_at": "2026-10-19T00:00:00", "sound_id": "nope", "volume_level": 9}, TZ)
    assert (s.sound_id, s.volume_level) == (None, None)


def test_update_schedule_validates_and_clears_the_sound_and_volume():
    s = fixed()
    cfg = {"id": "s", "name": "Lek", "description": "", "mode": const.MODE_FIXED_TIMES,
           "fixed_times": ["07:00", "16:00"], "start_at": "2026-10-19T00:00:00", "end_at": None, "window_minutes": 30}
    new = models.apply_schedule_update(cfg, {"sound_id": "marimba", "volume_level": "2"}, TZ)
    assert (new["sound_id"], new["volume_level"]) == ("marimba", 2)
    cleared = models.apply_schedule_update(new, {"sound_id": "default", "volume_level": "default"}, TZ)
    assert (cleared["sound_id"], cleared["volume_level"]) == (None, None)
    for bad, key in (({"sound_id": "nope"}, "invalid_sound"), ({"volume_level": 5}, "invalid_volume"), ({"volume_level": "x"}, "invalid_volume")):
        with pytest.raises(models.ScheduleUpdateError) as error:
            models.apply_schedule_update(cfg, bad, TZ)
        assert error.value.key == key
    assert s  # the plain schedule stays valid


def test_a_schedule_saved_by_version_1_loads_without_sound_fields():
    """Options written by 1.x have no sound/volume on a schedule: they read as "the default"."""
    old = {"id": "s", "name": "Lek", "description": "", "mode": "fixed_times", "fixed_times": ["07:00"],
           "start_at": "2026-10-19T00:00:00", "end_at": None, "window_minutes": 30}
    s = models.build_schedule(old, TZ)
    assert (s.sound_id, s.volume_level) == (None, None)


def test_done_now_for_a_term_far_ahead_is_flagged_for_a_second_confirmation():
    """More than a quarter of the gap since the previous term (07:00 -> 16:00 is 9 h: 2 h 15 min)."""
    sim = Sim(fixed(), created=at(8, 0))
    assert sim.status(at(9, 0)).early_far is True  # 7 h before 16:00
    assert sim.status(at(13, 0)).early_far is True  # 3 h
    assert sim.status(at(14, 0)).early_far is False  # 2 h
    assert sim.status(at(15, 45)).early_far is False  # inside the window: no question at all
