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

const GREEN = [46, 125, 50];
const RED = [198, 40, 40];
const BROWN = [93, 64, 55];
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
      blinking_brown: "status_blinking_brown",
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
    status_blinking_brown: "WARNING - overdue!",
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
    status_blinking_brown: "UWAGA – spóźnione!",
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
    status_blinking_brown: "ACHTUNG – überfällig!",
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
    status_blinking_brown: "ВНИМАНИЕ — просрочено!",
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
    status_blinking_brown: "УВАГА — прострочено!",
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
    status_blinking_brown: "警告——已逾期！",
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

// --- tiny synthesized alert tones, no audio asset files required ---
const SOUND_PATTERNS = {
  chime: [[880, 0.12], [1320, 0.18]],
  bell: [[1046, 0.3]],
  alert: [[660, 0.1], [0, 0.05], [660, 0.1], [0, 0.05], [660, 0.1]],
  gentle: [[523, 0.25]],
  none: [],
};

let sharedAudioCtx = null;
function playSound(name) {
  const pattern = SOUND_PATTERNS[name];
  if (!pattern || !pattern.length) return;
  try {
    sharedAudioCtx = sharedAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sharedAudioCtx;
    let t = ctx.currentTime;
    for (const [freq, dur] of pattern) {
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      t += dur;
    }
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
      if (state === "red" || state === "blinking_brown") {
        playSound(this._stateObj.attributes.sound);
      }
      this._lastState = state;
    }

    this._render();
  }

  _colorFor(state, attrs) {
    switch (state) {
      case "green":
        return rgb(GREEN);
      case "red":
      case "exceeded":
        return rgb(RED);
      case "blinking_brown":
        return rgb(BROWN);
      case "pending":
        return rgb(PENDING_GRAY);
      case "inactive":
        return rgb(INACTIVE_GRAY);
      case "transition":
      default: {
        const p = typeof attrs.color_progress === "number" ? attrs.color_progress : 0;
        return rgb(lerp(GREEN, RED, Math.max(0, Math.min(1, p))));
      }
    }
  }

  async _onPress() {
    const attrs = this._stateObj.attributes;
    if (attrs.answer_required) {
      this._openAnswerDialog();
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
  _openAnswerDialog() {
    if (this._config.layout === "tile") {
      const attrs = this._stateObj.attributes;
      const oldestOpenSlot = (attrs.open_slots && attrs.open_slots[0]) || null;
      const time = oldestOpenSlot ? formatTime(oldestOpenSlot.scheduled_at, this._hass?.language) : "?";
      const box = this._openModal(`
        <h3>${this._t("answer_dialog_title", { time })}</h3>
        <button id="answer-already-done">${this._t("answer_already_done", { time })}</button>
        <button id="answer-do-now">${this._t("answer_do_now", { time })}</button>
        <button id="answer-extra">${this._t("answer_extra", { time })}</button>
        <button id="answer-cancel">${this._t("answer_cancel")}</button>
      `);
      box.querySelector("#answer-already-done").addEventListener("click", () => this._onAnswer("already_done"));
      box.querySelector("#answer-do-now").addEventListener("click", () => this._onAnswer("do_now"));
      box.querySelector("#answer-extra").addEventListener("click", () => this._onAnswer("extra"));
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
        @keyframes tile-blink-bg { 50% { background: #8d5a4a; } }
        .tile-number { font-size: 1.7em; font-weight: 700; color: ${numberColor}; line-height: 1; }
        .tile-number.blinking-num { animation: tile-blink-num 0.8s step-start infinite; }
        @keyframes tile-blink-num { 50% { opacity: 0.15; } }
        .tile-inactive-label { font-size: 0.7em; font-weight: 600; color: #fff; text-align: center; }
        .tile-info { flex: 1; min-width: 0; }
        .tile-name { font-size: 1.1em; font-weight: 600; }
        .tile-description { font-size: 0.85em; opacity: 0.7; }
        .tile-status { font-size: 1.1em; font-weight: 700; margin-top: 2px; }
        .tile-status.state-red, .tile-status.state-blinking_brown, .tile-status.state-exceeded { color: #c62828; }
        .tile-status.state-green { color: #2e7d32; }
        .tile-blink-note { font-size: 1em; font-weight: 700; color: #a85c00; margin-top: 2px; }
        .tile-countdown { font-size: 0.95em; opacity: 0.8; }
        .tile-last { font-size: 0.85em; opacity: 0.6; }
        .tile-edit {
          flex-shrink: 0; align-self: flex-start; background: none; border: none; cursor: pointer;
          font-size: 1.4em; line-height: 1; padding: 0 0 8px 8px; color: var(--primary-text-color, inherit);
        }
      </style>
      <ha-card class="tile">
        <div class="tile-tap-target ${notClickable ? "not-clickable" : ""}" id="tap-target" tabindex="0" role="button" aria-label="${ariaLabel}">
          <div class="tile-circle ${state === "blinking_brown" ? "blinking-bg" : ""}">
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
    for (const type of ["pointerdown", "pointerup", "keydown", "contextmenu"]) {
      editBtn.addEventListener(type, (ev) => ev.stopPropagation());
    }
    editBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openEditDialog();
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

    const oldestOpenSlot = (attrs.open_slots && attrs.open_slots[0]) || null;

    root.innerHTML = `
      <style>
        ha-card { padding: 16px; position: relative; }
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
        @keyframes blink-bg { 50% { background: #8d5a4a; } }
        .number { font-size: 1.6em; font-weight: 700; color: ${numberColor}; line-height: 1; }
        .number.blinking-num { animation: blink-num 0.8s step-start infinite; }
        @keyframes blink-num { 50% { opacity: 0.15; } }
        .inactive-label { font-size: 0.7em; font-weight: 600; color: #fff; text-align: center; }
        .info { flex: 1; }
        .name { font-size: 1.1em; font-weight: 600; }
        .description { font-size: 0.85em; opacity: 0.7; }
        .plain-status { font-size: 1.15em; font-weight: 700; margin-top: 2px; }
        .plain-status.state-red, .plain-status.state-blinking_brown, .plain-status.state-exceeded {
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
      <ha-card>
        <div class="row">
          <div class="button ${state === "blinking_brown" ? "blinking-bg" : ""} ${state === "inactive" || state === "pending" ? "not-clickable" : ""}" id="btn">
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
        ${this._answerDialogOpen ? this._renderAnswerDialog(oldestOpenSlot, locale) : ""}
      </ha-card>
    `;

    root.getElementById("btn").addEventListener("click", () => this._onPress());
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
      root.getElementById("answer-already-done")?.addEventListener("click", () => this._onAnswer("already_done"));
      root.getElementById("answer-do-now")?.addEventListener("click", () => this._onAnswer("do_now"));
      root.getElementById("answer-extra")?.addEventListener("click", () => this._onAnswer("extra"));
      root.getElementById("answer-cancel")?.addEventListener("click", () => this._closeAnswerDialog());
    }
  }

  _renderAnswerDialog(oldestOpenSlot, locale) {
    const time = oldestOpenSlot ? formatTime(oldestOpenSlot.scheduled_at, locale) : "?";
    return `
      <div class="dialog-backdrop">
        <div class="dialog-box">
          <h3>${this._t("answer_dialog_title", { time })}</h3>
          <button id="answer-already-done">${this._t("answer_already_done", { time })}</button>
          <button id="answer-do-now">${this._t("answer_do_now", { time })}</button>
          <button id="answer-extra">${this._t("answer_extra", { time })}</button>
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
        details.advanced button {
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
        const text = String((el._config && el._config.error) || (el.shadowRoot && el.shadowRoot.textContent) || el.textContent || "");
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
for (const delay of [400, 2500, 7000, 16000]) {
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
if (!window.customCards.some((c) => c.type === "how-many-times-today-card"))
window.customCards.push({
  type: "how-many-times-today-card",
  name: "How Many Times Today",
  description: "One schedule: a single button with today's execution count, color-fading toward the deadline, and history.",
});
