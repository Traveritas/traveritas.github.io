"""Render all 92 stereo SFX prototypes (Batch 1 + Batch 2 + Batch 3: WAV + MP3 + base64 bundle) and print QC report."""
from __future__ import annotations
import base64
import json
import subprocess
import time
from pathlib import Path
import numpy as np
from scipy.io import wavfile

from dsp import SR, analyze
from recipes_ab import RECIPES_AB
from recipes_cd import RECIPES_CD
from recipes_e import RECIPES_E
from recipes_f import RECIPES_F
from recipes_g import RECIPES_G
from recipes_h import RECIPES_H
from recipes_i import RECIPES_I
from recipes_j import RECIPES_J

ROOT = Path(__file__).resolve().parent
WAV_DIR = ROOT / "samples" / "wav"
MP3_DIR = ROOT / "samples" / "mp3"
BUNDLE_JS = ROOT / "samples-bundle.js"
REPORT_JSON = ROOT / "samples-report.json"


def write_wav_24bit_or_16bit(path: Path, sig: np.ndarray) -> None:
    clipped = np.clip(sig, -1.0, 1.0)
    pcm16 = np.round(clipped * 32767.0).astype(np.int16)
    wavfile.write(str(path), SR, pcm16)


def encode_mp3(wav_path: Path, mp3_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(wav_path),
        "-codec:a", "libmp3lame", "-q:a", "2",
        str(mp3_path),
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    t0 = time.perf_counter()
    WAV_DIR.mkdir(parents=True, exist_ok=True)
    MP3_DIR.mkdir(parents=True, exist_ok=True)

    all_recipes = {
        **RECIPES_AB,
        **RECIPES_CD,
        **RECIPES_E,
        **RECIPES_F,
        **RECIPES_G,
        **RECIPES_H,
        **RECIPES_I,
        **RECIPES_J,
    }
    bundle: dict[str, str] = {}
    metrics: dict[str, dict] = {}
    clipped_count = 0

    print(f"Synthesizing {len(all_recipes)} stereo 48kHz SFX prototypes...")
    print(f"{'ID':<22} {'Dur':>6} {'Peak':>7} {'RMS':>7} {'L/R':>6} {'DomHz':>8} {'MP3':>7}")
    print("-" * 72)

    for sid, fn in all_recipes.items():
        sig = fn()
        st = analyze(sig)
        if st["peak_db"] > -1.4:
            clipped_count += 1
        wav_p = WAV_DIR / f"{sid}.wav"
        mp3_p = MP3_DIR / f"{sid}.mp3"
        write_wav_24bit_or_16bit(wav_p, sig)
        encode_mp3(wav_p, mp3_p)
        mp3_bytes = mp3_p.read_bytes()
        bundle[sid] = "data:audio/mpeg;base64," + base64.b64encode(mp3_bytes).decode("ascii")
        st["mp3_kb"] = round(len(mp3_bytes) / 1024.0, 1)
        metrics[sid] = st
        print(
            f"{sid:<22} {st['dur_s']:>5.2f}s {st['peak_db']:>6.1f}d "
            f"{st['rms_db']:>6.1f}d {st['lr_corr']:>6.2f} {st['dom_hz']:>7.1f} "
            f"{st['mp3_kb']:>5.1f}KB"
        )

    BUNDLE_JS.write_text(
        "// Auto-generated compact MP3 data-URI bundle for zero-CORS file:// audition\n"
        f"window.SFX_BUNDLE = {json.dumps(bundle, separators=(',', ':'))};\n"
        f"window.SFX_METRICS = {json.dumps(metrics, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    REPORT_JSON.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    elapsed = time.perf_counter() - t0
    bundle_kb = BUNDLE_JS.stat().st_size / 1024.0
    print("-" * 72)
    print(
        f"Done in {elapsed:.2f}s | Total: {len(all_recipes)} cues | "
        f"Over-ceiling (> -1.4dBFS): {clipped_count} | "
        f"Bundle: {bundle_kb:.1f} KB"
    )


if __name__ == "__main__":
    main()
