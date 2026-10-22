"""Generates the documentation diagrams as SVG (EN + PL) into docs/images/.

    python tools/make_diagrams.py

Re-run after changing a diagram; the SVGs are committed so the docs render on GitHub
without running anything. PNG copies (for Word, which does not render SVG reliably) are
made by tools/export_png.ps1. The configuration-guide diagrams are in
tools/make_config_diagrams.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from svglib import (  # noqa: E402
    AMBER, BLUE, BLACK, BORDER, FAINT, GREEN, INK, LINE, MUTED, PURPLE, RED, SAGE, TINT, WARNINGS, Svg,
)

OUT = Path(__file__).resolve().parents[1] / "docs" / "images"
TESTS = {"models": 88, "coordinator": 28, "validation": 46, "card": 6}
TESTS_TOTAL = sum(TESTS.values())


def diagrams(lang: str):
    def L(en: str, pl: str) -> str:
        return en if lang == "en" else pl

    sfx = "" if lang == "en" else ".pl"
    result: dict[str, Svg] = {}

    def new(name, w, h, title, sub=""):
        s = Svg(f"{name}{sfx}", w, h, title, sub)
        result[f"diagram-{name}{sfx}.svg"] = s
        return s

    def big_button(s, cx, cy, r, kind, number, number_color="#ffffff"):
        """The schedule button as the card draws it: a colour state and a big number."""
        gid = f"bb{lang}{cx}{cy}"
        if kind == "mid":
            s.add(f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GREEN}"/>'
                  f'<stop offset="1" stop-color="#b8631f"/></linearGradient></defs>')
            fill = f"url(#{gid})"
        else:
            fill = {"ok": GREEN, "red": RED, "black": BLACK, "grey": "#9a978c", "exceeded": RED}[kind]
        if kind == "black":
            s.circle(cx, cy, r + 8, "none", BLACK, 3, "7 6")
        s.circle(cx, cy, r, fill)
        s.text(cx, cy + r * 0.38, str(number), int(r * 1.1), 700, number_color, "middle")

    # 1 ---------------------------------------------------------------- architecture
    s = new("architecture", 1000, 560, L("Architecture", "Architektura"),
            L("one integration and one card; every schedule is one sensor", "jedna integracja i jedna karta; każdy harmonogram to jeden sensor"))
    s.box(40, 130, 200, 96, "Config / Options Flow",
          [L("UI wizard,", "kreator w UI,"), L("no YAML editing", "bez edycji YAML")], BLUE)
    s.box(40, 400, 200, 96, L("Due moment", "Moment terminu"),
          [L("event + optional push", "zdarzenie + opcjonalny push")], AMBER)
    s.rect(280, 120, 440, 400, "#ffffff", LINE, 2, 16, "8 6")
    s.text(500, 146, L("Integration how_many_times_today (Python)", "Integracja how_many_times_today (Python)"), 14, 700, MUTED, "middle", 420)
    s.box(310, 160, 380, 62, L("Entity services", "Usługi encji"),
          ["press_schedule, clear_history, set_schedule_active"], BLUE, 14, 12)
    s.box(310, 250, 380, 92, "Coordinator",
          [L("moves time forward, opens and closes terms,", "przesuwa czas, otwiera i zamyka terminy,"),
           L("timer at the exact moments + 30 s refresh", "timer na dokładne chwile + odświeżanie co 30 s")], GREEN)
    s.box(310, 385, 120, 110, "models.py", [L("pure engine", "czysty silnik"), L("(no HA)", "(bez HA)")], SAGE, 15, 12)
    s.box(440, 385, 120, 110, "ScheduleState", [L("last press,", "ostatnie naciśn.,"), L("open terms", "otwarte terminy")], AMBER, 13, 12)
    s.box(570, 385, 120, 110, "HistoryStore", [L("press log", "log naciśnięć")], AMBER, 14, 12)
    s.arrow(500, 222, 500, 250, MUTED)
    for x in (370, 500, 630):
        s.arrow(x, 342, x, 385, MUTED)
    s.arrow(240, 178, 310, 280, BLUE)
    s.arrow(310, 330, 240, 430, AMBER)
    s.rect(760, 120, 200, 130, "#ffffff", LINE, 2, 16, "8 6")
    s.text(860, 146, L("HA entity (per schedule)", "Encja HA (na harmonogram)"), 13, 700, MUTED, "middle", 185)
    s.box(780, 165, 160, 70, "sensor", [L("state + attributes", "stan + atrybuty")], GREEN, 15, 12)
    s.arrow(690, 290, 780, 205, GREEN)
    s.box(760, 390, 200, 110, L("Lovelace card", "Karta Lovelace"),
          [L("one button with a big number,", "jeden klawisz z dużą liczbą,"), L("auto-registered", "rejestrowana automatycznie")], PURPLE, 15, 12)
    s.arrow(860, 390, 860, 250, PURPLE, both=True)
    s.text(870, 330, L("reads state, presses", "czyta stan, naciska"), 12, 400, MUTED)

    # 2 ---------------------------------------------------------------- data model
    s = new("data-model", 1000, 480, L("Data model: a schedule and its terms", "Model danych: harmonogram i jego terminy"),
            L("one button and one sensor per schedule; the number counts today's executions", "jeden klawisz i jeden sensor na harmonogram; liczba zlicza dzisiejsze wykonania"))
    rows = [
        (L("Heart medication", "Lek na serce"), L("fixed times, 2 a day", "stałe godziny, 2 razy dziennie"), ["07:00", "16:00"], PURPLE, "0/2"),
        (L("Cat food", "Karma dla kota"), L("fixed times, 3 a day", "stałe godziny, 3 razy dziennie"), ["08:00", "14:00", "20:00"], SAGE, "1/3"),
        (L("Water", "Woda"), L("every 12 h from 09:00", "co 12 godzin od 09:00"), ["09:00", "21:00"], BLUE, "2/2"),
    ]
    for i, (name, mode, times, col, ratio) in enumerate(rows):
        y = 120 + i * 110
        s.box(40, y, 270, 80, name, [mode], col)
        s.arrow(310, y + 40, 370, y + 40, col)
        big_button(s, 420, y + 40, 32, "ok" if i else "mid", ratio.split("/")[0])
        s.text(420, y + 90, L(f"{ratio} today", f"{ratio} dziś"), 12, 600, MUTED, "middle")
        s.text(500, y + 22, L("terms of the day", "terminy w ciągu dnia"), 12, 400, MUTED)
        for j, t in enumerate(times):
            s.rect(500 + j * 110, y + 32, 96, 36, "#ffffff", col, 1.8, 18)
            s.text(548 + j * 110, y + 56, t, 15, 700, col, "middle")
    s.text(40, 458, L("Each term has a tolerance window (default 30 min before and after); a start and an optional end limit the schedule.",
                      "Każdy termin ma okno tolerancji (domyślnie 30 min przed i po); start i opcjonalny koniec ograniczają harmonogram."), 13, 600, INK, check_w=920)

    # 3 ---------------------------------------------------------------- colour over time
    s = new("color-timeline", 1000, 520, L("Button colour around a term T", "Kolor klawisza wokół terminu T"),
            L("the sensor state is the stage name", "stanem sensora jest nazwa etapu"))
    x0, x1, x2, x3, x4 = 70, 440, 620, 900, 930
    s.add(f'<defs><linearGradient id="gr{lang}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{GREEN}"/>'
          f'<stop offset="0.35" stop-color="{GREEN}"/><stop offset="0.55" stop-color="#ffc107"/><stop offset="1" stop-color="{RED}"/></linearGradient>'
          f'<pattern id="st{lang}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
          f'<rect width="14" height="14" fill="{BLACK}"/><rect width="7" height="14" fill="#e8e8e8"/></pattern></defs>')
    s.rect(x0, 270, 36, 34, GREEN, None, rx=0)
    s.rect(x0 + 36, 270, x1 - x0 - 36, 34, f"url(#gr{lang})", None, rx=0)
    s.rect(x1, 270, x2 - x1, 34, RED, None, rx=0)
    s.rect(x2, 270, x4 - x2, 34, f"url(#st{lang})", None, rx=0)
    big_button(s, x0 + 40, 190, 34, "ok", 1)
    big_button(s, (x0 + 36 + x1) // 2, 190, 34, "mid", 1)
    big_button(s, (x1 + x2) // 2, 190, 34, "red", 1)
    big_button(s, (x2 + x4) // 2 - 20, 190, 34, "black", 1)
    s.pill(x0 + 18, 334, "green", GREEN)
    s.pill((x0 + 36 + x1) // 2, 334, "transition", AMBER)
    s.pill((x1 + x2) // 2, 334, "red", RED)
    s.pill((x2 + x4) // 2, 334, "blinking_black", BLACK)
    s.text((x0 + 36 + x1) // 2, 366, L("green, then yellow, then red", "zielony, potem żółty, potem czerwony"), 12, 400, MUTED, "middle", 330)
    s.text((x1 + x2) // 2, 366, L("due, inside the window", "termin, w oknie"), 12, 400, MUTED, "middle", 170)
    s.text((x2 + x4) // 2, 366, L("unresolved, blinks", "nierozwiązany, miga"), 12, 400, MUTED, "middle", 200)
    ticks = [
        (x0, L("press: green, cycle restarts", "naciśnięcie: zielony, cykl od nowa"), "start", x0, 410),
        (x1, L("T: red, due alert", "T: czerwony, alert terminu"), "middle", x1, 440),
        (x2, L("T + window (30 min): blinks black", "T + okno (30 min): miga na czarno"), "middle", x2, 410),
        (x3, L("T + ¾ of the gap: logged as MISSED", "T + ¾ odstępu: wpis POMINIĘTE"), "middle", x3, 470),
    ]
    for x, lab, anc, ax, ty in ticks:
        s.line(x, 310, x, ty - 14, FAINT, 2, "4 4")
        s.text(ax, ty, lab, 13, 600, INK, anc, 340, halo=True)
    s.arrow(x0, 250, x4, 250, FAINT)
    s.text(x4, 242, L("time", "czas"), 13, 400, FAINT, "end")

    # 4 ---------------------------------------------------------------- state priority
    s = new("stage-states", 1000, 520, L("Which state wins", "Który stan wygrywa"),
            L("the first matching row, from the top", "pierwszy pasujący wiersz od góry"))
    ladder = [
        ("inactive", "grey", MUTED, L("switched off by hand, or past the end (card hidden)", "wyłączony ręcznie lub po końcu (karta ukryta)")),
        ("pending", "grey", BLUE, L("before the start date and time", "przed datą i godziną startu")),
        ("blinking_black", "black", BLACK, L("a term outlived its window and is still open", "termin przekroczył okno i wciąż jest otwarty")),
        ("exceeded", "exceeded", RED, L("more executions today than planned (red, black number)", "więcej wykonań dziś niż zaplanowano (czerwony, czarna liczba)")),
        ("red", "red", RED, L("a term is due and inside its window", "termin przypadł i trwa jego okno")),
        ("transition", "mid", AMBER, L("fading green, yellow, red towards the next term", "przejście zielony, żółty, czerwony do następnego terminu")),
        ("green", "ok", GREEN, L("just confirmed (or nothing due yet)", "świeżo potwierdzone (lub nic jeszcze nie przypadło)")),
    ]
    for i, (name, kind, col, desc) in enumerate(ladder):
        y = 112 + i * 56
        s.rect(40, y, 920, 48, TINT[col], col, 1.5, 12)
        s.text(62, y + 30, str(i + 1), 16, 700, MUTED)
        big_button(s, 120, y + 24, 17, kind, "3" if kind != "grey" else "–", "#000000" if kind == "exceeded" else "#ffffff")
        s.pill(260, y + 24, name, col, 14, 150)
        s.text(360, y + 29, desc, 14, 400, INK, check_w=580)
    s.text(40, 508, L("The counter and number_blinking are separate attributes; the number blinks after an out-of-window execution within the planned count.",
                      "Licznik i number_blinking to osobne atrybuty; liczba miga po wykonaniu poza oknem w granicach planowanej liczby."), 12, 400, MUTED, check_w=920)

    # 5 ---------------------------------------------------------------- window and answers
    s = new("window-answers", 1000, 560, L("Pressing: inside the window or not", "Naciśnięcie: w oknie lub poza nim"),
            L("example: a term at 07:00 with a 30-minute window", "przykład: termin o 07:00 z oknem 30 minut"))
    hx = lambda h: 100 + (h - 5.5) * 280  # noqa: E731  (05:30 .. 08:30)
    for h in (6, 7, 8):
        s.text(hx(h), 124, f"{h:02d}:00", 12, 400, FAINT, "middle")
    s.rect(hx(6.5), 140, hx(7.5) - hx(6.5), 44, TINT[GREEN], GREEN, 2, 8)
    s.text(hx(6.5), 206, L("window 06:30 – 07:30", "okno 06:30 – 07:30"), 14, 700, GREEN, "start", 190)
    s.line(hx(7), 134, hx(7), 192, RED, 3)
    s.text(hx(7), 210, "T = 07:00", 13, 700, RED, "middle")
    s.circle(hx(7), 162, 7, RED)
    cases = [
        (40, GREEN, L("Inside the window", "W oknie"), [L("on schedule: the term is closed,", "zgodnie z harmonogramem: termin zamknięty,"), L("a normal history entry", "zwykły wpis w historii")]),
        (350, AMBER, L("Outside, a term is open", "Poza oknem, termin otwarty"), [L("a question about the oldest open term", "pytanie o najstarszy otwarty termin"), L("(answer_required is true)", "(answer_required = true)")]),
        (660, RED, L("Outside, nothing open", "Poza oknem, nic otwartego"), [L("an extra execution: OUTSIDE THE", "dodatkowe wykonanie: POZA"), L("SCHEDULE, the number blinks", "HARMONOGRAMEM, liczba miga")]),
    ]
    for x, col, head, lines in cases:
        s.box(x, 250, 300, 92, head, lines, col, 15, 13)
    s.text(500, 372, L("The question, when it is asked:", "Pytanie, gdy się pojawia:"), 14, 700, INK, "middle")
    answers = [
        ("A", "already_done", L("It was done then, just not recorded", "Zrobione wtedy, tylko nie zapisane"), "+1", GREEN),
        ("B", "do_now", L("It was not done then — doing it now", "Nie zrobiono wtedy — robię teraz"), "+1", AMBER),
        ("C", "extra", L("Done then, and this is an additional one", "Zrobione wtedy, a to dodatkowe"), "+2", RED),
    ]
    for i, (letter, key, desc, delta, col) in enumerate(answers):
        y = 392 + i * 50
        s.rect(40, y, 920, 42, TINT[col], col, 1.5, 10)
        s.circle(70, y + 21, 14, col)
        s.text(70, y + 27, letter, 15, 700, "#ffffff", "middle")
        s.text(100, y + 27, key, 14, 700, col)
        s.text(240, y + 27, desc, 14, 400, INK, check_w=560)
        s.pill(910, y + 21, L(f"count {delta}", f"licznik {delta}"), col, 13, 90)
    s.text(40, 548, L("Several open terms are closed one per press, oldest first.", "Kilka otwartych terminów zamyka się po jednym na naciśnięcie, od najstarszego."), 13, 600, INK, check_w=920)

    # 6 ---------------------------------------------------------------- press sequence
    s = new("press-sequence", 1000, 640, L("What happens on a press", "Co dzieje się po naciśnięciu"),
            L("here: pressed outside the window while a term is open", "tu: naciśnięcie poza oknem przy otwartym terminie"))
    cols = [(110, L("Card (JS)", "Karta (JS)"), PURPLE), (320, "sensor", GREEN), (530, "Coordinator", GREEN), (730, "models.py", SAGE), (900, L("Stores", "Magazyny"), AMBER)]
    for x, name, col in cols:
        s.box(x - 70, 110, 140, 44, name, [], col, 15)
        s.line(x, 154, x, 610, LINE, 2, "5 5")
    cx = [c[0] for c in cols]
    msgs = [
        (0, 1, L("1  press_schedule (no answer)", "1  press_schedule (bez odpowiedzi)"), False, GREEN),
        (1, 2, "2  async_press(schedule_id)", False, GREEN),
        (2, 3, "3  press(...)", False, SAGE),
        (3, 2, "4  AnswerRequired", True, RED),
        (1, 0, L("5  error: answer_required", "5  błąd: answer_required"), True, RED),
        (0, 1, L("6  A/B/C dialog → press_schedule(answer)", "6  dialog A/B/C → press_schedule(answer)"), False, PURPLE),
        (2, 3, L("7  press(..., answer) → entries", "7  press(..., answer) → wpisy"), False, SAGE),
        (2, 4, L("8  save history + state", "8  zapis historii + stanu"), False, AMBER),
        (1, 0, L("9  state + attributes", "9  stan + atrybuty"), True, PURPLE),
    ]
    for i, (a, b, lab, dash, col) in enumerate(msgs):
        y = 196 + i * 48
        s.arrow(cx[a], y, cx[b], y, col, "6 4" if dash else None)
        s.text((cx[a] + cx[b]) / 2, y - 9, lab, 13, 600, col, "middle", abs(cx[b] - cx[a]) - 10, halo=True)
    s.text(40, 628, L("Inside the window there is no step 4-6: the press is simply recorded.", "W oknie nie ma kroków 4-6: naciśnięcie po prostu się zapisuje."), 13, 400, MUTED, check_w=920)

    # 7 ---------------------------------------------------------------- notifications
    s = new("notifications", 1000, 520, L("What happens when a term comes due", "Co się dzieje, gdy przypada termin"),
            L("at T the sensor turns red, once, on the exact second", "w T sensor robi się czerwony, raz, co do sekundy"))
    s.box(40, 190, 190, 90, L("Timer", "Timer"), [L("armed for the next", "uzbrojony na następną"), L("moment of change", "chwilę zmiany")], GREEN)
    s.box(300, 190, 190, 90, L("Term opens", "Termin się otwiera"), [L("sensor state: red", "stan sensora: red")], RED)
    s.arrow(230, 235, 300, 235, MUTED)
    outs = [
        (110, PURPLE, L("In-app message", "Komunikat w aplikacji"), L("card shows the description (panel open)", "karta pokazuje opis (panel otwarty)")),
        (235, BLUE, L("Event", "Zdarzenie"), "how_many_times_today_due"),
        (360, AMBER, L("Push (optional)", "Push (opcjonalnie)"), L("notify.mobile_app_* with the description", "notify.mobile_app_* z opisem")),
    ]
    for y, col, head, line in outs:
        s.arrow(490, 235, 570, y + 36, MUTED)
        s.box(570, y, 390, 74, head, [line], col, 15, 12)
    s.text(40, 490, L("The event payload: entity_id, name, description, scheduled_at. Nothing repeats at black or when a term is missed.",
                      "Payload zdarzenia: entity_id, name, description, scheduled_at. Nic się nie powtarza przy czarnym ani przy pominięciu."), 13, 400, MUTED, check_w=920)

    # 8 ---------------------------------------------------------------- lifecycle
    s = new("schedule-lifecycle", 1000, 430, L("A schedule's life", "Życie harmonogramu"),
            L("start and end bound it; it can also be switched off by hand", "start i koniec ją ograniczają; można ją też wyłączyć ręcznie"))
    s.rect(60, 150, 160, 40, "#e4e1d8", FAINT, 1.5, 8)
    s.text(140, 176, "pending", 14, 700, FAINT, "middle")
    s.rect(220, 150, 560, 40, TINT[GREEN], GREEN, 1.5, 8)
    s.text(500, 176, L("active — terms, presses, alerts", "aktywny — terminy, naciśnięcia, alerty"), 14, 700, GREEN, "middle", 520)
    s.rect(780, 150, 160, 40, "#e4e1d8", FAINT, 1.5, 8)
    s.text(860, 176, "inactive", 14, 700, FAINT, "middle")
    s.line(220, 130, 220, 210, INK, 2, "4 4")
    s.line(780, 130, 780, 210, INK, 2, "4 4")
    s.text(220, 122, L("start (date + time)", "start (data + godzina)"), 13, 700, INK, "middle", 180)
    s.text(780, 122, L("end (optional)", "koniec (opcjonalny)"), 13, 700, INK, "middle", 160)
    s.rect(400, 250, 200, 40, "#e4e1d8", FAINT, 1.5, 8)
    s.text(500, 276, "inactive", 14, 700, FAINT, "middle")
    s.arrow(500, 232, 500, 250, MUTED)
    s.text(510, 242, L("switched off by hand", "wyłączony ręcznie"), 12, 400, MUTED)
    s.text(40, 330, L("pending: a grey button; inactive: the card is hidden (grey while editing). No alerts, no MISSED entries, presses refused.",
                      "pending: szary klawisz; inactive: karta ukryta (szara podczas edycji). Bez alertów, bez wpisów POMINIĘTE, naciśnięcia odrzucane."), 13, 400, INK, check_w=920)
    s.text(40, 354, L("Switching back on does not backfill the time spent off. The history stays available.",
                      "Ponowne włączenie nie nadrabia czasu wyłączenia. Historia pozostaje dostępna."), 13, 400, MUTED, check_w=920)

    # 9 ---------------------------------------------------------------- restart persistence
    s = new("restart-persistence", 1000, 470, L("State across a Home Assistant restart", "Stan po restarcie Home Assistanta"),
            L("12 h interval, pressed at 08:00, HA restarted at 12:00, checked at 20:30", "interwał 12 h, naciśnięcie 08:00, restart HA o 12:00, sprawdzenie o 20:30"))
    hx = lambda h: 110 + (h - 8) * 58  # noqa: E731
    s.add(f'<defs><linearGradient id="rp{lang}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{GREEN}"/>'
          f'<stop offset="1" stop-color="{RED}"/></linearGradient></defs>')
    for h in range(8, 23, 2):
        s.line(hx(h), 130, hx(h), 392, "#e4dfd2", 1)
        s.text(hx(h), 122, f"{h:02d}:00", 12, 400, FAINT, "middle")
    s.text(40, 158, L("Without stored state", "Bez zapisanego stanu"), 15, 700, RED, check_w=330)
    s.rect(hx(8), 172, hx(12) - hx(8), 30, f"url(#rp{lang})", None, rx=4)
    s.rect(hx(12), 172, hx(22) - hx(12), 30, GREEN, None, rx=4)
    s.text(hx(17), 222, L("a restart would wipe the cycle: plain green until pressed again", "restart zerowałby cykl: zielony aż do kolejnego naciśnięcia"), 13, 600, RED, "middle", 560)
    s.text(hx(22), 142, L("20:30 would show 'green' —", "o 20:30 byłoby 'green' —"), 12, 700, RED, "end")
    s.text(hx(22), 158, L("a missed dose looks on time", "pominięta dawka wygląda na w terminie"), 12, 400, RED, "end", 260)
    s.text(40, 290, L("With stored state (how it works)", "Z zapisanym stanem (jak działa)"), 15, 700, GREEN, check_w=330)
    s.rect(hx(8), 304, hx(20) - hx(8), 30, f"url(#rp{lang})", None, rx=4)
    s.rect(hx(20), 304, hx(22) - hx(20), 30, BLACK, None, rx=4)
    s.text(hx(14), 354, L("one continuous cycle, the restart changes nothing", "jeden ciągły cykl, restart niczego nie zmienia"), 13, 600, GREEN, "middle", 520)
    s.text(hx(22), 292, L("20:30 shows 'blinking_black'", "o 20:30 'blinking_black'"), 12, 700, BLACK, "end")
    for y0, y1 in ((165, 210), (297, 342)):
        s.line(hx(12), y0, hx(12), y1, INK, 2, "3 3")
    s.text(hx(12), 398, L("restart 12:00", "restart 12:00"), 12, 700, INK, "middle")
    s.text(hx(8), 398, L("press 08:00", "naciśnięcie 08:00"), 12, 700, INK, "middle")
    s.text(hx(20), 398, L("due 20:00", "termin 20:00"), 12, 700, INK, "middle")
    s.text(40, 438, L("A missed dose must not look 'on time' just because Home Assistant was restarted.",
                      "Pominięta dawka nie może wyglądać na 'w terminie' tylko dlatego, że Home Assistant był restartowany."), 14, 600, INK, check_w=920)

    # 10 --------------------------------------------------------------- storage
    s = new("storage", 1000, 430, L("Where data lives", "Gdzie leżą dane"), L("three places, each with its own job", "trzy miejsca, każde z własnym zadaniem"))
    s.box(40, 120, 290, 140, L("Config entry options", "Opcje wpisu konfiguracji"),
          [L("schedules: name, description,", "harmonogramy: nazwa, opis,"), L("mode, times / interval,", "tryb, godziny / interwał,"),
           L("start, end, window;", "start, koniec, okno;"), L("sound, push service", "dźwięk, usługa push")], BLUE)
    s.box(355, 120, 290, 140, "…_schedule_state_<entry_id>",
          [L("last press, processed up to,", "ostatnie naciśnięcie, przetw. do,"), L("open terms (and missed flag),", "otwarte terminy (i flaga pominięcia),"),
           "number_blinking,", "manually_inactive"], GREEN, 14)
    s.box(670, 120, 290, 140, "…_schedule_history_<entry_id>",
          ["{schedule_id: [entries]}", "timestamp, kind, scheduled_at,", "outside_schedule, count_delta"], AMBER, 14)
    s.text(185, 286, L("edited in the Options Flow", "edytowane w Options Flow"), 13, 600, BLUE, "middle", 280)
    s.text(500, 286, L("rewritten when a press, a term or a switch changes it", "nadpisywany po naciśnięciu, terminie lub przełączeniu"), 12, 600, GREEN, "middle", 290)
    s.text(815, 286, L("appended on every press and every MISSED", "dopisywane przy każdym naciśnięciu i POMINIĘTE"), 12, 600, AMBER, "middle", 290)
    s.text(40, 336, L("Today's counter is not stored: it is the sum of today's count_delta values, so it resets at midnight on its own.",
                      "Dzisiejszy licznik nie jest zapisywany: to suma count_delta z dzisiaj, więc sam się zeruje o północy."), 13, 400, MUTED, check_w=920)
    s.text(40, 358, L("History entries are an event type plus data, never ready-made text, so the card shows them in the viewer's language.",
                      "Wpisy historii to typ zdarzenia plus dane, nigdy gotowy tekst, więc karta pokazuje je w języku oglądającego."), 13, 400, MUTED, check_w=920)

    # 11 --------------------------------------------------------------- history clearing
    s = new("history-clearing", 1000, 400, L("Clearing history by week", "Czyszczenie historii po tygodniach"),
            L("the clear_history service with weeks: [\"2026-W02\"]", "usługa clear_history z weeks: [\"2026-W02\"]"))
    weeks = [("2026-W02", [1, 3, 4, 6], True), ("2026-W03", [0, 2, 3, 5, 6], False), ("2026-W04", [1, 2, 4], False)]
    for i, (w, days, gone) in enumerate(weeks):
        y = 130 + i * 76
        s.text(40, y + 28, w, 15, 700, RED if gone else INK)
        for d in range(7):
            x = 160 + d * 62
            s.rect(x, y, 52, 44, "#ffffff", BORDER, 1.5, 8)
            if d in days:
                s.circle(x + 26, y + 22, 11, "#e5b7b7" if gone else GREEN)
                if gone:
                    s.line(x + 15, y + 11, x + 37, y + 33, RED, 3)
        s.text(160 + 7 * 62 + 20, y + 28, L("removed", "usunięte") if gone else L("kept", "zachowane"), 14, 700, RED if gone else GREEN)
    for d, n in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] if lang == "en" else ["pon", "wt", "śr", "czw", "pt", "sob", "niedz"]):
        s.text(160 + d * 62 + 26, 122, n, 12, 400, FAINT, "middle")
    s.text(40, 372, L("The service targets a schedule's sensor (or all of them); without weeks the whole history is cleared.",
                      "Usługa dotyczy sensora harmonogramu (lub wszystkich); bez weeks czyszczona jest cała historia."), 13, 400, MUTED, check_w=920)

    # 12 --------------------------------------------------------------- card anatomy
    s = new("card-anatomy", 1000, 560, L("What the card shows, and where it comes from", "Co pokazuje karta i skąd to bierze"),
            L("everything comes from the attributes of the schedule's sensor", "wszystko pochodzi z atrybutów sensora harmonogramu"))
    s.rect(40, 110, 330, 400, "#ffffff", BORDER, 2, 20)
    s.text(205, 142, L("Heart medication", "Lek na serce"), 18, 700, INK, "middle", 300)
    big_button(s, 205, 232, 62, "red", 2)
    s.text(205, 336, L("Take the pill with water", "Tabletka z wodą"), 14, 400, MUTED, "middle", 300)
    s.text(205, 372, L("next at 16:00", "następny o 16:00"), 16, 700, INK, "middle")
    s.text(205, 424, L("▶ show history", "▶ pokaż historię"), 14, 600, BLUE, "middle")
    s.text(205, 456, L("OUTSIDE THE SCHEDULE - 12:00", "POZA HARMONOGRAMEM - 12:00"), 12, 700, INK, "middle", 300)
    items = [
        (232, 214, 270, L("colour of the button", "kolor klawisza"), "state, color_progress", RED),
        (232, 280, 270, L("big number", "duża liczba"), "count_today, planned_count, count_exceeded", AMBER),
        (232, 340, 270, L("number blinks", "liczba miga"), "number_blinking", PURPLE),
        (336, 400, 370, L("text under the button", "tekst pod klawiszem"), "description", BLUE),
        (372, 450, 370, L("countdown", "odliczanie"), "next_expected_at, seconds_to_next_expected", GREEN),
        (456, 500, 370, L("history (newest 50)", "historia (ostatnie 50)"), "history: kind, outside_schedule", MUTED),
    ]
    for y, ty, sx, what, attr, col in items:
        s.line(sx, y, 560, ty, col, 2, "5 4")
        s.circle(560, ty, 5, col)
        s.text(574, ty - 3, what, 14, 700, col if col != MUTED else INK, check_w=390)
        s.text(574, ty + 15, attr, 12, 400, MUTED, check_w=390)
    s.text(574, 140, L("The A/B/C question appears when answer_required is true;", "Pytanie A/B/C pojawia się, gdy answer_required = true;"), 12, 400, MUTED, check_w=400)
    s.text(574, 158, L("open_slots lists the unresolved terms.", "open_slots wymienia nierozwiązane terminy."), 12, 400, MUTED, check_w=400)
    s.text(574, 176, L("The sound (attribute sound) plays on entering red and black.", "Dźwięk (atrybut sound) gra przy wejściu w red i czerń."), 12, 400, MUTED, check_w=400)

    # 13 --------------------------------------------------------------- languages
    s = new("languages", 1000, 500, L("Languages", "Języki"), L("seven languages; anything else falls back to English", "siedem języków; reszta wraca do angielskiego"))
    chips = ["Polski (pl)", "English US", "English GB", "Deutsch (de)", "Русский (ru)", "Українська (uk)", "中文 (zh-Hans)"]
    files = {0: "pl.json", 1.5: "en.json", 3: "de.json", 4: "ru.json", 5: "uk.json", 6: "zh-Hans.json"}
    for i, c in enumerate(chips):
        y = 130 + i * 48
        s.rect(40, y - 16, 190, 34, TINT[BLUE], BLUE, 1.5, 17)
        s.text(135, y + 6, c, 14, 700, BLUE, "middle", 170)
    for i, f in files.items():
        y = 130 + i * 48
        s.rect(330, y - 16, 170, 34, TINT[AMBER], AMBER, 1.5, 8)
        s.text(415, y + 6, f, 14, 700, AMBER, "middle", 150)
    for i in range(7):
        y = 130 + i * 48
        fy = 130 + {0: 0, 1: 1.5, 2: 1.5, 3: 3, 4: 4, 5: 5, 6: 6}[i] * 48
        s.line(230, y, 330, fy, LINE, 2)
    s.line(520, 130, 520, 130 + 6 * 48, LINE, 2)
    for f in files:
        s.line(500, 130 + f * 48, 520, 130 + f * 48, LINE, 2)
    s.box(590, 120, 370, 110, L("Config / Options Flow, entities", "Config / Options Flow, encje"),
          ["translations/{en,pl,de,ru,uk,zh-Hans}.json", L("states, errors and services too", "także stany, błędy i usługi")], GREEN, 15, 12)
    s.box(590, 260, 370, 110, L("Lovelace card", "Karta Lovelace"),
          ["CARD_STRINGS in the card JS" if lang == "en" else "CARD_STRINGS w JS karty",
           L("language of the logged-in HA user", "język zalogowanego użytkownika HA")], PURPLE, 15, 12)
    s.arrow(520, 175, 590, 175, MUTED)
    s.arrow(520, 315, 590, 315, MUTED)
    s.text(40, 478, L("Both English variants map to a single en file; history entries are data, so they follow the viewer's language.",
                      "Oba warianty angielskiego trafiają do jednego pliku en; wpisy historii to dane, więc idą wg języka oglądającego."), 13, 400, MUTED, check_w=920)

    # 14 --------------------------------------------------------------- test architecture
    s = new("test-architecture", 1000, 540, L("How the unit tests run without Home Assistant", "Jak testy jednostkowe działają bez Home Assistanta"),
            L(f"{TESTS_TOTAL} tests; the code under test is unchanged", f"{TESTS_TOTAL} testów; testowany kod pozostaje bez zmian"))
    s.box(40, 105, 260, 66, "test_models.py", [L(f"{TESTS['models']} tests: the engine", f"{TESTS['models']} testów: silnik")], GREEN)
    s.box(40, 183, 260, 66, "test_coordinator.py", [L(f"{TESTS['coordinator']} tests", f"{TESTS['coordinator']} testów")], GREEN)
    s.box(40, 261, 260, 66, "test_validation.py", [L(f"{TESTS['validation']} tests: input, translations", f"{TESTS['validation']} testów: dane, tłumaczenia")], GREEN)
    s.box(40, 339, 260, 66, "test_card.py", [L(f"{TESTS['card']} tests: the card JS, static", f"{TESTS['card']} testy: JS karty, statycznie")], BLUE)
    s.box(40, 440, 260, 66, "conftest.py", [L("loads modules, installs fakes", "wczytuje moduły, instaluje atrapy")], PURPLE)
    s.rect(370, 110, 290, 250, "#ffffff", LINE, 2, 16, "8 6")
    s.text(515, 134, L("Real code under test", "Prawdziwy kod pod testem"), 14, 700, MUTED, "middle", 270)
    s.box(390, 150, 250, 46, "models.py / legacy.py", [], SAGE, 14)
    s.box(390, 208, 250, 46, "store.py", [], AMBER, 15)
    s.box(390, 266, 250, 46, "coordinator.py", [], GREEN, 15)
    s.text(515, 340, L("sensor.py, config flow: checked live", "sensor.py, config flow: sprawdzane na żywo"), 12, 400, MUTED, "middle", 270)
    s.rect(370, 400, 290, 110, "#ffffff", LINE, 2, 16, "8 6")
    s.text(515, 424, L("Fake homeassistant.* modules", "Atrapy modułów homeassistant.*"), 14, 700, MUTED, "middle", 270)
    s.text(515, 452, "FakeStore, FakeDataUpdateCoordinator", 12, 600, INK, "middle", 270)
    s.text(515, 474, L("fake clock, timer, event bus, services", "atrapa zegara, timera, zdarzeń, usług"), 12, 600, INK, "middle", 270)
    s.arrow(300, 138, 390, 173, GREEN)
    s.arrow(300, 216, 390, 280, GREEN)
    s.arrow(300, 294, 390, 190, GREEN)
    s.arrow(300, 473, 370, 450, PURPLE)
    s.arrow(515, 400, 515, 362, MUTED)
    s.box(720, 150, 240, 120, L("Checked on a live instance", "Sprawdzane na żywej instancji"),
          ["sensor.py, config flow,", L("services, card JS", "usługi, JS karty"), L("(Docker test instance)", "(instancja testowa Docker)")], BLUE, 14, 12)

    # 15 --------------------------------------------------------------- CI
    s = new("ci-pipeline", 1000, 330, "CI (GitHub Actions)", L("runs on every push and pull request", "uruchamia się przy każdym pushu i pull requeście"))
    s.box(40, 130, 170, 90, "push / PR", [], MUTED, 17)
    s.box(300, 110, 330, 64, "Tests", ["pip install -r requirements-test.txt  →  pytest tests/"], GREEN, 17, 12)
    s.box(300, 190, 330, 64, "Validate", [L("hassfest + HACS validation", "walidacja hassfest + HACS")], BLUE, 17, 12)
    s.box(720, 130, 240, 90, L("✔  green", "✔  zielone"), [L(f"{TESTS_TOTAL} tests, manifest, brand", f"{TESTS_TOTAL} testów, manifest, brand")], GREEN, 16, 12)
    s.arrow(210, 160, 300, 142, MUTED)
    s.arrow(210, 192, 300, 222, MUTED)
    s.arrow(630, 142, 720, 165, GREEN)
    s.arrow(630, 222, 720, 185, BLUE)
    s.text(40, 296, L("Python 3.12 on ubuntu-latest. Workflows: .github/workflows/tests.yml and validate.yml.",
                      "Python 3.12 na ubuntu-latest. Workflows: .github/workflows/tests.yml i validate.yml."), 13, 400, MUTED, check_w=920)

    # 16 --------------------------------------------------------------- features
    s = new("features", 1000, 590, L("What it does", "Co potrafi"), L("a Home Assistant integration with its own Lovelace card", "integracja Home Assistant z własną kartą Lovelace"))
    feats = [
        L("Any number of schedules, set up in the UI", "Dowolna liczba harmonogramów, ustawianych w UI"),
        L("Fixed times (1-24 a day) or every X hours", "Stałe godziny (1-24 dziennie) lub co X godzin"),
        L("Start and optional end date + time, switch off by hand", "Start i opcjonalny koniec (data + godzina), ręczne wyłączenie"),
        L("One button per schedule with today's count", "Jeden klawisz na harmonogram z dzisiejszą liczbą"),
        L("Tolerance window, missed terms logged (MISSED)", "Okno tolerancji, pominięte terminy w logach (POMINIĘTE)"),
        L("A/B/C question for presses outside the window", "Pytanie A/B/C przy naciśnięciu poza oknem"),
        L("In-app message, event and optional push", "Komunikat w aplikacji, zdarzenie i opcjonalny push"),
        L("State survives restarts; history per week", "Stan przeżywa restarty; historia po tygodniach"),
        L("Seven languages, in the viewer's language", "Siedem języków, w języku oglądającego"),
        L(f"{TESTS_TOTAL} unit tests and CI with hassfest / HACS checks", f"{TESTS_TOTAL} testów jednostkowych i CI z hassfest / HACS"),
    ]
    for i, d in enumerate(feats):
        y = 112 + i * 47
        s.rect(40, y, 920, 40, TINT[GREEN], GREEN, 1.5, 10)
        s.circle(64, y + 20, 11, GREEN)
        s.path(f"M 58 {y + 20} L 62 {y + 25} L 71 {y + 14}", "#fff", 2.6)
        s.text(86, y + 26, d, 14, 600, INK, check_w=840)
    return result


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
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
