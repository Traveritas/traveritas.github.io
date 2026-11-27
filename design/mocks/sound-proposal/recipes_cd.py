"""Direction C (Mineral & Dew / 水石微尘), Direction D (Celestial Tactile / 星仪冷脉),
and 4 Site-Exclusive Bonus Cues (Section Signatures + FX Channel Unlock).
"""
from __future__ import annotations
import math
import numpy as np
from dsp import (
    SR, NOTE, make_buf, pan_mono, mix_at, biquad_filter,
    modal_strike, air_transient, water_drop, micro_pulse, fdn_reverb, finalize,
)

# Warm mineral / jade / damped marimba modal ratios
STONE = [(1.0, 1.0, 0.24), (2.42, 0.26, 0.09), (3.88, 0.09, 0.04)]
STONE_DEEP = [(1.0, 1.0, 0.45), (1.99, 0.28, 0.22), (3.12, 0.11, 0.10)]


# ==================== DIRECTION C: MINERAL & DEW ====================

def c_hover_crystal() -> np.ndarray:
    buf = make_buf(0.60)
    mix_at(buf, water_drop(NOTE["Ab5"] * 0.85, NOTE["Eb6"], dur=0.075, decay=0.020,
                           pan=-0.16, cavity_hz=NOTE["Ab5"]), 0.0, 0.72)
    wet = fdn_reverb(buf, rt60=1.15, wet=0.42, damp_hz=4200, predelay_ms=10.0, tail_pad=0.35)
    return finalize(wet, target_peak_db=-9.2, fade_in_ms=2.0, fade_out_ms=60.0)


def c_click_confirm() -> np.ndarray:
    buf = make_buf(0.75)
    mix_at(buf, modal_strike(NOTE["F5"], 0.38, STONE, atk=0.0018, pan=-0.10, spread=0.25), 0.0, 0.75)
    mix_at(buf, water_drop(NOTE["Bb5"] * 0.86, NOTE["C6"] * 1.18, dur=0.085, decay=0.022,
                           pan=0.18, cavity_hz=NOTE["C6"]), 0.016, 0.78)
    wet = fdn_reverb(buf, rt60=1.35, wet=0.40, damp_hz=4400, predelay_ms=11.0, tail_pad=0.40)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=1.5, fade_out_ms=65.0)


def c_star_open() -> np.ndarray:
    buf = make_buf(0.95)
    drops = [(NOTE["F5"], -0.32, 0.0), (NOTE["Ab5"], 0.04, 0.068), (NOTE["C6"], 0.34, 0.145)]
    for f, p, t0 in drops:
        mix_at(buf, water_drop(f * 0.82, f * 1.24, dur=0.082, decay=0.022, pan=p, cavity_hz=f), t0, 0.72)
    wet = fdn_reverb(buf, rt60=1.45, wet=0.44, damp_hz=4500, predelay_ms=13.0, tail_pad=0.48)
    return finalize(wet, target_peak_db=-6.8, fade_in_ms=2.0, fade_out_ms=80.0)


def c_star_close() -> np.ndarray:
    buf = make_buf(0.75)
    mix_at(buf, modal_strike(NOTE["Ab5"], 0.28, STONE, atk=0.002, pan=0.20, spread=0.22), 0.0, 0.62)
    mix_at(buf, modal_strike(NOTE["F5"], 0.36, STONE, atk=0.0025, pan=-0.18, spread=0.24), 0.064, 0.76)
    wet = fdn_reverb(buf, rt60=0.95, wet=0.35, damp_hz=3600, tail_pad=0.32)
    return finalize(wet, target_peak_db=-7.8, fade_in_ms=2.0, fade_out_ms=60.0)


def c_ring_tick() -> np.ndarray:
    """Clean river-pebble tap with subtle hollow wood/stone click."""
    buf = make_buf(0.20)
    mix_at(buf, air_transient(0.008, (1400, 4200), 0.0018, pan=0.0, seed=51), 0.0, 0.35)
    mix_at(buf, modal_strike(NOTE["Bb5"], 0.09, [(1.0, 1.0, 0.026), (2.42, 0.32, 0.011)],
                             atk=0.0007, pan=-0.04, spread=0.18), 0.0, 0.85)
    wet = fdn_reverb(buf, rt60=0.36, wet=0.20, damp_hz=3800, predelay_ms=5.0, tail_pad=0.10)
    return finalize(wet, target_peak_db=-8.6, fade_in_ms=1.0, fade_out_ms=22.0)


def c_flip_dream() -> np.ndarray:
    """Suikinkutsu (water-harp well) descending ripples settling into deep stone stillness."""
    buf = make_buf(1.50)
    seq = [("Eb6", 0.02, 0.40), ("C6", 0.19, 0.16), ("Ab5", 0.39, -0.14), ("F5", 0.62, -0.34)]
    for nm, t0, p in seq:
        f = NOTE[nm]
        mix_at(buf, water_drop(f * 0.86, f * 1.18, dur=0.09, decay=0.026, pan=p, cavity_hz=f * 0.5), t0, 0.68)
    mix_at(buf, modal_strike(NOTE["F4"], 0.95, STONE_DEEP, atk=0.008, pan=0.0, spread=0.36), 0.66, 0.64)
    wet = fdn_reverb(buf, rt60=2.15, wet=0.52, damp_hz=3500, predelay_ms=18.0, tail_pad=0.70)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=6.0, fade_out_ms=170.0)


def c_flip_wake() -> np.ndarray:
    """Morning dew rising from stone basin into bright sunlit courtyard."""
    buf = make_buf(1.40)
    seq = [("F5", 0.02, -0.38), ("Ab5", 0.18, -0.12), ("Bb5", 0.35, 0.14), ("Eb6", 0.54, 0.36)]
    for nm, t0, p in seq:
        f = NOTE[nm]
        mix_at(buf, water_drop(f * 0.80, f * 1.28, dur=0.085, decay=0.024, pan=p, cavity_hz=f), t0, 0.72)
    mix_at(buf, modal_strike(NOTE["C6"], 0.72, STONE, atk=0.004, pan=0.0, spread=0.32), 0.72, 0.55)
    wet = fdn_reverb(buf, rt60=1.75, wet=0.46, damp_hz=4900, predelay_ms=14.0, tail_pad=0.60)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=4.0, fade_out_ms=150.0)


def c_gate_nexus() -> np.ndarray:
    """Resonant subterranean stone temple chord + cascading water-harp harmonics."""
    buf = make_buf(2.15)
    t = np.arange(len(buf)) / SR
    swell = np.where(t < 1.24, (t / 1.24) ** 1.9, np.exp(-(t - 1.24) / 0.55))
    for nm, p, g in [("F3", -0.25, 0.32), ("C4", 0.25, 0.35), ("Ab4", 0.0, 0.28)]:
        mix_at(buf, pan_mono(np.sin(2.0 * math.pi * NOTE[nm] * t) * swell, p), 0.0, g)
    for i, (nm, t0, p) in enumerate([
        ("F5", 0.12, -0.42), ("Ab5", 0.34, 0.38), ("C6", 0.56, -0.28),
        ("Eb6", 0.80, 0.26), ("F6", 1.04, -0.10),
    ]):
        f = NOTE[nm]
        mix_at(buf, water_drop(f * 0.84, f * 1.22, dur=0.09, decay=0.025, pan=p, cavity_hz=f * 0.5), t0, 0.58 + 0.05 * i)
    mix_at(buf, modal_strike(NOTE["Ab5"], 1.05, STONE_DEEP, atk=0.005, pan=0.0, spread=0.48), 1.20, 0.82)
    wet = fdn_reverb(buf, rt60=2.55, wet=0.56, damp_hz=4400, shimmer=0.10, predelay_ms=20.0, tail_pad=0.80)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=18.0, fade_out_ms=200.0)


# ==================== DIRECTION D: CELESTIAL TACTILE ====================

def d_hover_crystal() -> np.ndarray:
    buf = make_buf(0.22)
    mix_at(buf, micro_pulse(3200, NOTE["C6"], dur=0.024, decay=0.0045, pan=-0.08, metal_hz=NOTE["Eb6"]), 0.0, 0.72)
    wet = fdn_reverb(buf, rt60=0.32, wet=0.16, damp_hz=6400, predelay_ms=5.0, tail_pad=0.08)
    return finalize(wet, target_peak_db=-9.5, fade_in_ms=0.8, fade_out_ms=24.0)


def d_click_confirm() -> np.ndarray:
    buf = make_buf(0.32)
    mix_at(buf, micro_pulse(2800, NOTE["Ab5"], dur=0.022, decay=0.0042, pan=-0.06), 0.0, 0.88)
    mix_at(buf, micro_pulse(4200, NOTE["Eb6"], dur=0.032, decay=0.007, pan=0.10, metal_hz=NOTE["Eb6"]), 0.024, 0.64)
    wet = fdn_reverb(buf, rt60=0.45, wet=0.18, damp_hz=6800, predelay_ms=6.0, tail_pad=0.12)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=0.6, fade_out_ms=30.0)


def d_star_open() -> np.ndarray:
    """Astrolabe brass-glass rings snapping open in crisp micro-detents."""
    buf = make_buf(0.48)
    for i, (nm, p) in enumerate([("F5", -0.32), ("Ab5", -0.08), ("C6", 0.16), ("Eb6", 0.36)]):
        mix_at(buf, micro_pulse(3400 + 300 * i, NOTE[nm], dur=0.026, decay=0.005,
                                pan=p, metal_hz=NOTE[nm] if i == 3 else None), i * 0.034, 0.68 + 0.06 * i)
    wet = fdn_reverb(buf, rt60=0.58, wet=0.22, damp_hz=6600, predelay_ms=8.0, tail_pad=0.18)
    return finalize(wet, target_peak_db=-6.6, fade_in_ms=0.8, fade_out_ms=40.0)


def d_star_close() -> np.ndarray:
    buf = make_buf(0.36)
    for i, (nm, p) in enumerate([("C6", 0.24), ("Ab5", 0.0), ("F5", -0.22)]):
        mix_at(buf, micro_pulse(2900 - 400 * i, NOTE[nm], dur=0.022, decay=0.0042, pan=p), i * 0.030, 0.72)
    wet = fdn_reverb(buf, rt60=0.42, wet=0.16, damp_hz=5200, predelay_ms=6.0, tail_pad=0.12)
    return finalize(wet, target_peak_db=-7.6, fade_in_ms=0.8, fade_out_ms=30.0)


def d_ring_tick() -> np.ndarray:
    """Signature ultra-crisp watch-crown detent tick (dry near-field)."""
    buf = make_buf(0.09)
    mix_at(buf, micro_pulse(4600, 1450, dur=0.014, decay=0.0024, pan=0.0), 0.0, 0.95)
    mix_at(buf, air_transient(0.006, (4000, 9200), 0.0014, pan=0.02, seed=61), 0.0, 0.28)
    return finalize(buf, target_peak_db=-8.5, fade_in_ms=0.4, fade_out_ms=14.0)


def d_flip_dream() -> np.ndarray:
    """Astrolabe dial stepping down & locking into night hemisphere."""
    buf = make_buf(1.15)
    seq = [("Eb6", 0.0, 0.36), ("C6", 0.09, 0.20), ("Bb5", 0.19, 0.05),
           ("Ab5", 0.30, -0.10), ("F5", 0.43, -0.26), ("C5", 0.58, 0.0)]
    for i, (nm, t0, p) in enumerate(seq):
        mix_at(buf, micro_pulse(3600 - 280 * i, NOTE[nm], dur=0.030, decay=0.006,
                                pan=p, metal_hz=NOTE[nm] if i >= 4 else None), t0, 0.66)
    mix_at(buf, modal_strike(NOTE["F4"], 0.65, [(1.0, 0.7, 0.34), (2.0, 0.25, 0.18)],
                             atk=0.004, pan=0.0, spread=0.30), 0.62, 0.55)
    wet = fdn_reverb(buf, rt60=1.15, wet=0.30, damp_hz=5000, predelay_ms=12.0, tail_pad=0.42)
    return finalize(wet, target_peak_db=-5.0, fade_in_ms=1.5, fade_out_ms=95.0)


def d_flip_wake() -> np.ndarray:
    """Astrolabe dial ratcheting upward & clicking bright into daylight."""
    buf = make_buf(1.10)
    seq = [("C5", 0.0, -0.34), ("F5", 0.09, -0.18), ("Ab5", 0.18, -0.02),
           ("Bb5", 0.28, 0.14), ("C6", 0.39, 0.28), ("Eb6", 0.52, 0.0)]
    for i, (nm, t0, p) in enumerate(seq):
        mix_at(buf, micro_pulse(2200 + 340 * i, NOTE[nm], dur=0.028, decay=0.0055,
                                pan=p, metal_hz=NOTE[nm] if i >= 4 else None), t0, 0.68)
    wet = fdn_reverb(buf, rt60=1.05, wet=0.28, damp_hz=6400, predelay_ms=10.0, tail_pad=0.38)
    return finalize(wet, target_peak_db=-5.0, fade_in_ms=1.5, fade_out_ms=85.0)


def d_gate_nexus() -> np.ndarray:
    """Accelerating celestial escapement pulses culminating in clean hypercube lock & spatial bloom."""
    buf = make_buf(1.90)
    times = [0.00, 0.17, 0.33, 0.47, 0.60, 0.71, 0.81, 0.90, 0.98, 1.05, 1.12]
    notes = ["F4", "Ab4", "Bb4", "C5", "Eb5", "F5", "G5", "Ab5", "Bb5", "C6", "Eb6"]
    for i, (t0, nm) in enumerate(zip(times, notes)):
        p = ((-1) ** i) * (0.42 - 0.032 * i)
        mix_at(buf, micro_pulse(2600 + 220 * i, NOTE[nm], dur=0.026, decay=0.005,
                                pan=p, metal_hz=NOTE[nm] if i >= 7 else None), t0, 0.52 + 0.04 * i)
    mix_at(buf, modal_strike(NOTE["F5"], 0.85, [(1.0, 0.9, 0.55), (2.0, 0.35, 0.36), (3.0, 0.15, 0.20)],
                             atk=0.002, pan=-0.12, spread=0.45), 1.18, 0.72)
    mix_at(buf, modal_strike(NOTE["C6"], 0.80, [(1.0, 0.75, 0.50), (2.756, 0.18, 0.22)],
                             atk=0.003, pan=0.14, spread=0.45), 1.19, 0.58)
    wet = fdn_reverb(buf, rt60=1.95, wet=0.42, damp_hz=6200, shimmer=0.16, predelay_ms=16.0, tail_pad=0.65)
    return finalize(wet, target_peak_db=-4.0, fade_in_ms=1.5, fade_out_ms=160.0)


# ==================== BONUS: 4 SITE-EXCLUSIVE SIGNATURES ====================

def x_sec_articles() -> np.ndarray:
    """断章 (6-sided cool blue bipyramid · wind + frosted glass lens sweep)."""
    buf = make_buf(0.85)
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    wind = biquad_filter(np.random.default_rng(71).standard_normal(n), "bandpass", (900, 2600), order=2)
    w_env = np.sin(math.pi * t / 0.55) ** 1.6
    pan_u = np.linspace(-0.55, 0.55, n)
    ang = (pan_u + 1.0) * (math.pi * 0.25)
    mix_at(buf, np.column_stack((wind * w_env * np.cos(ang), wind * w_env * np.sin(ang))), 0.0, 0.36)
    mix_at(buf, modal_strike(NOTE["C6"], 0.45, [(1.0, 0.85, 0.26), (2.756, 0.18, 0.10)],
                             atk=0.014, pan=0.12, spread=0.35), 0.06, 0.46)
    wet = fdn_reverb(buf, rt60=1.35, wet=0.48, damp_hz=5200, shimmer=0.10, tail_pad=0.35)
    return finalize(wet, target_peak_db=-7.8, fade_in_ms=10.0, fade_out_ms=80.0)


def x_sec_moments() -> np.ndarray:
    """闪念 (7-face pale pink shard · fine raindrop + color bloom)."""
    buf = make_buf(0.85)
    mix_at(buf, water_drop(NOTE["Ab5"] * 0.86, NOTE["Eb6"], dur=0.075, decay=0.020,
                           pan=-0.22, cavity_hz=NOTE["Ab5"]), 0.0, 0.68)
    mix_at(buf, water_drop(NOTE["C6"] * 0.90, NOTE["G6"], dur=0.065, decay=0.017,
                           pan=0.28, cavity_hz=None), 0.092, 0.48)
    wet = fdn_reverb(buf, rt60=1.45, wet=0.46, damp_hz=4800, shimmer=0.12, tail_pad=0.40)
    return finalize(wet, target_peak_db=-7.6, fade_in_ms=2.0, fade_out_ms=80.0)


def x_sec_projects() -> np.ndarray:
    """造物 (warm amber cube · stardust cube gliding and docking into .pj-slot)."""
    buf = make_buf(0.80)
    for i, (nm, t0, p) in enumerate([("F5", 0.0, -0.40), ("Bb5", 0.055, -0.14), ("C6", 0.11, 0.14)]):
        mix_at(buf, micro_pulse(3200 + 250 * i, NOTE[nm], dur=0.022, decay=0.0045, pan=p), t0, 0.35)
    mix_at(buf, modal_strike(NOTE["F5"], 0.44, STONE, atk=0.0015, pan=0.18, spread=0.26), 0.155, 0.72)
    mix_at(buf, modal_strike(NOTE["C6"], 0.40, [(1.0, 0.7, 0.24), (2.756, 0.18, 0.09)],
                             atk=0.003, pan=0.24, spread=0.30), 0.165, 0.52)
    wet = fdn_reverb(buf, rt60=1.20, wet=0.40, damp_hz=5400, tail_pad=0.35)
    return finalize(wet, target_peak_db=-7.4, fade_in_ms=2.0, fade_out_ms=70.0)


def x_fx_unlock() -> np.ndarray:
    """FX slider pulled up from 0 (echoes Ave's voice-on cue in site sound.ts)."""
    buf = make_buf(0.95)
    notes = [("F5", 0.0, -0.25, 0.62), ("C6", 0.068, 0.08, 0.72), ("Eb6", 0.142, 0.28, 0.54)]
    for nm, t0, p, g in notes:
        mix_at(buf, modal_strike(NOTE[nm], 0.52, [(1.0, 1.0, 0.36), (2.756, 0.22, 0.14)],
                                 atk=0.002, pan=p, spread=0.32), t0, g)
    wet = fdn_reverb(buf, rt60=1.55, wet=0.46, damp_hz=5800, shimmer=0.16, tail_pad=0.45)
    return finalize(wet, target_peak_db=-5.8, fade_in_ms=2.0, fade_out_ms=90.0)


RECIPES_CD = {
    "c_hover_crystal": c_hover_crystal,
    "c_click_confirm": c_click_confirm,
    "c_star_open": c_star_open,
    "c_star_close": c_star_close,
    "c_ring_tick": c_ring_tick,
    "c_flip_dream": c_flip_dream,
    "c_flip_wake": c_flip_wake,
    "c_gate_nexus": c_gate_nexus,
    "d_hover_crystal": d_hover_crystal,
    "d_click_confirm": d_click_confirm,
    "d_star_open": d_star_open,
    "d_star_close": d_star_close,
    "d_ring_tick": d_ring_tick,
    "d_flip_dream": d_flip_dream,
    "d_flip_wake": d_flip_wake,
    "d_gate_nexus": d_gate_nexus,
    "x_sec_articles": x_sec_articles,
    "x_sec_moments": x_sec_moments,
    "x_sec_projects": x_sec_projects,
    "x_fx_unlock": x_fx_unlock,
}
