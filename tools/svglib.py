"""Tiny SVG drawing helpers for the documentation diagrams (no dependencies).

The palette is taken from docs/images/banner.svg so every diagram matches the
project banner. Text width is estimated conservatively (wider than Segoe UI, close
to DejaVu Sans which GitHub falls back to on Linux) and every box reports lines that
would overflow, so longer Polish strings are caught at generation time.
"""
from __future__ import annotations

from xml.sax.saxutils import escape

FONT = "Segoe UI, Helvetica, Arial, sans-serif"

INK = "#2b2b28"
MUTED = "#6b6859"
FAINT = "#8a8777"
LINE = "#b8b2a0"
BORDER = "#ddd8cc"
BG1 = "#fbfaf8"
BG2 = "#f1efe9"
GREEN = "#2e7d32"
RED = "#c62828"
BROWN = "#5d4037"
BLUE = "#4a90c4"
PURPLE = "#5c3d82"
SAGE = "#7a9e7e"
AMBER = "#b26a00"

# soft fill per accent colour
TINT = {
    GREEN: "#e6f2e7",
    RED: "#fbe9e9",
    BROWN: "#efe6e2",
    BLUE: "#e6f0f8",
    PURPLE: "#eee8f5",
    SAGE: "#e8f0e9",
    AMBER: "#fbf0dc",
    MUTED: "#f5f3ee",
    LINE: "#f5f3ee",
}

WARNINGS: list[str] = []


def est(s: str, size: float, bold: bool = False) -> float:
    """Conservative text width estimate in px."""
    return len(s) * size * (0.62 if bold else 0.57)


class Svg:
    def __init__(self, name: str, w: int, h: int, title: str, subtitle: str = "") -> None:
        self.name, self.w, self.h = name, w, h
        self.parts: list[str] = []
        self.markers: dict[str, str] = {}
        self._rect(1, 1, w - 2, h - 2, "url(#bg)", BORDER, 2, rx=24)
        self.text(40, 52, title, 28, 700, INK, check_w=w - 80)
        if subtitle:
            self.text(40, 80, subtitle, 16, 400, MUTED, check_w=w - 80)

    # --- primitives ---------------------------------------------------------
    def add(self, s: str) -> None:
        self.parts.append(s)

    def _rect(self, x, y, w, h, fill, stroke=None, sw=1.5, rx=10, dash=None, extra=""):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}{da}{extra}/>')

    def rect(self, x, y, w, h, fill, stroke=None, sw=1.5, rx=10, dash=None):
        self._rect(x, y, w, h, fill, stroke, sw, rx, dash)

    def text(self, x, y, s, size=14, weight=400, fill=INK, anchor="start", check_w=None, italic=False, halo=False):
        if check_w is not None and est(s, size, weight >= 600) > check_w:
            WARNINGS.append(f"{self.name}: '{s}' ({size}px) may overflow {check_w}px")
        it = ' font-style="italic"' if italic else ""
        # halo: a background-coloured outline so the label stays readable over lines
        ha = f' stroke="{BG1}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"' if halo else ""
        self.add(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}"{it}{ha}>{escape(s)}</text>'
        )

    def circle(self, cx, cy, r, fill, stroke=None, sw=2, dash=None):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{st}{da}/>')

    def line(self, x1, y1, x2, y2, color=LINE, sw=2, dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{da}/>')

    def path(self, d, stroke=LINE, sw=2, fill="none", dash=None, marker=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        mk = f' marker-end="url(#{self._marker(marker)})"' if marker else ""
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{da}{mk} stroke-linecap="round" stroke-linejoin="round"/>')

    # --- composite shapes ---------------------------------------------------
    def box(self, x, y, w, h, head, lines=(), color=MUTED, head_size=16, line_size=13, dash=None, fill=None):
        self.rect(x, y, w, h, fill or TINT[color], color, 1.8, 12, dash)
        pad = 10
        if lines:
            self.text(x + w / 2, y + 24, head, head_size, 700, color if color != MUTED else INK, "middle", w - 2 * pad)
            for i, ln in enumerate(lines):
                self.text(x + w / 2, y + 24 + (i + 1) * (line_size + 5), ln, line_size, 400, MUTED, "middle", w - 2 * pad)
        else:
            self.text(x + w / 2, y + h / 2 + head_size * 0.35, head, head_size, 700, color if color != MUTED else INK, "middle", w - 2 * pad)

    def pill(self, cx, cy, s, color, size=13, w=None):
        w = w or int(est(s, size, True) + 24)
        self.rect(cx - w / 2, cy - 13, w, 26, TINT[color], color, 1.5, 13)
        self.text(cx, cy + size * 0.35, s, size, 700, color, "middle")

    def _marker(self, color: str) -> str:
        mid = "m" + color.lstrip("#")
        if mid not in self.markers:
            self.markers[mid] = (
                f'<marker id="{mid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" '
                f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>'
            )
        return mid

    def arrow(self, x1, y1, x2, y2, color=MUTED, dash=None, both=False, sw=2):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        mid = self._marker(color)
        start = f' marker-start="url(#{mid})"' if both else ""
        self.add(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{da} '
            f'marker-end="url(#{mid})"{start}/>'
        )

    def button(self, cx, cy, r, kind):
        """The slot button as drawn on the card: ok / mid / overdue / blink."""
        gid = f"g{self.name}{cx}{cy}"
        if kind == "mid":
            self.add(
                f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
                f'<stop offset="0" stop-color="{GREEN}"/><stop offset="1" stop-color="#b8631f"/></linearGradient></defs>'
            )
            fill = f"url(#{gid})"
        else:
            fill = {"ok": GREEN, "overdue": BROWN, "blink": RED}[kind]
        if kind == "blink":
            self.circle(cx, cy, r + 9, "none", RED, 3, "7 6")
        self.circle(cx, cy, r, fill)
        k = r / 78
        if kind == "blink":
            self.rect(cx - 5 * k * 1.6, cy - 38 * k, 10 * k * 1.6, 46 * k, "#fff", None, rx=4)
            self.circle(cx, cy + 30 * k, 6.5 * k, "#fff")
        else:
            self.path(
                f"M {cx - 35 * k} {cy + 2 * k} L {cx - 10 * k} {cy + 28 * k} L {cx + 38 * k} {cy - 28 * k}",
                "#fff", max(3, 12 * k), dash=None,
            )

    # --- output -------------------------------------------------------------
    def render(self) -> str:
        defs = (
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{BG1}"/><stop offset="1" stop-color="{BG2}"/></linearGradient>'
            + "".join(self.markers.values())
            + "</defs>"
        )
        body = "\n  ".join(self.parts)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}">\n'
            f"  {defs}\n  {body}\n</svg>\n"
        )
