<p align="center">
  <img src="docs/images/banner.svg" alt="How Many Times Today" width="100%">
</p>

<p align="center">
  <a href="README.md"><b>English</b></a> ·
  <a href="README.pl.md">Polski</a>
</p>

# How Many Times Today

A Home Assistant custom integration + Lovelace card for tracking things that
need to happen a certain number of times per day (medication, pet feeding,
drinking water, anything recurring).

## Status

Design/early implementation phase — repository scaffold and backend engine in
place, Lovelace card not built yet.

## Concept

Each defined task (e.g. "pill, twice a day at 9:00 and 22:00") expands into
independent **slots** — one button per expected occurrence per day.

The button's color fades over time (green → red → brown) as the expected time
approaches and passes, and starts blinking in extreme cases (forgotten /
significantly overdue). Pressing it resets the slot and logs an entry in its
history.

Full functional specification: [docs/SPECIFICATION.md](docs/SPECIFICATION.md)
([Polish version](docs/SPECYFIKACJA.md))

## Documentation & issue tracking

- Confluence: `HMTT` space on jacekbieganowski.atlassian.net
- Jira: `HMTT` project

## Installation

Eventually via [HACS](https://hacs.xyz/) as a custom repository (not ready for
use yet).

## License

MIT — see [LICENSE](LICENSE).
