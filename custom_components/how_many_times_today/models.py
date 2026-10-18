"""Pure scheduling engine (no Home Assistant imports, easy to unit test).

One *schedule* has many *terms* (the moments something is due). Terms are derived from
the schedule's definition; only unresolved terms (and a few recently resolved ones) are
kept as runtime state. Everything takes `now` explicitly, so it is deterministic.

Time arithmetic goes through UTC: subtracting two aware datetimes that share a tzinfo
ignores DST, which would put terms an hour off on the days the clocks change.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone, tzinfo
from itertools import islice
from typing import Iterator

from .const import (
    ANSWER_ALREADY_DONE,
    ANSWER_DO_NOW,
    ANSWER_EXTRA,
    CONF_SCHEDULE_DESCRIPTION,
    CONF_SCHEDULE_END_AT,
    CONF_SCHEDULE_FIXED_TIMES,
    CONF_SCHEDULE_ID,
    CONF_SCHEDULE_INTERVAL_HOURS,
    CONF_SCHEDULE_MODE,
    CONF_SCHEDULE_NAME,
    CONF_SCHEDULE_START_AT,
    CONF_SCHEDULE_WINDOW_MINUTES,
    DEFAULT_WINDOW_MINUTES,
    DUE_NOTIFY_GRACE_SECONDS,
    KIND_EXTRA,
    KIND_MISSED,
    KIND_ON_SCHEDULE,
    KIND_OUTSIDE,
    KIND_REGISTERED_LATE,
    MISSED_GAP_FRACTION,
    MODE_FIXED_TIMES,
    MODE_INTERVAL,
    STATE_BLINKING_BROWN,
    STATE_EXCEEDED,
    STATE_GREEN,
    STATE_INACTIVE,
    STATE_PENDING,
    STATE_RED,
    STATE_TRANSITION,
)

OPEN = "open"
RESOLVED = "resolved"
_UTC = timezone.utc
_EPS = timedelta(microseconds=1)
# resolved terms older than this are forgotten
_KEEP_RESOLVED = timedelta(days=3)
# colour progress at or below this is still plain "green"
_GREEN_PROGRESS = 0.02


class AnswerRequired(Exception):
    """A press needs the A/B/C answer: it is outside the window of an open term."""


class ScheduleNotActive(Exception):
    """The schedule is pending (before its start) or inactive, so it takes no presses."""


# --- time helpers -------------------------------------------------------------------


def _parse_hhmm(value: str) -> time:
    # HA's TimeSelector returns "HH:MM:SS"; manually typed entries are "HH:MM" - accept
    # both, ignore seconds either way
    parts = value.split(":")
    return time(int(parts[0]), int(parts[1]))


def normalize_hhmm(value: str) -> str:
    """Validate a time and return it as "HH:MM"; raises ValueError if it is not a real
    time of day ("9am", "25:00", "", ...)."""
    try:
        return _parse_hhmm(value.strip()).strftime("%H:%M")
    except (ValueError, IndexError) as err:
        raise ValueError(f"Not a valid HH:MM time: {value!r}") from err


def parse_local_datetime(value: str, tz: tzinfo) -> datetime:
    """Parse a stored/entered local date-time; a naive value is read in `tz`."""
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=tz) if parsed.tzinfo is None else parsed


def normalize_local_datetime(raw: str) -> str:
    """"2026-10-19 09:30:00" / "2026-10-19T09:30" -> "2026-10-19T09:30:00" (a local,
    timezone-less wall-clock time as stored in the options); ValueError if unreadable."""
    parsed = datetime.fromisoformat(raw.strip())
    return parsed.replace(tzinfo=None, microsecond=0).isoformat()


def default_times(count: int) -> list[str]:
    """Evenly spread, readable defaults for the time fields (2 -> 09:00, 21:00)."""
    count = max(1, min(count, 24))
    step = 24 // count
    return [f"{(9 + i * step) % 24:02d}:00" for i in range(count)]


def _utc(value: datetime) -> datetime:
    return value.astimezone(_UTC)


def _add(value: datetime, delta: timedelta) -> datetime:
    """value + an absolute duration, returned in value's own timezone."""
    return (_utc(value) + delta).astimezone(value.tzinfo)


def _diff(a: datetime, b: datetime) -> timedelta:
    """a - b as an absolute duration."""
    return _utc(a) - _utc(b)


# --- schedule definition ------------------------------------------------------------


@dataclass(frozen=True)
class Schedule:
    id: str
    name: str
    description: str
    mode: str
    fixed_times: tuple[time, ...]  # sorted, unique (fixed_times mode)
    interval_hours: float  # (interval mode)
    start_at: datetime
    end_at: datetime | None
    window_minutes: int

    @property
    def window(self) -> timedelta:
        return timedelta(minutes=self.window_minutes)

    @property
    def planned_count(self) -> int:
        """How many executions are planned per day."""
        if self.mode == MODE_FIXED_TIMES:
            return len(self.fixed_times)
        return max(1, math.ceil(24 / self.interval_hours))


def build_schedule(cfg: dict, tz: tzinfo) -> Schedule:
    """Build a Schedule from its stored dict (the options entry)."""
    mode = cfg[CONF_SCHEDULE_MODE]
    if mode not in (MODE_FIXED_TIMES, MODE_INTERVAL):
        raise ValueError(f"Unknown schedule mode: {mode}")
    fixed: tuple[time, ...] = ()
    interval = 0.0
    if mode == MODE_FIXED_TIMES:
        fixed = tuple(sorted({_parse_hhmm(t) for t in cfg[CONF_SCHEDULE_FIXED_TIMES]}))
        if not fixed:
            raise ValueError("A fixed-times schedule needs at least one time")
    else:
        interval = float(cfg[CONF_SCHEDULE_INTERVAL_HOURS])
        if interval <= 0:
            raise ValueError("The interval must be positive")
    end = cfg.get(CONF_SCHEDULE_END_AT)
    return Schedule(
        id=cfg[CONF_SCHEDULE_ID],
        name=cfg[CONF_SCHEDULE_NAME],
        description=cfg.get(CONF_SCHEDULE_DESCRIPTION) or "",
        mode=mode,
        fixed_times=fixed,
        interval_hours=interval,
        start_at=parse_local_datetime(cfg[CONF_SCHEDULE_START_AT], tz),
        end_at=parse_local_datetime(end, tz) if end else None,
        window_minutes=int(cfg.get(CONF_SCHEDULE_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES)),
    )


# --- terms --------------------------------------------------------------------------


def occurrences_after(s: Schedule, after: datetime) -> Iterator[datetime]:
    """Terms strictly later than `after`, within [start, end], oldest first. Infinite
    unless the schedule has an end."""
    tz = after.tzinfo
    if s.mode == MODE_INTERVAL:
        step = timedelta(hours=s.interval_hours)
        k = 0 if _diff(after, s.start_at) < timedelta(0) else int(_diff(after, s.start_at) // step) + 1
        while True:
            term = _add(s.start_at, k * step)
            if s.end_at is not None and term > s.end_at:
                return
            yield term
            k += 1
    day: date = after.date()
    while True:
        if s.end_at is not None and day > s.end_at.date():
            return
        for t in s.fixed_times:
            term = datetime.combine(day, t, tzinfo=tz)
            if term > after and term >= s.start_at:
                if s.end_at is not None and term > s.end_at:
                    return
                yield term
        day += timedelta(days=1)


def _pattern_next(s: Schedule, term: datetime) -> datetime:
    """The next term of the periodic pattern after `term`, ignoring start and end - used
    for the gap, which the last term before the end still has."""
    if s.mode == MODE_INTERVAL:
        return _add(term, timedelta(hours=s.interval_hours))
    for t in s.fixed_times:
        candidate = datetime.combine(term.date(), t, tzinfo=term.tzinfo)
        if candidate > term:
            return candidate
    return datetime.combine(term.date() + timedelta(days=1), s.fixed_times[0], tzinfo=term.tzinfo)


def gap_after(s: Schedule, term: datetime) -> timedelta:
    """Time from `term` to the following term (the last one of a day counts to the
    first one of the next day)."""
    return _diff(_pattern_next(s, term), term)


def missed_at(s: Schedule, term: datetime) -> datetime:
    """When an unresolved term is declared missed: 3/4 of the gap after it."""
    return _add(term, gap_after(s, term) * MISSED_GAP_FRACTION)


# --- runtime state ------------------------------------------------------------------


@dataclass
class ScheduleRuntime:
    """Mutable, persisted state of one schedule."""

    schedule_id: str
    last_press_at: datetime | None = None
    # terms up to here have been turned into records (so nothing opens twice)
    processed_until: datetime | None = None
    # ISO term -> {"status": open|resolved, "missed": bool}
    occurrences: dict[str, dict] = field(default_factory=dict)
    number_blinking: bool = False
    manually_inactive: bool = False

    def to_dict(self) -> dict:
        return {
            "last_press_at": self.last_press_at.isoformat() if self.last_press_at else None,
            "processed_until": self.processed_until.isoformat() if self.processed_until else None,
            "occurrences": self.occurrences,
            "number_blinking": self.number_blinking,
            "manually_inactive": self.manually_inactive,
        }

    @classmethod
    def from_dict(cls, schedule_id: str, data: dict) -> ScheduleRuntime:
        def dt(value):
            return datetime.fromisoformat(value) if value else None

        return cls(
            schedule_id=schedule_id,
            last_press_at=dt(data.get("last_press_at")),
            processed_until=dt(data.get("processed_until")),
            occurrences={k: dict(v) for k, v in (data.get("occurrences") or {}).items()},
            number_blinking=bool(data.get("number_blinking", False)),
            manually_inactive=bool(data.get("manually_inactive", False)),
        )


def new_runtime(s: Schedule, now: datetime) -> ScheduleRuntime:
    """Runtime for a schedule that has just been created.

    Terms from the last tolerance window (or from the start, if later) still count, so a
    schedule created a minute after its start shows its first term as due instead of
    silently skipping it; older terms are not backfilled.
    """
    start_of_processing = max(s.start_at - _EPS, _add(now, -s.window))
    return ScheduleRuntime(schedule_id=s.id, processed_until=start_of_processing)


def activity(s: Schedule, rt: ScheduleRuntime, now: datetime) -> str:
    """"inactive" (switched off or past the end), "pending" (before the start) or "active"."""
    if rt.manually_inactive or (s.end_at is not None and now > s.end_at):
        return STATE_INACTIVE
    if now < s.start_at:
        return STATE_PENDING
    return "active"


def _term_of(key: str) -> datetime:
    return datetime.fromisoformat(key)


def _open_terms(rt: ScheduleRuntime) -> list[datetime]:
    return sorted(_term_of(k) for k, rec in rt.occurrences.items() if rec["status"] == OPEN)


# --- history ------------------------------------------------------------------------


def make_entry(
    timestamp: datetime,
    kind: str,
    scheduled_at: datetime | None,
    outside_schedule: bool,
    count_delta: int,
) -> dict:
    return {
        "timestamp": timestamp.isoformat(),
        "kind": kind,
        "scheduled_at": scheduled_at.isoformat() if scheduled_at else None,
        "outside_schedule": outside_schedule,
        "count_delta": count_delta,
    }


def count_today(history: list[dict], now: datetime) -> int:
    """Executions recorded today (local day); the counter resets at midnight on its own."""
    today = now.date()
    return sum(
        e["count_delta"]
        for e in history
        if datetime.fromisoformat(e["timestamp"]).astimezone(now.tzinfo).date() == today
    )


# --- advancing time -----------------------------------------------------------------


@dataclass
class DueEvent:
    """A term has just become due (the sensor turns red)."""

    scheduled_at: datetime


def advance(s: Schedule, rt: ScheduleRuntime, now: datetime) -> tuple[list[DueEvent], list[dict]]:
    """Move the runtime up to `now`: open terms that have come due, log terms that have
    gone unanswered for 3/4 of their gap ("missed"), forget old resolved ones.

    Returns (due events, new history entries); mutates `rt`.
    """
    events: list[DueEvent] = []
    entries: list[dict] = []
    state = activity(s, rt, now)

    if state == STATE_INACTIVE:
        # nothing is opened or logged while off, and the time spent off is not
        # backfilled when it is switched on again
        rt.processed_until = now
        return events, entries
    if state == STATE_PENDING:
        return events, entries

    after = rt.processed_until if rt.processed_until is not None else _add(now, -s.window)
    for term in occurrences_after(s, after):
        if term > now:
            break
        key = term.isoformat()
        if key not in rt.occurrences:  # a term resolved in advance is already there
            rt.occurrences[key] = {"status": OPEN, "missed": False}
            if _diff(now, term) <= timedelta(seconds=DUE_NOTIFY_GRACE_SECONDS):
                events.append(DueEvent(term))
    rt.processed_until = now

    for key in sorted(rt.occurrences):
        rec = rt.occurrences[key]
        if rec["status"] == OPEN and not rec["missed"]:
            term = _term_of(key)
            declared = missed_at(s, term)
            if now >= declared:
                rec["missed"] = True
                entries.append(make_entry(declared, KIND_MISSED, term, False, 0))

    cutoff = _add(now, -_KEEP_RESOLVED)
    for key in [k for k, r in rt.occurrences.items() if r["status"] == RESOLVED and _term_of(k) < cutoff]:
        del rt.occurrences[key]
    return events, entries


def next_boundary(s: Schedule, rt: ScheduleRuntime, now: datetime) -> datetime | None:
    """The next moment at which the schedule's state changes by itself (a term comes due,
    a window ends, a term is declared missed, start/end, midnight), or None."""
    candidates: list[datetime] = []
    if now < s.start_at:
        candidates.append(s.start_at)
    nxt = next(occurrences_after(s, now), None)
    if nxt is not None:
        candidates.append(nxt)
    for key, rec in rt.occurrences.items():
        if rec["status"] != OPEN:
            continue
        term = _term_of(key)
        candidates.append(_add(term, s.window))
        if not rec["missed"]:
            candidates.append(missed_at(s, term))
    if s.end_at is not None and now <= s.end_at:
        candidates.append(s.end_at + _EPS)
    midnight = datetime.combine(now.date() + timedelta(days=1), time(0), tzinfo=now.tzinfo)
    candidates.append(midnight)
    future = [c for c in candidates if c > now]
    return min(future) if future else None


# --- pressing -----------------------------------------------------------------------


def _within(now: datetime, term: datetime, window: timedelta) -> bool:
    return abs(_diff(now, term)) <= window


def answer_required(s: Schedule, rt: ScheduleRuntime, now: datetime) -> bool:
    """True when pressing now needs the A/B/C answer: the oldest open term is outside its
    tolerance window."""
    opens = _open_terms(rt)
    return bool(opens) and not _within(now, opens[0], s.window)


def press(
    s: Schedule,
    rt: ScheduleRuntime,
    now: datetime,
    history: list[dict],
    answer: str | None = None,
) -> list[dict]:
    """Register one press. Returns the history entries to append; mutates `rt`.

    Rules (oldest open term first):
    - inside the oldest open term's window: it is closed, a normal entry;
    - outside its window: the answer decides - A (already done: closed, +1), B (do it
      now: closed late, +1, outside the schedule), C (done then and again now: closed,
      +2, one entry of each); without an answer AnswerRequired is raised;
    - no open term: an upcoming term whose window has opened is closed in advance,
      otherwise the press is an extra, outside the schedule.
    Blinking of the number starts after an outside press that stays within the planned
    count and ends with the next press.
    """
    if activity(s, rt, now) != "active":
        raise ScheduleNotActive(activity(s, rt, now))

    before = count_today(history, now)
    entries: list[dict] = []
    outside = False
    opens = _open_terms(rt)

    if opens:
        term = opens[0]
        if _within(now, term, s.window):
            entries.append(make_entry(now, KIND_ON_SCHEDULE, term, False, 1))
        else:
            if answer is None:
                raise AnswerRequired
            if answer == ANSWER_ALREADY_DONE:
                entries.append(make_entry(now, KIND_REGISTERED_LATE, term, False, 1))
            elif answer == ANSWER_DO_NOW:
                entries.append(make_entry(now, KIND_OUTSIDE, term, True, 1))
                outside = True
            elif answer == ANSWER_EXTRA:
                entries.append(make_entry(now, KIND_REGISTERED_LATE, term, False, 1))
                entries.append(make_entry(now, KIND_EXTRA, None, True, 1))
                outside = True
            else:
                raise ValueError(f"Unknown answer: {answer!r}")
        rt.occurrences[term.isoformat()] = {"status": RESOLVED, "missed": rt.occurrences[term.isoformat()]["missed"]}
    else:
        upcoming = next(occurrences_after(s, now), None)
        if (
            upcoming is not None
            and _diff(upcoming, now) <= s.window
            and upcoming.isoformat() not in rt.occurrences
        ):
            rt.occurrences[upcoming.isoformat()] = {"status": RESOLVED, "missed": False}
            entries.append(make_entry(now, KIND_ON_SCHEDULE, upcoming, False, 1))
        else:
            entries.append(make_entry(now, KIND_OUTSIDE, None, True, 1))
            outside = True

    after = before + sum(e["count_delta"] for e in entries)
    rt.number_blinking = outside and after <= s.planned_count
    rt.last_press_at = now
    return entries


# --- the status the sensor shows ----------------------------------------------------


@dataclass
class Status:
    state: str
    active: bool
    color_progress: float | None
    next_expected_at: datetime | None
    planned_count: int
    count_today: int
    count_exceeded: bool
    number_blinking: bool
    answer_required: bool
    open_slots: list[dict] = field(default_factory=list)


def _next_unresolved(s: Schedule, rt: ScheduleRuntime, after: datetime) -> datetime | None:
    for term in islice(occurrences_after(s, after), 100):
        rec = rt.occurrences.get(term.isoformat())
        if rec is None or rec["status"] != RESOLVED:
            return term
    return None


def compute_status(s: Schedule, rt: ScheduleRuntime, history: list[dict], now: datetime) -> Status:
    """Work out the sensor state and attributes. State priority, highest first:
    inactive > pending > blinking_brown > exceeded > red > transition > green."""
    planned = s.planned_count
    count = count_today(history, now)
    exceeded = count > planned
    act = activity(s, rt, now)

    open_slots = [
        {
            "scheduled_at": term.isoformat(),
            "overdue_minutes": max(0, int(_diff(now, term).total_seconds() // 60)),
            "missed": bool(rt.occurrences[term.isoformat()]["missed"]),
        }
        for term in _open_terms(rt)
    ]

    if act == STATE_INACTIVE:
        return Status(STATE_INACTIVE, False, None, None, planned, count, exceeded, False, False, open_slots)
    if act == STATE_PENDING:
        first = next(occurrences_after(s, s.start_at - _EPS), None)
        return Status(STATE_PENDING, False, None, first, planned, count, exceeded, False, False, open_slots)

    next_expected = _next_unresolved(s, rt, now)
    needs_answer = answer_required(s, rt, now)
    window = s.window
    opens = _open_terms(rt)

    progress: float | None = None
    if any(_diff(now, t) > window for t in opens):
        state = STATE_BLINKING_BROWN
    elif exceeded:
        state = STATE_EXCEEDED
    elif opens:
        state = STATE_RED
    else:
        baseline = max(rt.last_press_at, s.start_at) if rt.last_press_at else s.start_at
        if next_expected is None or _diff(next_expected, baseline) <= timedelta(0):
            progress = 0.0
        else:
            progress = _diff(now, baseline) / _diff(next_expected, baseline)
            progress = max(0.0, min(1.0, progress))
        state = STATE_GREEN if progress <= _GREEN_PROGRESS else STATE_TRANSITION

    return Status(
        state=state,
        active=True,
        color_progress=progress,
        next_expected_at=next_expected,
        planned_count=planned,
        count_today=count,
        count_exceeded=exceeded,
        number_blinking=rt.number_blinking and not exceeded,
        answer_required=needs_answer,
        open_slots=open_slots,
    )
