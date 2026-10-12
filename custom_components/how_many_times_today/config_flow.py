"""Config + Options flow: everything is click-driven, no YAML editing required."""
from __future__ import annotations

import uuid
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    AVAILABLE_SOUNDS,
    CONF_BLINK_THRESHOLD_MINUTES,
    CONF_BTW_SYNC_ENABLED,
    CONF_GLOBAL_SOUND,
    CONF_TASK_FIXED_TIMES,
    CONF_TASK_ID,
    CONF_TASK_INTERVAL_HOURS,
    CONF_TASK_LATE_POLICY,
    CONF_TASK_MODE,
    CONF_TASK_NAME,
    CONF_TASK_REFERENCE_TIME,
    CONF_TASKS,
    DEFAULT_BLINK_THRESHOLD_MINUTES,
    DEFAULT_LATE_POLICY,
    DOMAIN,
    LATE_POLICY_COMPRESS,
    LATE_POLICY_RESET,
    MODE_FIXED_TIMES,
    MODE_INTERVAL,
)


class HowManyTimesTodayConfigFlow(ConfigFlow, domain=DOMAIN):
    """The integration itself is a singleton; tasks are managed entirely via Options."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="How Many Times Today", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HowManyTimesTodayOptionsFlow()


class HowManyTimesTodayOptionsFlow(OptionsFlow):
    def __init__(self) -> None:
        self._new_task: dict[str, Any] = {}
        self._editing_task_id: str | None = None

    @property
    def _tasks(self) -> list[dict]:
        return list(self.config_entry.options.get(CONF_TASKS, []))

    async def _async_save_tasks(self, tasks: list[dict]):
        new_options = dict(self.config_entry.options)
        new_options[CONF_TASKS] = tasks
        return self.async_create_entry(title="", data=new_options)

    # --- main menu -----------------------------------------------------

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_show_menu(
            step_id="init",
            menu_options=["add_task", "manage_tasks", "global_settings"],
        )

    # --- add task --------------------------------------------------------

    async def async_step_add_task(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            self._new_task = {
                CONF_TASK_ID: uuid.uuid4().hex[:8],
                CONF_TASK_NAME: user_input[CONF_TASK_NAME],
                CONF_TASK_MODE: user_input[CONF_TASK_MODE],
            }
            if self._new_task[CONF_TASK_MODE] == MODE_FIXED_TIMES:
                return await self.async_step_add_task_fixed_times()
            return await self.async_step_add_task_interval()

        schema = vol.Schema(
            {
                vol.Required(CONF_TASK_NAME): str,
                vol.Required(CONF_TASK_MODE, default=MODE_FIXED_TIMES): selector.selector(
                    {
                        "select": {
                            "options": [MODE_FIXED_TIMES, MODE_INTERVAL],
                            "translation_key": "schedule_mode",
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="add_task", data_schema=schema, errors=errors)

    async def async_step_add_task_fixed_times(
        self, user_input: dict[str, Any] | None = None
    ):
        errors: dict[str, str] = {}
        if user_input is not None:
            times = [t.strip() for t in user_input["times_csv"].split(",") if t.strip()]
            if not times:
                errors["times_csv"] = "no_times"
            else:
                self._new_task[CONF_TASK_FIXED_TIMES] = times
                tasks = self._tasks
                tasks.append(self._new_task)
                return await self._async_save_tasks(tasks)

        schema = vol.Schema({vol.Required("times_csv", default="09:00"): str})
        return self.async_show_form(
            step_id="add_task_fixed_times",
            data_schema=schema,
            errors=errors,
            description_placeholders={"example": "09:00, 22:00"},
        )

    async def async_step_add_task_interval(
        self, user_input: dict[str, Any] | None = None
    ):
        if user_input is not None:
            self._new_task[CONF_TASK_INTERVAL_HOURS] = user_input["interval_hours"]
            self._new_task[CONF_TASK_REFERENCE_TIME] = user_input["reference_time"]
            self._new_task[CONF_TASK_LATE_POLICY] = user_input["late_policy"]
            tasks = self._tasks
            tasks.append(self._new_task)
            return await self._async_save_tasks(tasks)

        schema = vol.Schema(
            {
                vol.Required("interval_hours", default=12): selector.selector(
                    {"number": {"min": 1, "max": 48, "step": 0.5, "mode": "box"}}
                ),
                vol.Required("reference_time", default="09:00"): selector.selector(
                    {"time": {}}
                ),
                vol.Required(
                    "late_policy", default=DEFAULT_LATE_POLICY
                ): selector.selector(
                    {
                        "select": {
                            "options": [LATE_POLICY_COMPRESS, LATE_POLICY_RESET],
                            "translation_key": "late_policy",
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="add_task_interval", data_schema=schema)

    # --- manage (edit/remove) existing tasks -----------------------------

    async def async_step_manage_tasks(self, user_input: dict[str, Any] | None = None):
        tasks = self._tasks
        if not tasks:
            return self.async_abort(reason="no_tasks")

        if user_input is not None:
            self._editing_task_id = user_input["task_id"]
            if user_input["action"] == "remove":
                tasks = [t for t in tasks if t[CONF_TASK_ID] != self._editing_task_id]
                return await self._async_save_tasks(tasks)
            return await self.async_step_edit_task()

        schema = vol.Schema(
            {
                vol.Required("task_id"): selector.selector(
                    {
                        "select": {
                            "options": [
                                {"value": t[CONF_TASK_ID], "label": t[CONF_TASK_NAME]}
                                for t in tasks
                            ]
                        }
                    }
                ),
                vol.Required("action", default="edit"): selector.selector(
                    {"select": {"options": ["edit", "remove"]}}
                ),
            }
        )
        return self.async_show_form(step_id="manage_tasks", data_schema=schema)

    async def async_step_edit_task(self, user_input: dict[str, Any] | None = None):
        tasks = self._tasks
        task = next(t for t in tasks if t[CONF_TASK_ID] == self._editing_task_id)

        if user_input is not None:
            task[CONF_TASK_NAME] = user_input[CONF_TASK_NAME]
            if task[CONF_TASK_MODE] == MODE_FIXED_TIMES:
                task[CONF_TASK_FIXED_TIMES] = [
                    t.strip() for t in user_input["times_csv"].split(",") if t.strip()
                ]
            else:
                task[CONF_TASK_INTERVAL_HOURS] = user_input["interval_hours"]
                task[CONF_TASK_REFERENCE_TIME] = user_input["reference_time"]
                task[CONF_TASK_LATE_POLICY] = user_input["late_policy"]
            return await self._async_save_tasks(tasks)

        if task[CONF_TASK_MODE] == MODE_FIXED_TIMES:
            schema = vol.Schema(
                {
                    vol.Required(CONF_TASK_NAME, default=task[CONF_TASK_NAME]): str,
                    vol.Required(
                        "times_csv", default=", ".join(task[CONF_TASK_FIXED_TIMES])
                    ): str,
                }
            )
        else:
            schema = vol.Schema(
                {
                    vol.Required(CONF_TASK_NAME, default=task[CONF_TASK_NAME]): str,
                    vol.Required(
                        "interval_hours", default=task[CONF_TASK_INTERVAL_HOURS]
                    ): selector.selector(
                        {"number": {"min": 1, "max": 48, "step": 0.5, "mode": "box"}}
                    ),
                    vol.Required(
                        "reference_time", default=task[CONF_TASK_REFERENCE_TIME]
                    ): selector.selector({"time": {}}),
                    vol.Required(
                        "late_policy", default=task.get(CONF_TASK_LATE_POLICY, DEFAULT_LATE_POLICY)
                    ): selector.selector(
                        {
                            "select": {
                                "options": [LATE_POLICY_COMPRESS, LATE_POLICY_RESET],
                                "translation_key": "late_policy",
                            }
                        }
                    ),
                }
            )
        return self.async_show_form(step_id="edit_task", data_schema=schema)

    # --- global settings --------------------------------------------------

    async def async_step_global_settings(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            new_options = dict(self.config_entry.options)
            new_options[CONF_GLOBAL_SOUND] = user_input[CONF_GLOBAL_SOUND]
            new_options[CONF_BLINK_THRESHOLD_MINUTES] = user_input[
                CONF_BLINK_THRESHOLD_MINUTES
            ]
            # placeholder: Buy The Way sync backend does not exist yet, so this
            # toggle is accepted but never acted upon until that integration lands
            new_options[CONF_BTW_SYNC_ENABLED] = user_input.get(
                CONF_BTW_SYNC_ENABLED, False
            )
            return self.async_create_entry(title="", data=new_options)

        current = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_GLOBAL_SOUND,
                    default=current.get(CONF_GLOBAL_SOUND, AVAILABLE_SOUNDS[0]),
                ): selector.selector({"select": {"options": AVAILABLE_SOUNDS}}),
                vol.Required(
                    CONF_BLINK_THRESHOLD_MINUTES,
                    default=current.get(
                        CONF_BLINK_THRESHOLD_MINUTES, DEFAULT_BLINK_THRESHOLD_MINUTES
                    ),
                ): selector.selector(
                    {"number": {"min": 5, "max": 1440, "step": 5, "mode": "box"}}
                ),
                vol.Optional(
                    CONF_BTW_SYNC_ENABLED,
                    default=current.get(CONF_BTW_SYNC_ENABLED, False),
                ): selector.selector({"boolean": {}}),
            }
        )
        return self.async_show_form(
            step_id="global_settings",
            data_schema=schema,
            description_placeholders={"btw_status": "coming soon"},
        )
