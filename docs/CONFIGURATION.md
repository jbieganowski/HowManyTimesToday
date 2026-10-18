# Configuration guide — How Many Times Today

([Polish version](CONFIGURATION.pl.md))

Everything is set up from the Home Assistant UI — no YAML is needed to create
schedules. This guide covers adding the integration, defining schedules, the global
settings, the entities and services the integration creates, notifications, and how to
put a schedule on a dashboard.

> The screenshots come from a real Home Assistant instance whose interface is set to
> Polish. The English labels are given in the text and tables.

## 1. Install and add the integration

1. Copy the `custom_components/how_many_times_today` folder into the
   `custom_components` folder of your Home Assistant configuration and restart Home
   Assistant.
2. Go to **Settings → Devices & services → Add integration**, search for
   **How Many Times Today** and confirm the dialog.

The integration is a **singleton**: there is exactly one entry and all schedules live
inside it. Adding it a second time shows "Already configured".

The card (`custom:how-many-times-today-card`) ships inside the integration and
registers itself, so no dashboard resource has to be added by hand.

> **Time zone.** Schedules follow the time zone configured in Home Assistant
> (**Settings → System → General**). "09:00" means 09:00 in that zone, and start/end
> dates are read in it too.

## 2. The Configure dialog

Open **Settings → Devices & services → How Many Times Today** and click the **gear
icon** on the integration entry.

![The integration page with the gear icon](images/config-integration-page.jpg)

![The Configure dialog menu](images/config-options-menu.jpg)

| Menu item | What it does |
| --- | --- |
| **Add a new schedule** | Creates a schedule (medication, feeding, water, …) |
| **Edit, switch on/off or remove a schedule** | Changes a schedule, switches it off or on by hand, or deletes it |
| **Global settings (sound, push notification)** | Settings shared by all schedules |
| **How to read the card?** | A help page: what every colour and sentence on the button means |

![Map of the Configure dialog](images/diagram-options-flow.svg)

Every step saves immediately and takes effect without restarting Home Assistant.

## 3. Adding a schedule

Choose **Add a new schedule**. You can create as many schedules as you need.

![Name, description and mode](images/config-schedule-basics.jpg)

| Field | Meaning |
| --- | --- |
| **Name** | Free text, e.g. *Heart medication*. It is the entity's name |
| **Description** | Shown under the button, in the notification and above the history. Optional |
| **Schedule mode** | **Fixed times of day** or **Every X hours** |

### Fixed times of day

First a counter asks **how many times a day** (1–24, with up and down arrows); then one
time field appears for each execution.

![How many times a day](images/config-schedule-count.jpg)

![A time for each execution](images/config-schedule-times.jpg)

The times need not be evenly spaced (for example 07:00 and 16:00). The number of times
is the **planned count** per day.

### Every X hours

No list of times: only the interval.

![The interval](images/config-schedule-interval.jpg)

| Field | Meaning | Range / default |
| --- | --- | --- |
| **Interval (hours)** | Time between two terms | 0.5 – 48 h in steps of 0.5; default 12 |

The **first term is exactly the start** you set in the next step; every following term
comes one interval after the previous one, across midnight. The planned count per day
is `24 ÷ interval`, rounded up (12 h → 2, 8 h → 3, 5 h → 5).

![How a schedule becomes terms](images/diagram-terms-generation.svg)

### Start, end and tolerance

![Start, end and tolerance](images/config-schedule-range.jpg)

| Field | Meaning | Default |
| --- | --- | --- |
| **Start (date and time)** | When the schedule begins; before it the button shows `pending` | the moment the form was opened |
| **End (date and time, optional)** | When it stops; afterwards the schedule is `inactive`. Must be later than the start | none |
| **Tolerance window (minutes before and after)** | A press this close to a term counts as on schedule | 30 (1 – 240) |

If you create a schedule a few minutes after its start, the first term is shown as due
right away; terms older than the tolerance window are not backfilled.

## 4. How a press is judged

A **term** is a moment a schedule is due. Each term has a tolerance window (default
30 minutes before and after).

![Pressing inside or outside the window](images/diagram-window-answers.svg)

- **Inside the window** — the press is on schedule: the term is closed and a normal
  history entry is written. Pressing a little *before* the term (inside the window)
  closes it in advance, so the button never turns red for it.
- **Outside the window, a term is open** — Home Assistant asks which of three things
  happened, about the **oldest open term**. The card shows the question; automations
  pass the answer in the `answer` field.
- **Outside the window, nothing open** — it is an extra execution, logged as
  **OUTSIDE THE SCHEDULE**; the number on the button blinks.

| Answer | Meaning | Today's count | History |
| --- | --- | --- | --- |
| `already_done` (A) | It was done at that time, it just was not recorded | +1 | registered late |
| `do_now` (B) | It was not done then — doing it now | +1 | outside the schedule |
| `extra` (C) | It was done then, and this is an additional one | +2 | registered late + outside the schedule |

![The A/B/C question on the card](images/screenshot-card-question.jpg)

Several open terms are closed one per press, oldest first. A second press inside the
window of an already closed term is an extra execution.

## 5. Editing, switching on/off and removing

Choose **Edit, switch on/off or remove a schedule**, pick the schedule and the action.

![Selecting a schedule and an action](images/config-manage-schedules.jpg)

- **Edit this schedule** opens the same steps as when adding. Progress and history are
  kept; a mode change is allowed.
- **Switch on / off** toggles the schedule by hand. A switched-off schedule shows a grey
  `inactive` button, sends no alerts and logs no missed terms; the time spent off is not
  backfilled when it is switched on again. The history stays available.
- **Remove this schedule and its entity** deletes it with its history.

If there is no schedule yet, the menu item shows "No schedules defined yet".

## 6. Global settings

Choose **Global settings (sound, push notification)**.

![Global settings](images/config-global-settings.jpg)

| Field | Meaning |
| --- | --- |
| **Notification sound** | One sound for the whole plugin: `chime`, `bell`, `alert`, `gentle` or `none` (default `chime`). It plays in the browser showing the card when a schedule turns `red`, and again when it turns `blinking_brown` |
| **Push notification service** | Optional, e.g. `notify.mobile_app_phone`. The dropdown lists the mobile-app notifiers; any notify service can be typed. Empty means no push |

### How to read the card

The fourth menu item, **How to read the card?**, is a help page. It explains in plain
words what every colour and every sentence under the name means, what the big number is,
and what to do when the button blinks. Its wording is exactly what the card shows, in the
language of the logged-in user. Confirming it returns to the menu; nothing is changed.

![The help page](images/config-legend.jpg)

## 7. What the integration creates

One **sensor per schedule**, named after the schedule (for example
`sensor.heart_medication`). Its state is the look of the button:

| State | Meaning |
| --- | --- |
| `pending` | Before the start date and time |
| `green` | Just confirmed (or nothing due yet) |
| `transition` | The colour fades from green to red towards the next term |
| `red` | A term is due and inside its window |
| `blinking_brown` | A term outlived its window and is still open; it keeps blinking |
| `exceeded` | More executions today than planned (red button, black number) |
| `inactive` | Switched off by hand, or past the end |

When several apply, the first match in this order wins: `inactive`, `pending`,
`blinking_brown`, `exceeded`, `red`, `transition`, `green`.

![Which state wins](images/diagram-stage-states.svg)

The card never relies on colour alone: under the name it shows a short, plain sentence
for the state.

| State | Sentence on the card |
| --- | --- |
| `pending` | Not started yet |
| `green` | Done — all good |
| `transition` | Getting close |
| `red` | NOW — time to do it |
| `blinking_brown` | WARNING — overdue! |
| `exceeded` | Done too many times |
| `inactive` | Switched off |

Attributes:

| Attribute | Meaning |
| --- | --- |
| `schedule_id`, `name`, `description` | Identity and the description |
| `mode`, `times` / `interval_hours` | Fixed times (`times`, list of `HH:MM`) or the interval |
| `start_at`, `end_at`, `window_minutes` | The range and the tolerance window |
| `active`, `manually_inactive` | Whether it takes presses; whether it was switched off by hand |
| `count_today`, `planned_count`, `count_exceeded` | The big number, the plan, and whether it is exceeded |
| `number_blinking` | The number blinks after an out-of-window execution within the plan; the next press stops it |
| `answer_required` | `true` when a press needs the A/B/C answer right now |
| `open_slots` | Unresolved terms, oldest first: `scheduled_at`, `overdue_minutes`, `missed` |
| `color_progress` | 0.0 – 1.0 progress of the fade; `null` outside `green` and `transition` |
| `last_pressed_at`, `next_expected_at`, `seconds_to_next_expected` | The last press and the next term |
| `history` | The newest 50 entries (see below) |
| `sound` | The global sound |

History entries are an event type plus data — never ready-made text — so the card shows
them in the viewer's language: `timestamp`, `kind` (`on_schedule`, `registered_late`,
`outside`, `extra`, `missed`), `scheduled_at` (the closed term, or `null`),
`outside_schedule` (bool) and `count_delta` (what it added to the count).

Today's count is the sum of today's `count_delta` values, so it resets at midnight. The
state is stored separately from the history and survives Home Assistant restarts; a term
that came due while Home Assistant was down is still open afterwards.

## 8. A schedule on a dashboard

Add one card per schedule. In the UI use **Add card → How Many Times Today** — a visual
editor offers an entity picker limited to this integration's sensors. The card's editor only chooses **which schedule the card shows**; it also links to the
integration settings, where a schedule's name, description, times, start and end are
changed (section 5). Or in YAML:

```yaml
type: custom:how-many-times-today-card
entity: sensor.heart_medication
```

![The card editor: it chooses the schedule and links to the integration settings](images/screenshot-card-editor.jpg)

![Schedule cards on a dashboard: a red one, a switched-off one, and the in-app messages](images/screenshot-card-dashboard.jpg)

"Show history" expands the entries; those outside the schedule carry the bold prefix
and can be cleared entirely or by week:

![An expanded history](images/screenshot-card-history.jpg)

## 9. Services

All three are entity services: pick the schedule's sensor as the target.

| Service | Fields | Effect |
| --- | --- | --- |
| `how_many_times_today.press_schedule` | `answer` (optional) | Confirms the schedule, like pressing its button |
| `how_many_times_today.clear_history` | `weeks` (optional) | Clears the press history |
| `how_many_times_today.set_schedule_active` | `active` (required) | Switches the schedule on or off |

```yaml
action: how_many_times_today.press_schedule
target:
  entity_id: sensor.heart_medication
data:
  answer: do_now
```

`press_schedule` without an `answer` when one is needed fails with a validation error
whose translation key is `answer_required` (`schedule_not_active` for a pending or
inactive schedule). `clear_history` without `weeks` clears everything; with `weeks`
(ISO weeks such as `2026-W41`) only those weeks:

```yaml
action: how_many_times_today.clear_history
target:
  entity_id: all
data:
  weeks:
    - 2026-W41
```

## 10. Notifications

![What happens when a term comes due](images/diagram-notifications.svg)

At the moment a term comes due the sensor turns `red`, once, on the exact second, and:

- the card shows an **in-app message** with the description (only while a Home Assistant
  panel is open) and plays the sound. It reacts to the sensor turning `red`, which every
  Home Assistant user receives; subscribing to a custom event over the WebSocket needs an
  administrator, which is why the card does not rely on the event;
- the event **`how_many_times_today_due`** is fired for automations, with
  `entity_id`, `name`, `description` and `scheduled_at`;
- if a **push notification service** is set, a push with the description goes through the
  Home Assistant Companion app, which works with the app closed.

Nothing repeats at `blinking_brown` or when a term is logged as missed.

## 11. Automation examples

Notify when a term comes due, using the event:

```yaml
alias: Schedule due
triggers:
  - trigger: event
    event_type: how_many_times_today_due
actions:
  - action: notify.notify
    data:
      title: "{{ trigger.event.data.name }}"
      message: "{{ trigger.event.data.description }}"
```

Confirm a schedule from a physical button:

```yaml
alias: Confirm heart medication
triggers:
  - trigger: state
    entity_id: binary_sensor.pill_box_opened
    to: "on"
actions:
  - condition: state
    entity_id: sensor.heart_medication
    attribute: answer_required
    state: false
  - action: how_many_times_today.press_schedule
    target:
      entity_id: sensor.heart_medication
```

## 12. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| The card shows "Configuration error" | The card's JavaScript is not loaded — typically a cached copy. Reload the page; if it persists, unregister the service worker and clear the browser cache (see [TESTING.md](TESTING.md)) |
| "Already configured" when adding the integration | It is a singleton — use the gear icon on the existing entry |
| "No schedules defined yet" in the edit menu | Add a schedule first |
| A schedule is `blinking_brown` right after a restart | Intended: the stored state is restored, so a term missed during the downtime stays visible |
| The button is grey and says `pending` / `inactive` | Before the start, past the end, or switched off by hand; presses are refused |
| Times look two hours off | Schedules use the time zone configured in Home Assistant, not the browser's |

How the pieces fit together: [SPECIFICATION.md](SPECIFICATION.md).
