# Local test environment

A persistent Home Assistant instance for manually testing this integration
end-to-end, running in Docker.

## Setup

- Container: `hmtt-test-ha` (image `ghcr.io/home-assistant/home-assistant:stable`)
- Port: `8123` (http://localhost:8123)
- Persistent config volume: `.ha-test-config/` (gitignored — contains the real
  auth database, do not commit it)
- The integration code is bind-mounted live from
  `custom_components/how_many_times_today/` into the container's
  `/config/custom_components/how_many_times_today/` — editing files on disk
  changes what the container sees immediately.
- Onboarded non-interactively via the REST onboarding API: Polish language,
  dark mode enabled, PL core config. Admin credentials are in
  `.ha-test-config/CREDENTIALS.local.txt` (gitignored, local only).

**Do not remove this container or its config volume** — it's meant to be
reused across sessions, not recreated each time.

## Restarting after a code change

Home Assistant's "reload" action (`/api/config/config_entries/entry/{id}/reload`,
or Settings → Devices & Services → reload) re-runs `async_setup_entry` on the
**already-imported** Python module — it does **not** re-read `.py` files from
disk. Editing `custom_components/how_many_times_today/*.py` requires a full
container restart to actually take effect:

```sh
docker restart hmtt-test-ha
```

(Caught this the hard way: a fix looked like it didn't work because "reload"
silently kept running the old bytecode with mismatched line numbers in the
traceback — always suspect this first if a just-applied fix doesn't change
the error.)

## Driving it without a browser

No browser automation is available in this environment, so onboarding and the
Config/Options Flow were exercised directly via the REST API (`/api/onboarding/*`,
`/api/config/config_entries/flow`, `/api/config/config_entries/options/flow`),
and dark mode via the WebSocket API (`frontend/set_user_data`). See the session
history for example `curl`/Python snippets, or just use the real UI at
http://localhost:8123 once logged in.

## Known-good manual test sequence

1. Add a task in `fixed_times` mode with 3 times → 3 independent slots appear
   immediately (button + sensor), no restart needed
2. Add a task in `interval` mode → slots computed from `interval_hours` /
   `reference_time` (note: HA's time selector returns `HH:MM:SS`, not `HH:MM`)
3. Press a slot's button → `last_pressed_at`/`next_expected_at` update,
   `press_count` increments, history entry recorded
4. `clear_history` service → history empties, `press_count` resets to 0
5. Edit global settings (sound/blink threshold) → reflected immediately in
   sensor attributes
6. Remove a task via `manage_tasks` → its entities disappear immediately, no
   restart needed
7. Card JS is served at `/how_many_times_today_files/how-many-times-today-card.js`
   (auto-registered by the integration, no manual Lovelace resource needed)

All of the above were verified working as of 2026-10-13 (see CHANGELOG for the
two bugs this testing round found and fixed: a `HH:MM:SS` parsing crash, and
a missing `@callback` on the dynamic add/remove dispatcher handlers that made
Home Assistant run them on a worker thread instead of the event loop).
