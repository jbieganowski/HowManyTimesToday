"""Config + Options flow: everything is click-driven, no YAML editing required."""
from __future__ import annotations

import uuid
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .const import (
    AUTHOR,
    AVAILABLE_SOUNDS,
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
    DOMAIN,
    MAX_PER_DAY_COUNT,
    MIN_PER_DAY_COUNT,
    MODE_FIXED_TIMES,
    MODE_INTERVAL,
)
from .models import default_times, normalize_hhmm, normalize_local_datetime, parse_local_datetime

STEP_ACTIONS = ["edit", "switch_active", "remove"]


async def _about_placeholders(hass) -> dict[str, str]:
    """Version (from manifest.json) and author, shown in the dialogs' descriptions."""
    return {"version": str((await async_get_integration(hass, DOMAIN)).version), "author": AUTHOR}


class HowManyTimesTodayConfigFlow(ConfigFlow, domain=DOMAIN):
    """The integration itself is a singleton; schedules are managed entirely via Options."""

    VERSION = 2

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="How Many Times Today", data={})
        return self.async_show_form(
            step_id="user", description_placeholders=await _about_placeholders(self.hass)
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HowManyTimesTodayOptionsFlow()


class HowManyTimesTodayOptionsFlow(OptionsFlow):
    def __init__(self) -> None:
        # the schedule being added or edited, filled in over several steps
        self._draft: dict[str, Any] = {}
        self._editing_id: str | None = None

    @property
    def _schedules(self) -> list[dict]:
        return [dict(s) for s in self.config_entry.options.get(CONF_SCHEDULES, [])]

    def _save(self, schedules: list[dict]):
        options = dict(self.config_entry.options)
        options[CONF_SCHEDULES] = schedules
        return self.async_create_entry(title="", data=options)

    # --- main menu ------------------------------------------------------------

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_show_menu(
            step_id="init",
            menu_options=["add_schedule", "manage_schedules", "reset_schedules", "global_settings", "legend"],
            description_placeholders=await _about_placeholders(self.hass),
        )

    # --- "How to read the card?": the colours and sentences explained -------------

    async def async_step_legend(self, user_input: dict[str, Any] | None = None):
        """A read-only help page (its text is the step's description); confirming it
        just goes back to the menu."""
        if user_input is not None:
            return await self.async_step_init()
        return self.async_show_form(step_id="legend", data_schema=vol.Schema({}))

    # --- reset to "everything on time" ----------------------------------------------

    async def async_step_reset_schedules(self, user_input: dict[str, Any] | None = None):
        """Pick the schedules to set to "everything due so far was done on time"; the
        form's description explains what that does to the counter and the history."""
        schedules = self._schedules
        if not schedules:
            return self.async_abort(reason="no_schedules")
        coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)

        if user_input is not None:
            if coordinator is not None and user_input["schedule_ids"]:
                known = [sid for sid in user_input["schedule_ids"] if sid in coordinator.schedules]
                await coordinator.async_reset_to_on_schedule(known, skip_inactive=True)
            return self.async_create_entry(title="", data=dict(self.config_entry.options))

        ids = [s[CONF_SCHEDULE_ID] for s in schedules]
        schema = vol.Schema(
            {
                vol.Required("schedule_ids", default=ids): selector.selector(
                    {
                        "select": {
                            "multiple": True,
                            "options": [
                                {"value": s[CONF_SCHEDULE_ID], "label": s[CONF_SCHEDULE_NAME]} for s in schedules
                            ],
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="reset_schedules", data_schema=schema)

    # --- add / edit a schedule (shared steps) ---------------------------------

    async def async_step_add_schedule(self, user_input: dict[str, Any] | None = None):
        self._editing_id = None
        self._draft = {}
        return await self.async_step_schedule_basics()

    async def async_step_schedule_basics(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        current = self._draft
        if user_input is not None:
            name = user_input[CONF_SCHEDULE_NAME].strip()
            if not name:
                errors[CONF_SCHEDULE_NAME] = "name_required"
            else:
                self._draft.update(
                    {
                        CONF_SCHEDULE_NAME: name,
                        CONF_SCHEDULE_DESCRIPTION: user_input.get(CONF_SCHEDULE_DESCRIPTION, "").strip(),
                        CONF_SCHEDULE_MODE: user_input[CONF_SCHEDULE_MODE],
                    }
                )
                if self._draft[CONF_SCHEDULE_MODE] == MODE_FIXED_TIMES:
                    return await self.async_step_schedule_count()
                return await self.async_step_schedule_interval()
            current = {**current, **user_input}

        schema = vol.Schema(
            {
                vol.Required(CONF_SCHEDULE_NAME, default=current.get(CONF_SCHEDULE_NAME, "")): str,
                vol.Optional(
                    CONF_SCHEDULE_DESCRIPTION,
                    description={"suggested_value": current.get(CONF_SCHEDULE_DESCRIPTION, "")},
                ): selector.selector({"text": {"multiline": True}}),
                vol.Required(
                    CONF_SCHEDULE_MODE, default=current.get(CONF_SCHEDULE_MODE, MODE_FIXED_TIMES)
                ): selector.selector(
                    {
                        "select": {
                            "options": [MODE_FIXED_TIMES, MODE_INTERVAL],
                            "translation_key": "schedule_mode",
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="schedule_basics", data_schema=schema, errors=errors)

    async def async_step_schedule_count(self, user_input: dict[str, Any] | None = None):
        """Fixed times, part 1: how many times a day (a counter, not a list)."""
        if user_input is not None:
            self._draft["_count"] = int(user_input["count"])
            return await self.async_step_schedule_times()

        existing = self._draft.get(CONF_SCHEDULE_FIXED_TIMES) or []
        schema = vol.Schema(
            {
                vol.Required("count", default=len(existing) or 1): selector.selector(
                    {
                        "number": {
                            "min": MIN_PER_DAY_COUNT,
                            "max": MAX_PER_DAY_COUNT,
                            "step": 1,
                            "mode": "box",
                        }
                    }
                )
            }
        )
        return self.async_show_form(step_id="schedule_count", data_schema=schema)

    async def async_step_schedule_times(self, user_input: dict[str, Any] | None = None):
        """Fixed times, part 2: one time field per execution."""
        count = self._draft.get("_count", 1)
        if user_input is not None:
            times = sorted({normalize_hhmm(user_input[f"time_{i}"]) for i in range(1, count + 1)})
            self._draft[CONF_SCHEDULE_FIXED_TIMES] = times
            self._draft.pop(CONF_SCHEDULE_INTERVAL_HOURS, None)
            return await self.async_step_schedule_range()

        existing = self._draft.get(CONF_SCHEDULE_FIXED_TIMES) or []
        defaults = default_times(count)
        fields = {}
        for i in range(1, count + 1):
            default = existing[i - 1] if i <= len(existing) else defaults[i - 1]
            fields[vol.Required(f"time_{i}", default=default)] = selector.selector({"time": {}})
        return self.async_show_form(step_id="schedule_times", data_schema=vol.Schema(fields))

    async def async_step_schedule_interval(self, user_input: dict[str, Any] | None = None):
        """Every X hours: the first term is exactly the start, no list of times."""
        if user_input is not None:
            self._draft[CONF_SCHEDULE_INTERVAL_HOURS] = float(user_input[CONF_SCHEDULE_INTERVAL_HOURS])
            self._draft.pop(CONF_SCHEDULE_FIXED_TIMES, None)
            return await self.async_step_schedule_range()

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SCHEDULE_INTERVAL_HOURS,
                    default=self._draft.get(CONF_SCHEDULE_INTERVAL_HOURS, 12),
                ): selector.selector({"number": {"min": 0.5, "max": 48, "step": 0.5, "mode": "box"}})
            }
        )
        return self.async_show_form(step_id="schedule_interval", data_schema=schema)

    async def async_step_schedule_range(self, user_input: dict[str, Any] | None = None):
        """Start, optional end and the tolerance window; then the schedule is saved."""
        errors: dict[str, str] = {}
        current = self._draft
        if user_input is not None:
            current = {**current, **user_input}
            try:
                start = normalize_local_datetime(user_input[CONF_SCHEDULE_START_AT])
                end_raw = (user_input.get(CONF_SCHEDULE_END_AT) or "").strip()
                end = normalize_local_datetime(end_raw) if end_raw else None
            except ValueError:
                errors["base"] = "invalid_datetime"
            else:
                tz = dt_util.now().tzinfo
                if end is not None and parse_local_datetime(end, tz) <= parse_local_datetime(start, tz):
                    errors[CONF_SCHEDULE_END_AT] = "end_before_start"
                else:
                    schedule = {
                        CONF_SCHEDULE_ID: self._editing_id or uuid.uuid4().hex[:8],
                        CONF_SCHEDULE_NAME: self._draft[CONF_SCHEDULE_NAME],
                        CONF_SCHEDULE_DESCRIPTION: self._draft.get(CONF_SCHEDULE_DESCRIPTION, ""),
                        CONF_SCHEDULE_MODE: self._draft[CONF_SCHEDULE_MODE],
                        CONF_SCHEDULE_START_AT: start,
                        CONF_SCHEDULE_END_AT: end,
                        CONF_SCHEDULE_WINDOW_MINUTES: int(user_input[CONF_SCHEDULE_WINDOW_MINUTES]),
                    }
                    if schedule[CONF_SCHEDULE_MODE] == MODE_FIXED_TIMES:
                        schedule[CONF_SCHEDULE_FIXED_TIMES] = self._draft[CONF_SCHEDULE_FIXED_TIMES]
                    else:
                        schedule[CONF_SCHEDULE_INTERVAL_HOURS] = self._draft[CONF_SCHEDULE_INTERVAL_HOURS]
                    schedules = self._schedules
                    if self._editing_id is None:
                        schedules.append(schedule)
                    else:
                        schedules = [schedule if s[CONF_SCHEDULE_ID] == self._editing_id else s for s in schedules]
                    return self._save(schedules)

        now_text = dt_util.now().strftime("%Y-%m-%d %H:%M:%S")
        start_default = (current.get(CONF_SCHEDULE_START_AT) or now_text).replace("T", " ")
        end_default = (current.get(CONF_SCHEDULE_END_AT) or "").replace("T", " ")
        schema = vol.Schema(
            {
                vol.Required(CONF_SCHEDULE_START_AT, default=start_default): selector.selector({"datetime": {}}),
                vol.Optional(
                    CONF_SCHEDULE_END_AT, description={"suggested_value": end_default or None}
                ): selector.selector({"datetime": {}}),
                vol.Required(
                    CONF_SCHEDULE_WINDOW_MINUTES,
                    default=int(current.get(CONF_SCHEDULE_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES)),
                ): selector.selector({"number": {"min": 1, "max": 240, "step": 1, "mode": "box"}}),
            }
        )
        return self.async_show_form(step_id="schedule_range", data_schema=schema, errors=errors)

    # --- manage (edit / switch on-off / remove) ---------------------------------

    async def async_step_manage_schedules(self, user_input: dict[str, Any] | None = None):
        schedules = self._schedules
        if not schedules:
            return self.async_abort(reason="no_schedules")

        if user_input is not None:
            schedule_id = user_input["schedule_id"]
            action = user_input["action"]
            if action == "remove":
                return self._save([s for s in schedules if s[CONF_SCHEDULE_ID] != schedule_id])
            if action == "switch_active":
                coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
                if coordinator is not None and schedule_id in coordinator.runtime:
                    now_off = not coordinator.runtime[schedule_id].manually_inactive
                    await coordinator.async_set_active(schedule_id, not now_off)
                return self.async_create_entry(title="", data=dict(self.config_entry.options))
            # edit: start from the stored definition
            stored = next(s for s in schedules if s[CONF_SCHEDULE_ID] == schedule_id)
            self._editing_id = schedule_id
            self._draft = dict(stored)
            return await self.async_step_schedule_basics()

        schema = vol.Schema(
            {
                vol.Required("schedule_id"): selector.selector(
                    {
                        "select": {
                            "options": [
                                {"value": s[CONF_SCHEDULE_ID], "label": s[CONF_SCHEDULE_NAME]}
                                for s in schedules
                            ]
                        }
                    }
                ),
                vol.Required("action", default="edit"): selector.selector(
                    {"select": {"options": STEP_ACTIONS, "translation_key": "schedule_action"}}
                ),
            }
        )
        return self.async_show_form(step_id="manage_schedules", data_schema=schema)

    # --- global settings --------------------------------------------------------

    def _notify_options(self) -> list[str]:
        services = self.hass.services.async_services().get("notify", {})
        return sorted(f"notify.{name}" for name in services if name.startswith("mobile_app_"))

    async def async_step_global_settings(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            options = dict(self.config_entry.options)
            options[CONF_GLOBAL_SOUND] = user_input[CONF_GLOBAL_SOUND]
            options[CONF_NOTIFY_SERVICE] = (user_input.get(CONF_NOTIFY_SERVICE) or "").strip() or None
            return self.async_create_entry(title="", data=options)

        current = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_GLOBAL_SOUND, default=current.get(CONF_GLOBAL_SOUND, AVAILABLE_SOUNDS[0])
                ): selector.selector({"select": {"options": AVAILABLE_SOUNDS}}),
                vol.Optional(
                    CONF_NOTIFY_SERVICE,
                    description={"suggested_value": current.get(CONF_NOTIFY_SERVICE)},
                ): selector.selector(
                    {"select": {"options": self._notify_options(), "custom_value": True, "mode": "dropdown"}}
                ),
            }
        )
        return self.async_show_form(step_id="global_settings", data_schema=schema)
