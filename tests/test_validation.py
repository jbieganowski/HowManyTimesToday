"""Input helpers for the config flow, the conversion from the old task/slot model, and
translation completeness."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
from how_many_times_today import const, legacy, models

INTEGRATION = Path(__file__).resolve().parents[1] / "custom_components" / "how_many_times_today"
TZ = timezone.utc


# --- normalize_hhmm --------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [("09:00", "09:00"), ("9:05", "09:05"), ("22:00:00", "22:00"), (" 07:30 ", "07:30"), ("00:00", "00:00")],
)
def test_normalize_hhmm_accepts_real_times(raw, expected):
    assert models.normalize_hhmm(raw) == expected


@pytest.mark.parametrize("raw", ["9am", "25:00", "12:60", "", "abc", "9", ":30", "09:xx"])
def test_normalize_hhmm_rejects_garbage(raw):
    with pytest.raises(ValueError):
        models.normalize_hhmm(raw)


# --- form helpers ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("2026-10-19 09:30:00", "2026-10-19T09:30:00"),
        ("2026-10-19T09:30", "2026-10-19T09:30:00"),
        ("2026-10-19 09:30:15.123456", "2026-10-19T09:30:15"),
        ("2026-10-19T09:30:00+02:00", "2026-10-19T09:30:00"),
    ],
)
def test_normalize_local_datetime(raw, expected):
    assert models.normalize_local_datetime(raw) == expected


@pytest.mark.parametrize("raw", ["", "tomorrow", "2026-13-40 00:00:00"])
def test_normalize_local_datetime_rejects_garbage(raw):
    with pytest.raises(ValueError):
        models.normalize_local_datetime(raw)


@pytest.mark.parametrize(
    "count, expected",
    [(1, ["09:00"]), (2, ["09:00", "21:00"]), (3, ["09:00", "17:00", "01:00"]), (24, [f"{(9 + i) % 24:02d}:00" for i in range(24)])],
)
def test_default_times_are_spread_over_the_day(count, expected):
    assert models.default_times(count) == expected


def test_default_times_are_clamped_and_always_valid():
    assert len(models.default_times(0)) == 1 and len(models.default_times(99)) == 24
    assert all(models.normalize_hhmm(t) == t for n in range(1, 25) for t in models.default_times(n))


# --- conversion from the old model ----------------------------------------------------------


NOW = datetime(2026, 10, 18, 15, 30, tzinfo=TZ)


def test_a_fixed_times_task_becomes_a_schedule_with_the_same_id_and_times():
    task = {"id": "abcd1234", "name": "Karma dla kota", "mode": "fixed_times", "fixed_times": ["20:00", "08:00:00", "14:00"]}
    schedule = legacy.convert_task(task, NOW)
    assert schedule["id"] == "abcd1234" and schedule["name"] == "Karma dla kota"
    assert schedule["mode"] == const.MODE_FIXED_TIMES
    assert schedule["fixed_times"] == ["08:00", "14:00", "20:00"]
    assert schedule["start_at"] == "2026-10-18T15:30:00"
    assert schedule["window_minutes"] == const.DEFAULT_WINDOW_MINUTES and schedule["end_at"] is None
    models.build_schedule(schedule, TZ)  # and it is a valid schedule


def test_an_interval_task_keeps_its_rhythm_by_starting_at_todays_reference_time():
    task = {"id": "i1", "name": "Woda", "mode": "interval", "interval_hours": 12, "reference_time": "08:00:00", "late_policy": "reset"}
    schedule = legacy.convert_task(task, NOW)
    assert schedule["mode"] == const.MODE_INTERVAL and schedule["interval_hours"] == 12.0
    assert schedule["start_at"] == "2026-10-18T08:00:00"
    built = models.build_schedule(schedule, TZ)
    assert next(models.occurrences_after(built, NOW)) == datetime(2026, 10, 18, 20, 0, tzinfo=TZ)


@pytest.mark.parametrize(
    "task",
    [
        {"id": "x", "name": "n", "mode": "fixed_times", "fixed_times": []},
        {"id": "x", "name": "n", "mode": "fixed_times", "fixed_times": ["9am"]},
        {"id": "x", "name": "n", "mode": "interval", "interval_hours": "abc", "reference_time": "08:00"},
        {"id": "x", "name": "n", "mode": "weekly"},
        {"name": "no id", "mode": "fixed_times", "fixed_times": ["08:00"]},
    ],
)
def test_unusable_old_tasks_are_dropped_not_fatal(task):
    assert legacy.convert_task(task, NOW) is None
    assert legacy.convert_tasks([task], NOW) == []


def test_migrated_options_keep_only_the_settings_that_still_exist():
    old = {"tasks": [{"id": "t"}], "global_sound": "bell", "blink_threshold_minutes": 45, "obsolete_key": True}
    schedules = [{"id": "t"}]
    assert legacy.convert_options(old, schedules) == {"global_sound": "bell", "schedules": schedules}
    assert legacy.convert_options({}, []) == {"schedules": []}


def test_old_press_history_becomes_on_schedule_entries_oldest_first():
    slots = {
        "t1_0": ["2026-10-17T08:00:00+02:00", "2026-10-18T08:05:00+02:00"],
        "t1_1": ["2026-10-17T20:00:00+02:00"],
        "t2_0": ["2026-10-17T09:00:00+02:00"],  # another task: not included
    }
    entries = legacy.convert_history("t1", slots)
    assert [e["timestamp"] for e in entries] == [
        "2026-10-17T08:00:00+02:00", "2026-10-17T20:00:00+02:00", "2026-10-18T08:05:00+02:00",
    ]
    assert all(e["kind"] == "on_schedule" and e["count_delta"] == 1 and not e["outside_schedule"] for e in entries)
    assert legacy.convert_history("none", slots) == []


def test_last_press_is_the_newest_among_a_tasks_slots():
    states = {
        "t1_0": {"last_pressed_at": "2026-10-18T08:05:00+02:00"},
        "t1_1": {"last_pressed_at": "2026-10-17T20:00:00+02:00"},
        "t1_2": {"last_pressed_at": None},
        "t2_0": {"last_pressed_at": "2026-10-18T23:00:00+02:00"},
    }
    assert legacy.last_press("t1", states) == "2026-10-18T08:05:00+02:00"
    assert legacy.last_press("none", states) is None


# --- translations ---------------------------------------------------------------------------


def _keys(node, prefix=""):
    out = set()
    for key, value in node.items():
        out |= _keys(value, f"{prefix}{key}.") if isinstance(value, dict) else {f"{prefix}{key}"}
    return out


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def test_every_translation_has_the_same_keys_as_strings_json():
    base = _keys(_load(INTEGRATION / "strings.json"))
    for path in sorted((INTEGRATION / "translations").glob("*.json")):
        keys = _keys(_load(path))
        assert keys == base, f"{path.name}: missing {sorted(base - keys)}, extra {sorted(keys - base)}"


def test_the_six_languages_are_all_present_and_nothing_is_left_untranslated():
    names = {p.stem for p in (INTEGRATION / "translations").glob("*.json")}
    assert names == {"en", "pl", "de", "ru", "uk", "zh-Hans"}
    en = _load(INTEGRATION / "translations" / "en.json")
    for lang in names - {"en"}:
        other = _load(INTEGRATION / "translations" / f"{lang}.json")
        same = [k for k in _keys(en)
                if _walk(en, k) == _walk(other, k)
                and not k.startswith("config.step.user.title")
                and not re.search(r"entity\.sensor\.schedule\.state\.", k)]
        # a handful of words legitimately read the same (names, "Weeks"/"Wochen"...); the
        # bulk must differ, otherwise a language was copied over untranslated
        assert len(same) < 8, f"{lang}: untranslated: {same}"


def _walk(node, dotted):
    for part in dotted.split("."):
        node = node[part]
    return node


def test_every_state_error_and_service_the_code_raises_or_exposes_is_translated():
    strings = _load(INTEGRATION / "strings.json")
    assert set(strings["entity"]["sensor"]["schedule"]["state"]) == set(const.SCHEDULE_STATES)
    assert {"answer_required", "early_answer_required", "schedule_not_active", *models.UPDATE_ERROR_KEYS} == set(strings["exceptions"])
    assert {
        const.SERVICE_PRESS_SCHEDULE,
        const.SERVICE_CLEAR_HISTORY,
        const.SERVICE_SET_SCHEDULE_ACTIVE,
        const.SERVICE_UPDATE_SCHEDULE,
        const.SERVICE_RESET_SCHEDULE,
    } == set(strings["services"])
    assert set(strings["selector"]["answer"]["options"]) == set(const.ANSWERS)
    assert {"name_required", "invalid_datetime", "end_before_start"} <= set(strings["options"]["error"])
    assert {f"time_{i}" for i in range(1, 25)} <= set(strings["options"]["step"]["schedule_times"]["data"])


def test_the_legend_quotes_the_cards_own_state_sentences_in_every_language():
    """The 'How to read the card?' step must say exactly what the card says (read from the
    card's own strings), so the help never drifts from the button."""
    js = (INTEGRATION / "www" / "how-many-times-today-card.js").read_text(encoding="utf-8")
    order = ["en", "pl", "de", "ru", "uk", "zh-Hans"]  # the order of the language blocks in the card
    for key in ("status_green", "status_on_plan", "status_transition", "status_red", "status_blinking_black", "status_exceeded", "status_number_blinking"):
        sentences = re.findall(rf'{key}: "(.*?)"', js)
        assert len(sentences) == len(order), f"{key}: expected one sentence per language, got {len(sentences)}"
        for lang, sentence in zip(order, sentences):
            legend = _load(INTEGRATION / "translations" / f"{lang}.json")["options"]["step"]["legend"]["description"]
            assert sentence in legend, f"{lang}: the legend does not quote the card's {key!r}: {sentence!r}"


def test_every_form_field_and_step_the_flow_uses_has_a_label():
    """Static check on config_flow.py (it cannot be imported without Home Assistant)."""
    source = (INTEGRATION / "config_flow.py").read_text(encoding="utf-8")
    strings = _load(INTEGRATION / "strings.json")["options"]["step"]
    steps = set(re.findall(r'step_id="(\w+)"', source))
    assert steps - {"user"} <= set(strings), f"steps without strings: {steps - set(strings)}"
    menu = set(re.findall(r'menu_options=\[([^\]]+)\]', source)[0].replace('"', "").replace(" ", "").split(","))
    assert menu == set(strings["init"]["menu_options"])


# --- version and author ---------------------------------------------------------------------


def test_the_version_is_semver_and_matches_both_changelogs():
    manifest = _load(INTEGRATION / "manifest.json")
    version = manifest["version"]
    assert re.fullmatch(r"\d+\.\d+\.\d+", version), version
    for name in ("CHANGELOG.md", "CHANGELOG.pl.md"):
        text = (INTEGRATION.parent.parent / name).read_text(encoding="utf-8")
        assert f"## [{version}]" in text, f"{name} has no section for {version}"


def test_every_language_shows_the_version_and_the_author_at_the_top_of_the_menu():
    for lang in ("en", "pl", "de", "ru", "uk", "zh-Hans"):
        data = _load(INTEGRATION / "translations" / f"{lang}.json")
        text = data["options"]["step"]["init"]["description"]
        assert "{version}" in text and "{author}" in text, f"{lang}: {text!r}"
    assert const.AUTHOR == "Jacek Bieganowski"


def test_english_texts_say_what_their_keys_promise():
    """The generated translation tables are positional; a shifted entry would give a key
    somebody else's text while every language still has the same keys."""
    en = _load(INTEGRATION / "translations" / "en.json")
    expectations = {
        ("exceptions", "invalid_name", "message"): "name",
        ("exceptions", "invalid_time", "message"): "time",
        ("exceptions", "no_times", "message"): "time",
        ("exceptions", "invalid_interval", "message"): "interval",
        ("exceptions", "invalid_window", "message"): "window",
        ("exceptions", "end_before_start", "message"): "end",
        ("exceptions", "wrong_mode", "message"): "mode",
        ("options", "step", "reset_schedules", "title"): "reset",
        ("options", "step", "reset_schedules", "data", "schedule_ids"): "schedules",
        ("services", "reset_schedule", "name"): "reset",
        ("services", "update_schedule", "name"): "change",
        ("services", "update_schedule", "fields", "interval_hours", "name"): "interval",
        ("services", "update_schedule", "fields", "window_minutes", "name"): "tolerance",
        ("services", "update_schedule", "fields", "end_at", "name"): "end",
    }
    for path, word in expectations.items():
        node = en
        for part in path:
            node = node[part]
        assert word in node.lower(), f"{'.'.join(path)} = {node!r} does not mention {word!r}"


def test_every_reminder_sound_has_its_four_volume_files_and_every_language_names_it():
    for sound_id in const.SOUND_IDS:
        for level in range(1, 5):
            assert (INTEGRATION / "www" / "sounds" / f"{sound_id}_{level}.ogg").is_file(), f"{sound_id}_{level}.ogg"
    for path in [INTEGRATION / "strings.json", *(INTEGRATION / "translations").glob("*.json")]:
        selectors = _load(path)["selector"]
        assert set(selectors["sound"]["options"]) == set(const.SOUND_IDS), path.name
        assert set(selectors["schedule_sound"]["options"]) == {"default", *const.SOUND_IDS}, path.name
        assert set(selectors["volume"]["options"]) == {"0", "1", "2", "3", "4"}, path.name


def test_the_sound_ids_of_services_yaml_are_the_integrations_sounds():
    text = (INTEGRATION / "services.yaml").read_text(encoding="utf-8")
    block = text[text.index("    sound_id:"):text.index("    volume_level:")]
    assert re.findall(r"- (\w+)", block) == ["default", *const.SOUND_IDS]


def test_the_sound_files_are_not_a_source_of_garbage():
    """The synthesised sounds are small: the whole folder stays under 3 MB."""
    total = sum(p.stat().st_size for p in (INTEGRATION / "www" / "sounds").glob("*.ogg"))
    assert 0 < total < 3 * 1024 * 1024
