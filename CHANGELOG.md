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
- Still missing: Lovelace card (frontend), remaining languages matched to Buy
  The Way, unit tests, HACS/hassfest validation
