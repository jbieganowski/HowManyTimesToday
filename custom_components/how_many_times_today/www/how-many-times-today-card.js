/**
 * How Many Times Today - Lovelace card.
 * One card = one slot sensor (sensor.xxx_status, created by the backend integration).
 * No build step: plain custom element, matches the "install by clicking" HACS convention.
 */

const GREEN = [46, 125, 50];
const RED = [198, 40, 40];
const BROWN = [93, 64, 55];

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

// --- UI strings, language set kept in sync with Buy The Way (see docs/SPECIFICATION.md);
// unsupported languages fall back to English ---
const CARD_STRINGS = {
  en: {
    show_history: "▶ show history",
    hide_history: "▼ hide history",
    clear_all: "Clear all history",
    clear_selected_weeks: "Clear selected weeks",
    no_presses: "No presses yet",
    last: "Last",
    total: "total",
    confirm_clear_all: "Clear the entire history for this slot?",
    in_prefix: "in",
    overdue_prefix: "overdue by",
    entity_not_found: "Entity not found",
  },
  pl: {
    show_history: "▶ pokaż historię",
    hide_history: "▼ ukryj historię",
    clear_all: "Wyczyść całą historię",
    clear_selected_weeks: "Wyczyść wybrane tygodnie",
    no_presses: "Brak naciśnięć",
    last: "Ostatnio",
    total: "łącznie",
    confirm_clear_all: "Wyczyścić całą historię tego slotu?",
    in_prefix: "za",
    overdue_prefix: "spóźnienie o",
    entity_not_found: "Nie znaleziono encji",
  },
  de: {
    show_history: "▶ Verlauf anzeigen",
    hide_history: "▼ Verlauf ausblenden",
    clear_all: "Gesamten Verlauf löschen",
    clear_selected_weeks: "Ausgewählte Wochen löschen",
    no_presses: "Noch keine Bestätigungen",
    last: "Zuletzt",
    total: "gesamt",
    confirm_clear_all: "Den gesamten Verlauf für diesen Slot löschen?",
    in_prefix: "in",
    overdue_prefix: "überfällig um",
    entity_not_found: "Entität nicht gefunden",
  },
  ru: {
    show_history: "▶ показать историю",
    hide_history: "▼ скрыть историю",
    clear_all: "Очистить всю историю",
    clear_selected_weeks: "Очистить выбранные недели",
    no_presses: "Пока нет нажатий",
    last: "Последнее",
    total: "всего",
    confirm_clear_all: "Очистить всю историю этого слота?",
    in_prefix: "через",
    overdue_prefix: "просрочено на",
    entity_not_found: "Сущность не найдена",
  },
  uk: {
    show_history: "▶ показати історію",
    hide_history: "▼ приховати історію",
    clear_all: "Очистити всю історію",
    clear_selected_weeks: "Очистити вибрані тижні",
    no_presses: "Поки немає натискань",
    last: "Останнє",
    total: "всього",
    confirm_clear_all: "Очистити всю історію цього слоту?",
    in_prefix: "через",
    overdue_prefix: "прострочено на",
    entity_not_found: "Сутність не знайдено",
  },
  "zh-hans": {
    show_history: "▶ 显示历史",
    hide_history: "▼ 隐藏历史",
    clear_all: "清除全部历史",
    clear_selected_weeks: "清除所选周",
    no_presses: "尚无记录",
    last: "上次",
    total: "共计",
    confirm_clear_all: "确定清除此插槽的全部历史吗？",
    in_prefix: "还有",
    overdue_prefix: "已超时",
    entity_not_found: "未找到实体",
  },
};

function translate(hassLanguage, key) {
  const lang = (hassLanguage || "en").toLowerCase();
  const dict = CARD_STRINGS[lang] || CARD_STRINGS[lang.split("-")[0]] || CARD_STRINGS.en;
  return dict[key] ?? CARD_STRINGS.en[key] ?? key;
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

class HowManyTimesTodayCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("how-many-times-today-card: 'entity' is required (the slot's sensor entity)");
    }
    this._config = config;
    this._historyOpen = false;
    this._lastStage = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    this._stateObj = stateObj;
    this._tick();
  }

  getCardSize() {
    return 3;
  }

  _t(key) {
    return translate(this._hass?.language, key);
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
    const attrs = this._stateObj.attributes;
    const stage = this._stateObj.state;

    // sound on entering overdue/blinking (edge-triggered, not every tick)
    if (stage !== this._lastStage) {
      if (stage === "overdue" || stage === "blinking") {
        playSound(attrs.sound);
      }
      this._lastStage = stage;
    }

    this._render();
  }

  _computeColor(stage, attrs) {
    if (stage === "overdue") return rgb(BROWN);
    if (stage === "blinking") return null; // handled by CSS animation instead of a fixed color
    if (stage === "green") return rgb(GREEN);

    // "transition": recompute smoothly on every tick from timestamps, independent of the
    // ~30s backend polling cadence, for a visibly moving gradient
    if (attrs.last_pressed_at && attrs.next_expected_at) {
      const start = new Date(attrs.last_pressed_at).getTime();
      const end = new Date(attrs.next_expected_at).getTime();
      const now = Date.now();
      const t = end <= start ? 1 : Math.max(0, Math.min(1, (now - start) / (end - start)));
      return rgb(lerp(GREEN, RED, t));
    }
    return rgb(GREEN);
  }

  _onPress() {
    const attrs = this._stateObj.attributes;
    this._hass.callService("how_many_times_today", "press_slot", {
      slot_id: attrs.slot_id,
    });
  }

  _onClearAll() {
    const attrs = this._stateObj.attributes;
    if (!confirm(this._t("confirm_clear_all"))) return;
    this._hass.callService("how_many_times_today", "clear_history", {
      slot_id: attrs.slot_id,
    });
  }

  _onClearWeeks(weeks) {
    if (!weeks.length) return;
    const attrs = this._stateObj.attributes;
    this._hass.callService("how_many_times_today", "clear_history", {
      slot_id: attrs.slot_id,
      weeks,
    });
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
    const stage = this._stateObj.state;
    const name = attrs.friendly_name || this._config.entity;
    const color = this._computeColor(stage, attrs);
    const seconds = attrs.seconds_to_next_expected;
    const countdownLabel =
      seconds == null
        ? "—"
        : seconds >= 0
        ? `${this._t("in_prefix")} ${formatDuration(seconds)}`
        : `${this._t("overdue_prefix")} ${formatDuration(seconds)}`;

    const history = attrs.history || [];
    const weeks = [...new Set(history.map((ts) => isoWeekOf(new Date(ts))))].reverse();

    root.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .row { display: flex; align-items: center; gap: 16px; }
        .button {
          width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: 3px solid rgba(255,255,255,0.5);
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          background: ${color || "transparent"};
        }
        .button.blinking { animation: blink 1s step-start infinite; }
        @keyframes blink {
          50% { background: #8d5a4a; }
        }
        .button svg { width: 32px; height: 32px; }
        .info { flex: 1; }
        .name { font-size: 1.1em; font-weight: 600; }
        .countdown { font-size: 0.95em; opacity: 0.8; }
        .last { font-size: 0.85em; opacity: 0.6; }
        .history-toggle { cursor: pointer; font-size: 0.85em; margin-top: 8px; opacity: 0.7; }
        .history { margin-top: 8px; font-size: 0.85em; }
        .history ul { max-height: 160px; overflow-y: auto; margin: 4px 0; padding-left: 16px; }
        .history button { margin-right: 8px; margin-top: 4px; }
        .week-list label { display: block; }
      </style>
      <ha-card>
        <div class="row">
          <div class="button ${stage === "blinking" ? "blinking" : ""}" id="btn">
            <svg viewBox="0 0 24 24"><path fill="white" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          </div>
          <div class="info">
            <div class="name">${name}</div>
            <div class="countdown">${countdownLabel}</div>
            <div class="last">${this._t("last")}: ${formatTime(attrs.last_pressed_at, locale)} · ${this._t("total")}: ${attrs.press_count ?? 0}</div>
          </div>
        </div>
        <div class="history-toggle" id="toggle">${this._historyOpen ? this._t("hide_history") : this._t("show_history")}</div>
        ${this._historyOpen ? this._renderHistory(history, weeks, locale) : ""}
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
  }

  _renderHistory(history, weeks, locale) {
    const items = history
      .slice()
      .reverse()
      .map((ts) => `<li>${formatTime(ts, locale)}</li>`)
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

window.customCards = window.customCards || [];
window.customCards.push({
  type: "how-many-times-today-card",
  name: "How Many Times Today",
  description: "One recurring task slot: color-fading confirm button, countdown and history.",
});
