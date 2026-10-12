"""Constants for the How Many Times Today integration."""
from __future__ import annotations

DOMAIN = "how_many_times_today"

# --- schedule modes ---
MODE_FIXED_TIMES = "fixed_times"
MODE_INTERVAL = "interval"

# --- late-press policy (interval mode only) ---
LATE_POLICY_COMPRESS = "compress"  # shorten next cycle by the delay
LATE_POLICY_RESET = "reset"  # start a fresh full interval from press time
LATE_SCOPE_ONCE = "once"
LATE_SCOPE_PERMANENT = "permanent"

# --- slot color stages (also used as sensor state) ---
STAGE_GREEN = "green"
STAGE_TRANSITION = "transition"  # interpolated green -> red, see color attr
STAGE_RED = "red"
STAGE_OVERDUE = "overdue"  # brown
STAGE_BLINKING = "blinking"

# --- config/options keys ---
CONF_TASKS = "tasks"
CONF_GLOBAL_SOUND = "global_sound"
CONF_BLINK_THRESHOLD_MINUTES = "blink_threshold_minutes"
CONF_BTW_SYNC_ENABLED = "btw_sync_enabled"

# task definition keys
CONF_TASK_ID = "id"
CONF_TASK_NAME = "name"
CONF_TASK_MODE = "mode"
CONF_TASK_FIXED_TIMES = "fixed_times"  # list[str] "HH:MM"
CONF_TASK_INTERVAL_HOURS = "interval_hours"
CONF_TASK_REFERENCE_TIME = "reference_time"  # "HH:MM", anchor for interval mode
CONF_TASK_LATE_POLICY = "late_policy"

DEFAULT_BLINK_THRESHOLD_MINUTES = 60
DEFAULT_LATE_POLICY = LATE_POLICY_COMPRESS

AVAILABLE_SOUNDS = [
    "chime",
    "bell",
    "alert",
    "gentle",
    "none",
]

UPDATE_INTERVAL_SECONDS = 30

# dispatcher signal fired whenever slots are added/removed after the initial
# platform setup (e.g. a task added/edited/removed via Options Flow while HA is
# running) - format with the config entry_id
SIGNAL_SLOTS_UPDATED = DOMAIN + "_slots_updated_{}"

STORAGE_VERSION = 1
STORAGE_KEY_PREFIX = f"{DOMAIN}_history"

SERVICE_PRESS_SLOT = "press_slot"
SERVICE_CLEAR_HISTORY = "clear_history"

ATTR_SLOT_ID = "slot_id"
ATTR_WEEKS = "weeks"  # optional list of ISO week strings "YYYY-Www" to clear selectively
