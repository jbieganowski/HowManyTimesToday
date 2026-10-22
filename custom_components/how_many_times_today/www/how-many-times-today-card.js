/**
 * How Many Times Today - Lovelace card.
 * One card = one schedule sensor (sensor.xxx, created by the backend integration).
 * Model: "one button per schedule" (replaces the earlier per-occurrence "slots" model).
 * No build step: plain custom element.
 */

// Tells the integration (a tiny GET answered with 204, written to the Home Assistant log)
// that the script started or what stopped it - a device that shows "Custom element doesn't
// exist" can then be told apart: never asked for, never started, or stopped by an error.
const CARD_PATH = "/how_many_times_today_files/how-many-times-today-card.js";
const reportToServer = (kind, text) => {
  try {
    new Image().src = `${CARD_PATH}?${kind}=${encodeURIComponent(String(text).slice(0, 280))}&t=${Date.now()}`;
  } catch (err) {
    /* reporting must never break the card */
  }
};
window.addEventListener("error", (ev) => {
  if (ev.filename && ev.filename.includes("how-many-times-today-card")) reportToServer("report", `${ev.message} @${ev.lineno}`);
});
window.addEventListener("unhandledrejection", (ev) => {
  const text = String((ev.reason && (ev.reason.stack || ev.reason.message)) || ev.reason);
  if (text.includes("how-many-times-today-card")) reportToServer("report", text);
});

// the colours of the Android app: green, then yellow ("the time is coming"), then red
const GREEN = [24, 160, 64];
const AMBER = [255, 193, 7];
const RED = [214, 30, 30];
const BLACK = [0, 0, 0];
// the button stays plain green up to this share of the way to the next term
const GREEN_HOLD_PROGRESS = 0.35;
// the light phase of the blinking black button (strong contrast with black)
const BLACK_BLINK = "#e8e8e8";
const PENDING_GRAY = [96, 125, 139];
const INACTIVE_GRAY = [158, 158, 158];

// The sentence under the name. Like the app: a fading button that is still far from the
// next term says "all according to plan"; "the time is coming" only from 55 % of the way.
const APPROACHING_PROGRESS = 0.55;
function plainStatusKeyOf(state, attrs) {
  if (state === "transition" && (attrs.color_progress ?? 0) < APPROACHING_PROGRESS) return "status_on_plan";
  return (
    {
      pending: "status_pending",
      green: "status_green",
      transition: "status_transition",
      red: "status_red",
      blinking_black: "status_blinking_black",
      exceeded: "status_exceeded",
      inactive: "status_inactive",
    }[state] || "status_green"
  );
}

// An element can only be defined once per page. A page that kept an older copy of this
// script (a cached start page or script) defines the card first, and a newer copy loaded
// next - from the dashboard resource - would be ignored. So the newer copy takes the older
// class over: its methods replace the old ones, and the cards already on the page show the
// new look at their next redraw.
function defineOrUpgrade(tag, Cls) {
  const existing = customElements.get(tag);
  if (!existing) {
    customElements.define(tag, Cls);
    return "defined";
  }
  if (existing === Cls) return "same";
  for (const name of Object.getOwnPropertyNames(Cls.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(existing.prototype, name, Object.getOwnPropertyDescriptor(Cls.prototype, name));
  }
  for (const name of Object.getOwnPropertyNames(Cls)) {
    if (["length", "name", "prototype"].includes(name)) continue;
    Object.defineProperty(existing, name, Object.getOwnPropertyDescriptor(Cls, name));
  }
  return "upgraded";
}

function lerp(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}

function rgb(arr) {
  return `rgb(${arr[0]}, ${arr[1]}, ${arr[2]})`;
}

// green until 35 % of the way, then to yellow (reached at 55 %, "the time is coming"), then to red
function transitionColor(progress) {
  const t = Math.max(0, Math.min(1, progress));
  if (t < GREEN_HOLD_PROGRESS) return GREEN;
  if (t < APPROACHING_PROGRESS) return lerp(GREEN, AMBER, (t - GREEN_HOLD_PROGRESS) / (APPROACHING_PROGRESS - GREEN_HOLD_PROGRESS));
  return lerp(AMBER, RED, (t - APPROACHING_PROGRESS) / (1 - APPROACHING_PROGRESS));
}

function formatDuration(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${sign}${h}h ${m}m`;
  if (m > 0) return `${sign}${m}m ${sec}s`;
  return `${sign}${sec}s`;
}

function formatTime(iso, locale) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(locale || undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// "2026-W42" -> "12-18 Oct" (Monday to Sunday of that ISO week, in the viewer's language),
// because nobody reads week numbers; the ISO string stays the value sent to the service.
function formatIsoWeek(iso, locale) {
  const m = /^(\d{4})-W(\d{2})$/.exec(iso);
  if (!m) return iso;
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (Number(m[2]) - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat(locale || undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  return typeof fmt.formatRange === "function"
    ? fmt.formatRange(monday, sunday)
    : `${fmt.format(monday)} - ${fmt.format(sunday)}`;
}

// --- UI strings for the supported languages (see docs/SPECIFICATION.md): pl, en, de,
// ru, uk, zh-hans; unsupported languages fall back to English. ---
const CARD_STRINGS = {
  en: {
    show_history: "▶ show history",
    hide_history: "▼ hide history",
    clear_all: "Clear all history",
    clear_selected_weeks: "Clear selected weeks",
    week_word: "Week",
    no_presses: "No presses yet",
    last: "Last",
    total: "total",
    confirm_clear_all: "Clear the entire history for this schedule?",
    in_prefix: "Next in",
    overdue_prefix: "overdue by",
    entity_not_found: "Entity not found",
    editor_entity_label: "Schedule sensor",
    editor_hint: "The schedule's type (fixed times / interval) is changed in the integration's settings, not here.",
    editor_live_notice: "The fields below are NOT part of the card's configuration (they won't appear in \"Show code editor\") — they save immediately to the schedule itself.",
    editor_open_settings: "Open the integration settings",
    editor_section_schedule: "Schedule details",
    editor_active_label: "Schedule active",
    editor_name_label: "Name",
    editor_description_label: "Description",
    editor_count_label: "How many times a day",
    editor_time_label: "Time {n}",
    editor_interval_label: "Every how many hours",
    editor_advanced_label: "Advanced",
    editor_start_label: "Start",
    editor_end_label: "End (optional)",
    editor_clear_end: "Remove end date",
    editor_window_label: "Tolerance window (minutes)",
    editor_save_button: "Save schedule changes",
    editor_saved_message: "Saved",
    editor_reset_button: "Reset to \"all on time\"",
    editor_reset_confirm: "Mark everything that has already passed today as done on time? Today's history of this schedule will be replaced.",
    editor_reset_done: "Reset done",
    error_schedule_not_active: "This schedule is switched off or has not started yet",
    editor_generic_error: "Could not save the changes",
    error_nothing_to_update: "Nothing to save — change something first",
    error_invalid_name: "Please enter a name",
    error_invalid_time: "One of the times isn't valid (use HH:MM)",
    error_no_times: "Give at least one time",
    error_too_many_times: "Too many times (maximum 24 a day)",
    error_invalid_interval: "The interval must be between 0.5 and 48 hours",
    error_invalid_datetime: "That date/time isn't valid",
    error_end_before_start: "The end date must be after the start date",
    error_invalid_window: "The tolerance window must be between 1 and 240 minutes",
    error_wrong_mode: "This field doesn't apply to this schedule's mode",
    inactive_label: "inactive",
    pending_label: "not started yet",
    status_pending: "Not started yet",
    status_green: "You are up to date",
    status_on_plan: "All according to plan",
    status_transition: "The time is coming",
    status_red: "NOW",
    status_blinking_black: "WARNING - overdue!",
    status_exceeded: "Done too many times",
    status_inactive: "Switched off",
    status_number_blinking: "Blinking number: the last execution was recorded outside the schedule",
    answer_dialog_title: "What happened at {time}?",
    answer_already_done: "A. It was done, just not recorded",
    answer_do_now: "B. Wasn't done at {time}, doing it now",
    answer_extra: "C. Done at {time}, this is an extra execution",
    answer_cancel: "Cancel",
    kind_registered_late: "recorded with a delay",
    kind_outside: "OUTSIDE SCHEDULE",
    kind_extra: "OUTSIDE SCHEDULE",
    kind_missed: "MISSED",
    editor_layout_label: "Appearance",
    layout_card: "Card (large)",
    layout_tile: "Tile (as in the app, no history)",
    history_dialog_title: "History — {name}",
    close_label: "Close",
    edit_label: "Edit",
    early_title: "It is not time yet: the next term is {time}.",
    early_question: "Is this that coming occurrence, only done now, or an extra one?",
    early_yes: "The coming occurrence, done now",
    early_extra: "An extra one",
    early_confirm: "The term at {time} is still far ahead. It will count as done now and the button will skip it (it will not turn red for that term). Is that right?",
    sound_label: "Reminder sound",
    volume_label: "Reminder volume",
    sound_default: "Default",
    preview_label: "Play",
    help_label: "Help",
    help_title: "Help",
    help_toc: "Table of contents",
    help_g_intro: "Introduction",
    help_g_schedules: "Schedules",
    help_g_notif: "Reminders and settings",
    help_g_data: "History and data",
    help_h_what: "What is this for?",
    help_p_what: "This card helps you remember to do something at the right times every day, for example to take a pill, feed the cat or drink water. Every such thing is a schedule with its own big round button. When you have done it, tap the button.",
    help_h_colors: "How to read the button",
    help_p_colors: "The big number on the button shows how many times you did it today. The colour and the words under the name tell you what to do: green - all is well, yellow and orange - the time is coming, red - do it now, blinking black - you are late. If the number blinks, the last time was saved outside the plan. Red with a black number means you did it more times today than needed. A grey button means this schedule is switched off or has not started yet. At midnight the number goes back to zero.",
    help_h_press: "How to confirm that you did it",
    help_p_press: "Tap the round button when you have done it. If you do it close to the set time (by default up to half an hour earlier or later), everything is fine. If you tap between two times (nothing is due yet), you are asked whether this is the coming occurrence, only done now, or an extra one. If you tap later, you are asked what happened: A - I did it earlier but did not record it, B - I did not do it and I am doing it now, C - I did it earlier and this is an extra time. If you tap when nothing is due, it is saved as done outside the plan.",
    help_h_add: "How to add and change a schedule",
    help_p_add: "New schedules are added in Settings, Devices & services, How Many Times Today, Configure. Type a name (for example Heart medication). Choose how often: at fixed times (1 to 24 times a day, each at its own time) or every few hours. Set when it starts and, if needed, when it ends. The pencil on a tile (or a double tap on it) lets you change the schedule. The button \"Reset to all on time\" fixes a mistake: it marks everything that has already passed today as done on time.",
    help_h_notif: "Reminders, sound and text size",
    help_p_notif: "At the set time the card shows a message and plays the reminder sound while the dashboard is open. With a phone chosen in the global settings you also get a push notification. In the global settings you choose the default sound and its volume (each schedule can have its own, in its edit dialog), the text size of the cards and high contrast.",
    help_h_history: "History",
    help_p_history: "Hold a tile (or right-click it), or tap \"show history\" on the large card. Entries done outside the plan and missed ones are in bold. You can clear the whole history or only chosen weeks.",
    help_h_privacy: "Your data",
    help_p_privacy: "Everything stays in your Home Assistant. There is no account and no cloud, and no data is collected.",
    help_author: "Author: {author}",
    help_version: "Version",
    help_build: "Build",
    help_font: "Text size",
    help_contrast: "High contrast",
    sound_group_gentle: "gentle",
    sound_group_medium: "medium",
    sound_group_strong: "strong",
    sound_group_verystrong: "very strong",
    sound_group_melody: "melody",
    sound_group_seasonal: "seasonal",
    sound_delikatny_dzwonek: "Soft chime",
    sound_pozytywka: "Music box",
    sound_harfa: "Harp",
    sound_dzwonek: "Bell",
    sound_gitara: "Guitar",
    sound_marimba: "Marimba",
    sound_sygnal: "Beeps",
    sound_fanfara: "Fanfare",
    sound_budzik: "Alarm clock",
    sound_sos: "SOS (Morse code)",
    sound_alarm: "Alarm",
    sound_syrena: "Siren",
    sound_wlaz_kotek: "Kitten on the fence (Polish song)",
    sound_kreskowka: "Cheerful cartoon tune",
    sound_pop_weasel: "Pop Goes the Weasel",
    sound_boze_narodzenie: "Christmas",
    sound_wielkanoc_kurczaczek: "Easter: chick",
    sound_wielkanoc_dzwony: "Easter: bells",
    volume_0: "Sound off",
    volume_1: "Quiet",
    volume_2: "Medium",
    volume_3: "Loud",
    volume_4: "Very loud",
  },
  pl: {
    show_history: "▶ pokaż historię",
    hide_history: "▼ ukryj historię",
    clear_all: "Wyczyść całą historię",
    clear_selected_weeks: "Wyczyść wybrane tygodnie",
    week_word: "Tydzień",
    no_presses: "Brak naciśnięć",
    last: "Ostatnio",
    total: "łącznie",
    confirm_clear_all: "Wyczyścić całą historię tego harmonogramu?",
    in_prefix: "Następne za",
    overdue_prefix: "spóźnione o",
    entity_not_found: "Nie znaleziono encji",
    editor_entity_label: "Sensor harmonogramu",
    editor_hint: "Rodzaj harmonogramu (stałe godziny / interwał) zmienisz w ustawieniach integracji, nie tutaj.",
    editor_live_notice: "Poniższe pola NIE są częścią konfiguracji karty (nie pojawią się w „Pokaż edytor kodu”) — zapisują się od razu w samym harmonogramie.",
    editor_open_settings: "Otwórz ustawienia integracji",
    editor_section_schedule: "Szczegóły harmonogramu",
    editor_active_label: "Harmonogram aktywny",
    editor_name_label: "Nazwa",
    editor_description_label: "Opis",
    editor_count_label: "Ile razy dziennie",
    editor_time_label: "Godzina {n}",
    editor_interval_label: "Co ile godzin",
    editor_advanced_label: "Zaawansowane",
    editor_start_label: "Start",
    editor_end_label: "Koniec (opcjonalnie)",
    editor_clear_end: "Usuń datę końca",
    editor_window_label: "Okno tolerancji (minuty)",
    editor_save_button: "Zapisz zmiany harmonogramu",
    editor_saved_message: "Zapisano",
    editor_reset_button: "Resetuj do „wszystko o czasie”",
    editor_reset_confirm: "Oznaczyć wszystko, co dziś już minęło, jako zrobione o czasie? Dzisiejsza historia tego harmonogramu zostanie zastąpiona.",
    editor_reset_done: "Zresetowano",
    error_schedule_not_active: "Ten harmonogram jest wyłączony albo jeszcze się nie zaczął",
    editor_generic_error: "Nie udało się zapisać zmian",
    error_nothing_to_update: "Nie ma czego zapisać – najpierw coś zmień",
    error_invalid_name: "Wpisz nazwę",
    error_invalid_time: "Jedna z godzin jest nieprawidłowa (format GG:MM)",
    error_no_times: "Podaj przynajmniej jedną godzinę",
    error_too_many_times: "Za dużo godzin (maksymalnie 24 dziennie)",
    error_invalid_interval: "Interwał musi być od 0,5 do 48 godzin",
    error_invalid_datetime: "Ta data/godzina jest nieprawidłowa",
    error_end_before_start: "Data końca musi być po dacie startu",
    error_invalid_window: "Okno tolerancji musi być od 1 do 240 minut",
    error_wrong_mode: "To pole nie pasuje do trybu tego harmonogramu",
    inactive_label: "nieaktywne",
    pending_label: "jeszcze nie wystartował",
    status_pending: "Jeszcze się nie zaczęło",
    status_green: "Jesteś na bieżąco",
    status_on_plan: "Wszystko zgodnie z planem",
    status_transition: "Zbliża się pora",
    status_red: "TERAZ",
    status_blinking_black: "UWAGA – spóźnione!",
    status_exceeded: "Zrobione za dużo razy",
    status_inactive: "Wyłączone",
    status_number_blinking: "Migająca liczba: ostatnie wykonanie zapisano poza planem",
    answer_dialog_title: "Co się stało o {time}?",
    answer_already_done: "A. Było wykonane, tylko nie zapisano",
    answer_do_now: "B. Nie wykonano o {time}, robię to teraz",
    answer_extra: "C. Wykonano o {time}, a to jest dodatkowe wykonanie",
    answer_cancel: "Anuluj",
    kind_registered_late: "zarejestrowano z opóźnieniem",
    kind_outside: "POZA HARMONOGRAMEM",
    kind_extra: "POZA HARMONOGRAMEM",
    kind_missed: "POMINIĘTE",
    editor_layout_label: "Wygląd",
    layout_card: "Karta (duża)",
    layout_tile: "Kafelek (jak w aplikacji, bez historii)",
    history_dialog_title: "Historia — {name}",
    close_label: "Zamknij",
    edit_label: "Edytuj",
    early_title: "To jeszcze nie pora: najbliższy termin jest {time}.",
    early_question: "Czy to jest nadchodzące wystąpienie, tylko wykonane teraz, czy dodatkowe?",
    early_yes: "Nadchodzące wystąpienie, wykonane teraz",
    early_extra: "Dodatkowe wykonanie",
    early_confirm: "Termin {time} jest jeszcze daleko. Zostanie uznany za wykonany teraz, a klawisz go przeskoczy (nie zrobi się dla niego czerwony). Czy na pewno?",
    sound_label: "Dźwięk przypomnienia",
    volume_label: "Głośność przypomnienia",
    sound_default: "Domyślny",
    preview_label: "Odtwórz",
    help_label: "Pomoc",
    help_title: "Pomoc",
    help_toc: "Spis treści",
    help_g_intro: "Wprowadzenie",
    help_g_schedules: "Harmonogramy",
    help_g_notif: "Przypomnienia i ustawienia",
    help_g_data: "Historia i dane",
    help_h_what: "Do czego to służy?",
    help_p_what: "Ta karta pomaga pamiętać o wykonaniu czegoś o właściwych porach każdego dnia, na przykład o wzięciu tabletki, nakarmieniu kota czy wypiciu wody. Każda taka rzecz to harmonogram z własnym dużym okrągłym klawiszem. Gdy to zrobisz, dotknij klawisza.",
    help_h_colors: "Jak czytać klawisz",
    help_p_colors: "Duża liczba na klawiszu pokazuje, ile razy zrobiłeś to dzisiaj. Kolor i słowa pod nazwą mówią, co robić: zielony - wszystko w porządku, żółty i pomarańczowy - zbliża się pora, czerwony - zrób to teraz, migający czarny - jesteś spóźniony. Jeśli liczba miga, ostatni raz został zapisany poza planem. Czerwony z czarną liczbą oznacza, że dziś zrobiłeś to więcej razy, niż trzeba. Szary klawisz oznacza, że harmonogram jest wyłączony albo jeszcze się nie zaczął. O północy liczba wraca do zera.",
    help_h_press: "Jak potwierdzić, że zadanie wykonano",
    help_p_press: "Dotknij okrągłego klawisza, gdy to zrobisz. Jeśli zrobisz to blisko ustalonej pory (domyślnie do pół godziny wcześniej lub później), wszystko jest w porządku. Jeśli dotkniesz między terminami (nic jeszcze nie jest należne), karta zapyta, czy to jest nadchodzące wystąpienie, tylko wykonane teraz, czy dodatkowe. Jeśli dotkniesz później, zapyta, co się stało: A - zrobiłem wcześniej, ale nie zapisałem, B - nie zrobiłem i robię to teraz, C - zrobiłem wcześniej i to jest dodatkowy raz. Jeśli dotkniesz, gdy nic nie jest wymagane, zapisze się to jako wykonane poza planem.",
    help_h_add: "Jak dodać i zmienić harmonogram",
    help_p_add: "Nowe harmonogramy dodajesz w Ustawieniach, Urządzenia i usługi, How Many Times Today, Konfiguruj. Wpisz nazwę (na przykład Lek na serce). Wybierz, jak często: o stałych godzinach (od 1 do 24 razy dziennie, każde o własnej porze) albo co kilka godzin. Ustaw, kiedy się zaczyna i w razie potrzeby kiedy kończy. Ołówek na kafelku (albo dwukrotne dotknięcie) pozwala zmienić harmonogram. Przycisk „Resetuj do „wszystko o czasie”” naprawia pomyłkę: oznacza wszystko, co dziś już minęło, jako zrobione o czasie.",
    help_h_notif: "Przypomnienia, dźwięk i rozmiar tekstu",
    help_p_notif: "O ustalonej porze karta pokazuje komunikat i odtwarza dźwięk przypomnienia, gdy pulpit jest otwarty. Jeśli w ustawieniach globalnych wybierzesz telefon, dostaniesz też powiadomienie push. W ustawieniach globalnych wybierasz domyślny dźwięk i jego głośność (każdy harmonogram może mieć własne, w oknie edycji), rozmiar tekstu na kartach i wysoki kontrast.",
    help_h_history: "Historia",
    help_p_history: "Przytrzymaj kafelek (albo kliknij go prawym przyciskiem) lub dotknij „pokaż historię” na dużej karcie. Wpisy wykonane poza planem i pominięte są pogrubione. Możesz wyczyścić całą historię albo tylko wybrane tygodnie.",
    help_h_privacy: "Twoje dane",
    help_p_privacy: "Wszystko zostaje w Twoim Home Assistancie. Nie ma konta ani chmury, a żadne dane nie są zbierane.",
    help_author: "Autor: {author}",
    help_version: "Wersja",
    help_build: "Kompilacja",
    help_font: "Rozmiar tekstu",
    help_contrast: "Wysoki kontrast",
    sound_group_gentle: "delikatny",
    sound_group_medium: "średni",
    sound_group_strong: "mocny",
    sound_group_verystrong: "bardzo mocny",
    sound_group_melody: "melodia",
    sound_group_seasonal: "okolicznościowy",
    sound_delikatny_dzwonek: "Delikatny dzwonek",
    sound_pozytywka: "Pozytywka",
    sound_harfa: "Harfa",
    sound_dzwonek: "Dzwonek",
    sound_gitara: "Gitara",
    sound_marimba: "Marimba",
    sound_sygnal: "Sygnał",
    sound_fanfara: "Fanfara",
    sound_budzik: "Budzik",
    sound_sos: "SOS (alfabet Morse'a)",
    sound_alarm: "Alarm",
    sound_syrena: "Syrena",
    sound_wlaz_kotek: "Wlazł kotek na płotek",
    sound_kreskowka: "Wesoła kreskówka",
    sound_pop_weasel: "Pop Goes the Weasel (Łasica)",
    sound_boze_narodzenie: "Boże Narodzenie",
    sound_wielkanoc_kurczaczek: "Wielkanoc: kurczaczek",
    sound_wielkanoc_dzwony: "Wielkanoc: dzwony",
    volume_0: "Wyłącz dźwięk",
    volume_1: "Cicho",
    volume_2: "Średnio",
    volume_3: "Głośno",
    volume_4: "Bardzo głośno",
  },
  de: {
    show_history: "▶ Verlauf anzeigen",
    hide_history: "▼ Verlauf ausblenden",
    clear_all: "Gesamten Verlauf löschen",
    clear_selected_weeks: "Ausgewählte Wochen löschen",
    week_word: "Woche",
    no_presses: "Noch keine Bestätigungen",
    last: "Zuletzt",
    total: "gesamt",
    confirm_clear_all: "Den gesamten Verlauf für diesen Zeitplan löschen?",
    in_prefix: "Nächste in",
    overdue_prefix: "überfällig um",
    entity_not_found: "Entität nicht gefunden",
    editor_entity_label: "Zeitplan-Sensor",
    editor_hint: "Die Art des Zeitplans (feste Uhrzeiten / Intervall) änderst du in den Einstellungen der Integration, nicht hier.",
    editor_live_notice: "Die folgenden Felder sind NICHT Teil der Kartenkonfiguration (sie erscheinen nicht im „Code-Editor anzeigen”) – sie werden sofort im Zeitplan selbst gespeichert.",
    editor_open_settings: "Einstellungen der Integration öffnen",
    editor_section_schedule: "Details zum Zeitplan",
    editor_active_label: "Zeitplan aktiv",
    editor_name_label: "Name",
    editor_description_label: "Beschreibung",
    editor_count_label: "Wie oft am Tag",
    editor_time_label: "Uhrzeit {n}",
    editor_interval_label: "Alle wie viele Stunden",
    editor_advanced_label: "Erweitert",
    editor_start_label: "Start",
    editor_end_label: "Ende (optional)",
    editor_clear_end: "Enddatum entfernen",
    editor_window_label: "Toleranzfenster (Minuten)",
    editor_save_button: "Änderungen am Zeitplan speichern",
    editor_saved_message: "Gespeichert",
    editor_reset_button: "Zurücksetzen auf „alles pünktlich“",
    editor_reset_confirm: "Alles, was heute schon fällig war, als pünktlich erledigt markieren? Der heutige Verlauf dieses Zeitplans wird ersetzt.",
    editor_reset_done: "Zurückgesetzt",
    error_schedule_not_active: "Dieser Zeitplan ist ausgeschaltet oder noch nicht gestartet",
    editor_generic_error: "Änderungen konnten nicht gespeichert werden",
    error_nothing_to_update: "Nichts zu speichern – ändere zuerst etwas",
    error_invalid_name: "Bitte gib einen Namen ein",
    error_invalid_time: "Eine der Uhrzeiten ist ungültig (Format HH:MM)",
    error_no_times: "Gib mindestens eine Uhrzeit an",
    error_too_many_times: "Zu viele Uhrzeiten (maximal 24 pro Tag)",
    error_invalid_interval: "Das Intervall muss zwischen 0,5 und 48 Stunden liegen",
    error_invalid_datetime: "Dieses Datum/diese Uhrzeit ist ungültig",
    error_end_before_start: "Das Enddatum muss nach dem Startdatum liegen",
    error_invalid_window: "Das Toleranzfenster muss zwischen 1 und 240 Minuten liegen",
    error_wrong_mode: "Dieses Feld passt nicht zum Modus dieses Zeitplans",
    inactive_label: "inaktiv",
    pending_label: "noch nicht gestartet",
    status_pending: "Noch nicht gestartet",
    status_green: "Du bist auf dem Laufenden",
    status_on_plan: "Alles nach Plan",
    status_transition: "Es wird bald Zeit",
    status_red: "JETZT",
    status_blinking_black: "ACHTUNG – überfällig!",
    status_exceeded: "Zu oft erledigt",
    status_inactive: "Ausgeschaltet",
    status_number_blinking: "Blinkende Zahl: letztes Mal außerhalb des Zeitplans erfasst",
    answer_dialog_title: "Was ist um {time} passiert?",
    answer_already_done: "A. Es wurde erledigt, nur nicht erfasst",
    answer_do_now: "B. Wurde nicht um {time} erledigt, ich mache es jetzt",
    answer_extra: "C. Wurde um {time} erledigt, das hier ist eine zusätzliche Ausführung",
    answer_cancel: "Abbrechen",
    kind_registered_late: "mit Verspätung erfasst",
    kind_outside: "AUSSERHALB DES ZEITPLANS",
    kind_extra: "AUSSERHALB DES ZEITPLANS",
    kind_missed: "VERPASST",
    editor_layout_label: "Darstellung",
    layout_card: "Karte (groß)",
    layout_tile: "Kachel (wie in der App, ohne Verlauf)",
    history_dialog_title: "Verlauf — {name}",
    close_label: "Schließen",
    edit_label: "Bearbeiten",
    early_title: "Es ist noch nicht Zeit: der nächste Termin ist {time}.",
    early_question: "Ist das der kommende Termin, nur jetzt erledigt, oder eine zusätzliche Ausführung?",
    early_yes: "Der kommende Termin, jetzt erledigt",
    early_extra: "Eine zusätzliche Ausführung",
    early_confirm: "Der Termin um {time} liegt noch weit voraus. Er zählt jetzt als erledigt und die Taste überspringt ihn (sie wird für diesen Termin nicht rot). Ist das richtig?",
    sound_label: "Erinnerungston",
    volume_label: "Erinnerungslautstärke",
    sound_default: "Standard",
    preview_label: "Abspielen",
    help_label: "Hilfe",
    help_title: "Hilfe",
    help_toc: "Inhaltsverzeichnis",
    help_g_intro: "Einführung",
    help_g_schedules: "Zeitpläne",
    help_g_notif: "Erinnerungen und Einstellungen",
    help_g_data: "Verlauf und Daten",
    help_h_what: "Wofür ist das?",
    help_p_what: "Diese Karte hilft dir, etwas jeden Tag zur richtigen Zeit nicht zu vergessen, zum Beispiel eine Tablette zu nehmen, die Katze zu füttern oder Wasser zu trinken. Jede solche Sache ist ein Zeitplan mit einer eigenen großen runden Taste. Wenn du es getan hast, tippe auf die Taste.",
    help_h_colors: "So liest du die Taste",
    help_p_colors: "Die große Zahl auf der Taste zeigt, wie oft du es heute getan hast. Die Farbe und die Worte unter dem Namen sagen dir, was zu tun ist: grün - alles in Ordnung, gelb und orange - die Zeit naht, rot - jetzt tun, blinkend schwarz - du bist zu spät. Blinkt die Zahl, wurde das letzte Mal außerhalb des Plans gespeichert. Rot mit schwarzer Zahl bedeutet, dass du es heute öfter getan hast als nötig. Eine graue Taste bedeutet, dass der Zeitplan ausgeschaltet ist oder noch nicht begonnen hat. Um Mitternacht springt die Zahl auf null.",
    help_h_press: "So bestätigst du, dass es erledigt ist",
    help_p_press: "Tippe auf die runde Taste, wenn du es getan hast. Geschieht es nahe der festgelegten Zeit (standardmäßig bis eine halbe Stunde früher oder später), ist alles in Ordnung. Tippst du zwischen zwei Terminen (noch nichts ist fällig), wirst du gefragt, ob es der kommende Termin ist, nur jetzt erledigt, oder eine zusätzliche Ausführung. Tippst du später, wirst du gefragt, was passiert ist: A - ich habe es früher getan, aber nicht erfasst, B - ich habe es nicht getan und tue es jetzt, C - ich habe es früher getan und dies ist ein zusätzliches Mal. Tippst du, wenn nichts fällig ist, wird es als außerhalb des Plans erledigt gespeichert.",
    help_h_add: "So fügst du einen Zeitplan hinzu oder änderst ihn",
    help_p_add: "Neue Zeitpläne fügst du unter Einstellungen, Geräte & Dienste, How Many Times Today, Konfigurieren hinzu. Gib einen Namen ein (zum Beispiel Herzmedikament). Wähle, wie oft: zu festen Uhrzeiten (1 bis 24 Mal täglich, jeweils zu eigener Zeit) oder alle paar Stunden. Lege fest, wann er beginnt und bei Bedarf endet. Der Stift auf einer Kachel (oder ein Doppeltippen) ändert den Zeitplan. Die Schaltfläche „Auf ‚alles pünktlich‘ zurücksetzen“ behebt einen Fehler: Sie markiert alles, was heute schon fällig war, als pünktlich erledigt.",
    help_h_notif: "Erinnerungen, Ton und Textgröße",
    help_p_notif: "Zur festgelegten Zeit zeigt die Karte eine Meldung und spielt den Erinnerungston ab, solange das Dashboard geöffnet ist. Mit einem in den globalen Einstellungen gewählten Telefon bekommst du auch eine Push-Benachrichtigung. In den globalen Einstellungen wählst du den Standardton und seine Lautstärke (jeder Zeitplan kann im Bearbeiten-Dialog einen eigenen haben), die Textgröße der Karten und hohen Kontrast.",
    help_h_history: "Verlauf",
    help_p_history: "Halte eine Kachel gedrückt (oder klicke mit rechts) oder tippe auf der großen Karte auf „Verlauf anzeigen“. Einträge außerhalb des Plans und verpasste sind fett. Du kannst den ganzen Verlauf oder nur bestimmte Wochen löschen.",
    help_h_privacy: "Deine Daten",
    help_p_privacy: "Alles bleibt in deinem Home Assistant. Es gibt kein Konto und keine Cloud, und es werden keine Daten gesammelt.",
    help_author: "Autor: {author}",
    help_version: "Version",
    help_build: "Build",
    help_font: "Textgröße",
    help_contrast: "Hoher Kontrast",
    sound_group_gentle: "sanft",
    sound_group_medium: "mittel",
    sound_group_strong: "stark",
    sound_group_verystrong: "sehr stark",
    sound_group_melody: "Melodie",
    sound_group_seasonal: "saisonal",
    sound_delikatny_dzwonek: "Sanftes Glöckchen",
    sound_pozytywka: "Spieluhr",
    sound_harfa: "Harfe",
    sound_dzwonek: "Glocke",
    sound_gitara: "Gitarre",
    sound_marimba: "Marimba",
    sound_sygnal: "Signaltöne",
    sound_fanfara: "Fanfare",
    sound_budzik: "Wecker",
    sound_sos: "SOS (Morsecode)",
    sound_alarm: "Alarm",
    sound_syrena: "Sirene",
    sound_wlaz_kotek: "Kätzchen auf dem Zaun (polnisches Lied)",
    sound_kreskowka: "Fröhliche Zeichentrickmelodie",
    sound_pop_weasel: "Pop Goes the Weasel",
    sound_boze_narodzenie: "Weihnachten",
    sound_wielkanoc_kurczaczek: "Ostern: Küken",
    sound_wielkanoc_dzwony: "Ostern: Glocken",
    volume_0: "Ton aus",
    volume_1: "Leise",
    volume_2: "Mittel",
    volume_3: "Laut",
    volume_4: "Sehr laut",
  },
  ru: {
    show_history: "▶ показать историю",
    hide_history: "▼ скрыть историю",
    clear_all: "Очистить всю историю",
    clear_selected_weeks: "Очистить выбранные недели",
    week_word: "Неделя",
    no_presses: "Пока нет нажатий",
    last: "Последнее",
    total: "всего",
    confirm_clear_all: "Очистить всю историю этого расписания?",
    in_prefix: "Следующее через",
    overdue_prefix: "просрочено на",
    entity_not_found: "Сущность не найдена",
    editor_entity_label: "Сенсор расписания",
    editor_hint: "Тип расписания (фиксированное время / интервал) изменяется в настройках интеграции, а не здесь.",
    editor_live_notice: "Поля ниже НЕ являются частью конфигурации карточки (они не появятся в «Показать редактор кода») — они сохраняются сразу в самом расписании.",
    editor_open_settings: "Открыть настройки интеграции",
    editor_section_schedule: "Детали расписания",
    editor_active_label: "Расписание активно",
    editor_name_label: "Название",
    editor_description_label: "Описание",
    editor_count_label: "Сколько раз в день",
    editor_time_label: "Время {n}",
    editor_interval_label: "Через сколько часов",
    editor_advanced_label: "Дополнительно",
    editor_start_label: "Начало",
    editor_end_label: "Конец (необязательно)",
    editor_clear_end: "Убрать дату окончания",
    editor_window_label: "Окно допуска (минуты)",
    editor_save_button: "Сохранить изменения расписания",
    editor_saved_message: "Сохранено",
    editor_reset_button: "Сбросить в «всё вовремя»",
    editor_reset_confirm: "Отметить всё, что уже наступило сегодня, как сделанное вовремя? Сегодняшняя история этого расписания будет заменена.",
    editor_reset_done: "Сброшено",
    error_schedule_not_active: "Это расписание выключено или ещё не началось",
    editor_generic_error: "Не удалось сохранить изменения",
    error_nothing_to_update: "Нечего сохранять – сначала что-нибудь измените",
    error_invalid_name: "Введите название",
    error_invalid_time: "Одно из указанных времён неверно (формат ЧЧ:ММ)",
    error_no_times: "Укажите хотя бы одно время",
    error_too_many_times: "Слишком много времён (максимум 24 в день)",
    error_invalid_interval: "Интервал должен быть от 0,5 до 48 часов",
    error_invalid_datetime: "Эта дата/время указаны неверно",
    error_end_before_start: "Дата окончания должна быть позже даты начала",
    error_invalid_window: "Окно допуска должно быть от 1 до 240 минут",
    error_wrong_mode: "Это поле не подходит для режима этого расписания",
    inactive_label: "неактивно",
    pending_label: "ещё не началось",
    status_pending: "Ещё не началось",
    status_green: "Вы в графике",
    status_on_plan: "Всё по плану",
    status_transition: "Скоро пора",
    status_red: "СЕЙЧАС",
    status_blinking_black: "ВНИМАНИЕ — просрочено!",
    status_exceeded: "Сделано слишком много раз",
    status_inactive: "Выключено",
    status_number_blinking: "Мигающее число: последнее выполнение записано вне расписания",
    answer_dialog_title: "Что произошло в {time}?",
    answer_already_done: "A. Было сделано, просто не записано",
    answer_do_now: "B. Не было сделано в {time}, делаю сейчас",
    answer_extra: "C. Сделано в {time}, а это дополнительное выполнение",
    answer_cancel: "Отмена",
    kind_registered_late: "записано с задержкой",
    kind_outside: "ВНЕ РАСПИСАНИЯ",
    kind_extra: "ВНЕ РАСПИСАНИЯ",
    kind_missed: "ПРОПУЩЕНО",
    editor_layout_label: "Внешний вид",
    layout_card: "Карточка (большая)",
    layout_tile: "Плитка (как в приложении, без истории)",
    history_dialog_title: "История — {name}",
    close_label: "Закрыть",
    edit_label: "Изменить",
    early_title: "Ещё не время: ближайший срок — {time}.",
    early_question: "Это ближайшее выполнение, просто сделанное сейчас, или дополнительное?",
    early_yes: "Ближайшее выполнение, сделанное сейчас",
    early_extra: "Дополнительное выполнение",
    early_confirm: "Срок {time} ещё далеко. Он будет засчитан как выполненный сейчас, а кнопка его пропустит (для этого срока она не станет красной). Всё верно?",
    sound_label: "Звук напоминания",
    volume_label: "Громкость напоминания",
    sound_default: "По умолчанию",
    preview_label: "Воспроизвести",
    help_label: "Справка",
    help_title: "Справка",
    help_toc: "Содержание",
    help_g_intro: "Введение",
    help_g_schedules: "Расписания",
    help_g_notif: "Напоминания и настройки",
    help_g_data: "История и данные",
    help_h_what: "Для чего это?",
    help_p_what: "Эта карточка помогает не забыть сделать что-то в нужное время каждый день, например принять таблетку, покормить кошку или выпить воды. Каждое такое дело — это расписание с собственной большой круглой кнопкой. Когда вы это сделали, нажмите кнопку.",
    help_h_colors: "Как читать кнопку",
    help_p_colors: "Большое число на кнопке показывает, сколько раз вы сделали это сегодня. Цвет и слова под названием подсказывают, что делать: зелёный — всё в порядке, жёлтый и оранжевый — скоро время, красный — сделайте это сейчас, мигающий чёрный — вы опаздываете. Если число мигает, последний раз записан вне плана. Красный с чёрным числом означает, что сегодня сделано больше раз, чем нужно. Серая кнопка означает, что расписание выключено или ещё не началось. В полночь число возвращается к нулю.",
    help_h_press: "Как подтвердить, что вы это сделали",
    help_p_press: "Нажмите круглую кнопку, когда сделаете это. Если вы делаете это близко к назначенному времени (по умолчанию в пределах получаса раньше или позже), всё в порядке. Если нажмёте между сроками (пока ничего не требуется), вас спросят, это ближайшее выполнение, просто сделанное сейчас, или дополнительное. Если нажмёте позже, спросят, что произошло: A — я сделал(а) раньше, но не записал(а), B — не сделал(а) и делаю сейчас, C — сделал(а) раньше, и это ещё один раз. Если нажать, когда ничего не нужно, это будет записано как выполненное вне плана.",
    help_h_add: "Как добавить и изменить расписание",
    help_p_add: "Новые расписания добавляются в Настройки, Устройства и службы, How Many Times Today, Настроить. Введите название (например, Лекарство для сердца). Выберите, как часто: в фиксированное время (от 1 до 24 раз в день, каждый раз в своё время) или каждые несколько часов. Укажите, когда оно начинается и при необходимости заканчивается. Карандаш на плитке (или двойное нажатие) позволяет изменить расписание. Кнопка «Сбросить до «всё вовремя»» исправляет ошибку: отмечает всё, что сегодня уже наступило, как выполненное вовремя.",
    help_h_notif: "Напоминания, звук и размер текста",
    help_p_notif: "В назначенное время карточка показывает сообщение и воспроизводит звук напоминания, пока открыта панель. Если в общих настройках выбран телефон, приходит и push-уведомление. В общих настройках выбираются звук по умолчанию и его громкость (у каждого расписания может быть свой, в окне редактирования), размер текста на карточках и высокая контрастность.",
    help_h_history: "История",
    help_p_history: "Удерживайте плитку (или щёлкните правой кнопкой) либо нажмите «показать историю» на большой карточке. Записи вне плана и пропущенные выделены жирным. Можно очистить всю историю или только выбранные недели.",
    help_h_privacy: "Ваши данные",
    help_p_privacy: "Всё остаётся в вашем Home Assistant. Нет учётной записи и облака, данные не собираются.",
    help_author: "Автор: {author}",
    help_version: "Версия",
    help_build: "Сборка",
    help_font: "Размер текста",
    help_contrast: "Высокая контрастность",
    sound_group_gentle: "мягкий",
    sound_group_medium: "средний",
    sound_group_strong: "сильный",
    sound_group_verystrong: "очень сильный",
    sound_group_melody: "мелодия",
    sound_group_seasonal: "праздничный",
    sound_delikatny_dzwonek: "Мягкий звонок",
    sound_pozytywka: "Музыкальная шкатулка",
    sound_harfa: "Арфа",
    sound_dzwonek: "Звонок",
    sound_gitara: "Гитара",
    sound_marimba: "Маримба",
    sound_sygnal: "Сигнал",
    sound_fanfara: "Фанфары",
    sound_budzik: "Будильник",
    sound_sos: "SOS (азбука Морзе)",
    sound_alarm: "Тревога",
    sound_syrena: "Сирена",
    sound_wlaz_kotek: "Котёнок на заборе (польская песенка)",
    sound_kreskowka: "Весёлая мультяшная мелодия",
    sound_pop_weasel: "Pop Goes the Weasel",
    sound_boze_narodzenie: "Рождество",
    sound_wielkanoc_kurczaczek: "Пасха: цыплёнок",
    sound_wielkanoc_dzwony: "Пасха: колокола",
    volume_0: "Без звука",
    volume_1: "Тихо",
    volume_2: "Средне",
    volume_3: "Громко",
    volume_4: "Очень громко",
  },
  uk: {
    show_history: "▶ показати історію",
    hide_history: "▼ приховати історію",
    clear_all: "Очистити всю історію",
    clear_selected_weeks: "Очистити вибрані тижні",
    week_word: "Тиждень",
    no_presses: "Поки немає натискань",
    last: "Останнє",
    total: "всього",
    confirm_clear_all: "Очистити всю історію цього розкладу?",
    in_prefix: "Наступне через",
    overdue_prefix: "прострочено на",
    entity_not_found: "Сутність не знайдено",
    editor_entity_label: "Сенсор розкладу",
    editor_hint: "Тип розкладу (фіксований час / інтервал) змінюється в налаштуваннях інтеграції, а не тут.",
    editor_live_notice: "Поля нижче НЕ є частиною конфігурації картки (вони не з'являться в «Показати редактор коду») — вони зберігаються одразу в самому розкладі.",
    editor_open_settings: "Відкрити налаштування інтеграції",
    editor_section_schedule: "Деталі розкладу",
    editor_active_label: "Розклад активний",
    editor_name_label: "Назва",
    editor_description_label: "Опис",
    editor_count_label: "Скільки разів на день",
    editor_time_label: "Час {n}",
    editor_interval_label: "Через скільки годин",
    editor_advanced_label: "Додатково",
    editor_start_label: "Початок",
    editor_end_label: "Кінець (необов'язково)",
    editor_clear_end: "Прибрати дату закінчення",
    editor_window_label: "Вікно допуску (хвилини)",
    editor_save_button: "Зберегти зміни розкладу",
    editor_saved_message: "Збережено",
    editor_reset_button: "Скинути до «все вчасно»",
    editor_reset_confirm: "Позначити все, що вже настало сьогодні, як зроблене вчасно? Сьогоднішню історію цього розкладу буде замінено.",
    editor_reset_done: "Скинуто",
    error_schedule_not_active: "Цей розклад вимкнено або ще не розпочато",
    editor_generic_error: "Не вдалося зберегти зміни",
    error_nothing_to_update: "Нічого зберігати – спочатку щось змініть",
    error_invalid_name: "Введіть назву",
    error_invalid_time: "Один із часів є неправильним (формат ГГ:ХХ)",
    error_no_times: "Вкажіть принаймні один час",
    error_too_many_times: "Забагато часів (максимум 24 на день)",
    error_invalid_interval: "Інтервал має бути від 0,5 до 48 годин",
    error_invalid_datetime: "Ця дата/час є неправильними",
    error_end_before_start: "Дата закінчення має бути пізніше за дату початку",
    error_invalid_window: "Вікно допуску має бути від 1 до 240 хвилин",
    error_wrong_mode: "Це поле не підходить для режиму цього розкладу",
    inactive_label: "неактивно",
    pending_label: "ще не почалося",
    status_pending: "Ще не почалося",
    status_green: "Ви за графіком",
    status_on_plan: "Усе за планом",
    status_transition: "Наближається час",
    status_red: "ЗАРАЗ",
    status_blinking_black: "УВАГА — прострочено!",
    status_exceeded: "Зроблено забагато разів",
    status_inactive: "Вимкнено",
    status_number_blinking: "Миготливе число: останнє виконання записано поза розкладом",
    answer_dialog_title: "Що сталося о {time}?",
    answer_already_done: "A. Було зроблено, просто не записано",
    answer_do_now: "B. Не зроблено о {time}, роблю зараз",
    answer_extra: "C. Зроблено о {time}, а це додаткове виконання",
    answer_cancel: "Скасувати",
    kind_registered_late: "записано із затримкою",
    kind_outside: "ПОЗА РОЗКЛАДОМ",
    kind_extra: "ПОЗА РОЗКЛАДОМ",
    kind_missed: "ПРОПУЩЕНО",
    editor_layout_label: "Вигляд",
    layout_card: "Картка (велика)",
    layout_tile: "Плитка (як у застосунку, без історії)",
    history_dialog_title: "Історія — {name}",
    close_label: "Закрити",
    edit_label: "Змінити",
    early_title: "Ще не час: найближчий термін — {time}.",
    early_question: "Це найближче виконання, просто зроблене зараз, чи додаткове?",
    early_yes: "Найближче виконання, зроблене зараз",
    early_extra: "Додаткове виконання",
    early_confirm: "Термін {time} ще далеко. Його буде зараховано як виконаний зараз, а кнопка його пропустить (для цього терміну вона не стане червоною). Усе вірно?",
    sound_label: "Звук нагадування",
    volume_label: "Гучність нагадування",
    sound_default: "Типовий",
    preview_label: "Відтворити",
    help_label: "Довідка",
    help_title: "Довідка",
    help_toc: "Зміст",
    help_g_intro: "Вступ",
    help_g_schedules: "Розклади",
    help_g_notif: "Нагадування та налаштування",
    help_g_data: "Історія та дані",
    help_h_what: "Для чого це?",
    help_p_what: "Ця картка допомагає не забути зробити щось у потрібний час щодня, наприклад випити пігулку, погодувати кота чи випити води. Кожна така справа — це розклад із власною великою круглою кнопкою. Коли ви це зробили, натисніть кнопку.",
    help_h_colors: "Як читати кнопку",
    help_p_colors: "Велике число на кнопці показує, скільки разів ви зробили це сьогодні. Колір і слова під назвою підказують, що робити: зелений — усе гаразд, жовтий і помаранчевий — наближається час, червоний — зробіть це зараз, блимаючий чорний — ви запізнюєтесь. Якщо число блимає, останній раз записано поза планом. Червоний із чорним числом означає, що сьогодні зроблено більше разів, ніж потрібно. Сіра кнопка означає, що розклад вимкнено або він ще не почався. Опівночі число повертається до нуля.",
    help_h_press: "Як підтвердити, що ви це зробили",
    help_p_press: "Натисніть круглу кнопку, коли зробите це. Якщо ви робите це близько до призначеного часу (типово в межах півгодини раніше чи пізніше), усе гаразд. Якщо натиснете між термінами (поки нічого не потрібно), вас запитають, чи це найближче виконання, просто зроблене зараз, чи додаткове. Якщо натиснете пізніше, запитають, що сталося: A — я зробив(ла) раніше, але не записав(ла), B — не зробив(ла) і роблю зараз, C — зробив(ла) раніше, і це ще один раз. Якщо натиснути, коли нічого не потрібно, це буде записано як виконане поза планом.",
    help_h_add: "Як додати та змінити розклад",
    help_p_add: "Нові розклади додаються в Налаштування, Пристрої та служби, How Many Times Today, Налаштувати. Введіть назву (наприклад, Ліки для серця). Виберіть, як часто: у фіксований час (від 1 до 24 разів на день, щоразу у свій час) або кожні кілька годин. Вкажіть, коли починається і за потреби закінчується. Олівець на плитці (або подвійне натискання) дає змогу змінити розклад. Кнопка «Скинути до «усе вчасно»» виправляє помилку: позначає все, що сьогодні вже настало, як виконане вчасно.",
    help_h_notif: "Нагадування, звук і розмір тексту",
    help_p_notif: "У призначений час картка показує повідомлення та відтворює звук нагадування, поки відкрито панель. Якщо в загальних налаштуваннях вибрано телефон, приходить і push-сповіщення. У загальних налаштуваннях вибирають типовий звук і його гучність (кожен розклад може мати власний, у вікні редагування), розмір тексту на картках і високу контрастність.",
    help_h_history: "Історія",
    help_p_history: "Утримуйте плитку (або клацніть правою кнопкою) чи натисніть «показати історію» на великій картці. Записи поза планом і пропущені виділено жирним. Можна очистити всю історію або лише вибрані тижні.",
    help_h_privacy: "Ваші дані",
    help_p_privacy: "Усе залишається у вашому Home Assistant. Немає облікового запису й хмари, дані не збираються.",
    help_author: "Автор: {author}",
    help_version: "Версія",
    help_build: "Збірка",
    help_font: "Розмір тексту",
    help_contrast: "Висока контрастність",
    sound_group_gentle: "м'який",
    sound_group_medium: "середній",
    sound_group_strong: "сильний",
    sound_group_verystrong: "дуже сильний",
    sound_group_melody: "мелодія",
    sound_group_seasonal: "святковий",
    sound_delikatny_dzwonek: "М'який дзвіночок",
    sound_pozytywka: "Музична скринька",
    sound_harfa: "Арфа",
    sound_dzwonek: "Дзвінок",
    sound_gitara: "Гітара",
    sound_marimba: "Маримба",
    sound_sygnal: "Сигнал",
    sound_fanfara: "Фанфари",
    sound_budzik: "Будильник",
    sound_sos: "SOS (абетка Морзе)",
    sound_alarm: "Тривога",
    sound_syrena: "Сирена",
    sound_wlaz_kotek: "Кошеня на паркані (польська пісенька)",
    sound_kreskowka: "Весела мультяшна мелодія",
    sound_pop_weasel: "Pop Goes the Weasel",
    sound_boze_narodzenie: "Різдво",
    sound_wielkanoc_kurczaczek: "Великдень: курча",
    sound_wielkanoc_dzwony: "Великдень: дзвони",
    volume_0: "Без звуку",
    volume_1: "Тихо",
    volume_2: "Середньо",
    volume_3: "Голосно",
    volume_4: "Дуже голосно",
  },
  "zh-hans": {
    show_history: "▶ 显示历史",
    hide_history: "▼ 隐藏历史",
    clear_all: "清除全部历史",
    clear_selected_weeks: "清除所选周",
    week_word: "周",
    no_presses: "尚无记录",
    last: "上次",
    total: "共计",
    confirm_clear_all: "确定清除此计划的全部历史吗？",
    in_prefix: "下一次还有",
    overdue_prefix: "已超时",
    entity_not_found: "未找到实体",
    editor_entity_label: "计划传感器",
    editor_hint: "日程的类型（固定时间/间隔）请在集成设置中更改，而不是在这里。",
    editor_live_notice: "下面的字段不属于卡片配置的一部分（不会出现在\"显示代码编辑器\"中）——它们会立即保存到日程本身。",
    editor_open_settings: "打开集成设置",
    editor_section_schedule: "日程详情",
    editor_active_label: "日程已启用",
    editor_name_label: "名称",
    editor_description_label: "说明",
    editor_count_label: "每天几次",
    editor_time_label: "时间 {n}",
    editor_interval_label: "每隔多少小时",
    editor_advanced_label: "高级",
    editor_start_label: "开始",
    editor_end_label: "结束（可选）",
    editor_clear_end: "清除结束日期",
    editor_window_label: "容差窗口（分钟）",
    editor_save_button: "保存日程更改",
    editor_saved_message: "已保存",
    editor_reset_button: "重置为“全部按时”",
    editor_reset_confirm: "将今天已到期的全部标记为按时完成？该日程今天的历史将被替换。",
    editor_reset_done: "已重置",
    error_schedule_not_active: "该日程已关闭或尚未开始",
    editor_generic_error: "无法保存更改",
    error_nothing_to_update: "没有可保存的内容——请先做出修改",
    error_invalid_name: "请输入名称",
    error_invalid_time: "其中一个时间无效（格式 HH:MM）",
    error_no_times: "请至少提供一个时间",
    error_too_many_times: "时间太多（每天最多24个）",
    error_invalid_interval: "间隔必须在0.5到48小时之间",
    error_invalid_datetime: "该日期/时间无效",
    error_end_before_start: "结束日期必须晚于开始日期",
    error_invalid_window: "容差窗口必须在1到240分钟之间",
    error_wrong_mode: "此字段不适用于该日程的模式",
    inactive_label: "未启用",
    pending_label: "尚未开始",
    status_pending: "尚未开始",
    status_green: "一切按时",
    status_on_plan: "一切按计划",
    status_transition: "即将到时间",
    status_red: "现在",
    status_blinking_black: "警告——已逾期！",
    status_exceeded: "完成次数过多",
    status_inactive: "已关闭",
    status_number_blinking: "数字闪烁：上次执行记录在计划之外",
    answer_dialog_title: "{time} 发生了什么？",
    answer_already_done: "A. 已完成，只是没有记录",
    answer_do_now: "B. {time} 时没有完成，现在补做",
    answer_extra: "C. {time} 时已完成，这是额外的一次执行",
    answer_cancel: "取消",
    kind_registered_late: "延迟记录",
    kind_outside: "计划外",
    kind_extra: "计划外",
    kind_missed: "已错过",
    editor_layout_label: "外观",
    layout_card: "卡片（大）",
    layout_tile: "方块（与应用相同，无历史）",
    history_dialog_title: "历史记录 — {name}",
    close_label: "关闭",
    edit_label: "编辑",
    early_title: "还没到时间：下一个时间点是 {time}。",
    early_question: "这是即将到来的那一次、只是现在做了，还是额外的一次？",
    early_yes: "即将到来的那一次，现在做了",
    early_extra: "额外的一次",
    early_confirm: "时间点 {time} 还很远。它将被算作现在已完成，按钮会跳过它（该时间点不会变红）。确定吗？",
    sound_label: "提醒声音",
    volume_label: "提醒音量",
    sound_default: "默认",
    preview_label: "播放",
    help_label: "帮助",
    help_title: "帮助",
    help_toc: "目录",
    help_g_intro: "简介",
    help_g_schedules: "日程",
    help_g_notif: "提醒与设置",
    help_g_data: "历史与数据",
    help_h_what: "这是做什么用的？",
    help_p_what: "这张卡片帮助您每天在合适的时间记得做某件事，例如吃药、喂猫或喝水。每一件这样的事就是一个日程，有自己的大圆按钮。做完之后，点按这个按钮。",
    help_h_colors: "如何看按钮",
    help_p_colors: "按钮上的大数字表示您今天做了多少次。颜色和名称下方的文字告诉您该做什么：绿色——一切正常，黄色和橙色——时间快到了，红色——现在就做，闪烁的黑色——您已迟到。如果数字闪烁，说明最近一次是在计划之外记录的。红色加黑色数字表示今天做的次数超过了需要。灰色按钮表示该日程已关闭或尚未开始。午夜时数字归零。",
    help_h_press: "如何确认已经完成",
    help_p_press: "做完后点按圆按钮。如果在设定时间附近完成（默认前后半小时内），一切正常。如果在两个时间点之间按下（尚无待办），会询问这是即将到来的那一次、只是现在做了，还是额外的一次。如果按得较晚，会询问发生了什么：A——我之前做了但没有记录，B——我没做，现在正在做，C——我之前做了，这是额外的一次。如果在没有待办时按下，则记为计划之外完成。",
    help_h_add: "如何添加和更改日程",
    help_p_add: "新日程在 设置、设备与服务、How Many Times Today、配置 中添加。输入名称（例如“心脏药”）。选择频率：固定时间（每天 1 到 24 次，各有自己的时间）或每隔几小时。设定开始时间，必要时设定结束时间。磁贴上的铅笔（或双击）可更改日程。“重置为‘全部按时’”按钮用于纠正错误：把今天已到时间的所有事项标记为按时完成。",
    help_h_notif: "提醒、声音和文字大小",
    help_p_notif: "到设定时间，只要仪表盘打开，卡片会显示消息并播放提醒声音。如果在全局设置中选择了手机，还会收到推送通知。在全局设置中选择默认声音及其音量（每个日程可在其编辑对话框中设置自己的）、卡片文字大小和高对比度。",
    help_h_history: "历史",
    help_p_history: "长按磁贴（或右键点击），或在大卡片上点按“显示历史”。计划之外的和错过的记录以粗体显示。您可以清除全部历史，也可以只清除所选的周。",
    help_h_privacy: "您的数据",
    help_p_privacy: "一切都保留在您的 Home Assistant 中。没有账户，没有云，也不收集任何数据。",
    help_author: "作者：{author}",
    help_version: "版本",
    help_build: "构建",
    help_font: "文字大小",
    help_contrast: "高对比度",
    sound_group_gentle: "轻柔",
    sound_group_medium: "中等",
    sound_group_strong: "强",
    sound_group_verystrong: "很强",
    sound_group_melody: "旋律",
    sound_group_seasonal: "节日",
    sound_delikatny_dzwonek: "轻柔铃声",
    sound_pozytywka: "八音盒",
    sound_harfa: "竖琴",
    sound_dzwonek: "铃声",
    sound_gitara: "吉他",
    sound_marimba: "马林巴",
    sound_sygnal: "提示音",
    sound_fanfara: "号角",
    sound_budzik: "闹钟",
    sound_sos: "SOS（摩尔斯电码）",
    sound_alarm: "警报",
    sound_syrena: "警笛",
    sound_wlaz_kotek: "小猫爬上栅栏（波兰儿歌）",
    sound_kreskowka: "欢快的卡通旋律",
    sound_pop_weasel: "Pop Goes the Weasel",
    sound_boze_narodzenie: "圣诞节",
    sound_wielkanoc_kurczaczek: "复活节：小鸡",
    sound_wielkanoc_dzwony: "复活节：钟声",
    volume_0: "关闭声音",
    volume_1: "轻",
    volume_2: "中",
    volume_3: "响",
    volume_4: "很响",
  },
};

function translate(hassLanguage, key, placeholders) {
  const lang = (hassLanguage || "en").toLowerCase();
  const dict = CARD_STRINGS[lang] || CARD_STRINGS[lang.split("-")[0]] || CARD_STRINGS.en;
  let text = dict[key] ?? CARD_STRINGS.en[key] ?? key;
  if (placeholders) {
    for (const [k, v] of Object.entries(placeholders)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

// --- reminder sounds: the ogg files the integration serves (id + volume level 1-4; 0 = silence) ---
const SOUNDS_PATH = "/how_many_times_today_files/sounds";
const SOUND_IDS = ["delikatny_dzwonek", "pozytywka", "harfa", "dzwonek", "gitara", "marimba", "sygnal", "fanfara",
  "budzik", "sos", "alarm", "syrena", "wlaz_kotek", "kreskowka", "pop_weasel", "boze_narodzenie",
  "wielkanoc_kurczaczek", "wielkanoc_dzwony"];
const SOUND_GROUP_OF = { delikatny_dzwonek: "gentle", pozytywka: "gentle", harfa: "gentle", dzwonek: "medium",
  gitara: "medium", marimba: "medium", sygnal: "strong", fanfara: "strong", budzik: "strong", sos: "strong",
  alarm: "verystrong", syrena: "verystrong", wlaz_kotek: "melody", kreskowka: "melody", pop_weasel: "melody",
  boze_narodzenie: "seasonal", wielkanoc_kurczaczek: "seasonal", wielkanoc_dzwony: "seasonal" };

function colorForState(state, attrs) {
  switch (state) {
    case "green":
      return rgb(GREEN);
    case "red":
    case "exceeded":
      return rgb(RED);
    case "blinking_black":
      return rgb(BLACK);
    case "pending":
      return rgb(PENDING_GRAY);
    case "inactive":
      return rgb(INACTIVE_GRAY);
    case "transition":
    default: {
      const p = typeof attrs.color_progress === "number" ? attrs.color_progress : 0;
      return rgb(transitionColor(p));
    }
  }
}

function playSound(id, level) {
  const volume = Number(level);
  if (!id || !SOUND_IDS.includes(id) || !(volume >= 1 && volume <= 4)) return;
  try {
    const audio = new Audio(`${SOUNDS_PATH}/${id}_${Math.round(volume)}.ogg`);
    const started = audio.play();
    if (started && started.catch) started.catch(() => {}); // blocked before the first tap: not fatal
  } catch (err) {
    // audio can legitimately fail (autoplay policy before first user gesture); non-fatal
  }
}

const DOMAIN = "how_many_times_today";

class HowManyTimesTodayCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("how-many-times-today-card: 'entity' is required (the schedule's sensor entity)");
    }
    this._config = config;
    this._historyOpen = false;
    this._lastState = null;
    this._answerDialogOpen = false;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    // Home Assistant may hand over `hass` before the config (the dashboard editor's
    // preview does), so pick up the entity's state now that the config is known
    this._stateObj = this._hass ? this._hass.states[config.entity] : undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._editorEl) this._editorEl.hass = hass;
    // `hass` can arrive before setConfig(): nothing to show until the config is there
    if (!this._config) return;
    const stateObj = hass.states[this._config.entity];
    this._stateObj = stateObj;
    this._tick();
  }

  getCardSize() {
    return 3;
  }

  // Sizing hint for the "sections" dashboard layout when the card is first placed -
  // the tile is the app's card without the history, so it is a little shorter than the
  // big card (and can be made narrower).
  getGridOptions() {
    if (this._config && this._config.layout === "tile") {
      return { columns: 12, rows: 3, min_columns: 6, min_rows: 3 };
    }
    return { columns: 12, rows: 4, min_columns: 6, min_rows: 3 };
  }

  static getConfigElement() {
    return document.createElement("how-many-times-today-card-editor");
  }

  static getStubConfig(hass) {
    const match = Object.values(hass.states).find(
      (s) => s.entity_id.startsWith("sensor.") && s.attributes && s.attributes.schedule_id !== undefined
    );
    return { entity: match ? match.entity_id : "" };
  }

  _t(key, placeholders) {
    return translate(this._hass?.language, key, placeholders);
  }

  // Home Assistant's dashboard-edit mode sets this on cards that define the setter
  // (a documented Lovelace convention). An inactive schedule hides itself on the
  // normal dashboard, but while the user is rearranging cards it must still render
  // (greyed out) so it can be selected/moved/removed like any other card.
  set editMode(editMode) {
    this._editMode = editMode;
    this._tick();
  }

  connectedCallback() {
    this._interval = setInterval(() => this._tick(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
    this._closeModal();
  }

  _tick() {
    if (!this._stateObj) {
      this._render();
      return;
    }
    const state = this._stateObj.state;

    // In-app notification: triggered off the entity's own state transition into "red"
    // (every user receives state_changed updates; a raw custom-event subscription
    // would need admin rights, so it's not used here - see docs/TESTING.md).
    if (state !== this._lastState) {
      if (state === "red") {
        const attrs = this._stateObj.attributes;
        const name = attrs.name || attrs.friendly_name || this._config.entity;
        const message = attrs.description ? `${name}: ${attrs.description}` : name;
        this.dispatchEvent(
          new CustomEvent("hass-notification", {
            detail: { message },
            bubbles: true,
            composed: true,
          })
        );
      }
      if (state === "red" || state === "blinking_black") {
        playSound(this._stateObj.attributes.sound, this._stateObj.attributes.volume);
      }
      this._lastState = state;
    }

    this._render();
  }

  // The text size and the high-contrast option come from the integration's global settings
  // (the sensor's font_scale / high_contrast attributes), the same for every card.
  _appearanceStyle(attrs) {
    const scale = Number(attrs.font_scale) || 1;
    let css = "";
    if (scale !== 1) {
      css += `ha-card { font-size: ${scale}em; } .tile-circle { width: ${76 * scale}px; height: ${76 * scale}px; } .button { width: ${72 * scale}px; height: ${72 * scale}px; }`;
    }
    if (attrs.high_contrast) {
      css += `ha-card { background: #000; color: #fff; font-weight: 700; }
        .tile-description, .description, .tile-countdown, .countdown, .tile-last, .last { opacity: 1; }
        .tile-status.state-green, .plain-status.state-green { color: #69f0ae; }
        .tile-status.state-red, .tile-status.state-blinking_black, .tile-status.state-exceeded,
        .plain-status.state-red, .plain-status.state-blinking_black, .plain-status.state-exceeded { color: #ff8a80; }
        .tile-blink-note, .number-blink-note { color: #ffd54f; }
        .tile-edit, .tile-help, .help-btn, .history-toggle { color: #fff; }`;
    }
    return css ? `<style>${css}</style>` : "";
  }

  _colorFor(state, attrs) {
    return colorForState(state, attrs);
  }

  async _onPress() {
    const attrs = this._stateObj.attributes;
    if (attrs.answer_required) {
      this._openAnswerDialog();
      return;
    }
    // a little too early before the coming term: ask whether it was done ahead of time
    if (attrs.early_by_seconds != null) {
      this._openAnswerDialog("early");
      return;
    }
    if (this._stateObj.state === "inactive" || this._stateObj.state === "pending") {
      // backend would reject with translation_key "schedule_not_active" anyway;
      // nothing useful for the user to do here, so skip the round-trip
      return;
    }
    try {
      await this._hass.callService(DOMAIN, "press_schedule", {}, { entity_id: this._config.entity });
      // The service call only resolves once the backend has already written the new
      // state, but the dashboard's own "hass" push to this card can lag a tick behind -
      // pull the fresh state straight from the same hass object instead of waiting for
      // it, so the press (and an already-open history list) shows up immediately.
      this._stateObj = this._hass.states[this._config.entity] || this._stateObj;
      this._tick();
    } catch (err) {
      const code = err?.code || err?.error?.code;
      const key = err?.translation_key || err?.error?.translation_key;
      if (code === "service_validation_error" && key === "answer_required") {
        this._openAnswerDialog();
        return;
      }
      if (code === "service_validation_error" && key === "early_answer_required") {
        this._openAnswerDialog("early");
        return;
      }
      if (code === "service_validation_error" && key === "schedule_not_active") {
        return; // state changed to inactive/pending between render and click; ignore
      }
      // Fallback per the backend contract: the answer_required attribute can be up to
      // ~30s stale, so re-check it directly on any failure before giving up.
      if (this._stateObj?.attributes?.answer_required) {
        this._openAnswerDialog();
        return;
      }
      throw err;
    }
  }

  async _onAnswer(answer) {
    // "done now" for a term that is still far ahead skips it: ask once more
    const attrs = this._stateObj.attributes;
    if (answer === "done_early" && attrs.early_far) {
      const time = formatTime(attrs.next_expected_at, this._hass?.language);
      if (!confirm(this._t("early_confirm", { time }))) return;
    }
    await this._hass.callService(DOMAIN, "press_schedule", { answer }, { entity_id: this._config.entity });
    this._stateObj = this._hass.states[this._config.entity] || this._stateObj;
    if (this._config.layout === "tile") {
      this._closeModal();
    } else {
      this._answerDialogOpen = false;
    }
    this._tick();
  }

  // The big card has room to show a dialog positioned over itself; a tile does not,
  // so its dialogs (answer + history) are appended to the document body instead -
  // see _openModal(). Both share the exact same answer/press logic either way.
  // What the answer dialog asks: a press while a term is open and late (A/B/C), or a press a
  // little too early before the coming term (done ahead of time / an extra one).
  _answerParts() {
    const attrs = this._stateObj.attributes;
    if (this._answerKind === "early") {
      const time = formatTime(attrs.next_expected_at, this._hass?.language);
      return {
        title: `${this._t("early_title", { time })}<br>${this._t("early_question")}`,
        buttons: [
          ["answer-done-early", this._t("early_yes"), "done_early"],
          ["answer-extra", this._t("early_extra"), "extra"],
        ],
      };
    }
    const oldestOpenSlot = (attrs.open_slots && attrs.open_slots[0]) || null;
    const time = oldestOpenSlot ? formatTime(oldestOpenSlot.scheduled_at, this._hass?.language) : "?";
    return {
      title: this._t("answer_dialog_title", { time }),
      buttons: [
        ["answer-already-done", this._t("answer_already_done", { time }), "already_done"],
        ["answer-do-now", this._t("answer_do_now", { time }), "do_now"],
        ["answer-extra", this._t("answer_extra", { time }), "extra"],
      ],
    };
  }

  _openAnswerDialog(kind = "late") {
    this._answerKind = kind;
    if (this._config.layout === "tile") {
      const parts = this._answerParts();
      const box = this._openModal(`
        <h3>${parts.title}</h3>
        ${parts.buttons.map(([id, label]) => `<button id="${id}">${label}</button>`).join("")}
        <button id="answer-cancel">${this._t("answer_cancel")}</button>
      `);
      for (const [id, , answer] of parts.buttons) {
        box.querySelector(`#${id}`).addEventListener("click", () => this._onAnswer(answer));
      }
      box.querySelector("#answer-cancel").addEventListener("click", () => this._closeModal());
      return;
    }
    this._answerDialogOpen = true;
    this._render();
  }

  _closeAnswerDialog() {
    if (this._config.layout === "tile") {
      this._closeModal();
      return;
    }
    this._answerDialogOpen = false;
    this._render();
  }

  // A dialog appended straight to <body> (outside both the card's shadow root and
  // the dashboard's own card wrapper) so it isn't clipped to the tile's own small
  // height and isn't affected by a transformed ancestor breaking position:fixed.
  _openModal(innerHtml, wide = false) {
    this._closeModal();
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; " +
      "align-items:center; justify-content:center; z-index:1000;";
    overlay.innerHTML = `
      <style>
        .hmtt-modal-box {
          background: var(--card-background-color, white); color: var(--primary-text-color, black);
          padding: 16px; border-radius: 8px; max-width: ${wide ? 460 : 320}px; width: ${wide ? "92vw" : "auto"}; max-height: 80vh; overflow-y: auto;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4); font-family: var(--paper-font-body1_-_font-family, inherit);
        }
        .hmtt-modal-box h3 { margin: 0 0 12px 0; font-size: 1em; }
        .hmtt-modal-box button {
          display: block; width: 100%; text-align: left; padding: 8px; margin-bottom: 6px; cursor: pointer;
        }
        .hmtt-modal-box .history ul { max-height: 160px; overflow-y: auto; margin: 4px 0; padding-left: 16px; }
        .hmtt-modal-box .week-list label { display: block; }
        .hmtt-modal-box .outside { font-weight: 700; }
      </style>
      <div class="hmtt-modal-box">${innerHtml}</div>
    `;
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) this._closeModal();
    });
    document.body.appendChild(overlay);
    this._modalEl = overlay;
    return overlay.querySelector(".hmtt-modal-box");
  }

  _closeModal() {
    this._editorEl = null;
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
  }

  // Double tap / double click on the tile (or Alt+Enter): the schedule's edit dialog, the
  // same fields as the card editor, with Save and "Reset to all on time".
  _openEditDialog() {
    if (!this._hass || !this._config || !this._config.entity) return;
    const box = this._openModal('<div id="hmtt-edit-host"></div>', true);
    const editor = document.createElement("how-many-times-today-card-editor");
    box.querySelector("#hmtt-edit-host").appendChild(editor);
    editor.renderStandalone(this._hass, this._config.entity, () => this._closeModal());
    this._editorEl = editor;
  }

  // Help (the same template as the app: the version in the title bar, A- / A+ and high
  // contrast, the table of contents in a frame with groups, then the author and the build).
  _openHelpDialog() {
    const attrs = (this._stateObj && this._stateObj.attributes) || {};
    const sizes = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
    let index = sizes.indexOf(Number(attrs.font_scale));
    if (index < 0) index = 1;
    let contrast = !!attrs.high_contrast;
    const groups = [
      ["help_g_intro", ["what", "colors"]],
      ["help_g_schedules", ["press", "add"]],
      ["help_g_notif", ["notif"]],
      ["help_g_data", ["history", "privacy"]],
    ];
    const box = this._openModal('<div id="hmtt-help"></div>', true);
    const host = box.querySelector("#hmtt-help");
    const paint = () => {
      const colors = contrast ? "background:#000;color:#fff;" : "";
      host.innerHTML = `
        <style>
          #hmtt-help .hbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
          #hmtt-help .hbar b { font-size: 1.05em; }
          #hmtt-help .hbtn { display: inline-block; width: auto; margin: 0 0 0 4px; padding: 4px 8px; }
          #hmtt-help nav { border: 1px solid var(--divider-color, #888); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
          #hmtt-help nav ul { margin: 2px 0 6px; padding-left: 18px; }
          #hmtt-help nav a { cursor: pointer; text-decoration: underline; }
          #hmtt-help h4 { margin: 14px 0 4px; }
          #hmtt-help p { margin: 0 0 8px; line-height: 1.45; }
          #hmtt-help .hfoot { margin-top: 12px; opacity: 0.85; font-size: 0.9em; }
        </style>
        <div style="${colors} font-size:${sizes[index]}em; ${contrast ? "font-weight:700;" : ""} padding:8px; border-radius:6px;">
          <div class="hbar">
            <b>${this._t("help_title")} · How Many Times Today ${attrs.version || ""}</b>
            <span>
              <button type="button" class="hbtn" id="h-minus" aria-label="${this._t("help_font")} -">A-</button>
              <button type="button" class="hbtn" id="h-plus" aria-label="${this._t("help_font")} +">A+</button>
              <button type="button" class="hbtn" id="h-contrast" aria-label="${this._t("help_contrast")}" title="${this._t("help_contrast")}">◐</button>
            </span>
          </div>
          <nav><b>${this._t("help_toc")}</b>
            ${groups
              .map(
                ([g, ids]) => `<div><i>${this._t(g)}</i><ul>${ids
                  .map((id) => `<li><a data-target="hmtt-help-${id}">${this._t("help_h_" + id)}</a></li>`)
                  .join("")}</ul></div>`
              )
              .join("")}
          </nav>
          ${groups
            .flatMap(([, ids]) => ids)
            .map((id) => `<h4 id="hmtt-help-${id}">${this._t("help_h_" + id)}</h4><p>${this._t("help_p_" + id)}</p>`)
            .join("")}
          <div class="hfoot">${this._t("help_author", { author: attrs.author || "Jacek Bieganowski" })}<br>
            ${this._t("help_version")} ${attrs.version || "?"}${attrs.build ? ` · ${this._t("help_build")} ${attrs.build}` : ""}</div>
          <button type="button" id="h-close" style="margin-top:12px">${this._t("close_label")}</button>
        </div>
      `;
      host.querySelector("#h-minus").addEventListener("click", () => {
        index = Math.max(0, index - 1);
        paint();
      });
      host.querySelector("#h-plus").addEventListener("click", () => {
        index = Math.min(sizes.length - 1, index + 1);
        paint();
      });
      host.querySelector("#h-contrast").addEventListener("click", () => {
        contrast = !contrast;
        paint();
      });
      host.querySelector("#h-close").addEventListener("click", () => this._closeModal());
      for (const link of host.querySelectorAll("nav a")) {
        link.addEventListener("click", () => {
          const target = host.querySelector(`#${link.dataset.target}`);
          if (target) target.scrollIntoView({ block: "start" });
        });
      }
    };
    paint();
  }

  _onClearAll() {
    if (!confirm(this._t("confirm_clear_all"))) return;
    this._hass.callService(DOMAIN, "clear_history", {}, { entity_id: this._config.entity });
  }

  _onClearWeeks(weeks) {
    if (!weeks.length) return;
    this._hass.callService(DOMAIN, "clear_history", { weeks }, { entity_id: this._config.entity });
  }

  _toggleHistory() {
    this._historyOpen = !this._historyOpen;
    this._render();
  }

  _openHistoryDialog() {
    const attrs = this._stateObj.attributes;
    const name = attrs.name || attrs.friendly_name || this._config.entity;
    const history = attrs.history || [];
    const weeks = [...new Set(history.map((h) => isoWeekOf(new Date(h.timestamp))))].reverse();
    const box = this._openModal(`
      <h3>${this._t("history_dialog_title", { name })}</h3>
      ${this._renderHistory(history, weeks, this._hass?.language)}
      <button id="modal-close">${this._t("close_label")}</button>
    `);
    box.querySelector("#modal-close").addEventListener("click", () => this._closeModal());
    const clearAllBtn = box.querySelector("#clear-all");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => {
        this._onClearAll();
        this._closeModal();
      });
    }
    const clearWeeksBtn = box.querySelector("#clear-weeks");
    if (clearWeeksBtn) {
      clearWeeksBtn.addEventListener("click", () => {
        const checked = [...box.querySelectorAll(".week-list input:checked")].map((el) => el.value);
        this._onClearWeeks(checked);
        this._closeModal();
      });
    }
  }

  _closeHistoryDialog() {
    this._closeModal();
  }

  // "Tile" layout (opt-in via layout: tile): the same content as the card in the Android
  // app - the coloured circle with the number, name, description, the state sentence,
  // the blinking-number note, the countdown, "last / total" and the pencil - but no
  // history list. Tap presses the schedule (same answer dialog as the big card), a double
  // tap or the pencil opens the edit dialog, and a long press, right click or
  // Shift+Enter opens the history as a dialog.
  _renderTile(state) {
    const root = this.shadowRoot;
    const locale = this._hass?.language;
    const attrs = this._stateObj.attributes;
    const name = attrs.name || attrs.friendly_name || this._config.entity;
    const color = this._colorFor(state, attrs);
    const numberColor = state === "exceeded" ? "#000" : "#fff";
    const bigNumber = state === "inactive" ? null : attrs.count_today ?? 0;
    const plainStatusKey = plainStatusKeyOf(state, attrs);
    const plainStatus = this._t(plainStatusKey);
    const notClickable = state === "inactive" || state === "pending";
    const ariaLabel = `${name}: ${plainStatus}`;
    // like the app: while the term is due NOW (red) the next one is not announced
    const seconds = attrs.seconds_to_next_expected;
    const countdownLabel =
      state === "inactive" || state === "pending" || state === "red" || seconds == null
        ? ""
        : seconds >= 0
        ? `${this._t("in_prefix")} ${formatDuration(seconds)}`
        : `${this._t("overdue_prefix")} ${formatDuration(seconds)}`;

    root.innerHTML = `
      <style>
        ha-card.tile { padding: 16px; position: relative; box-sizing: border-box; height: 100%; }
        .tile-tap-target {
          display: flex; align-items: flex-start; gap: 16px; cursor: pointer; outline: none;
          border-radius: 8px; touch-action: manipulation;
        }
        .tile-tap-target.not-clickable { cursor: default; }
        .tile-tap-target:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        .tile-circle {
          width: 76px; height: 76px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: 3px solid rgba(255,255,255,0.5); box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          background: ${color};
        }
        .tile-circle.blinking-bg { animation: tile-blink-bg 1s step-start infinite; }
        @keyframes tile-blink-bg { 50% { background: ${BLACK_BLINK}; } }
        @keyframes tile-blink-numcol { 50% { color: #000; } }
        .tile-circle.blinking-bg .tile-number { animation: tile-blink-numcol 1s step-start infinite; }
        .tile-circle.blinking-bg .tile-number.blinking-num { animation: tile-blink-numcol 1s step-start infinite, tile-blink-num 0.8s step-start infinite; }
        .tile-number { font-size: 1.7em; font-weight: 700; color: ${numberColor}; line-height: 1; }
        .tile-number.blinking-num { animation: tile-blink-num 0.8s step-start infinite; }
        @keyframes tile-blink-num { 50% { opacity: 0.15; } }
        .tile-inactive-label { font-size: 0.7em; font-weight: 600; color: #fff; text-align: center; }
        .tile-info { flex: 1; min-width: 0; }
        .tile-name { font-size: 1.1em; font-weight: 600; }
        .tile-description { font-size: 0.85em; opacity: 0.7; }
        .tile-status { font-size: 1.1em; font-weight: 700; margin-top: 2px; }
        .tile-status.state-red, .tile-status.state-blinking_black, .tile-status.state-exceeded { color: #c62828; }
        .tile-status.state-green { color: #2e7d32; }
        .tile-blink-note { font-size: 1em; font-weight: 700; color: #a85c00; margin-top: 2px; }
        .tile-countdown { font-size: 0.95em; opacity: 0.8; }
        .tile-last { font-size: 0.85em; opacity: 0.6; }
        .tile-edit {
          flex-shrink: 0; align-self: flex-start; background: none; border: none; cursor: pointer;
          font-size: 1.4em; line-height: 1; padding: 0 0 8px 8px; color: var(--primary-text-color, inherit);
        }
      </style>
      ${this._appearanceStyle(attrs)}
      <ha-card class="tile">
        <div class="tile-tap-target ${notClickable ? "not-clickable" : ""}" id="tap-target" tabindex="0" role="button" aria-label="${ariaLabel}">
          <div class="tile-circle ${state === "blinking_black" ? "blinking-bg" : ""}">
            ${
              bigNumber === null
                ? `<div class="tile-inactive-label">${this._t("inactive_label")}</div>`
                : `<div class="tile-number ${attrs.number_blinking ? "blinking-num" : ""}">${bigNumber}</div>`
            }
          </div>
          <div class="tile-info">
            <div class="tile-name">${name}</div>
            ${attrs.description ? `<div class="tile-description">${attrs.description}</div>` : ""}
            <div class="tile-status state-${state}">${plainStatus}</div>
            ${attrs.number_blinking ? `<div class="tile-blink-note">${this._t("status_number_blinking")}</div>` : ""}
            ${countdownLabel ? `<div class="tile-countdown">${countdownLabel}</div>` : ""}
            <div class="tile-last">${this._t("last")}: ${formatTime(attrs.last_pressed_at, locale)} · ${this._t("total")}: ${attrs.count_today ?? 0}/${attrs.planned_count ?? "?"}</div>
          </div>
          <button type="button" class="tile-edit" id="edit-btn" aria-label="${this._t("edit_label")}" title="${this._t("edit_label")}">✎</button>
          <button type="button" class="tile-edit tile-help" id="help-btn" aria-label="${this._t("help_label")}" title="${this._t("help_label")}">?</button>
        </div>
      </ha-card>
    `;

    const tapTarget = root.getElementById("tap-target");
    const HOLD_MS = 550;
    const DOUBLE_TAP_MS = 320;
    let holdTimer = null;
    let holdTriggered = false;
    const clearHoldTimer = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    const startHold = () => {
      holdTriggered = false;
      clearHoldTimer();
      holdTimer = setTimeout(() => {
        holdTriggered = true;
        this._openHistoryDialog();
      }, HOLD_MS);
    };

    // the pencil is its own control: it must not also count as a tap on the tile
    const editBtn = root.getElementById("edit-btn");
    const helpBtn = root.getElementById("help-btn");
    for (const button of [editBtn, helpBtn]) {
      for (const type of ["pointerdown", "pointerup", "keydown", "contextmenu"]) {
        button.addEventListener(type, (ev) => ev.stopPropagation());
      }
    }
    editBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openEditDialog();
    });
    helpBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openHelpDialog();
    });

    tapTarget.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      startHold();
    });
    tapTarget.addEventListener("pointerup", (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) {
        clearHoldTimer();
        return;
      }
      const wasHold = holdTriggered;
      clearHoldTimer();
      if (wasHold) return;
      // One tap presses, but only after a short wait: a second tap inside it is a
      // double tap that opens the edit dialog instead of pressing twice. The state is
      // kept on the card because the tile is redrawn every second.
      const now = Date.now();
      if (this._pendingPress && now - this._lastTapAt < DOUBLE_TAP_MS) {
        clearTimeout(this._pendingPress);
        this._pendingPress = null;
        this._lastTapAt = 0;
        this._openEditDialog();
        return;
      }
      this._lastTapAt = now;
      this._pendingPress = setTimeout(() => {
        this._pendingPress = null;
        this._onPress();
      }, DOUBLE_TAP_MS);
    });
    tapTarget.addEventListener("pointerleave", clearHoldTimer);
    tapTarget.addEventListener("pointercancel", clearHoldTimer);
    tapTarget.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      this._openHistoryDialog();
    });
    tapTarget.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.shiftKey) {
        ev.preventDefault();
        this._openHistoryDialog();
      } else if (ev.key === "Enter" && ev.altKey) {
        ev.preventDefault();
        this._openEditDialog();
      } else if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
        ev.preventDefault();
        this._onPress();
      }
    });
  }

  _render() {
    const root = this.shadowRoot;
    if (!this._stateObj) {
      this.hidden = false;
      root.innerHTML = `<ha-card><div class="placeholder">${this._t("entity_not_found")}: ${this._config.entity}</div></ha-card>`;
      return;
    }

    const state = this._stateObj.state;
    // An inactive schedule shouldn't clutter the normal dashboard - it's only
    // managed from the integration's own options (Settings), not from here.
    // While the dashboard itself is being edited (cards moved/resized), the card
    // must stay visible as a grey placeholder so it remains selectable.
    this.hidden = state === "inactive" && !this._editMode;

    if (this._config.layout === "tile") {
      this._renderTile(state);
      return;
    }

    const locale = this._hass?.language;
    const attrs = this._stateObj.attributes;
    const name = attrs.name || attrs.friendly_name || this._config.entity;
    const color = this._colorFor(state, attrs);
    const seconds = attrs.seconds_to_next_expected;
    const countdownLabel =
      state === "inactive" || state === "pending" || seconds == null
        ? ""
        : seconds >= 0
        ? `${this._t("in_prefix")} ${formatDuration(seconds)}`
        : `${this._t("overdue_prefix")} ${formatDuration(seconds)}`;

    const history = attrs.history || [];
    const weeks = [...new Set(history.map((h) => isoWeekOf(new Date(h.timestamp))))].reverse();

    const numberColor = state === "exceeded" ? "#000" : "#fff";
    const bigNumber = state === "inactive" ? null : attrs.count_today ?? 0;
    // Plain-language explanation of the current state, shown big and bold so the
    // card is understandable without having to learn what each color means
    // (important for elderly users in particular) - every state the card can be
    // in while actively running has one of these, nothing is left unexplained.
    const plainStatusKey = plainStatusKeyOf(state, attrs);
    const plainStatus = this._t(plainStatusKey);

    root.innerHTML = `
      <style>
        ha-card { padding: 16px; position: relative; }
        .help-btn { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          border: 1px solid var(--divider-color, #ccc); background: none; color: var(--primary-text-color, inherit); font-weight: 700; }
        .row { display: flex; align-items: center; gap: 16px; }
        .button {
          width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: 3px solid rgba(255,255,255,0.5);
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          background: ${color};
        }
        .button.not-clickable { cursor: default; }
        .button.blinking-bg { animation: blink-bg 1s step-start infinite; }
        @keyframes blink-bg { 50% { background: ${BLACK_BLINK}; } }
        @keyframes blink-numcol { 50% { color: #000; } }
        .button.blinking-bg .number { animation: blink-numcol 1s step-start infinite; }
        .button.blinking-bg .number.blinking-num { animation: blink-numcol 1s step-start infinite, blink-num 0.8s step-start infinite; }
        .number { font-size: 1.6em; font-weight: 700; color: ${numberColor}; line-height: 1; }
        .number.blinking-num { animation: blink-num 0.8s step-start infinite; }
        @keyframes blink-num { 50% { opacity: 0.15; } }
        .inactive-label { font-size: 0.7em; font-weight: 600; color: #fff; text-align: center; }
        .info { flex: 1; }
        .name { font-size: 1.1em; font-weight: 600; }
        .description { font-size: 0.85em; opacity: 0.7; }
        .plain-status { font-size: 1.15em; font-weight: 700; margin-top: 2px; }
        .plain-status.state-red, .plain-status.state-blinking_black, .plain-status.state-exceeded {
          color: #c62828;
        }
        .plain-status.state-green { color: #2e7d32; }
        .number-blink-note { font-size: 1.05em; font-weight: 700; color: #a85c00; margin-top: 2px; }
        .countdown { font-size: 0.95em; opacity: 0.8; }
        .last { font-size: 0.85em; opacity: 0.6; }
        .history-toggle { cursor: pointer; font-size: 0.85em; margin-top: 8px; opacity: 0.7; }
        .history { margin-top: 8px; font-size: 0.85em; }
        .history ul { max-height: 160px; overflow-y: auto; margin: 4px 0; padding-left: 16px; }
        .history button { margin-right: 8px; margin-top: 4px; }
        .week-list label { display: block; }
        .outside { font-weight: 700; }
        .dialog-backdrop {
          position: absolute; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 10;
          border-radius: inherit;
        }
        .dialog-box {
          background: var(--card-background-color, white); color: var(--primary-text-color, black);
          padding: 16px; border-radius: 8px; max-width: 320px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .dialog-box h3 { margin: 0 0 12px 0; font-size: 1em; }
        .dialog-box button { display: block; width: 100%; text-align: left; padding: 8px; margin-bottom: 6px; cursor: pointer; }
      </style>
      ${this._appearanceStyle(attrs)}
      <ha-card>
        <button type="button" class="help-btn" id="help-btn" aria-label="${this._t("help_label")}" title="${this._t("help_label")}">?</button>
        <div class="row">
          <div class="button ${state === "blinking_black" ? "blinking-bg" : ""} ${state === "inactive" || state === "pending" ? "not-clickable" : ""}" id="btn">
            ${
              bigNumber === null
                ? `<div class="inactive-label">${this._t("inactive_label")}</div>`
                : `<div class="number ${attrs.number_blinking ? "blinking-num" : ""}">${bigNumber}</div>`
            }
          </div>
          <div class="info">
            <div class="name">${name}</div>
            ${attrs.description ? `<div class="description">${attrs.description}</div>` : ""}
            <div class="plain-status state-${state}">${plainStatus}</div>
            ${attrs.number_blinking ? `<div class="number-blink-note">${this._t("status_number_blinking")}</div>` : ""}
            ${countdownLabel ? `<div class="countdown">${countdownLabel}</div>` : ""}
            <div class="last">${this._t("last")}: ${formatTime(attrs.last_pressed_at, locale)} · ${this._t("total")}: ${attrs.count_today ?? 0}/${attrs.planned_count ?? "?"}</div>
          </div>
        </div>
        <div class="history-toggle" id="toggle">${this._historyOpen ? this._t("hide_history") : this._t("show_history")}</div>
        ${this._historyOpen ? this._renderHistory(history, weeks, locale) : ""}
        ${this._answerDialogOpen ? this._renderAnswerDialog() : ""}
      </ha-card>
    `;

    root.getElementById("btn").addEventListener("click", () => this._onPress());
    root.getElementById("help-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openHelpDialog();
    });
    root.getElementById("toggle").addEventListener("click", () => this._toggleHistory());

    if (this._historyOpen) {
      const clearAllBtn = root.getElementById("clear-all");
      if (clearAllBtn) clearAllBtn.addEventListener("click", () => this._onClearAll());
      const clearWeeksBtn = root.getElementById("clear-weeks");
      if (clearWeeksBtn) {
        clearWeeksBtn.addEventListener("click", () => {
          const checked = [...root.querySelectorAll(".week-list input:checked")].map((el) => el.value);
          this._onClearWeeks(checked);
        });
      }
    }

    if (this._answerDialogOpen) {
      for (const [id, , answer] of this._answerParts().buttons) {
        root.getElementById(id)?.addEventListener("click", () => this._onAnswer(answer));
      }
      root.getElementById("answer-cancel")?.addEventListener("click", () => this._closeAnswerDialog());
    }
  }

  _renderAnswerDialog() {
    const parts = this._answerParts();
    return `
      <div class="dialog-backdrop">
        <div class="dialog-box">
          <h3>${parts.title}</h3>
          ${parts.buttons.map(([id, label]) => `<button id="${id}">${label}</button>`).join("")}
          <button id="answer-cancel">${this._t("answer_cancel")}</button>
        </div>
      </div>
    `;
  }

  _historyLabel(entry) {
    switch (entry.kind) {
      case "registered_late":
        return this._t("kind_registered_late");
      case "outside":
      case "extra":
        return `<span class="outside">${this._t("kind_outside")}</span>`;
      case "missed":
        return `<span class="outside">${this._t("kind_missed")}</span>`;
      case "on_schedule":
      default:
        return "";
    }
  }

  _renderHistory(history, weeks, locale) {
    const items = history
      .slice()
      .reverse()
      .map((h) => {
        const label = this._historyLabel(h);
        const time = formatTime(h.timestamp, locale);
        return `<li>${label ? label + " - " : ""}${time}</li>`;
      })
      .join("");
    const weekCheckboxes = weeks
      .map((w) => `<label><input type="checkbox" value="${w}"> ${this._t("week_word")} ${formatIsoWeek(w, locale)}</label>`)
      .join("");
    return `
      <div class="history">
        <ul>${items || `<li><em>${this._t("no_presses")}</em></li>`}</ul>
        <button id="clear-all">${this._t("clear_all")}</button>
        ${
          weeks.length
            ? `<div class="week-list">${weekCheckboxes}<button id="clear-weeks">${this._t("clear_selected_weeks")}</button></div>`
            : ""
        }
      </div>
    `;
  }
}

const cardOutcome = defineOrUpgrade("how-many-times-today-card", HowManyTimesTodayCard);

// --- visual card editor: entity picker restricted to this integration's own
// schedule sensors (identified by the schedule_id attribute), filled with the
// Lovelace UI editor instead of hand-written YAML ---
class HowManyTimesTodayCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    if (this._standalone) {
      this._hass = hass; // the form is built once; never rebuilt under the user's typing
      return;
    }
    const firstTime = !this._hass;
    this._hass = hass;
    if (this._picker) {
      this._picker.hass = hass;
      // Only build the schedule-edit form once per entity selection, not on every
      // hass update - otherwise unrelated state changes elsewhere in HA would wipe
      // out whatever the user is in the middle of typing.
      if (firstTime) this._renderScheduleForm();
    } else {
      this._render();
    }
  }

  _styles() {
    return `
      <style>
        .wrap { padding: 12px 0; }
        .hint { margin: 16px 0 8px; color: var(--secondary-text-color); line-height: 1.4; }
        .hint-link { color: var(--primary-color); font-weight: 500; }
        .field { margin: 12px 0; }
        .field label { display: block; font-size: 0.9em; margin-bottom: 4px; color: var(--secondary-text-color); }
        .field input, .field select {
          width: 100%; box-sizing: border-box; padding: 8px; font-size: 1em;
          border: 1px solid var(--divider-color, #ccc); border-radius: 4px;
          background: var(--card-background-color, white); color: var(--primary-text-color, black);
        }
        .toggle-row { display: flex; align-items: center; gap: 8px; }
        .toggle-row input[type=checkbox] { width: 20px; height: 20px; }
        .toggle-row label { margin: 0; font-size: 1em; color: var(--primary-text-color, black); }
        .count-row { display: flex; align-items: center; gap: 8px; }
        .count-row label { margin: 0; }
        .count-row input[type=number] { width: 80px; }
        .times-list { margin-top: 8px; }
        .time-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .time-row label { margin: 0; min-width: 90px; font-size: 0.9em; color: var(--secondary-text-color); }
        details.advanced { margin-top: 16px; border-top: 1px solid var(--divider-color, #ccc); padding-top: 8px; }
        details.advanced summary { cursor: pointer; font-weight: 600; }
        #f-preview, details.advanced button {
          margin-top: 4px; padding: 6px 10px; cursor: pointer;
          border: 1px solid var(--divider-color, #ccc); border-radius: 4px; background: none;
          color: var(--primary-text-color, black);
        }
        .save-row { margin-top: 20px; }
        .save-button {
          width: 100%; padding: 14px; font-size: 1.05em; font-weight: 700;
          background: var(--primary-color); color: var(--text-primary-color, white);
          border: none; border-radius: 6px; cursor: pointer;
        }
        .save-button:disabled { opacity: 0.6; cursor: default; }
        .save-status { margin-top: 10px; font-weight: 600; }
        .save-status.ok { color: #2e7d32; }
        .save-status.err { color: #c62828; }
        .extra-row { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .secondary-button {
          width: 100%; padding: 10px; font-size: 1em; cursor: pointer; border-radius: 6px;
          border: 1px solid var(--divider-color, #ccc); background: none; color: var(--primary-text-color, black);
        }
        .secondary-button:disabled { opacity: 0.6; cursor: default; }
        h3.section { font-size: 1em; margin: 20px 0 4px; }
        .live-notice {
          margin: 16px 0; padding: 10px 12px; border-radius: 6px; font-size: 0.85em; line-height: 1.4;
          background: var(--warning-color, #fff3cd); color: #7a5b00; border: 1px solid #e0c36a;
        }
      </style>
    `;
  }

  // Used by the card itself (tile double tap): only the schedule form, in a dialog,
  // with a Close button - no entity picker or layout choice.
  renderStandalone(hass, entityId, onClose) {
    this._standalone = true;
    this._onClose = onClose;
    this._hass = hass;
    this._config = { entity: entityId };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `${this._styles()}<div class="wrap"></div>`;
    const formContainer = document.createElement("div");
    this._formContainer = formContainer;
    this.shadowRoot.querySelector(".wrap").appendChild(formContainer);
    this._renderScheduleForm();
  }

  _entityFilter(stateObj) {
    return !!(stateObj.attributes && stateObj.attributes.schedule_id !== undefined);
  }

  _t(key, placeholders) {
    return translate(this._hass?.language, key, placeholders);
  }

  _render() {
    // Home Assistant sets `hass` before the config on a fresh editor element, so both
    // may be missing on the first call; render once the config has arrived
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });

    this.shadowRoot.innerHTML = `${this._styles()}<div class="wrap"></div>`;

    const wrap = this.shadowRoot.querySelector(".wrap");

    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = this._config.entity || "";
    picker.label = translate(this._hass.language, "editor_entity_label");
    picker.entityFilter = this._entityFilter;
    picker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this._config = { ...this._config, entity: ev.detail.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
      this._renderScheduleForm();
    });

    this._picker = picker;
    wrap.appendChild(picker);

    // Appearance (big card vs compact tile) is true card config, like the entity
    // above - unlike everything below the hint, which is live schedule data.
    const layoutField = document.createElement("div");
    layoutField.className = "field";
    const layoutLabel = document.createElement("label");
    layoutLabel.textContent = this._t("editor_layout_label");
    const layoutSelect = document.createElement("select");
    layoutSelect.id = "f-layout";
    layoutSelect.innerHTML = `
      <option value="card">${this._t("layout_card")}</option>
      <option value="tile">${this._t("layout_tile")}</option>
    `;
    layoutSelect.value = this._config.layout === "tile" ? "tile" : "card";
    layoutSelect.addEventListener("change", (ev) => {
      this._config = { ...this._config, layout: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });
    layoutField.appendChild(layoutLabel);
    layoutField.appendChild(layoutSelect);
    wrap.appendChild(layoutField);

    // Only the schedule's TYPE (fixed times vs interval) still requires the
    // integration's own settings - everything else is editable right here below
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = translate(this._hass.language, "editor_hint");
    const link = document.createElement("a");
    link.className = "hint-link";
    link.href = "/config/integrations/integration/how_many_times_today";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = translate(this._hass.language, "editor_open_settings");
    wrap.appendChild(hint);
    wrap.appendChild(link);

    const formContainer = document.createElement("div");
    this._formContainer = formContainer;
    wrap.appendChild(formContainer);

    this._renderScheduleForm();
  }

  _renderScheduleForm() {
    const container = this._formContainer;
    if (!container) return;
    const entityId = this._config.entity;
    const stateObj = entityId && this._hass ? this._hass.states[entityId] : null;
    if (!stateObj) {
      container.innerHTML = "";
      return;
    }
    const attrs = stateObj.attributes;
    const mode = attrs.mode;

    // start_at/end_at are ISO strings already in HA's own timezone (not the
    // browser's) - slicing the digits directly gives HA's wall-clock time with no
    // conversion, so it's correct regardless of what timezone the browser is in.
    // (A `new Date(iso).getHours()` round-trip would silently shift the time by
    // the browser/HA offset - caught live when they differed by 2 hours.)
    const toLocalInputValue = (iso) => (iso ? String(iso).slice(0, 16) : "");

    const times = attrs.times || [];
    const initialCount = mode === "fixed_times" ? Math.max(1, times.length) : 1;

    const startInitial = toLocalInputValue(attrs.start_at);
    const endInitial = toLocalInputValue(attrs.end_at);

    container.innerHTML = `
      ${this._standalone ? "" : `<div class="live-notice">${this._t("editor_live_notice")}</div>`}
      <h3 class="section">${this._t("editor_section_schedule")}</h3>
      <div class="field">
        <label>${this._t("editor_name_label")}</label>
        <input type="text" id="f-name" value="${(attrs.name || "").replace(/"/g, "&quot;")}">
      </div>
      <div class="field">
        <label>${this._t("editor_description_label")}</label>
        <input type="text" id="f-description" value="${(attrs.description || "").replace(/"/g, "&quot;")}">
      </div>
      <div class="field toggle-row">
        <input type="checkbox" id="f-active" ${attrs.active ? "checked" : ""}>
        <label for="f-active">${this._t("editor_active_label")}</label>
      </div>
      <div class="field">
        <label>${this._t("sound_label")}</label>
        <select id="f-sound">
          <option value="default">${this._t("sound_default")}</option>
          ${SOUND_IDS.map((id) => `<option value="${id}" ${attrs.own_sound === id ? "selected" : ""}>${this._t("sound_" + id)} · ${this._t("sound_group_" + SOUND_GROUP_OF[id])}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>${this._t("volume_label")}</label>
        <select id="f-volume">
          <option value="default">${this._t("sound_default")}</option>
          ${[0, 1, 2, 3, 4].map((v) => `<option value="${v}" ${attrs.own_volume === v ? "selected" : ""}>${this._t("volume_" + v)}</option>`).join("")}
        </select>
        <button type="button" id="f-preview">▶ ${this._t("preview_label")}</button>
      </div>
      ${
        mode === "fixed_times"
          ? `
            <div class="field count-row">
              <label>${this._t("editor_count_label")}</label>
              <input type="number" id="f-count" min="1" max="24" step="1" value="${initialCount}">
            </div>
            <div class="times-list" id="f-times-list"></div>
          `
          : `
            <div class="field">
              <label>${this._t("editor_interval_label")}</label>
              <input type="number" id="f-interval" min="0.5" max="48" step="0.5" value="${attrs.interval_hours ?? 12}">
            </div>
          `
      }
      <details class="advanced">
        <summary>${this._t("editor_advanced_label")}</summary>
        <div class="field">
          <label>${this._t("editor_start_label")}</label>
          <input type="datetime-local" id="f-start" value="${startInitial}" data-initial="${startInitial}">
        </div>
        <div class="field">
          <label>${this._t("editor_end_label")}</label>
          <input type="datetime-local" id="f-end" value="${endInitial}" data-initial="${endInitial}">
          <button type="button" id="f-clear-end">${this._t("editor_clear_end")}</button>
        </div>
        <div class="field">
          <label>${this._t("editor_window_label")}</label>
          <input type="number" id="f-window" min="1" max="240" step="1" value="${attrs.window_minutes ?? 30}">
        </div>
      </details>
      <div class="save-row">
        <button type="button" class="save-button" id="f-save">${this._t("editor_save_button")}</button>
        <div class="save-status" id="f-status"></div>
      </div>
      <div class="extra-row">
        <button type="button" class="secondary-button" id="f-reset">${this._t("editor_reset_button")}</button>
        ${this._standalone ? `<button type="button" class="secondary-button" id="f-close">${this._t("close_label")}</button>` : ""}
      </div>
    `;

    if (mode === "fixed_times") {
      this._renderTimesList(times.length ? times : ["09:00"]);
      container.querySelector("#f-count").addEventListener("input", (ev) => {
        const n = Math.max(1, Math.min(24, parseInt(ev.target.value, 10) || 1));
        const current = this._currentTimesValues();
        while (current.length < n) current.push("09:00");
        current.length = n;
        this._renderTimesList(current);
      });
    }

    container.querySelector("#f-clear-end").addEventListener("click", () => {
      container.querySelector("#f-end").value = "";
    });

    // listen to the chosen sound (the default one when "Default" is chosen)
    container.querySelector("#f-preview").addEventListener("click", () => {
      const chosenSound = container.querySelector("#f-sound").value;
      const chosenVolume = container.querySelector("#f-volume").value;
      playSound(
        chosenSound === "default" ? attrs.default_sound : chosenSound,
        chosenVolume === "default" ? attrs.default_volume : Number(chosenVolume)
      );
    });

    container.querySelector("#f-save").addEventListener("click", () => this._onSave(mode));
    container.querySelector("#f-reset").addEventListener("click", () => this._onReset());
    const closeBtn = container.querySelector("#f-close");
    if (closeBtn) closeBtn.addEventListener("click", () => this._onClose && this._onClose());

    // Active/inactive takes effect immediately (it's a different backend service
    // than the rest of the form, not something that waits for "Save")
    const activeToggle = container.querySelector("#f-active");
    activeToggle.addEventListener("change", async (ev) => {
      const checkbox = ev.target;
      const newValue = checkbox.checked;
      checkbox.disabled = true;
      try {
        await this._hass.callService(
          DOMAIN,
          "set_schedule_active",
          { active: newValue },
          { entity_id: this._config.entity }
        );
      } catch (err) {
        checkbox.checked = !newValue; // revert the visible toggle on failure
      } finally {
        checkbox.disabled = false;
      }
    });
  }

  _renderTimesList(times) {
    const list = this._formContainer.querySelector("#f-times-list");
    if (!list) return;
    list.innerHTML = times
      .map(
        (t, i) => `
        <div class="time-row">
          <label>${this._t("editor_time_label", { n: i + 1 })}</label>
          <input type="time" class="f-time" value="${t}">
        </div>
      `
      )
      .join("");
  }

  _currentTimesValues() {
    return [...this._formContainer.querySelectorAll(".f-time")].map((el) => el.value || "09:00");
  }

  // HA's own error text is not localized, so the translation key is mapped here.
  _errorMessage(err) {
    const key = err?.translation_key || err?.error?.translation_key;
    const errorKey = key ? `error_${key}` : null;
    if (errorKey && CARD_STRINGS.en[errorKey]) return this._t(errorKey);
    return err?.message || err?.error?.message || this._t("editor_generic_error");
  }

  // "Reset to all on time": everything that has already come due today counts as done
  // on time (today's history is rewritten, see the reset_schedule service).
  async _onReset() {
    const container = this._formContainer;
    const status = container.querySelector("#f-status");
    const button = container.querySelector("#f-reset");
    if (!confirm(this._t("editor_reset_confirm"))) return;
    status.textContent = "";
    status.className = "save-status";
    button.disabled = true;
    try {
      await this._hass.callService(DOMAIN, "reset_schedule", {}, { entity_id: this._config.entity });
      status.textContent = this._t("editor_reset_done");
      status.className = "save-status ok";
    } catch (err) {
      status.textContent = this._errorMessage(err);
      status.className = "save-status err";
    } finally {
      button.disabled = false;
    }
  }

  async _onSave(mode) {
    const container = this._formContainer;
    // Two identical save buttons (top, right after name/description so it's visible
    // without scrolling past the times list; bottom, after the advanced section) -
    // both trigger the exact same save, reading every field regardless of which one
    // was clicked, and both show the result so the user sees it either way.
    const statuses = [...container.querySelectorAll(".save-status")];
    const saveBtns = [...container.querySelectorAll(".save-button")];
    const setStatus = (text, cls) => {
      for (const s of statuses) {
        s.textContent = text;
        s.className = `save-status ${cls || ""}`.trim();
      }
    };
    setStatus("", "");
    for (const b of saveBtns) b.disabled = true;

    const data = {
      name: container.querySelector("#f-name").value.trim(),
      description: container.querySelector("#f-description").value,
    };
    if (mode === "fixed_times") {
      data.fixed_times = this._currentTimesValues();
    } else {
      data.interval_hours = parseFloat(container.querySelector("#f-interval").value);
    }
    // datetime-local gives "YYYY-MM-DDTHH:MM" in whatever timezone the browser is
    // in; backend wants "YYYY-MM-DD HH:MM:SS" local HA time. Assumes the browser
    // and the HA instance are in the same timezone (true for the typical
    // single-user self-hosted setup this plugin targets).
    // Only sent when actually changed from the value shown when the form opened,
    // so saving an unrelated field (e.g. the name) never nudges start/end by the
    // seconds truncation of a round-trip through the datetime-local input.
    const startEl = container.querySelector("#f-start");
    const endEl = container.querySelector("#f-end");
    const startVal = startEl.value;
    const endVal = endEl.value;
    if (startVal !== startEl.dataset.initial) {
      data.start_at = startVal ? startVal.replace("T", " ") + ":00" : "";
    }
    if (endVal !== endEl.dataset.initial) {
      data.end_at = endVal ? endVal.replace("T", " ") + ":00" : "";
    }
    data.window_minutes = parseInt(container.querySelector("#f-window").value, 10);
    data.sound_id = container.querySelector("#f-sound").value;
    data.volume_level = container.querySelector("#f-volume").value;

    try {
      await this._hass.callService(DOMAIN, "update_schedule", data, { entity_id: this._config.entity });
      setStatus(this._t("editor_saved_message"), "ok");
    } catch (err) {
      // err.message turned out NOT to be localized in practice (HA returned English
      // even for a Polish-language account) - map the translation_key ourselves
      // instead, using the same CARD_STRINGS mechanism as everything else here.
      const key = err?.translation_key || err?.error?.translation_key;
      const errorKey = key ? `error_${key}` : null;
      const hasTranslation = errorKey && CARD_STRINGS.en[errorKey];
      const message = hasTranslation
        ? this._t(errorKey)
        : err?.message || err?.error?.message || this._t("editor_generic_error");
      setStatus(message, "err");
    } finally {
      for (const b of saveBtns) b.disabled = false;
    }
  }
}

defineOrUpgrade("how-many-times-today-card-editor", HowManyTimesTodayCardEditor);


// --- the alert card (for a screensaver such as WallPanel): shows what is due right now and
// disappears when nothing is. One schedule due: that one (circle, name, sentence). Several:
// only the logo and "N events" in the correct plural form of the language. ---
const LOGO_URI = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 456 456%22 width=%22456%22 height=%22456%22%3E%3Cdefs%3E%3ClinearGradient id=%22bgA%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%232E7D32%22/%3E%3Cstop offset=%220.55%22 stop-color=%22%23C62828%22/%3E%3Cstop offset=%221%22 stop-color=%22%235D4037%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx=%22228%22 cy=%22228%22 r=%22214%22 fill=%22url(%23bgA)%22/%3E%3Cg opacity=%220.30%22 transform=%22translate(74 300) rotate(-14) scale(0.27) translate(-228 -228)%22%3E%3Cdefs%3E%3CclipPath id=%22gs1%22%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22/%3E%3C/clipPath%3E%3C/defs%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22rgba(255,255,255,0.10)%22/%3E%3Cg clip-path=%22url(%23gs1)%22%3E%3Crect x=%22140%22 y=%22170%22 width=%22170%22 height=%2258%22 fill=%22%23FFFFFF%22/%3E%3Cpath d=%22M150,340 C186,296 212,282 228,278 C244,282 270,296 306,340 Z%22 fill=%22%23FFFFFF%22/%3E%3C/g%3E%3Cline x1=%22228%22 y1=%22226%22 x2=%22228%22 y2=%22282%22 stroke=%22%23FFFFFF%22 stroke-width=%224%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22none%22 stroke=%22%23FFFFFF%22 stroke-width=%2211%22 stroke-linejoin=%22round%22/%3E%3Crect x=%22126%22 y=%2298%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3Crect x=%22126%22 y=%22334%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3C/g%3E%3Cg opacity=%220.30%22 transform=%22translate(382 156) rotate(14) scale(0.27) translate(-228 -228)%22%3E%3Cdefs%3E%3CclipPath id=%22gs2%22%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22/%3E%3C/clipPath%3E%3C/defs%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22rgba(255,255,255,0.10)%22/%3E%3Cg clip-path=%22url(%23gs2)%22%3E%3Crect x=%22140%22 y=%22170%22 width=%22170%22 height=%2258%22 fill=%22%23FFFFFF%22/%3E%3Cpath d=%22M150,340 C186,296 212,282 228,278 C244,282 270,296 306,340 Z%22 fill=%22%23FFFFFF%22/%3E%3C/g%3E%3Cline x1=%22228%22 y1=%22226%22 x2=%22228%22 y2=%22282%22 stroke=%22%23FFFFFF%22 stroke-width=%224%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22none%22 stroke=%22%23FFFFFF%22 stroke-width=%2211%22 stroke-linejoin=%22round%22/%3E%3Crect x=%22126%22 y=%2298%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3Crect x=%22126%22 y=%22334%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id=%22ga%22%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22/%3E%3C/clipPath%3E%3C/defs%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22rgba(255,255,255,0.12)%22/%3E%3Cg clip-path=%22url(%23ga)%22%3E%3Crect x=%22140%22 y=%22170%22 width=%22170%22 height=%2258%22 fill=%22%23FFFFFF%22/%3E%3Cpath d=%22M150,340 C186,296 212,282 228,278 C244,282 270,296 306,340 Z%22 fill=%22%23FFFFFF%22/%3E%3C/g%3E%3Cline x1=%22228%22 y1=%22226%22 x2=%22228%22 y2=%22282%22 stroke=%22%23FFFFFF%22 stroke-width=%224%22 stroke-linecap=%22round%22/%3E%3Cpath d=%22M152,120 L304,120 C304,172 252,200 236,228 C252,256 304,284 304,336 L152,336 C152,284 204,256 220,228 C204,200 152,172 152,120 Z%22 fill=%22none%22 stroke=%22%23FFFFFF%22 stroke-width=%2211%22 stroke-linejoin=%22round%22/%3E%3Crect x=%22126%22 y=%2298%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3Crect x=%22126%22 y=%22334%22 width=%22204%22 height=%2224%22 rx=%2210%22 fill=%22%23FFFFFF%22/%3E%3C/svg%3E";

// the plural form of a count: "one" | "few" | "many" | "other" (Polish: 1 wydarzenie,
// 2-4 wydarzenia, 5-21 wydarzeń, 22-24 wydarzenia, 25-31 wydarzeń ...)
function pluralForm(language, n) {
  const lang = String(language || "en").toLowerCase().split("-")[0];
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (lang === "pl") {
    if (abs === 1) return "one";
    return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "few" : "many";
  }
  if (lang === "ru" || lang === "uk") {
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "few";
    return "many";
  }
  if (lang === "zh") return "other";
  return abs === 1 ? "one" : "other"; // en, de
}

const EVENT_WORDS = {
  en: { one: "event", other: "events" },
  pl: { one: "wydarzenie", few: "wydarzenia", many: "wydarzeń" },
  de: { one: "Ereignis", other: "Ereignisse" },
  ru: { one: "событие", few: "события", many: "событий" },
  uk: { one: "подія", few: "події", many: "подій" },
  zh: { other: "个事件" },
};

function eventsText(language, n) {
  const lang = String(language || "en").toLowerCase().split("-")[0];
  const words = EVENT_WORDS[lang] || EVENT_WORDS.en;
  const form = pluralForm(lang in EVENT_WORDS ? lang : "en", n);
  return lang === "zh" ? `${n} ${words.other}` : `${n} ${words[form] ?? words.other ?? words.many}`;
}

class HowManyTimesTodayAlertCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._signature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig() {
    return {};
  }

  // the schedules that are due right now: the optional `entities` list, else every schedule
  // sensor of the integration; due = red (inside the window) or blinking black (overdue)
  _due() {
    if (!this._hass) return [];
    const ids = Array.isArray(this._config.entities) && this._config.entities.length
      ? this._config.entities
      : Object.keys(this._hass.states).filter((id) => {
          const a = this._hass.states[id].attributes;
          return id.startsWith("sensor.") && a && a.schedule_id !== undefined;
        });
    return ids
      .map((id) => this._hass.states[id])
      .filter((s) => s && (s.state === "red" || s.state === "blinking_black"));
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const due = this._due();
    const language = this._hass && this._hass.language;
    const signature = `${language}|${due.map((s) => `${s.entity_id}:${s.state}:${s.attributes.count_today}:${s.attributes.font_scale}`).join(",")}`;
    if (signature === this._signature) return; // nothing changed: do not redraw (keeps the blinking smooth)
    this._signature = signature;
    this.hidden = due.length === 0;
    if (due.length === 0) {
      this.shadowRoot.innerHTML = "";
      return;
    }
    const style = `
      <style>
        ha-card { background: rgba(0, 0, 0, 0.6); color: #fff; border-radius: 16px; padding: 14px 18px; box-shadow: none; }
        .row { display: flex; align-items: center; gap: 18px; }
        .circle { width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
          justify-content: center; border: 3px solid rgba(255,255,255,0.6); font-size: 2em; font-weight: 700; }
        .circle.blinking { animation: alert-blink 1s step-start infinite; }
        @keyframes alert-blink { 50% { background: ${BLACK_BLINK}; color: #000; } }
        .logo { width: 72px; height: 72px; flex-shrink: 0; }
        .name { font-size: 1.5em; font-weight: 700; }
        .description { font-size: 1em; opacity: 0.85; }
        .status { font-size: 1.25em; font-weight: 700; color: #ff8a80; margin-top: 2px; }
        .events { font-size: 1.9em; font-weight: 700; }
      </style>`;
    let body;
    if (due.length === 1) {
      const s = due[0];
      const a = s.attributes;
      const name = a.name || a.friendly_name || s.entity_id;
      const key = s.state === "red" ? "status_red" : "status_blinking_black";
      const scale = Number(a.font_scale) || 1;
      body = `
        <div class="row" style="font-size:${scale}em">
          <div class="circle ${s.state === "blinking_black" ? "blinking" : ""}" style="background:${colorForState(s.state, a)}">${a.count_today ?? 0}</div>
          <div>
            <div class="name">${name}</div>
            ${a.description ? `<div class="description">${a.description}</div>` : ""}
            <div class="status">${translate(language, key)}</div>
          </div>
        </div>`;
    } else {
      body = `
        <div class="row">
          <img class="logo" src="${LOGO_URI}" alt="">
          <div class="events">${eventsText(language, due.length)}</div>
        </div>`;
    }
    this.shadowRoot.innerHTML = `${style}<ha-card>${body}</ha-card>`;
  }
}

defineOrUpgrade("how-many-times-today-alert-card", HowManyTimesTodayAlertCard);

reportToServer("loaded", customElements.get("how-many-times-today-card") ? cardOutcome : "NOT defined");

// Dashboard cards of this type that were built before the element existed show an error
// card ("Custom element doesn't exist"). Home Assistant rebuilds them when the element gets
// defined, but some clients (the Android app) were seen not to: ask for the rebuild
// ourselves, and report what the page shows (the error cards' texts, how many of our cards
// are there and drawn) so that a device that still fails can be traced.
function scanPage() {
  const errors = [];
  let ours = 0;
  let drawn = 0;
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.localName === "hui-error-card") {
        const text = String((el._config && (el._config.message || el._config.error)) || (el.shadowRoot && el.shadowRoot.textContent) || el.textContent || "");
        errors.push({ el, text: text.replace(/\s+/g, " ").trim() });
      } else if (el.localName === "how-many-times-today-card") {
        ours += 1;
        if (el.shadowRoot && el.shadowRoot.querySelector("ha-card")) drawn += 1;
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { errors, ours, drawn };
}
let firstErrorCount = null;
for (const delay of [400, 2500, 7000, 16000, 30000, 60000]) {
  setTimeout(() => {
    try {
      const { errors, ours, drawn } = scanPage();
      if (firstErrorCount === null) firstErrorCount = errors.length;
      for (const { el, text } of errors) {
        if (text.includes("how-many-times-today")) el.dispatchEvent(new CustomEvent("ll-rebuild", { bubbles: true, composed: true }));
      }
      if (delay >= 7000 && (firstErrorCount > 0 || errors.length > 0)) {
        // the log keeps the first 60 characters of each report, so: one short line per error card
        reportToServer("loaded", `${delay / 1000}s e${errors.length} o${ours} d${drawn}`);
        errors.slice(0, 3).forEach((e, n) => reportToServer("loaded", `E${n + 1}: ${e.text.slice(0, 54)}`));
      }
    } catch (err) {
      reportToServer("report", `page scan failed: ${err && err.message}`);
    }
  }, delay);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "how-many-times-today-alert-card"))
  window.customCards.push({
    type: "how-many-times-today-alert-card",
    name: "How Many Times Today - alert",
    description: "What is due right now (for a screensaver): the one schedule, or the logo and the number of events; hidden when nothing is due.",
  });
if (!window.customCards.some((c) => c.type === "how-many-times-today-card"))
window.customCards.push({
  type: "how-many-times-today-card",
  name: "How Many Times Today",
  description: "One schedule: a single button with today's execution count, color-fading toward the deadline, and history.",
});
