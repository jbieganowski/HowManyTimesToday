/**
 * How Many Times Today - Lovelace card.
 * One card = one schedule sensor (sensor.xxx, created by the backend integration).
 * Model: "one button per schedule" (replaces the earlier per-occurrence "slots" model).
 * No build step: plain custom element.
 */

const GREEN = [46, 125, 50];
const RED = [198, 40, 40];
const BROWN = [93, 64, 55];
const PENDING_GRAY = [96, 125, 139];
const INACTIVE_GRAY = [158, 158, 158];

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
    in_prefix: "in",
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
    status_green: "Done — all good",
    status_transition: "Getting close",
    status_red: "NOW — time to do it",
    status_blinking_brown: "WARNING — overdue!",
    status_exceeded: "Done too many times",
    status_inactive: "Switched off",
    status_number_blinking: "Blinking number: last time was recorded outside the schedule",
    answer_dialog_title: "What happened at {time}?",
    answer_already_done: "A. It was done, just not recorded",
    answer_do_now: "B. Wasn't done at {time}, doing it now",
    answer_extra: "C. Done at {time}, this is an extra execution",
    answer_cancel: "Cancel",
    kind_registered_late: "recorded with a delay",
    kind_outside: "OUTSIDE SCHEDULE",
    kind_extra: "OUTSIDE SCHEDULE",
    kind_missed: "MISSED",
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
    in_prefix: "za",
    overdue_prefix: "spóźnienie o",
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
    status_green: "Zrobione – wszystko w porządku",
    status_transition: "Zbliża się pora",
    status_red: "TERAZ – czas to zrobić",
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
    in_prefix: "in",
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
    status_green: "Erledigt – alles in Ordnung",
    status_transition: "Es wird bald Zeit",
    status_red: "JETZT – Zeit, es zu tun",
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
    in_prefix: "через",
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
    status_green: "Сделано — всё в порядке",
    status_transition: "Скоро пора",
    status_red: "СЕЙЧАС — пора сделать",
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
    in_prefix: "через",
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
    status_green: "Зроблено — усе гаразд",
    status_transition: "Наближається час",
    status_red: "ЗАРАЗ — час зробити",
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
    in_prefix: "还有",
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
    status_green: "已完成——一切正常",
    status_transition: "即将到时间",
    status_red: "现在——该做了",
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
    // `hass` can arrive before setConfig(): nothing to show until the config is there
    if (!this._config) return;
    const stateObj = hass.states[this._config.entity];
    this._stateObj = stateObj;
    this._tick();
  }

  getCardSize() {
    return 3;
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
    this._answerDialogOpen = false;
    this._render();
  }

  _openAnswerDialog() {
    this._answerDialogOpen = true;
    this._render();
  }

  _closeAnswerDialog() {
    this._answerDialogOpen = false;
    this._render();
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
    const plainStatusKey = {
      pending: "status_pending",
      green: "status_green",
      transition: "status_transition",
      red: "status_red",
      blinking_brown: "status_blinking_brown",
      exceeded: "status_exceeded",
      inactive: "status_inactive",
    }[state] || "status_green";
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

customElements.define("how-many-times-today-card", HowManyTimesTodayCard);

// --- visual card editor: entity picker restricted to this integration's own
// schedule sensors (identified by the schedule_id attribute), filled with the
// Lovelace UI editor instead of hand-written YAML ---
class HowManyTimesTodayCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
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

    this.shadowRoot.innerHTML = `
      <style>
        .wrap { padding: 12px 0; }
        .hint { margin: 16px 0 8px; color: var(--secondary-text-color); line-height: 1.4; }
        .hint-link { color: var(--primary-color); font-weight: 500; }
        .field { margin: 12px 0; }
        .field label { display: block; font-size: 0.9em; margin-bottom: 4px; color: var(--secondary-text-color); }
        .field input {
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
        h3.section { font-size: 1em; margin: 20px 0 4px; }
        .live-notice {
          margin: 16px 0; padding: 10px 12px; border-radius: 6px; font-size: 0.85em; line-height: 1.4;
          background: var(--warning-color, #fff3cd); color: #7a5b00; border: 1px solid #e0c36a;
        }
      </style>
      <div class="wrap"></div>
    `;

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
      <div class="live-notice">${this._t("editor_live_notice")}</div>
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

customElements.define("how-many-times-today-card-editor", HowManyTimesTodayCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "how-many-times-today-card",
  name: "How Many Times Today",
  description: "One schedule: a single button with today's execution count, color-fading toward the deadline, and history.",
});
