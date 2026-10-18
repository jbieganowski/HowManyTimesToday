"""Diagrams for the configuration guide (docs/CONFIGURATION.md): the Options Flow map
and how a schedule turns into terms. Same palette/helpers as make_diagrams.py.

    python tools/make_config_diagrams.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from svglib import AMBER, BLUE, FAINT, GREEN, INK, MUTED, PURPLE, RED, SAGE, TINT, WARNINGS, Svg  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "images"


def diagrams(lang: str):
    def L(en: str, pl: str) -> str:
        return en if lang == "en" else pl

    sfx = "" if lang == "en" else ".pl"
    result: dict[str, Svg] = {}

    def new(name, w, h, title, sub=""):
        s = Svg(f"{name}{sfx}", w, h, title, sub)
        result[f"diagram-{name}{sfx}.svg"] = s
        return s

    # ------------------------------------------------------------ options flow map
    s = new("options-flow", 1000, 610, L("The Configure dialog", "Okno Konfiguruj"),
            L("Settings → Devices & services → How Many Times Today → the gear icon",
              "Ustawienia → Urządzenia i usługi → How Many Times Today → ikona koła zębatego"))
    s.box(40, 290, 140, 70, L("Configure", "Konfiguruj"), [L("gear icon", "ikona koła")], PURPLE)
    rows = [(110, BLUE), (330, GREEN), (520, AMBER)]
    menus = [L("Add a new schedule", "Dodaj nowy harmonogram"), L("Edit, switch on/off or remove", "Edytuj, włącz/wyłącz lub usuń"), L("Global settings", "Ustawienia globalne")]
    for (y, col), menu in zip(rows, menus):
        s.arrow(180, 325, 220, y + 30, MUTED)
        s.box(220, y, 230, 60, menu, [], col, 12)
        s.arrow(450, y + 30, 480, y + 30, MUTED)
    # add
    s.box(480, 110, 190, 60, L("Name, description, mode", "Nazwa, opis, tryb"), [], BLUE, 12)
    s.arrow(670, 140, 700, 100, MUTED)
    s.arrow(670, 140, 700, 165, MUTED)
    s.box(700, 78, 260, 44, L("Fixed times: how many a day, each time", "Stałe godziny: ile razy, każda godzina"), [], SAGE, 11)
    s.box(700, 143, 260, 44, L("Every X hours: the interval", "Co X godzin: interwał"), [], SAGE, 11)
    s.arrow(830, 122, 830, 143, MUTED, dash="2 4")
    s.arrow(830, 187, 830, 215, MUTED)
    s.box(700, 215, 260, 60, L("Start, optional end, tolerance", "Start, opcjonalny koniec, tolerancja"), [L("saved", "zapisane")], GREEN, 11, 12)
    # manage
    s.box(480, 330, 190, 60, L("Pick a schedule + action", "Wybierz harmonogram + akcję"), [], GREEN, 11)
    s.arrow(670, 360, 700, 322, MUTED)
    s.arrow(670, 360, 700, 372, MUTED)
    s.arrow(670, 360, 700, 422, MUTED)
    s.box(700, 300, 260, 44, L("Edit: the same steps as adding", "Edytuj: te same kroki co przy dodawaniu"), [], SAGE, 11)
    s.box(700, 352, 260, 44, L("Switch on / off", "Włącz / wyłącz"), [], SAGE, 11)
    s.box(700, 404, 260, 44, L("Remove (its entity too)", "Usuń (razem z encją)"), [], RED, 11)
    # global
    s.box(480, 520, 190, 60, L("Sound + push service", "Dźwięk + usługa push"), [], AMBER, 12)
    s.arrow(670, 550, 700, 550, MUTED)
    s.box(700, 525, 260, 50, L("Saved: applies to every schedule", "Zapisane: dotyczy wszystkich"), [], SAGE, 11)
    s.text(40, 600, L("Every step saves immediately and takes effect without restarting Home Assistant.",
                      "Każdy krok zapisuje się od razu i działa bez restartu Home Assistanta."), 13, 600, INK, check_w=920)

    # ------------------------------------------------------------ schedule -> terms
    s = new("terms-generation", 1000, 520, L("How a schedule becomes terms", "Jak harmonogram daje terminy"),
            L("planned per day: the number of times, or 24 ÷ interval rounded up", "planowane na dobę: liczba godzin albo 24 ÷ interwał w górę"))
    x = lambda h: 300 + h * 27  # noqa: E731
    for h in range(0, 25, 3):
        s.line(x(h), 112, x(h), 408, "#e4dfd2", 1)
        s.text(x(h), 104, f"{h:02d}:00", 12, 400, FAINT, "middle")
    examples = [
        (L("Fixed times", "Stałe godziny"), L("07:00, 16:00 → 2 a day", "07:00, 16:00 → 2 dziennie"), [7, 16], PURPLE),
        (L("Fixed times", "Stałe godziny"), L("08:00, 14:00, 20:00 → 3 a day", "08:00, 14:00, 20:00 → 3 dziennie"), [8, 14, 20], SAGE),
        (L("Every 12 h", "Co 12 godzin"), L("from 09:30 → 2 a day", "od 09:30 → 2 dziennie"), [9.5, 21.5], BLUE),
        (L("Every 8 h", "Co 8 godzin"), L("from 06:00 → 3 a day", "od 06:00 → 3 dziennie"), [6, 14, 22], GREEN),
        (L("Every 5 h", "Co 5 godzin"), L("from 08:00 → 5 a day (24 ÷ 5 rounded up)", "od 08:00 → 5 dziennie (24 ÷ 5 w górę)"), [8, 13, 18, 23], AMBER),
    ]
    for i, (name, sub, hours, col) in enumerate(examples):
        y = 150 + i * 58
        s.text(40, y + 2, name, 15, 700, col, check_w=240)
        s.text(40, y + 22, sub, 12, 400, MUTED, check_w=255)
        s.line(x(0), y, x(24), y, "#d9d5c8", 3)
        for h in hours:
            s.rect(x(h - 0.5), y - 9, x(h + 0.5) - x(h - 0.5), 18, TINT[col], col, 1, 6)
            s.circle(x(h), y, 8, col)
            hh, mm = int(h), int(round((h - int(h)) * 60))
            s.text(x(h), y - 15, f"{hh:02d}:{mm:02d}", 11, 700, col, "middle")
    s.text(40, 462, L("The band around each dot is the tolerance window (default 30 minutes before and after).",
                      "Pasek wokół kropki to okno tolerancji (domyślnie 30 minut przed i po)."), 13, 400, MUTED, check_w=920)
    s.text(40, 484, L("Interval mode: the first term is exactly the start; each next one is one interval later, across midnight.",
                      "Tryb interwałowy: pierwszy termin to dokładnie start; każdy kolejny jest o jeden interwał później, także po północy."), 13, 600, INK, check_w=920)
    return result


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    count = 0
    for lang in ("en", "pl"):
        for fname, svg in diagrams(lang).items():
            (OUT / fname).write_text(svg.render(), encoding="utf-8", newline="\n")
            count += 1
    print(f"wrote {count} SVG files to {OUT}")
    for w in WARNINGS:
        print("WARNING:", w)


if __name__ == "__main__":
    main()
