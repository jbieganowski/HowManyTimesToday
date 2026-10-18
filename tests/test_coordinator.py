"""The coordinator and the stores, against fake Home Assistant pieces (see conftest.py):
persistence across a simulated restart, due events and push, the exact-moment timer, and
schedule add/edit/remove."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from conftest import CLOCK, DISPATCHED, TIMERS, FakeHass, FakeStore
from how_many_times_today import const, models
from how_many_times_today import coordinator as coordinator_mod

TZ = timezone.utc


def at(h=0, mi=0, d=19, s=0):
    return datetime(2026, 10, d, h, mi, s, tzinfo=TZ)


@pytest.fixture(autouse=True)
def _clean():
    FakeStore.saved.clear()
    DISPATCHED.clear()
    TIMERS.clear()
    CLOCK["now"] = at(6, 0)


def cfg_fixed(sid="s1", times=("07:00", "16:00"), name="Lek na serce", description="Wez lek", **extra):
    return {
        "id": sid, "name": name, "description": description, "mode": const.MODE_FIXED_TIMES,
        "fixed_times": list(times), "start_at": "2026-10-19T00:00:00", "end_at": None,
        "window_minutes": 30, **extra,
    }


def cfg_interval(sid="i1", hours=12, start="2026-10-19T09:00:00", name="Woda"):
    return {
        "id": sid, "name": name, "description": "", "mode": const.MODE_INTERVAL,
        "interval_hours": hours, "start_at": start, "end_at": None, "window_minutes": 30,
    }


def make_entry(schedules, **options):
    return SimpleNamespace(entry_id="e1", options={const.CONF_SCHEDULES: schedules, **options})


async def start(entry, hass=None):
    coord = coordinator_mod.HowManyTimesTodayCoordinator(hass or FakeHass(), entry)
    coord.entity_id_for = lambda sid: f"sensor.{sid}"
    await coord.async_setup()
    return coord


def run(coro):
    return asyncio.run(coro)


# --- persistence -----------------------------------------------------------------


def test_state_and_history_survive_a_restart():
    async def go():
        entry = make_entry([cfg_fixed()])
        coord = await start(entry)
        CLOCK["now"] = at(6, 45)
        await coord.async_press("s1")
        before = coord.runtime["s1"].to_dict()

        restarted = await start(entry)  # a new coordinator over the same storage
        assert restarted.runtime["s1"].to_dict() == before
        assert restarted.status("s1").count_today == 1
        assert [e["kind"] for e in restarted.history.get("s1")] == ["on_schedule"]

    run(go())


def test_an_open_term_stays_open_and_blinking_after_a_restart():
    async def go():
        entry = make_entry([cfg_fixed()])
        coord = await start(entry)
        CLOCK["now"] = at(7, 5)
        await coord.async_refresh()
        assert coord.status("s1").state == const.STATE_RED

        CLOCK["now"] = at(9, 0)  # HA was down for a while
        restarted = await start(entry)
        st = restarted.status("s1")
        assert st.state == const.STATE_BLINKING_BROWN
        assert [x["scheduled_at"] for x in st.open_slots] == [at(7).isoformat()]

    run(go())


def test_the_number_blinking_flag_survives_a_restart():
    async def go():
        entry = make_entry([cfg_fixed()])
        CLOCK["now"] = at(12)
        coord = await start(entry)
        await coord.async_press("s1")  # outside every window -> the number blinks
        assert coord.status("s1").number_blinking is True
        assert (await start(entry)).status("s1").number_blinking is True

    run(go())


def test_corrupt_saved_state_is_ignored_and_other_schedules_still_restore():
    async def go():
        entry = make_entry([cfg_fixed("a"), cfg_fixed("b", name="Karma")])
        CLOCK["now"] = at(12)
        coord = await start(entry)
        await coord.async_press("b")
        FakeStore.saved[f"{const.STORAGE_KEY_STATE_PREFIX}_e1"]["a"] = {"last_press_at": "garbage"}

        restarted = await start(entry)
        assert restarted.runtime["a"].last_press_at is None
        assert restarted.runtime["b"].last_press_at == at(12)

    run(go())


# --- presses -----------------------------------------------------------------------


def test_press_records_history_saves_state_and_refreshes():
    async def go():
        coord = await start(make_entry([cfg_fixed()]))
        CLOCK["now"] = at(7, 10)
        refreshes = coord.refresh_calls
        await coord.async_press("s1")
        assert [e["kind"] for e in coord.history.get("s1")] == ["on_schedule"]
        assert coord.refresh_calls == refreshes + 1
        assert FakeStore.saved[f"{const.STORAGE_KEY_STATE_PREFIX}_e1"]["s1"]["last_press_at"] == at(7, 10).isoformat()

    run(go())


def test_press_outside_the_window_with_an_open_term_raises_and_changes_nothing():
    async def go():
        coord = await start(make_entry([cfg_fixed()]))
        CLOCK["now"] = at(12)
        with pytest.raises(models.AnswerRequired):
            await coord.async_press("s1")
        assert coord.history.get("s1") == []
        await coord.async_press("s1", const.ANSWER_DO_NOW)
        assert [e["kind"] for e in coord.history.get("s1")] == ["outside"]

    run(go())


def test_press_unknown_schedule_raises():
    async def go():
        coord = await start(make_entry([cfg_fixed()]))
        with pytest.raises(ValueError):
            await coord.async_press("nope")

    run(go())


def test_a_press_catches_up_terms_that_came_due_since_the_last_refresh():
    async def go():
        coord = await start(make_entry([cfg_fixed()]))
        CLOCK["now"] = at(7, 10)  # nothing refreshed since 06:00
        await coord.async_press("s1")  # must close the 07:00 term, not treat this as an extra
        assert [e["kind"] for e in coord.history.get("s1")] == ["on_schedule"]

    run(go())


# --- switching on and off, clearing --------------------------------------------------


def test_set_active_off_blocks_presses_and_persists():
    async def go():
        entry = make_entry([cfg_fixed()])
        coord = await start(entry)
        await coord.async_set_active("s1", False)
        assert coord.status("s1").state == const.STATE_INACTIVE
        with pytest.raises(models.ScheduleNotActive):
            await coord.async_press("s1")
        assert (await start(entry)).status("s1").state == const.STATE_INACTIVE
        await coord.async_set_active("s1", True)
        assert coord.status("s1").state != const.STATE_INACTIVE

    run(go())


def test_clear_history_for_one_schedule_all_schedules_and_weeks():
    async def go():
        coord = await start(make_entry([cfg_fixed("a"), cfg_fixed("b", name="Karma")]))
        for sid in ("a", "b"):
            await coord.history.async_append(sid, [
                models.make_entry(at(8, d=5), "on_schedule", None, False, 1),   # 2026-W41
                models.make_entry(at(8, d=19), "on_schedule", None, False, 1),  # 2026-W43
            ])
        await coord.async_clear_history("a", ["2026-W41"])
        assert len(coord.history.get("a")) == 1 and len(coord.history.get("b")) == 2
        await coord.async_clear_history(None, ["2026-W41"])
        assert len(coord.history.get("b")) == 1
        await coord.async_clear_history("a", None)
        assert coord.history.get("a") == [] and len(coord.history.get("b")) == 1
        await coord.async_clear_history(None, None)
        assert coord.history.get("b") == []
        with pytest.raises(ValueError):
            await coord.async_clear_history("nope", None)

    run(go())


def test_history_survives_a_reload():
    async def go():
        entry = make_entry([cfg_fixed()])
        coord = await start(entry)
        CLOCK["now"] = at(12)
        await coord.async_press("s1", const.ANSWER_DO_NOW)
        assert len((await start(entry)).history.get("s1")) == 1

    run(go())


# --- due events and push ----------------------------------------------------------------


def test_a_due_event_is_fired_once_with_the_agreed_payload():
    async def go():
        hass = FakeHass()
        coord = await start(make_entry([cfg_fixed()]), hass)
        CLOCK["now"] = at(7, 0, s=5)
        await coord.async_refresh()
        await coord.async_refresh()  # nothing new: no repeat
        assert hass.bus.fired == [(const.EVENT_DUE, {
            "entity_id": "sensor.s1", "name": "Lek na serce", "description": "Wez lek",
            "scheduled_at": at(7).isoformat(),
        })]

    run(go())


def test_no_event_for_a_term_that_became_due_during_a_downtime():
    async def go():
        hass = FakeHass()
        entry = make_entry([cfg_fixed()])
        await start(entry, hass)
        CLOCK["now"] = at(7, 20)
        await start(entry, hass)  # restart 20 minutes after 07:00
        assert hass.bus.fired == []

    run(go())


def test_push_goes_through_the_configured_notify_service_once():
    async def go():
        hass = FakeHass()
        coord = await start(make_entry([cfg_fixed()], notify_service="notify.mobile_app_pixel"), hass)
        CLOCK["now"] = at(7, 0, s=5)
        await coord.async_refresh()
        await coord.async_refresh()
        assert hass.services.calls == [("notify", "mobile_app_pixel", {"title": "Lek na serce", "message": "Wez lek"}, False)]

    run(go())


def test_push_message_falls_back_to_the_name_and_no_service_means_no_push():
    async def go():
        hass = FakeHass()
        coord = await start(make_entry([cfg_fixed(description="")], notify_service="mobile_app_pixel"), hass)
        CLOCK["now"] = at(7, 0, s=5)
        await coord.async_refresh()
        assert hass.services.calls[0][2]["message"] == "Lek na serce"
        hass2 = FakeHass()
        coord2 = await start(make_entry([cfg_fixed()]), hass2)
        CLOCK["now"] = at(16, 0, s=5)
        await coord2.async_refresh()
        assert hass2.services.calls == [] and len(hass2.bus.fired) >= 1

    run(go())


def test_a_failing_notifier_does_not_break_the_schedule():
    async def go():
        hass = FakeHass()

        async def boom(*args, **kwargs):
            raise RuntimeError("no such service")

        hass.services.async_call = boom
        coord = await start(make_entry([cfg_fixed()], notify_service="notify.broken"), hass)
        CLOCK["now"] = at(7, 0, s=5)
        await coord.async_refresh()
        assert coord.status("s1").state == const.STATE_RED

    run(go())


# --- the exact-moment timer ---------------------------------------------------------------


def test_the_timer_is_armed_for_the_next_change_plus_a_second_and_rearmed_on_refresh():
    async def go():
        coord = await start(make_entry([cfg_fixed()]))
        assert [t[0] for t in TIMERS] == [at(7) + timedelta(seconds=1)]
        CLOCK["now"] = at(7, 0, s=1)
        await coord.async_refresh()
        # the first one is cancelled, the new one is for the end of the window
        assert TIMERS[0][2] is True
        assert TIMERS[-1][0] == at(7, 30) + timedelta(seconds=1) and TIMERS[-1][2] is False

    run(go())


def test_the_timer_callback_schedules_a_refresh_and_unload_cancels_the_timer():
    async def go():
        hass = FakeHass()
        coord = await start(make_entry([cfg_fixed()]), hass)
        TIMERS[-1][1](at(7, 0, s=1))  # what Home Assistant does at the armed moment
        assert len(hass.tasks) == 1
        await hass.tasks[0]
        coord.async_unload()  # the refresh re-armed a timer; unloading must cancel it
        assert TIMERS[-1][2] is True

    run(go())


# --- schedules added, edited and removed -----------------------------------------------------


def test_options_update_reports_added_and_removed_schedules():
    async def go():
        entry = make_entry([cfg_fixed("a")])
        coord = await start(entry)
        entry.options[const.CONF_SCHEDULES] = [cfg_fixed("a"), cfg_interval("i1")]
        await coord.async_options_updated()
        assert DISPATCHED[-1][1:] == ({"i1"}, set())
        assert set(coord.schedules) == {"a", "i1"} and set(coord.runtime) == {"a", "i1"}

        entry.options[const.CONF_SCHEDULES] = [cfg_interval("i1")]
        await coord.async_options_updated()
        assert DISPATCHED[-1][1:] == (set(), {"a"})
        assert set(coord.schedules) == {"i1"}

    run(go())


def test_editing_a_schedule_keeps_its_progress_and_removing_one_drops_its_data():
    async def go():
        entry = make_entry([cfg_fixed("a"), cfg_fixed("b", name="Karma")])
        CLOCK["now"] = at(12)
        coord = await start(entry)
        await coord.async_press("a")
        await coord.async_press("b")
        entry.options[const.CONF_SCHEDULES] = [cfg_fixed("a", times=("07:00", "16:00", "21:00"))]
        await coord.async_options_updated()
        assert coord.runtime["a"].last_press_at == at(12)  # edited: progress kept
        assert coord.status("a").planned_count == 3
        assert coord.history.get("b") == []  # removed: gone
        assert "b" not in FakeStore.saved[f"{const.STORAGE_KEY_STATE_PREFIX}_e1"]
        assert "b" not in FakeStore.saved[f"{const.STORAGE_KEY_HISTORY_PREFIX}_e1"]

    run(go())


def test_an_invalid_schedule_in_the_options_is_ignored_not_fatal():
    async def go():
        bad = cfg_fixed("bad")
        bad["fixed_times"] = ["9am"]
        coord = await start(make_entry([cfg_fixed("ok"), bad]))
        assert set(coord.schedules) == {"ok"}

    run(go())


def test_the_global_sound_and_notify_service_come_from_the_options():
    async def go():
        coord = await start(make_entry([], global_sound="bell", notify_service="notify.mobile_app_x"))
        assert coord.sound == "bell" and coord.notify_service == "notify.mobile_app_x"
        default = await start(make_entry([]))
        assert default.sound == "chime" and default.notify_service is None

    run(go())


# --- changing a schedule from the card ---------------------------------------------------------


def test_update_schedule_stores_the_change_and_keeps_the_progress():
    async def go():
        entry = make_entry([cfg_fixed("a"), cfg_fixed("b", name="Karma")])
        CLOCK["now"] = at(12)
        hass = FakeHass()
        coord = await start(entry, hass)
        await coord.async_press("a")
        await coord.async_update_schedule("a", {"name": "  Lek rano ", "fixed_times": ["8:00", "20:00", "13:00"]})
        stored = entry.options[const.CONF_SCHEDULES]
        assert stored[0]["name"] == "Lek rano" and stored[0]["fixed_times"] == ["08:00", "13:00", "20:00"]
        assert stored[1]["name"] == "Karma"  # the other schedule is untouched
        assert hass.config_entries.updates == 1
        await coord.async_options_updated()  # what the update listener does
        assert coord.schedules["a"].name == "Lek rano" and coord.status("a").planned_count == 3
        assert coord.runtime["a"].last_press_at == at(12)

    run(go())


def test_update_schedule_rejects_a_bad_change_and_stores_nothing():
    async def go():
        entry = make_entry([cfg_interval("i1")])
        hass = FakeHass()
        coord = await start(entry, hass)
        before = [dict(c) for c in entry.options[const.CONF_SCHEDULES]]
        for changes, key in (
            ({"fixed_times": ["08:00"]}, "wrong_mode"),
            ({"interval_hours": 100}, "invalid_interval"),
            ({}, "nothing_to_update"),
        ):
            with pytest.raises(models.ScheduleUpdateError) as err:
                await coord.async_update_schedule("i1", changes)
            assert err.value.key == key
        assert entry.options[const.CONF_SCHEDULES] == before and hass.config_entries.updates == 0
        with pytest.raises(ValueError):
            await coord.async_update_schedule("unknown", {"name": "x"})

    run(go())


# --- reset to "everything on time" ------------------------------------------------------------


def test_reset_replaces_todays_history_keeps_earlier_days_and_lights_the_button_up():
    async def go():
        entry = make_entry([cfg_fixed("a", times=("07:00", "13:00", "20:00")), cfg_fixed("off")])
        CLOCK["now"] = at(6)
        coord = await start(entry)
        await coord.async_set_active("off", False)
        CLOCK["now"] = at(14)
        await coord.async_refresh()
        await coord.history.async_append("a", [models.make_entry(at(9, d=18), const.KIND_ON_SCHEDULE, at(9, d=18), False, 1)])
        assert coord.status("a").state == const.STATE_BLINKING_BROWN
        assert await coord.async_reset_to_on_schedule(None) == ["a"]  # the one switched off is skipped
        status = coord.status("a")
        assert status.count_today == 2 and status.open_slots == [] and status.state != const.STATE_BLINKING_BROWN
        stamps = [e["timestamp"] for e in coord.history.get("a")]
        assert stamps == [at(9, d=18).isoformat(), at(7).isoformat(), at(13).isoformat()]
        assert coord.history.get("off") == []
        # the reset sticks: nothing reopens at the next refresh
        await coord.async_refresh()
        assert coord.status("a").open_slots == [] and coord.status("a").count_today == 2

    run(go())


def test_reset_of_a_named_inactive_schedule_raises_unless_skipped():
    async def go():
        entry = make_entry([cfg_fixed("a")])
        coord = await start(entry)
        await coord.async_set_active("a", False)
        with pytest.raises(models.ScheduleNotActive):
            await coord.async_reset_to_on_schedule(["a"])
        assert await coord.async_reset_to_on_schedule(["a"], skip_inactive=True) == []

    run(go())


def test_reset_undoes_pointless_presses_the_counter_is_back_to_the_terms_due():
    async def go():
        entry = make_entry([cfg_fixed("a", times=("07:00", "20:00"))])
        CLOCK["now"] = at(6, 50)
        coord = await start(entry)
        await coord.async_press("a")  # 07:00, in advance: correct
        CLOCK["now"] = at(14)
        for _ in range(3):  # pressed by mistake
            await coord.async_press("a", const.ANSWER_DO_NOW)
        assert coord.status("a").count_exceeded and coord.status("a").state == const.STATE_EXCEEDED
        await coord.async_reset_to_on_schedule(["a"])
        status = coord.status("a")
        assert status.count_today == 1 and not status.count_exceeded and not status.number_blinking
        assert status.state in (const.STATE_GREEN, const.STATE_TRANSITION)
        assert [(e["scheduled_at"], e["count_delta"]) for e in coord.history.get("a")] == [(at(7).isoformat(), 1)]

    run(go())


# --- removing the integration ----------------------------------------------------------------


def test_removing_the_entry_deletes_its_stored_state_and_history_and_nothing_else():
    from how_many_times_today import store

    async def go():
        entry = make_entry([cfg_fixed("a")])
        coord = await start(entry)
        await coord.history.async_append("a", [models.make_entry(at(7), const.KIND_ON_SCHEDULE, at(7), False, 1)])
        await coord.state_store.async_save(coord.runtime)
        FakeStore.saved["other_integration_data"] = {"keep": True}
        assert f"{const.STORAGE_KEY_STATE_PREFIX}_e1" in FakeStore.saved
        assert f"{const.STORAGE_KEY_HISTORY_PREFIX}_e1" in FakeStore.saved
        await store.async_remove_all(FakeHass(), "e1")
        assert not [k for k in FakeStore.saved if "e1" in k]
        assert FakeStore.saved["other_integration_data"] == {"keep": True}

    run(go())
