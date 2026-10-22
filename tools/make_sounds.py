"""Generates the reminder sounds of How Many Times Today (synthesised in code: no recordings, no copyright issues).

Usage:  python tools/make_sounds.py [output_directory]

Every sound is made in 4 volume levels (1 = quiet, 2 = medium, 3 = loud, 4 = very loud) as <id>_<n>.ogg
in custom_components/how_many_times_today/www/sounds. The "loud" level is matched to the target RMS of the
sound's class (gentle ... very strong), "medium" is 7 dB and "quiet" 14 dB softer.
Needs numpy only; the ogg encoding goes through ffmpeg (imageio-ffmpeg).
"""
from __future__ import annotations

import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 22050
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "custom_components/how_many_times_today/www/sounds"
RNG = np.random.default_rng(7)

# docelowy RMS (dBFS) wersji "głośno" w danej klasie mocy
POWER_RMS = {1: -27.0, 2: -22.0, 3: -17.0, 4: -13.0}
LEVEL_OFFSET_DB = {1: -14.0, 2: -7.0, 3: 0.0}  # poziom 4 (bardzo głośno) liczony osobno: max_loud()


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(SR * dur)) / SR


def env_exp(n: int, decay: float, attack: float = 0.003) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.exp(-t * decay)
    a = int(attack * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def place(buf: np.ndarray, sig: np.ndarray, start: float) -> None:
    i = int(start * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[: j - i]


def bell(freq: float, dur: float = 1.6, decay: float = 3.0, bright: float = 1.0) -> np.ndarray:
    t = t_axis(dur)
    parts = [(1.0, 1.0), (2.0, 0.6), (2.76, 0.45), (4.07, 0.3 * bright), (5.4, 0.2 * bright), (6.8, 0.1 * bright)]
    sig = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t * decay * (0.6 + 0.4 * r)) for r, a in parts)
    sig *= np.minimum(1, t / 0.002)
    return sig / np.max(np.abs(sig))


def pluck(freq: float, dur: float = 1.8, decay: float = 0.9965, bright: float = 0.5) -> np.ndarray:
    """Karplus-Strong: struna gitary / harfy."""
    n = int(SR * dur)
    period = max(2, int(round(SR / freq)))
    buf = RNG.uniform(-1, 1, period)
    # mniej jasny szum = cieplejszy dźwięk
    for _ in range(int((1 - bright) * 4)):
        buf = (buf + np.roll(buf, 1)) / 2
    out = np.zeros(n)
    for i in range(n):
        j = i % period
        nxt = (buf[j] + buf[(j + 1) % period]) * 0.5 * decay
        out[i] = buf[j]
        buf[j] = nxt
    return out / np.max(np.abs(out))


def marimba(freq: float, dur: float = 0.9) -> np.ndarray:
    t = t_axis(dur)
    sig = np.sin(2 * np.pi * freq * t) * np.exp(-t * 7) + 0.5 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t * 25)
    return sig / np.max(np.abs(sig))


def music_box(freq: float, dur: float = 1.0) -> np.ndarray:
    t = t_axis(dur)
    sig = np.sin(2 * np.pi * freq * t) * np.exp(-t * 5) + 0.35 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 9)
    sig *= np.minimum(1, t / 0.002)
    return sig / np.max(np.abs(sig))


def brass(freq: float, dur: float = 0.5, attack: float = 0.04) -> np.ndarray:
    t = t_axis(dur)
    sig = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, 9))
    e = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / 0.08)
    return sig * e / np.max(np.abs(sig))


def beep(freq: float, dur: float = 0.14) -> np.ndarray:
    t = t_axis(dur)
    sig = np.sign(np.sin(2 * np.pi * freq * t)) * 0.6 + np.sin(2 * np.pi * freq * t) * 0.4
    sig *= np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.008)
    return sig


def siren(dur: float, f0: float, f1: float, cycles: int) -> np.ndarray:
    t = t_axis(dur)
    ph = (t * cycles / dur) % 1.0
    f = f0 + (f1 - f0) * np.where(ph < 0.5, ph * 2, 2 - ph * 2)
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(phase) + 0.5 * np.sin(2 * phase) + 0.25 * np.sin(3 * phase)
    sig = np.tanh(sig * 1.6)
    return sig * np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.05)


def sleigh_bells(dur: float) -> np.ndarray:
    n = int(SR * dur)
    noise = RNG.normal(0, 1, n)
    t = np.arange(n) / SR
    # szum pasmowy przez prosty filtr (różnica szumu = górnoprzepustowy) z szybkimi "uderzeniami"
    hp = np.diff(noise, prepend=0)
    hits = np.zeros(n)
    for k in np.arange(0.0, dur - 0.05, 0.11):
        place(hits, np.exp(-t[: int(0.09 * SR)] * 38), k)
    return hp * hits * 0.6


def chirp(f0: float, f1: float, dur: float) -> np.ndarray:
    t = t_axis(dur)
    f = f0 + (f1 - f0) * t / dur
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    return sig * np.sin(np.pi * t / dur) ** 0.7


NOTE = {"C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.0, "A4": 440.0, "B4": 493.88,
        "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.0, "C6": 1046.5,
        "G3": 196.0, "C3": 130.81, "E3": 164.81}


def build() -> dict[str, tuple[np.ndarray, int]]:
    s: dict[str, tuple[np.ndarray, int]] = {}

    # --- delikatne (klasa 1) ---
    b = np.zeros(int(SR * 2.2))
    place(b, bell(NOTE["E5"], 1.6, 3.2, 0.5), 0.0)
    place(b, bell(NOTE["A5"], 1.6, 3.2, 0.5), 0.45)
    s["delikatny_dzwonek"] = (b, 1)

    b = np.zeros(int(SR * 3.6))
    for i, n in enumerate(["E5", "G5", "C6", "G5", "E5", "G5", "C6", "E5"]):
        place(b, music_box(NOTE[n], 1.0), 0.0 + i * 0.4)
    s["pozytywka"] = (b, 1)

    b = np.zeros(int(SR * 3.4))
    for i, n in enumerate(["C4", "E4", "G4", "C5", "E5"]):
        place(b, pluck(NOTE[n], 1.8, 0.9975, 0.3), i * 0.17)
    s["harfa"] = (b, 1)

    # --- średnie (klasa 2) ---
    b = np.zeros(int(SR * 2.6))
    place(b, bell(NOTE["G5"], 1.5, 2.6, 1.0), 0.0)
    place(b, bell(NOTE["C5"], 1.8, 2.4, 1.0), 0.5)
    place(b, bell(NOTE["G5"], 1.5, 2.6, 1.0), 1.2)
    s["dzwonek"] = (b, 2)

    b = np.zeros(int(SR * 3.6))
    chord = ["E3", "G3", "C4", "E4", "G4"]          # akord C-dur "przeciągnięty" po strunach, dwa razy
    for i, n in enumerate(chord):
        place(b, pluck(NOTE[n], 2.4, 0.9972, 0.55), i * 0.045)
    for i, n in enumerate(chord):
        place(b, pluck(NOTE[n], 1.8, 0.997, 0.55), 1.3 + i * 0.04)
    s["gitara"] = (b, 2)

    b = np.zeros(int(SR * 2.4))
    for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "C6"]):
        place(b, marimba(NOTE[n]), i * 0.2)
    s["marimba"] = (b, 2)

    # --- mocne (klasa 3) ---
    b = np.zeros(int(SR * 2.0))
    for k in range(3):
        place(b, beep(1760, 0.13), k * 0.2)
    for k in range(3):
        place(b, beep(1760, 0.13), 1.05 + k * 0.2)
    s["sygnal"] = (b, 3)

    b = np.zeros(int(SR * 3.0))
    for i, (n, d) in enumerate([("C5", 0.28), ("E5", 0.28), ("G5", 0.28), ("C6", 0.7)]):
        place(b, brass(NOTE[n], d + 0.1), [0, 0.3, 0.6, 0.9][i])
    s["fanfara"] = (b, 3)

    b = np.zeros(int(SR * 3.2))
    for k in range(10):   # dzwonek budzika: szybkie uderzenia w dwa dzwonki
        place(b, bell(2093 if k % 2 == 0 else 2349, 0.4, 9.0, 1.4), 0.1 + k * 0.07)
    for k in range(10):
        place(b, bell(2093 if k % 2 == 0 else 2349, 0.4, 9.0, 1.4), 1.2 + k * 0.07)
    s["budzik"] = (b, 3)

    # --- bardzo mocne (klasa 4) ---
    s["alarm"] = (siren(3.0, 650, 1500, 4), 4)
    b = np.zeros(int(SR * 3.4))
    for k in range(6):
        place(b, np.tanh(2.2 * beep(2000 if k % 2 == 0 else 1500, 0.28)), k * 0.5)
    s["syrena"] = (b, 4)

    # --- okolicznościowe ---
    # Boże Narodzenie: początek "Jingle Bells" (melodia z domeny publicznej) na dzwonkach + grzechotki sań
    b = np.zeros(int(SR * 5.2))
    melody = [("E5", 0.0), ("E5", 0.32), ("E5", 0.64), ("E5", 1.2), ("E5", 1.52), ("E5", 1.84),
              ("E5", 2.4), ("G5", 2.72), ("C5", 3.04), ("D5", 3.36), ("E5", 3.68)]
    for n, st in melody:
        place(b, bell(NOTE[n], 0.9, 4.5, 0.7), st)
    place(b, sleigh_bells(4.6), 0.0)
    s["boze_narodzenie"] = (b, 2)

    # Wielkanoc: kurczaczek (ćwierkanie) i dzwony
    b = np.zeros(int(SR * 3.0))
    for i, (f0, f1, st) in enumerate([(2600, 3600, 0.0), (2700, 3800, 0.22), (2500, 3500, 0.44), (2800, 3900, 0.9), (2600, 3700, 1.12), (2700, 3600, 1.34)]):
        place(b, chirp(f0, f1, 0.11) * 0.8, st)
    s["wielkanoc_kurczaczek"] = (b, 2)

    b = np.zeros(int(SR * 4.6))
    for k, st in enumerate([0.0, 1.1, 2.2]):
        place(b, bell(196.0, 2.4, 1.6, 0.6) + 0.5 * bell(293.66, 2.4, 1.8, 0.4), st)
    s["wielkanoc_dzwony"] = (b, 3)

    # --- melodie ---
    # "Wlazł kotek na płotek": tradycyjna piosenka ludowa (domena publiczna), 6 taktów w metrum 3/4, C-dur.
    # Nuty z zapisu na portalu edukacyjnym zpe.gov.pl (online-skills, CC BY 3.0): G E E | F D D | C E G | G E E | F D D | C E C
    q = 0.42                                    # ćwierćnuta (ok. 143 uderzeń na minutę)
    kotek = [("G4", 0, 1), ("E4", 1, 1), ("E4", 2, 1),
             ("F4", 3, 1), ("D4", 4, 1), ("D4", 5, 1),
             ("C4", 6, .5), ("E4", 6.5, .5), ("G4", 7, 1),
             ("G4", 9, 1), ("E4", 10, 1), ("E4", 11, 1),
             ("F4", 12, 1), ("D4", 13, 1), ("D4", 14, 1),
             ("C4", 15, .5), ("E4", 15.5, .5), ("C4", 16, 1)]
    b = np.zeros(int(SR * (17 * q + 1.2)))
    for n, st, d in kotek:
        place(b, music_box(NOTE[n], 1.1 if n != "C4" or st < 16 else 1.6), st * q)
    s["wlaz_kotek"] = (b, 2)

    # Wesoła kreskówkowa melodyjka: własny, oryginalny motyw (nie jest cytatem żadnej bajki)
    b = np.zeros(int(SR * 3.2))
    for i, n in enumerate(["C5", "E5", "G5", "C6"]):
        place(b, pluck(NOTE[n], 0.5, 0.99, 0.8), 0.0 + i * 0.09)
    for i, (n, st) in enumerate([("G5", 0.6), ("G5", 0.8), ("E5", 1.0), ("G5", 1.3), ("A5", 1.5), ("G5", 1.7)]):
        place(b, marimba(NOTE[n], 0.5), st)
    place(b, marimba(NOTE["C6"], 1.0), 2.1)
    place(b, marimba(NOTE["C5"], 1.0), 2.1)
    s["kreskowka"] = (b, 3)

    # "Pop Goes the Weasel": tradycyjna angielska melodia taneczna z XIX w. (domena publiczna), 6/8, C-dur.
    # Nuty z zapisu na Wikipedii (en.wikipedia.org/wiki/Pop_Goes_the_Weasel):
    # C C D D | E G E C | C C D D | E C - - | C C D D | E G E C | A - - D F | E C - -   (jednostka = ósemka)
    e = 0.17
    weasel = [("C4", 0, 2), ("C4", 2, 1), ("D4", 3, 2), ("D4", 5, 1),
              ("E4", 6, 1), ("G4", 7, 1), ("E4", 8, 1), ("C4", 9, 3),
              ("C4", 12, 2), ("C4", 14, 1), ("D4", 15, 2), ("D4", 17, 1),
              ("E4", 18, 3), ("C4", 21, 1),
              ("C4", 24, 2), ("C4", 26, 1), ("D4", 27, 2), ("D4", 29, 1),
              ("E4", 30, 1), ("G4", 31, 1), ("E4", 32, 1), ("C4", 33, 3),
              ("A4", 36, 1), ("D4", 39, 2), ("F4", 41, 1),
              ("E4", 42, 3), ("C4", 45, 1)]
    b = np.zeros(int(SR * (48 * e + 1.2)))
    for n, st, d in weasel:
        place(b, music_box(NOTE[n], 1.0 if st < 45 else 1.6), st * e)
    s["pop_weasel"] = (b, 2)

    # SOS alfabetem Morse'a: ... --- ...  (kropka = 1 jednostka, kreska = 3, przerwa w literze = 1, między literami = 3)
    u = 0.12
    b = np.zeros(int(SR * (27 * u + 0.3)))
    t = 0.0
    for letter in ("...", "---", "..."):
        for mark in letter:
            dur = (1 if mark == "." else 3) * u
            tone = beep(880, dur)
            place(b, tone, t)
            t += dur + u
        t += 2 * u          # razem 3 jednostki przerwy po literze (1 już dodana po ostatnim znaku)
    s["sos"] = (b, 3)
    return s


def fade(sig: np.ndarray) -> np.ndarray:
    n = int(0.02 * SR)
    sig = sig.copy()
    sig[:n] *= np.linspace(0, 1, n)
    sig[-n:] *= np.linspace(1, 0, n)
    return sig


def trim_tail(sig: np.ndarray) -> np.ndarray:
    idx = np.where(np.abs(sig) > 0.003 * np.max(np.abs(sig)))[0]
    return sig[: idx[-1] + int(0.05 * SR)] if len(idx) else sig


def max_loud(sig: np.ndarray) -> np.ndarray:
    """Poziom 4 "bardzo głośno" (dla osób z dużym niedosłuchem): niezależnie od klasy mocy dźwięk jest mocno
    ściśnięty miękkim ogranicznikiem, aż RMS dojdzie do ok. -10 dBFS (szczyty nie przekraczają 0,97)."""
    x = sig / (np.max(np.abs(sig)) + 1e-9)
    out = x
    for g in (1.0, 1.5, 2.2, 3.2, 4.5, 6.5, 9.0, 13.0):
        out = np.tanh(x * g) / np.tanh(g) * 0.97
        if 20 * np.log10(np.sqrt(np.mean(out ** 2)) + 1e-9) >= -10.0:
            break
    return out


def to_level(sig: np.ndarray, power: int, level: int) -> np.ndarray:
    sig = trim_tail(sig)
    if level == 4:
        return fade(max_loud(sig))
    rms = np.sqrt(np.mean(sig ** 2)) + 1e-9
    target_db = POWER_RMS[power] + LEVEL_OFFSET_DB[level]
    out = sig * (10 ** (target_db / 20) / rms)
    peak = np.max(np.abs(out))
    if peak > 0.9:   # miękki limiter zamiast ucinania szczytów
        out = np.tanh(out / 0.9) * 0.9
    return fade(out)


def write_wav(path: Path, sig: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(sig, -1, 1) * 32767).astype(np.int16).tobytes())


def main() -> None:
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_tmp.wav"
    for sid, (sig, power) in build().items():
        for level in (1, 2, 3, 4):
            write_wav(tmp, to_level(sig, power, level))
            target = OUT / f"{sid}_{level}.ogg"
            subprocess.run([ffmpeg, "-y", "-v", "error", "-i", str(tmp), "-c:a", "libvorbis", "-q:a", "4", str(target)], check=True)
        print(f"{sid}: {len(sig) / SR:.1f} s, klasa mocy {power}")
    tmp.unlink(missing_ok=True)
    total = sum(f.stat().st_size for f in OUT.glob("*_?.ogg"))
    print(f"written {len(list(OUT.glob('*_?.ogg')))} files, total {total // 1024} KB, directory {OUT}")


if __name__ == "__main__":
    main()
