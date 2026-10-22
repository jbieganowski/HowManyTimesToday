# Changelog

([Polish version](CHANGELOG.pl.md))

## [2.3.0] - 2026-10-22

### Integration

- **Alert card for a screensaver** (`custom:how-many-times-today-alert-card`): shows what is
  due right now (one schedule: the schedule; several: the logo and "N events" in the correct
  plural form of the language) and hides itself when nothing is due. Meant for the cards of
  a screensaver such as WallPanel, under the calendar. A step-by-step guide is section 13 of
  the configuration guide.

## [2.2.0] - 2026-10-22

### Integration

- **Second confirmation for a far-ahead "done now".** When the coming term is further away
  than a quarter of the gap since the previous term, answering that it is the coming
  occurrence done now asks once more (it names the term's time and says the button will skip
  it), because skipping a dose that is still hours away should not happen by a slip. The
  sensor has the new attribute `early_far`.
- The card checks the page for leftover error cards also after 30 and 60 seconds.

## [2.1.0] - 2026-10-22

### Integration

- **A press between two terms always asks.** There is no "last tenth of the gap" any more:
  when nothing is open and the coming term's tolerance window has not begun, at any
  distance from the term, the card asks whether this is the **coming occurrence, only done
  now** (`done_early`: the coming term is closed and counts, the button goes on from green,
  it never turns red for that term and the next feeding shown is the one after it) or an
  **extra** one (`extra`: +1, outside the schedule, the term stays due, as before). The
  question names the coming term's time. When the coming term is already closed there is no
  question: the press is an extra. A press without the answer fails with
  `early_answer_required` (an answer that does not fit, such as `do_now`, does too), so an
  automation that presses a schedule between its terms must pass `answer: done_early` or
  `extra` (the example in the configuration guide shows how).

### Documentation

- Configuration guide, specification and the physical-button example (EN + PL) describe the
  new rule; 171 tests.

## [2.0.0] - 2026-10-22

The integration now has what the latest Android app has. A major version: the state
`blinking_brown` is renamed `blinking_black` (automations and templates that test for it
must be updated); everything stored by 1.x is read as it was.

### Integration

- The button that blinks when a term is overdue now blinks **black** (and light grey)
  instead of brown; the state of the sensor is `blinking_black`.
- **Early press**: a press shortly before the coming term (the last tenth of the gap since
  the previous term, before its tolerance window) asks whether the task was done ahead of
  time (`done_early`: closes the coming term on schedule) or is an extra one (`extra`). The
  sensor shows `early_by_seconds`; a press without the answer fails with
  `early_answer_required`.
- **Reminder sounds**: 18 sounds in six classes (gentle, medium, strong, very strong,
  melody, seasonal), each at four volume levels, served by the integration and played by the
  card. A default sound and volume in the global settings, and an own sound and volume per
  schedule (options flow, the card's edit dialog with a *Play* button, the `update_schedule`
  service fields `sound_id` and `volume_level`). `tools/make_sounds.py` regenerates them.
- **Text size** (85 – 175 %) and **high contrast** in the global settings, applied to every
  card and tile.
- **Colours as in the app**: green, then yellow (the sentence "the time is coming" appears
  at yellow), then red.
- **Help** on every card and tile (the **?** button): the version in the title bar, A- / A+,
  a contrast switch, a table of contents with groups, the sections, the author and the
  build date. The sensor has the new attributes `sound`, `volume`, `own_sound`, `own_volume`,
  `default_sound`, `default_volume`, `early_by_seconds`, `font_scale`, `high_contrast`,
  `version`, `author`, `build`.
- New logo (the hourglass of the app).

### Compatibility

- Options and schedules written by 1.x load unchanged: the old sound names are mapped
  (`chime`, `bell` to `dzwonek`, `alert` to `alarm`, `gentle` to `delikatny_dzwonek`, `none`
  to silence), schedules without a sound use the default.

### Documentation

- Configuration guide, specification, testing notes and diagrams (EN + PL) describe the
  early press, the sounds, the black blinking and the colour fade; 168 tests.

## [1.3.6] - 2026-10-20

### Integration

- The card reads the message of an error card from the field Home Assistant really uses, so
  the rebuild of its leftover error cards and the report of their text work.

## [1.3.5] - 2026-10-20

### Integration

- The page report of the card is split into short lines (one per error card), because the
  log keeps only the start of each report.

## [1.3.4] - 2026-10-20

### Integration

- The card reports to the log what the page shows after it started (the texts of any error
  cards and how many of its own cards are drawn), so a device that still shows an error can
  be traced to its exact message.

## [1.3.3] - 2026-10-20

### Integration

- **Error cards of this card are rebuilt by the card itself.** Some clients (the Home Assistant
  app on a phone) were seen to start the card correctly and still leave the "Custom element
  doesn't exist" cards built before it on the dashboard. Once the card is defined it now asks
  for those cards to be rebuilt and reports in the log how many were found and what is
  left.

## [1.3.2] - 2026-10-20

### Integration

- **The card's sentences match the Android app** in every language: "You are up to date",
  "All according to plan" (a fading button that is still far from the next term; "The time is
  coming" only from 55 % of the way), "NOW", the countdown "Next in ...", "Last / total". The
  help page of the Configure dialog quotes the same sentences.
- **A page that still holds an older copy of the card takes the newer one over**: the cards
  already shown redraw with the new look within a second (before, the first copy loaded won
  and the newer one was ignored).
- **The card file is always sent in full** (never "not modified"), and the card tells the
  Home Assistant log that it started or what stopped it, so a device that shows "Custom element
  doesn't exist" can be traced.

## [1.3.1] - 2026-10-20

### Integration

- Every request for the card file is logged (the client's name, whether it was a
  revalidation, and the result), so a device that shows "Custom element doesn't exist"
  can be traced to a card that was never requested or never arrived.

## [1.3.0] - 2026-10-20

### Integration

- **The tile shows what the Android app's card shows**, without the history: the circle with
  the number, name, description, the state sentence, the blinking-number note, the
  countdown ("in 10 h 46 m"), "Last: ... · total: n/m" and the pencil that opens the edit
  dialog. While a term is due (red) the next one is not announced, as in the app.

## [1.2.0] - 2026-10-20

### Integration

- **Edit a schedule from the tile.** A double tap or double click on a tile (or Alt+Enter)
  opens a dialog with the schedule's fields (name, description, switch on/off, times or
  interval, start, end, tolerance window) and the buttons **Save schedule changes**,
  **Reset to "all on time"** and **Close**. A single tap still presses, after a short
  wait (about a third of a second) so that a double tap does not press twice.
- **Reset to "all on time" in the card editor** as well, below the save button.

## [1.1.2] - 2026-10-19

### Integration

- **Fixed:** an app or browser that kept the card script cached under its address (the Home
  Assistant app on a phone kept showing "Custom element doesn't exist" after an update)
  now fetches it again: the card's address carries the integration version
  (`...card.js?v=1.1.2`), both as the extra module and as the dashboard resource, which is
  updated by itself on every new version.

## [1.1.1] - 2026-10-18

### Integration

- **Fixed:** on a busy dashboard the cards sometimes showed "Custom element doesn't exist"
  until the next reload. The card is now also registered as a dashboard resource (Settings →
  Dashboards → Resources, added on start, removed with the integration), the way other
  custom cards are loaded; the extra module route stays as well.

## [1.1.0] - 2026-10-18

### Integration

- **Tile look for the card.** `layout: tile` (or **Appearance** in the card editor) shows a
  schedule as a compact tile: the coloured circle with the number, the name and the state
  sentence. A tap presses the button; a long press (or a right click, or Shift+Enter)
  opens the history. The default stays the large card, so existing cards look the same.
- **Adding the integration needs no dialog:** choosing it in **Add integration** creates
  it at once; schedules are added afterwards with **Configure**.
- **Optional YAML line:** a bare `how_many_times_today:` in `configuration.yaml` adds the
  integration by itself on the next start (once; the line can stay or be removed).
- The card elements are registered only once, even if the script is loaded twice.

## [1.0.1] - 2026-10-18

### Integration

- **Fixed:** on a fresh install the sensors got an entity id prefixed with the device name
  (`sensor.how_many_times_today_heart_medication`); they are `sensor.heart_medication` again.
- **Fixed:** deleting the integration now also deletes its stored state and press history
  instead of leaving files in `.storage`.

## [1.0.0] - 2026-10-18

### Integration

- **Schedules instead of slots.** Any number of schedules; each has one button, one
  sensor and a counter of today's executions.
  - Modes: fixed times (1–24 a day) or every X hours (the first term is exactly the start).
  - Start and optional end (date and time), switching off by hand; tolerance window
    (default 30 minutes before and after a term, per schedule); an optional description.
  - Colour cycle: green → fade to red → red at the term → blinking brown after the window;
    a term nobody closed is logged MISSED after ¾ of the gap to the next one.
  - Pressing outside the window while a term is open asks the A/B/C question
    (`already_done`, `do_now`, `extra`); presses with no open term are logged "outside the
    schedule" and the number blinks; more executions than planned turn the button red with
    a black number.
  - The sensor state is the single source of truth for the look (`pending`, `green`,
    `transition`, `red`, `blinking_brown`, `exceeded`, `inactive`).
- **Notifications:** at the exact second a term comes due the event
  `how_many_times_today_due` is fired (after the entity took its new state), the card shows
  an in-app message, and an optional push goes through the mobile app.
- **Entity services** `press_schedule`, `clear_history`, `set_schedule_active`, `reset_schedule` and `update_schedule` (changes a schedule's name, description, times or interval, start, end and tolerance window; the progress is kept); a press that
  needs an answer fails with a validation error whose translation key is `answer_required`.
- **Version and author** (SemVer, shown on the device page, in the add dialog and at the top of the Configure menu).
- **Reset to "all on time"** in the Configure dialog (and the `reset_schedule` service): the chosen schedules get today's counter and history as if every term already due had been done on time.
- **Edit a schedule in the card editor:** name, description, times or interval, start, end and tolerance window.
- **State survives restarts**; today's counter is derived from the history and resets at
  midnight. Terms and dates follow the Home Assistant time zone.
- **Migration** from the previous task/slot model (config entry version 1 → 2): tasks become
  schedules with their ids, press history and last presses are kept, old entities removed.
- A help page in the Configure menu, **How to read the card?**: what every colour and sentence
  on the button means, in plain words and in the viewer's language (it quotes the card exactly).
- Config Flow and Options Flow with real UI steps (a counter for the number of times, one
  time field per execution), time inputs validated; seven languages (en, pl, de, ru, uk,
  zh-Hans), shown in the language of the logged-in Home Assistant user.

### Lovelace card

- A plain sentence for every state under the name (so the card never relies on colour alone),
  and a note when the number blinks.
- One button per schedule with a big number, the description under it and the history with
  the bold "OUTSIDE THE SCHEDULE" prefix; the A/B/C question dialog; in-app message and
  sound; a visual editor with an entity picker limited to this integration's sensors.
  Bundled inside the integration and registered automatically; it is served with an ETag and
  `no-cache`, so a changed card is picked up on the next page load without restarting Home
  Assistant.

### Quality and documentation

- 118 unit tests (engine, coordinator and stores, input and translations) running without a
  Home Assistant installation, in CI together with hassfest / HACS validation.
- Bilingual (English + Polish) README, specification, configuration guide with real
  screenshots of the UI, testing notes, and generated diagrams (SVG, with PNG copies).
