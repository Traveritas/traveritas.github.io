"""Direction A (Crystalline Hall / 晶棱回响) and Direction B (Optic Loom / 薄雾光格).
All pitches strictly locked to site BGM key: F Natural Minor / Ab Major.
"""
from __future__ import annotations
import math
import numpy as np
from dsp import (
    SR, NOTE, make_buf, pan_mono, mix_at, biquad_filter,
    modal_strike, air_transient, fdn_reverb, finalize,
)

# Quartz / thin glass modal ratios (fundamental + crisp luminous overtones)
QUARTZ = [(1.0, 1.0, 0.42), (2.756, 0.24, 0.16), (4.0, 0.11, 0.12), (5.404, 0.06, 0.06)]
QUARTZ_SHORT = [(1.0, 1.0, 0.16), (2.756, 0.22, 0.07), (5.404, 0.05, 0.03)]
QUARTZ_LONG = [(1.0, 1.0, 0.85), (2.0, 0.28, 0.62), (2.756, 0.18, 0.30), (4.0, 0.09, 0.20)]


# ==================== DIRECTION A: CRYSTALLINE HALL ====================

def a_hover_crystal() -> np.ndarray:
    buf = make_buf(0.65)
    mix_at(buf, air_transient(0.018, (3200, 7600), 0.004, pan=-0.12, seed=1), 0.0, 0.14)
    mix_at(buf, modal_strike(NOTE["C6"], 0.42, QUARTZ_SHORT, atk=0.006, pan=-0.16, spread=0.35), 0.0, 0.55)
    mix_at(buf, modal_strike(NOTE["Eb6"], 0.38, QUARTZ_SHORT, atk=0.010, pan=0.22, spread=0.35), 0.028, 0.32)
    wet = fdn_reverb(buf, rt60=1.25, wet=0.46, damp_hz=5800, shimmer=0.14, tail_pad=0.40)
    return finalize(wet, target_peak_db=-9.5, fade_in_ms=4.0, fade_out_ms=60.0)


def a_click_confirm() -> np.ndarray:
    buf = make_buf(0.85)
    mix_at(buf, air_transient(0.014, (2800, 8200), 0.0032, pan=0.0, seed=2), 0.0, 0.36)
    mix_at(buf, modal_strike(NOTE["Ab5"], 0.55, QUARTZ, atk=0.0014, pan=-0.10, spread=0.30), 0.0, 0.78)
    mix_at(buf, modal_strike(NOTE["Eb6"], 0.50, QUARTZ_SHORT, atk=0.002, pan=0.18, spread=0.36), 0.022, 0.44)
    wet = fdn_reverb(buf, rt60=1.55, wet=0.42, damp_hz=5400, shimmer=0.12, tail_pad=0.48)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=1.5, fade_out_ms=70.0)


def a_star_open() -> np.ndarray:
    buf = make_buf(1.05)
    notes = [("F5", 0.0, -0.34, 0.65), ("Ab5", 0.048, -0.10, 0.72),
             ("C6", 0.098, 0.16, 0.76), ("Eb6", 0.152, 0.38, 0.52)]
    for nm, t0, p, g in notes:
        mix_at(buf, air_transient(0.014, (3400, 7800), 0.0035, pan=p, seed=int(t0 * 1000) + 3), t0, 0.18 * g)
        mix_at(buf, modal_strike(NOTE[nm], 0.58, QUARTZ, atk=0.0025, pan=p, spread=0.28), t0, g)
    wet = fdn_reverb(buf, rt60=1.65, wet=0.48, damp_hz=5600, shimmer=0.16, tail_pad=0.55)
    return finalize(wet, target_peak_db=-6.8, fade_in_ms=2.5, fade_out_ms=90.0)


def a_star_close() -> np.ndarray:
    buf = make_buf(0.85)
    notes = [("C6", 0.0, 0.28, 0.58), ("Ab5", 0.044, 0.04, 0.68), ("F5", 0.092, -0.22, 0.72)]
    for nm, t0, p, g in notes:
        mix_at(buf, modal_strike(NOTE[nm], 0.42, QUARTZ_SHORT, atk=0.003, pan=p, spread=0.22), t0, g)
    wet = fdn_reverb(buf, rt60=1.10, wet=0.38, damp_hz=4200, shimmer=0.0, tail_pad=0.38)
    return finalize(wet, target_peak_db=-7.8, fade_in_ms=2.5, fade_out_ms=70.0)


def a_ring_tick() -> np.ndarray:
    buf = make_buf(0.24)
    mix_at(buf, air_transient(0.010, (3600, 8600), 0.0022, pan=0.04, seed=5), 0.0, 0.34)
    mix_at(buf, modal_strike(NOTE["Eb6"], 0.12, [(1.0, 0.9, 0.042), (2.756, 0.25, 0.018)],
                             atk=0.0008, pan=-0.05, spread=0.24), 0.0, 0.80)
    wet = fdn_reverb(buf, rt60=0.48, wet=0.28, damp_hz=6000, predelay_ms=7.0, tail_pad=0.12)
    return finalize(wet, target_peak_db=-8.8, fade_in_ms=1.0, fade_out_ms=28.0)


def a_flip_dream() -> np.ndarray:
    """Day -> Night (900ms pulse): descending crystalline mist blooming into deep F minor hall."""
    buf = make_buf(1.55)
    # Soft frosted veil swell
    t = np.arange(len(buf)) / SR
    veil = biquad_filter(np.random.default_rng(14).standard_normal(len(buf)), "bandpass", (420, 1900), order=2)
    veil_env = np.sin(np.clip(t / 1.15, 0.0, 1.0) * math.pi) ** 1.8
    mix_at(buf, pan_mono(veil * veil_env, 0.0), 0.0, 0.08)
    # Descending glassy harmonic cascade (Eb6 -> C6 -> Ab5 -> F5 -> C5)
    seq = [("Eb6", 0.02, 0.42, 0.45), ("C6", 0.16, 0.20, 0.56), ("Ab5", 0.34, -0.08, 0.68),
           ("F5", 0.54, -0.32, 0.76), ("C5", 0.78, 0.0, 0.64)]
    for nm, t0, p, g in seq:
        mix_at(buf, modal_strike(NOTE[nm], 0.95, QUARTZ_LONG, atk=0.012, pan=p, spread=0.40, drift_hz=0.9), t0, g)
    wet = fdn_reverb(buf, rt60=2.35, wet=0.58, damp_hz=4100, shimmer=0.18, predelay_ms=20.0, tail_pad=0.75)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=10.0, fade_out_ms=180.0)


def a_flip_wake() -> np.ndarray:
    """Night -> Day (900ms pulse): mist clearing upward into bright crisp Ab major / F minor light."""
    buf = make_buf(1.45)
    seq = [("F5", 0.02, -0.38, 0.62), ("Ab5", 0.15, -0.14, 0.68), ("C6", 0.30, 0.12, 0.76),
           ("Eb6", 0.48, 0.34, 0.72), ("G6", 0.70, 0.0, 0.42)]
    for nm, t0, p, g in seq:
        mix_at(buf, air_transient(0.015, (3200, 8200), 0.004, pan=p, seed=int(t0 * 100) + 20), t0, 0.18 * g)
        mix_at(buf, modal_strike(NOTE[nm], 0.80, QUARTZ, atk=0.004, pan=p, spread=0.35), t0, g)
    wet = fdn_reverb(buf, rt60=1.85, wet=0.50, damp_hz=6400, shimmer=0.22, predelay_ms=16.0, tail_pad=0.65)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=6.0, fade_out_ms=160.0)


def a_gate_nexus() -> np.ndarray:
    """4D hypercube swelling & white-out over ~1.34s DOOR sequence + luminous hall tail."""
    buf = make_buf(2.25)
    t = np.arange(len(buf)) / SR
    # Harmonic pad swelling toward t=1.28s white-out
    swell = np.where(t < 1.28, (t / 1.28) ** 2.1, np.exp(-(t - 1.28) / 0.55))
    for nm, p, g in [("F4", -0.35, 0.36), ("C5", 0.35, 0.38), ("Ab5", -0.18, 0.32), ("Eb6", 0.22, 0.20)]:
        sig = np.sin(2.0 * math.pi * NOTE[nm] * t + 0.4 * np.sin(2.0 * math.pi * 0.7 * t)) * swell
        mix_at(buf, pan_mono(sig, p), 0.0, g)
    # Rotating crystalline facets accelerating slightly into the threshold
    steps = [("F5", 0.08, -0.45), ("Ab5", 0.30, 0.40), ("Bb5", 0.50, -0.30),
             ("C6", 0.68, 0.28), ("Eb6", 0.86, -0.18), ("F6", 1.04, 0.14)]
    for nm, t0, p in steps:
        mix_at(buf, modal_strike(NOTE[nm], 0.75, QUARTZ, atk=0.005, pan=p, spread=0.38), t0, 0.46)
    # Threshold bloom at 1.24s
    mix_at(buf, modal_strike(NOTE["C6"], 1.05, QUARTZ_LONG, atk=0.008, pan=-0.12, spread=0.50), 1.22, 0.72)
    mix_at(buf, modal_strike(NOTE["F6"], 0.95, QUARTZ_LONG, atk=0.010, pan=0.15, spread=0.50), 1.24, 0.56)
    wet = fdn_reverb(buf, rt60=2.8, wet=0.60, damp_hz=6200, shimmer=0.28, predelay_ms=22.0, tail_pad=0.85)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=24.0, fade_out_ms=220.0)


# ==================== DIRECTION B: OPTIC LOOM ====================

def _optic_grain(freq: float, dur: float, pan: float = 0.0, bright: float = 1.0) -> np.ndarray:
    """Hann-windowed optical harmonic grain with subtle frosted air halo."""
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    win = np.sin(math.pi * t / max(dur, 1e-4)) ** 1.35
    sig = (np.sin(2.0 * math.pi * freq * t)
           + 0.26 * bright * np.sin(2.0 * math.pi * freq * 2.0 * t + 0.5)
           + 0.10 * bright * np.sin(2.0 * math.pi * freq * 3.0 * t + 1.1)) * win
    return pan_mono(sig, pan)


def _frosted_sweep(dur: float, f_start: float, f_end: float, pan_start: float, pan_end: float, seed: int) -> np.ndarray:
    """Silky frosted-glass bandpass air sweep moving gently across stereo field."""
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(n)
    # Split into 2 moving bands crossfaded smoothly
    b1 = biquad_filter(raw, "bandpass", (max(120, f_start * 0.7), min(11000, f_start * 1.4)), order=2)
    b2 = biquad_filter(raw, "bandpass", (max(120, f_end * 0.7), min(11000, f_end * 1.4)), order=2)
    u = t / max(dur, 1e-4)
    env = np.sin(math.pi * u) ** 1.4
    mono = (b1 * (1.0 - u) + b2 * u) * env
    p = pan_start + (pan_end - pan_start) * u
    ang = (np.clip(p, -1.0, 1.0) + 1.0) * (math.pi * 0.25)
    return np.column_stack((mono * np.cos(ang), mono * np.sin(ang)))


def b_hover_crystal() -> np.ndarray:
    buf = make_buf(0.55)
    mix_at(buf, _frosted_sweep(0.28, 1200, 2800, -0.35, 0.35, seed=31), 0.0, 0.28)
    mix_at(buf, _optic_grain(NOTE["Bb5"], 0.16, pan=-0.18, bright=0.8), 0.02, 0.42)
    mix_at(buf, _optic_grain(NOTE["F6"], 0.18, pan=0.22, bright=0.6), 0.08, 0.32)
    wet = fdn_reverb(buf, rt60=1.05, wet=0.44, damp_hz=4400, predelay_ms=12.0, tail_pad=0.35)
    return finalize(wet, target_peak_db=-9.5, fade_in_ms=6.0, fade_out_ms=60.0)


def b_click_confirm() -> np.ndarray:
    buf = make_buf(0.70)
    # Double optical shutter micro-step (0ms + 38ms)
    mix_at(buf, air_transient(0.012, (2000, 6200), 0.0028, pan=-0.12, seed=32), 0.0, 0.42)
    mix_at(buf, _optic_grain(NOTE["F5"], 0.11, pan=-0.15, bright=1.0), 0.0, 0.65)
    mix_at(buf, _optic_grain(NOTE["C6"], 0.24, pan=0.16, bright=0.9), 0.038, 0.72)
    mix_at(buf, _frosted_sweep(0.24, 1600, 3400, -0.25, 0.25, seed=33), 0.02, 0.24)
    wet = fdn_reverb(buf, rt60=1.25, wet=0.40, damp_hz=4800, tail_pad=0.38)
    return finalize(wet, target_peak_db=-6.4, fade_in_ms=1.5, fade_out_ms=60.0)


def b_star_open() -> np.ndarray:
    """12fps optical aperture unfolding in 4 gentle stepped grains."""
    buf = make_buf(0.95)
    mix_at(buf, _frosted_sweep(0.45, 700, 2900, -0.45, 0.45, seed=34), 0.0, 0.30)
    for idx, (nm, p) in enumerate([("F5", -0.35), ("G5", -0.12), ("Bb5", 0.14), ("C6", 0.38)]):
        t0 = idx * 0.078  # ~12.8 fps site cadence
        mix_at(buf, _optic_grain(NOTE[nm], 0.18, pan=p, bright=0.85), t0, 0.56 + 0.06 * idx)
    wet = fdn_reverb(buf, rt60=1.35, wet=0.44, damp_hz=4600, tail_pad=0.45)
    return finalize(wet, target_peak_db=-6.8, fade_in_ms=3.0, fade_out_ms=80.0)


def b_star_close() -> np.ndarray:
    buf = make_buf(0.75)
    mix_at(buf, _frosted_sweep(0.32, 2600, 750, 0.35, -0.35, seed=35), 0.0, 0.28)
    for idx, (nm, p) in enumerate([("C6", 0.28), ("Ab5", 0.0), ("F5", -0.26)]):
        mix_at(buf, _optic_grain(NOTE[nm], 0.14, pan=p, bright=0.65), idx * 0.068, 0.58)
    wet = fdn_reverb(buf, rt60=0.95, wet=0.36, damp_hz=3800, tail_pad=0.32)
    return finalize(wet, target_peak_db=-7.8, fade_in_ms=3.0, fade_out_ms=65.0)


def b_ring_tick() -> np.ndarray:
    buf = make_buf(0.18)
    mix_at(buf, air_transient(0.008, (2600, 6800), 0.0018, pan=0.0, seed=36), 0.0, 0.40)
    mix_at(buf, _optic_grain(NOTE["C6"], 0.048, pan=0.06, bright=0.9), 0.0, 0.72)
    wet = fdn_reverb(buf, rt60=0.38, wet=0.22, damp_hz=4600, predelay_ms=6.0, tail_pad=0.10)
    return finalize(wet, target_peak_db=-8.8, fade_in_ms=1.0, fade_out_ms=24.0)


def b_flip_dream() -> np.ndarray:
    """9-step 100ms pixel-coarsen & darkroom re-focus pulse matching site PULSE = [1,2,4,7,7,5,3,2,1]."""
    buf = make_buf(1.45)
    pulse = [1, 2, 4, 7, 7, 5, 3, 2, 1]
    scale_notes = ["Eb6", "C6", "Bb5", "Ab5", "G5", "F5", "Eb5", "C5", "F4"]
    mix_at(buf, _frosted_sweep(1.10, 3200, 520, 0.45, -0.45, seed=37), 0.02, 0.34)
    for i, (lvl, nm) in enumerate(zip(pulse, scale_notes)):
        t0 = i * 0.100  # Exact 100ms site step!
        pan = -0.42 + 0.84 * (i / 8.0) * (-1 if i % 2 else 1) * 0.6
        g = 0.22 + 0.07 * lvl
        mix_at(buf, _optic_grain(NOTE[nm], 0.22, pan=pan, bright=0.45 + 0.07 * (9 - i)), t0, g)
    wet = fdn_reverb(buf, rt60=1.95, wet=0.54, damp_hz=3600, shimmer=0.08, predelay_ms=18.0, tail_pad=0.65)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=8.0, fade_out_ms=160.0)


def b_flip_wake() -> np.ndarray:
    """9-step 100ms pixel focus clearing upward into daylight clarity."""
    buf = make_buf(1.40)
    pulse = [1, 2, 4, 7, 7, 5, 3, 2, 1]
    scale_notes = ["F4", "C5", "Eb5", "F5", "G5", "Ab5", "Bb5", "C6", "Eb6"]
    mix_at(buf, _frosted_sweep(1.05, 560, 3600, -0.45, 0.45, seed=38), 0.02, 0.34)
    for i, (lvl, nm) in enumerate(zip(pulse, scale_notes)):
        t0 = i * 0.100
        pan = (-0.36 + 0.72 * (i / 8.0))
        g = 0.22 + 0.065 * lvl
        mix_at(buf, _optic_grain(NOTE[nm], 0.20, pan=pan, bright=0.50 + 0.08 * i), t0, g)
    wet = fdn_reverb(buf, rt60=1.65, wet=0.48, damp_hz=5600, shimmer=0.14, predelay_ms=15.0, tail_pad=0.58)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=6.0, fade_out_ms=150.0)


def b_gate_nexus() -> np.ndarray:
    """9-step 120ms DOOR optical expansion matching site DOOR = [1,2,3,5,8,12,18,26,40]."""
    buf = make_buf(2.15)
    mix_at(buf, _frosted_sweep(1.38, 420, 4800, -0.55, 0.55, seed=39), 0.0, 0.42)
    notes = ["F4", "Ab4", "Bb4", "C5", "Eb5", "F5", "Ab5", "C6", "Eb6"]
    for i, nm in enumerate(notes):
        t0 = i * 0.120  # Exact 120ms DOOR_MS!
        g = 0.24 + 0.075 * i
        p = ((-1) ** i) * (0.45 - 0.04 * i)
        mix_at(buf, _optic_grain(NOTE[nm], 0.28 + 0.03 * i, pan=p, bright=0.6 + 0.06 * i), t0, g)
    # White-out aperture flash at 1.15s
    mix_at(buf, modal_strike(NOTE["F6"], 0.90, QUARTZ, atk=0.015, pan=0.0, spread=0.55), 1.12, 0.65)
    wet = fdn_reverb(buf, rt60=2.45, wet=0.58, damp_hz=5400, shimmer=0.22, predelay_ms=20.0, tail_pad=0.75)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=16.0, fade_out_ms=200.0)


RECIPES_AB = {
    "a_hover_crystal": a_hover_crystal,
    "a_click_confirm": a_click_confirm,
    "a_star_open": a_star_open,
    "a_star_close": a_star_close,
    "a_ring_tick": a_ring_tick,
    "a_flip_dream": a_flip_dream,
    "a_flip_wake": a_flip_wake,
    "a_gate_nexus": a_gate_nexus,
    "b_hover_crystal": b_hover_crystal,
    "b_click_confirm": b_click_confirm,
    "b_star_open": b_star_open,
    "b_star_close": b_star_close,
    "b_ring_tick": b_ring_tick,
    "b_flip_dream": b_flip_dream,
    "b_flip_wake": b_flip_wake,
    "b_gate_nexus": b_gate_nexus,
}
