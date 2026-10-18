# Changelog

([Polish version](CHANGELOG.pl.md))

## [Unreleased]

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
- **Entity services** `press_schedule`, `clear_history`, `set_schedule_active`; a press that
  needs an answer fails with a validation error whose translation key is `answer_required`.
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
