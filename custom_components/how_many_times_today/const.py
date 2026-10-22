"""Constants for the How Many Times Today integration."""
from __future__ import annotations

DOMAIN = "how_many_times_today"
AUTHOR = "Jacek Bieganowski"

# --- schedule modes ---
MODE_FIXED_TIMES = "fixed_times"  # N times a day, each at a chosen HH:MM
MODE_INTERVAL = "interval"  # every X hours, the first term is exactly the start

# --- sensor states (one sensor per schedule; the state is the single source of
# truth for the button's look, the card only maps it to colours) ---
STATE_PENDING = "pending"  # before the start date/time
STATE_GREEN = "green"  # just confirmed
STATE_TRANSITION = "transition"  # green fading to red towards the next term
STATE_RED = "red"  # a term is due and still inside its tolerance window
STATE_BLINKING_BLACK = "blinking_black"  # an unresolved term outlived its window
STATE_EXCEEDED = "exceeded"  # more executions today than planned
STATE_INACTIVE = "inactive"  # after the end, or switched off by hand

SCHEDULE_STATES = [
    STATE_PENDING,
    STATE_GREEN,
    STATE_TRANSITION,
    STATE_RED,
    STATE_BLINKING_BLACK,
    STATE_EXCEEDED,
    STATE_INACTIVE,
]

# --- history entry kinds ---
KIND_ON_SCHEDULE = "on_schedule"  # pressed inside a term's tolerance window
KIND_REGISTERED_LATE = "registered_late"  # answer A, or the closed half of answer C
KIND_OUTSIDE = "outside"  # outside the schedule (answer B or no open term)
KIND_EXTRA = "extra"  # the additional execution of answer C
KIND_MISSED = "missed"  # "POMINIĘTE": a term nobody confirmed

# --- answers to the "pressed outside the window while a term is open" question ---
ANSWER_ALREADY_DONE = "already_done"  # A: it was done at the term, just not recorded
ANSWER_DO_NOW = "do_now"  # B: it was not done at the term, doing it now
ANSWER_EXTRA = "extra"  # C: done at the term, and this is an additional one
# answer to the "pressed a little too early" question: it was done ahead of time (closes
# the coming term); the other answer there is ANSWER_EXTRA (an additional execution)
ANSWER_DONE_EARLY = "done_early"
ANSWERS = [ANSWER_ALREADY_DONE, ANSWER_DO_NOW, ANSWER_EXTRA, ANSWER_DONE_EARLY]

# --- config/options keys ---
CONF_SCHEDULES = "schedules"
CONF_GLOBAL_SOUND = "global_sound"  # the reminder sound id (see SOUND_IDS)
CONF_GLOBAL_VOLUME = "global_volume"  # 0 = off ... 4 = very loud
CONF_FONT_SCALE = "font_scale"  # text size of the cards, 0.85 ... 1.75
CONF_HIGH_CONTRAST = "high_contrast"  # white bold text on black
CONF_NOTIFY_SERVICE = "notify_service"  # optional notify.mobile_app_* for the push

# schedule definition keys (stored in the options)
CONF_SCHEDULE_ID = "id"
CONF_SCHEDULE_NAME = "name"
CONF_SCHEDULE_DESCRIPTION = "description"
CONF_SCHEDULE_MODE = "mode"
CONF_SCHEDULE_FIXED_TIMES = "fixed_times"  # list[str] "HH:MM", 1-24 entries
CONF_SCHEDULE_INTERVAL_HOURS = "interval_hours"
CONF_SCHEDULE_START_AT = "start_at"  # local "YYYY-MM-DDTHH:MM:SS"
CONF_SCHEDULE_END_AT = "end_at"  # optional, same format
CONF_SCHEDULE_WINDOW_MINUTES = "window_minutes"
CONF_SCHEDULE_SOUND = "sound_id"  # optional: this schedule's own reminder sound
CONF_SCHEDULE_VOLUME = "volume_level"  # optional: 0 = off ... 4 = very loud

DEFAULT_WINDOW_MINUTES = 30
MIN_PER_DAY_COUNT = 1
MAX_PER_DAY_COUNT = 24

# a term is logged as missed ("POMINIĘTE") after this share of the gap to the next one
MISSED_GAP_FRACTION = 0.75
# a due event / push is only sent when the term is this fresh (no stale alerts after
# a long downtime)
DUE_NOTIFY_GRACE_SECONDS = 300

# The reminder sounds (synthesised by tools/make_sounds.py, files www/sounds/<id>_<1-4>.ogg)
# and their classes of strength; the volume levels 1-4 are the file variants, 0 is silence.
SOUNDS = {
    "delikatny_dzwonek": "gentle",
    "pozytywka": "gentle",
    "harfa": "gentle",
    "dzwonek": "medium",
    "gitara": "medium",
    "marimba": "medium",
    "sygnal": "strong",
    "fanfara": "strong",
    "budzik": "strong",
    "sos": "strong",
    "alarm": "verystrong",
    "syrena": "verystrong",
    "wlaz_kotek": "melody",
    "kreskowka": "melody",
    "pop_weasel": "melody",
    "boze_narodzenie": "seasonal",
    "wielkanoc_kurczaczek": "seasonal",
    "wielkanoc_dzwony": "seasonal",
}
SOUND_IDS = list(SOUNDS)
DEFAULT_SOUND = "dzwonek"
DEFAULT_VOLUME = 3
MIN_VOLUME = 0
MAX_VOLUME = 4
# the sound names of 1.x (a global option only), and the volume they meant
LEGACY_SOUNDS = {
    "chime": ("dzwonek", DEFAULT_VOLUME),
    "bell": ("dzwonek", DEFAULT_VOLUME),
    "alert": ("alarm", DEFAULT_VOLUME),
    "gentle": ("delikatny_dzwonek", DEFAULT_VOLUME),
    "none": (DEFAULT_SOUND, 0),
}

# text size steps of the cards (like the app: 85 % ... 175 %)
FONT_SCALES = [0.85, 1.0, 1.15, 1.3, 1.5, 1.75]
DEFAULT_FONT_SCALE = 1.0

# a press in the last share of the gap before the tolerance window of the coming term
# counts as "too early" and asks whether it was done ahead of time
EARLY_ZONE_FRACTION = 0.10

UPDATE_INTERVAL_SECONDS = 30
HISTORY_ATTRIBUTE_LIMIT = 50  # newest entries exposed on the sensor

# event fired when a term becomes due (the sensor turns red)
EVENT_DUE = "how_many_times_today_due"

# dispatcher signal fired whenever schedules are added/removed after the initial
# platform setup - format with the config entry_id
SIGNAL_SCHEDULES_UPDATED = DOMAIN + "_schedules_updated_{}"

STORAGE_VERSION = 1
STORAGE_KEY_STATE_PREFIX = f"{DOMAIN}_schedule_state"
STORAGE_KEY_HISTORY_PREFIX = f"{DOMAIN}_schedule_history"

# --- the previous slot model (only read by the one-off migration) ---
LEGACY_CONF_TASKS = "tasks"
LEGACY_STORAGE_HISTORY_PREFIX = f"{DOMAIN}_history"
LEGACY_STORAGE_STATE_PREFIX = f"{DOMAIN}_slot_state"

# --- services ---
SERVICE_PRESS_SCHEDULE = "press_schedule"
SERVICE_CLEAR_HISTORY = "clear_history"
SERVICE_RESET_SCHEDULE = "reset_schedule"
SERVICE_SET_SCHEDULE_ACTIVE = "set_schedule_active"
SERVICE_UPDATE_SCHEDULE = "update_schedule"

ATTR_ANSWER = "answer"
ATTR_WEEKS = "weeks"  # optional list of ISO week strings "YYYY-Www"
ATTR_ACTIVE = "active"
