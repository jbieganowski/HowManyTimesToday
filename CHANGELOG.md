# Changelog

([Polish version](CHANGELOG.pl.md))

## [Unreleased]

- Repository scaffold, functional specification, MIT license
- Integration engine (`custom_components/how_many_times_today/`):
  - scheduling model (fixed times / interval, compress/reset late-press policy)
  - persistent press history (per slot, full or ISO-week-selective clearing)
  - coordinator computing the color stage (green → transition → red → overdue →
    blinking) and the countdown
  - Config Flow + Options Flow (add/edit/remove tasks, global settings: sound,
    blink threshold, "sync with Buy The Way" placeholder toggle)
  - `button` (confirm) and `sensor` (state + attributes for the card) entities
    per slot
  - `press_slot` and `clear_history` services
  - translations: en (source), pl
- Bilingual README/CHANGELOG/specification (English + Polish) and a generated
  SVG project banner
- `icon.png` / `logo.png` (+ @2x) at repo root for HACS/brands
- Lovelace card (`how-many-times-today-card.js`): color-fading confirm button,
  live countdown, press history with per-week clearing, synthesized alert
  sounds (no audio asset files needed) — bundled inside the integration
  package and auto-registered/injected by the backend, no manual Lovelace
  resource step
- Fixed project banner: split into separate EN/PL SVGs (the first version
  mixed both languages in one image and overflowed its right edge) + a
  generated icon/logo for HACS/brands
- Full language parity with Buy The Way's confirmed 7-language set: added
  `de`, `ru`, `uk`, `zh-Hans` backend translations (`en` already covers both
  English variants for Home Assistant's purposes) and localized the Lovelace
  card's own static strings in all of them, with an English fallback
- Added illustrative mockups of the card's color states and the Options Flow
  menu (EN + PL) to the README — generated from the actual color/layout values,
  clearly labeled as mockups rather than real screenshots (no browser
  automation available yet to capture a live HA UI)
- Set up a persistent local Docker test instance (`hmtt-test-ha`,
  `docs/TESTING.md`) and exercised the integration end-to-end through it for
  the first time — found and fixed two real bugs:
  - `_parse_hhmm` crashed on HA's `TimeSelector` output (`HH:MM:SS`), which
    broke every interval-mode task and any task edited through the UI's time
    picker
  - the dynamic add/remove dispatcher handlers in `button.py`/`sensor.py`
    weren't decorated with `@callback`, so Home Assistant ran them on a
    worker thread instead of the event loop — new/removed tasks silently
    failed to add or remove entities while HA was running (only a full
    restart from a previously-saved config worked)
- Still missing: unit tests, HACS/hassfest validation, a visual card/options
  editor, real screenshots (now that a live test instance exists, these are
  unblocked for a future pass)
