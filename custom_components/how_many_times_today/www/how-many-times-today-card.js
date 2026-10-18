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

// --- UI strings, supported language set (see docs/SPECIFICATION.md);
// unsupported languages fall back to English. The schedule strings (answer_*, kind_*,
// inactive_label, pending_label) are translated for en/pl; de/ru/uk/zh-hans show the
// English text for those specific keys. ---
const CARD_STRINGS = {
  en: {
    show_history: "▶ show history",
    hide_history: "▼ hide history",
    clear_all: "Clear all history",
    clear_selected_weeks: "Clear selected weeks",
    no_presses: "No presses yet",
    last: "Last",
    total: "total",
    confirm_clear_all: "Clear the entire history for this schedule?",
    in_prefix: "in",
    overdue_prefix: "overdue by",
    entity_not_found: "Entity not found",
    editor_entity_label: "Schedule sensor",
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
    no_presses: "Brak naciśnięć",
    last: "Ostatnio",
    total: "łącznie",
    confirm_clear_all: "Wyczyścić całą historię tego harmonogramu?",
    in_prefix: "za",
    overdue_prefix: "spóźnienie o",
    entity_not_found: "Nie znaleziono encji",
    editor_entity_label: "Sensor harmonogramu",
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
    no_presses: "Noch keine Bestätigungen",
    last: "Zuletzt",
    total: "gesamt",
    confirm_clear_all: "Den gesamten Verlauf für diesen Zeitplan löschen?",
    in_prefix: "in",
    overdue_prefix: "überfällig um",
    entity_not_found: "Entität nicht gefunden",
    editor_entity_label: "Zeitplan-Sensor",
  },
  ru: {
    show_history: "▶ показать историю",
    hide_history: "▼ скрыть историю",
    clear_all: "Очистить всю историю",
    clear_selected_weeks: "Очистить выбранные недели",
    no_presses: "Пока нет нажатий",
    last: "Последнее",
    total: "всего",
    confirm_clear_all: "Очистить всю историю этого расписания?",
    in_prefix: "через",
    overdue_prefix: "просрочено на",
    entity_not_found: "Сущность не найдена",
    editor_entity_label: "Сенсор расписания",
  },
  uk: {
    show_history: "▶ показати історію",
    hide_history: "▼ приховати історію",
    clear_all: "Очистити всю історію",
    clear_selected_weeks: "Очистити вибрані тижні",
    no_presses: "Поки немає натискань",
    last: "Останнє",
    total: "всього",
    confirm_clear_all: "Очистити всю історію цього розкладу?",
    in_prefix: "через",
    overdue_prefix: "прострочено на",
    entity_not_found: "Сутність не знайдено",
    editor_entity_label: "Сенсор розкладу",
  },
  "zh-hans": {
    show_history: "▶ 显示历史",
    hide_history: "▼ 隐藏历史",
    clear_all: "清除全部历史",
    clear_selected_weeks: "清除所选周",
    no_presses: "尚无记录",
    last: "上次",
    total: "共计",
    confirm_clear_all: "确定清除此计划的全部历史吗？",
    in_prefix: "还有",
    overdue_prefix: "已超时",
    entity_not_found: "未找到实体",
    editor_entity_label: "计划传感器",
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
      root.innerHTML = `<ha-card><div class="placeholder">${this._t("entity_not_found")}: ${this._config.entity}</div></ha-card>`;
      return;
    }

    const locale = this._hass?.language;
    const attrs = this._stateObj.attributes;
    const state = this._stateObj.state;
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
      .map((w) => `<label><input type="checkbox" value="${w}"> ${w}</label>`)
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
// schedule sensors (identified by the count_today attribute), filled with the
// Lovelace UI editor instead of hand-written YAML ---
class HowManyTimesTodayCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._picker) {
      this._picker.hass = hass;
    } else {
      this._render();
    }
  }

  _entityFilter(stateObj) {
    return !!(stateObj.attributes && stateObj.attributes.schedule_id !== undefined);
  }

  _render() {
    // Home Assistant sets `hass` before the config on a fresh editor element, so both
    // may be missing on the first call; render once the config has arrived
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });

    this.shadowRoot.innerHTML = `
      <style>
        .wrap { padding: 12px 0; }
      </style>
      <div class="wrap"></div>
    `;

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
    });

    this._picker = picker;
    this.shadowRoot.querySelector(".wrap").appendChild(picker);
  }
}

customElements.define("how-many-times-today-card-editor", HowManyTimesTodayCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "how-many-times-today-card",
  name: "How Many Times Today",
  description: "One schedule: a single button with today's execution count, color-fading toward the deadline, and history.",
});
