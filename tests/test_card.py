"""Static checks on the Lovelace card's JavaScript (it cannot be run without a browser)."""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

CARD = (
    Path(__file__).resolve().parents[1]
    / "custom_components" / "how_many_times_today" / "www" / "how-many-times-today-card.js"
)
LANGUAGES = ["en", "pl", "de", "ru", "uk", "zh-hans"]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed")
def test_card_javascript_is_syntactically_valid():
    result = subprocess.run(["node", "--check", str(CARD)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def _blocks() -> dict[str, set[str]]:
    """CARD_STRINGS language -> the set of its keys."""
    text = CARD.read_text(encoding="utf-8")
    start = text.index("const CARD_STRINGS = {")
    body = text[start:text.index("\n};\n", start)]
    blocks: dict[str, set[str]] = {}
    current = None
    for line in body.split("\n")[1:]:
        header = re.match(r'^  "?([\w-]+)"?: \{$', line)
        if header:
            current = header.group(1)
            blocks[current] = set()
        elif current and (key := re.match(r"^    (\w+):", line)):
            blocks[current].add(key.group(1))
    return blocks


def test_every_language_block_of_the_card_has_the_same_keys():
    blocks = _blocks()
    assert list(blocks) == LANGUAGES  # the legend test relies on this order
    reference = blocks["en"]
    for lang, keys in blocks.items():
        assert keys == reference, f"{lang}: missing {sorted(reference - keys)}, extra {sorted(keys - reference)}"


def test_the_editor_and_the_card_wait_for_the_config():
    """Home Assistant hands `hass` over before setConfig(); both must tolerate that."""
    text = CARD.read_text(encoding="utf-8")
    assert "if (!this._config) return;" in text  # the card's hass setter
    assert "if (!this._hass || !this._config) return;" in text  # the editor's render


def test_the_card_knows_the_same_reminder_sounds_as_the_integration():
    import json
    from how_many_times_today import const

    text = CARD.read_text(encoding="utf-8")
    listed = re.search(r"const SOUND_IDS = \[(.*?)\];", text, re.S).group(1)
    assert re.findall(r'"(\w+)"', listed) == const.SOUND_IDS
    groups = dict(re.findall(r"(\w+): \"(gentle|medium|strong|verystrong|melody|seasonal)\"", re.search(r"const SOUND_GROUP_OF = \{(.*?)\};", text, re.S).group(1)))
    assert groups == const.SOUNDS
    for lang_block in _blocks().values():
        assert {f"sound_{sid}" for sid in const.SOUND_IDS} <= lang_block
        assert {f"volume_{v}" for v in range(5)} <= lang_block


def test_the_card_uses_black_not_brown_for_the_blinking_button():
    text = CARD.read_text(encoding="utf-8")
    assert "brown" not in text.lower()
    assert "blinking_black" in text and "BLACK_BLINK" in text


def test_the_card_fades_green_to_yellow_to_red_like_the_app():
    text = CARD.read_text(encoding="utf-8")
    assert "const GREEN = [24, 160, 64];" in text
    assert "const AMBER = [255, 193, 7];" in text
    assert "const RED = [214, 30, 30];" in text
    assert "GREEN_HOLD_PROGRESS = 0.35" in text and "APPROACHING_PROGRESS = 0.55" in text


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed")
def test_the_alert_card_says_the_number_of_events_in_correct_polish_and_other_languages():
    text = CARD.read_text(encoding="utf-8")
    code = text[text.index("function pluralForm"):text.index("class HowManyTimesTodayAlertCard")]
    probe = code + """
const out = {
  pl: [1, 2, 3, 4, 5, 11, 12, 13, 14, 21, 22, 24, 25, 112, 122].map((n) => eventsText("pl", n)),
  en: [1, 2].map((n) => eventsText("en", n)),
  ru: [1, 2, 5, 11, 21].map((n) => eventsText("ru", n)),
  uk: [1, 3, 5, 12, 22].map((n) => eventsText("uk", n)),
  de: [1, 2].map((n) => eventsText("de", n)),
  zh: [3].map((n) => eventsText("zh", n)),
};
console.log(JSON.stringify(out));
"""
    result = subprocess.run(["node", "-e", probe], capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, result.stderr
    import json

    got = json.loads(result.stdout)
    assert got["pl"] == [
        "1 wydarzenie", "2 wydarzenia", "3 wydarzenia", "4 wydarzenia", "5 wydarzeń", "11 wydarzeń", "12 wydarzeń",
        "13 wydarzeń", "14 wydarzeń", "21 wydarzeń", "22 wydarzenia", "24 wydarzenia", "25 wydarzeń", "112 wydarzeń",
        "122 wydarzenia",
    ]
    assert got["en"] == ["1 event", "2 events"]
    assert got["ru"] == ["1 событие", "2 события", "5 событий", "11 событий", "21 событие"]
    assert got["uk"] == ["1 подія", "3 події", "5 подій", "12 подій", "22 події"]
    assert got["de"] == ["1 Ereignis", "2 Ereignisse"]
    assert got["zh"] == ["3 个事件"]


def test_the_alert_card_is_registered_and_hides_itself_when_nothing_is_due():
    text = CARD.read_text(encoding="utf-8")
    assert 'defineOrUpgrade("how-many-times-today-alert-card"' in text
    assert 'type: "how-many-times-today-alert-card"' in text
    assert "this.hidden = due.length === 0;" in text
    assert 's.state === "red" || s.state === "blinking_black"' in text
