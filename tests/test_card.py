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
