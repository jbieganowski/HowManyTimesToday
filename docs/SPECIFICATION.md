# Functional specification — How Many Times Today

([Polish version](SPECYFIKACJA.md))

Status: agreed in conversation on 2026-10-12, implementation in progress (see
[CHANGELOG](../CHANGELOG.md)).

## Architecture

- **Custom Integration** (`custom_components/how_many_times_today/`) —
  backend: schedules, counters, history, HA entities. Configured entirely
  through Config Flow (UI wizard, no YAML editing).
- **Custom Lovelace Card** (`custom_components/how_many_times_today/www/`) —
  frontend: button with a color gradient, blinking, countdown. Bundled inside
  the integration package (not a repo-root `www/`) so HACS's "integration"
  category actually deploys it; the integration registers and auto-injects it
  itself, no manual Lovelace resource needed.
- Installation eventually via **HACS** (one click, no manual scripts).

## Data model — task and slots

Each defined task (e.g. "Heart medication", "Cat food") has:

- A name / measurement type (free text)
- A schedule — one of two modes:
  - **Fixed times** (e.g. 9:00 and 22:00), fully editable, not required to be
    evenly spaced
  - **Interval** (e.g. every 12h since the last press)

**Every expected occurrence during the day is its own independent slot** —
own button, state, counter and history. A task with 3 occurrences per day
produces 3 slots.

## Handling late presses (interval mode)

If pressed later than expected (e.g. 12h interval, 1h delay):

- by default: the next countdown is shortened proportionally (11h instead of
  12h)
- alternatively: a full reset to 12h from the actual press time
- choice: a **one-time** change or a **permanent** schedule shift

## Button visual behavior

Sequence of states from the moment of confirmation:

1. Green (just confirmed)
2. Gradual transition toward red as the deadline approaches
3. Brown once the deadline has passed
4. Blinking once a **configurable threshold** is exceeded (extreme delay)

In addition:

- Notification sound — **one global** choice for the whole plugin (selectable
  in settings)
- Countdown to the next expected press, active immediately after a press
- After pressing: slot resets + a visible "last taken at [time]" message

## History

- Per-slot press log (what, when)
- Clearing: entirely, or selectively by week (choosing specific weeks, not
  just "last N weeks")

## Multilingual support

- Language set **matched exactly to Buy The Way** (confirmed from
  `Models/Jezyk.cs` in the Buy The Way repo, 2026-10-13): Polish, English (US),
  English (GB), German, Russian, Ukrainian, Simplified Chinese. Home Assistant
  does not distinguish English regional variants for component translations,
  so both English variants map to a single `en` translation file here.
- Missing language → falls back to English (Home Assistant's own translation
  fallback mechanism already does this for `strings.json`/`translations/*.json`;
  the Lovelace card implements the same fallback itself in JS, since it isn't
  covered by that mechanism)
- Covers both halves of the UI: the backend Config/Options Flow
  (`translations/{en,pl,de,ru,uk,zh-Hans}.json`) and the Lovelace card's own
  static strings (`CARD_STRINGS` in the card JS, keyed by `hass.language`)
- Standing cross-product rule: Buy The Way's and this plugin's supported
  languages must always stay in sync
- Note: Buy The Way's own internal fallback is Polish (its default language);
  this plugin's fallback is English instead, per explicit instruction — only
  the supported language *set* needs to match, not each product's fallback
  behavior

## Buy The Way integration (future)

- Currently: a grayed-out, inactive "Sync with Buy The Way" option in settings
  (placeholder for a future backend)
- Once implemented: must be possible to disable it in the menu (optional, not
  forced)

## Open items / to refine during implementation

- Exact threshold (default value and unit) that triggers blinking
- Config Flow UI details for defining slots with custom, non-evenly-spaced
  times (e.g. 9:00 and 22:00 instead of an even 12h split)
