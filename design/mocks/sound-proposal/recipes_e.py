"""Batch 2 — DIR E: Optical Precision (精密光机).
High-craft tactile evolution of D: sapphire latches, lens-barrel micro-friction,
zero-tail binaural early reflections, and acoustic air-pressure shifts.
Zero musical chimes, zero muddy reverb wash.
"""
from __future__ import annotations
import numpy as np
from dsp import SR, make_buf, mix_at, pan_mono, biquad_filter, finalize
from dsp_v2 import (
    early_space,
    friction_slide,
    pressure_breath,
    shutter_click,
    micro_debris,
)


def e_hover_crystal() -> np.ndarray:
    """Micro frosted-lens brush + ultra-light sapphire contact in tight 15ms room."""
    buf = make_buf(0.115)
    mix_at(buf, friction_slide(0.052, (2800, 7600), 68.0, (-0.26, 0.22), "decay", seed=101), 0.0, 0.44)
    mix_at(buf, shutter_click(215.0, (4400, 9800), 0.0, 5.5, pan=0.08, seed=102), 0.011, 0.34)
    wet = early_space(buf, room_ms=15.0, width=0.72, mix=0.26, bright_hz=6200.0, seed=103)
    return finalize(wet, target_peak_db=-8.8, fade_in_ms=1.5, fade_out_ms=18.0, deharsh_db=-1.8)


def e_click_confirm() -> np.ndarray:
    """Two-stage rangefinder detent: tactile pre-slide -> crisp shutter snap -> micro-rebound."""
    buf = make_buf(0.165)
    mix_at(buf, friction_slide(0.026, (2000, 6400), 82.0, (-0.16, 0.0), "swell", seed=104), 0.0, 0.30)
    mix_at(buf, shutter_click(145.0, (2600, 8600), 5.5, 11.5, pan=-0.05, seed=105), 0.009, 0.96)
    mix_at(buf, shutter_click(240.0, (5000, 10800), 0.0, 5.0, pan=0.14, seed=106), 0.037, 0.42)
    wet = early_space(buf, room_ms=19.0, width=0.78, mix=0.30, bright_hz=5800.0, seed=107)
    return finalize(wet, target_peak_db=-5.6, fade_in_ms=0.6, fade_out_ms=22.0, deharsh_db=-1.5)


def e_star_open() -> np.ndarray:
    """Optical iris blades gliding outward + 4 micro ceramic latches fanning across stereo."""
    buf = make_buf(0.41)
    mix_at(buf, friction_slide(0.24, (1500, 5600), 52.0, (-0.52, 0.52), "bell", seed=108), 0.0, 0.50)
    mix_at(buf, pressure_breath(0.28, (220.0, 820.0), reverse=False, width=0.75, sub_boost=0.28, seed=109), 0.02, 0.32)
    latches = [
        (0.012, -0.44, 195.0, (3200, 7400), 0.46),
        (0.064, -0.15, 175.0, (3600, 8200), 0.56),
        (0.118, 0.18, 160.0, (4200, 9200), 0.66),
        (0.176, 0.46, 138.0, (4800, 10600), 0.88),
    ]
    for i, (t0, pan, sub, band, g) in enumerate(latches):
        mix_at(buf, shutter_click(sub, band, 3.0 if i == 3 else 0.0, 9.0, pan=pan, seed=110 + i), t0, g)
    wet = early_space(buf, room_ms=24.0, width=0.86, mix=0.34, bright_hz=6000.0, seed=115)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=1.5, fade_out_ms=36.0, deharsh_db=-1.6)


def e_star_close() -> np.ndarray:
    """Iris blades sweeping inward and locking flush with a dampened magnetic stop."""
    buf = make_buf(0.32)
    mix_at(buf, friction_slide(0.17, (1250, 3800), 46.0, (0.46, -0.42), "bell", seed=116), 0.0, 0.52)
    mix_at(buf, shutter_click(210.0, (3800, 8000), 0.0, 7.0, pan=0.26, seed=117), 0.025, 0.48)
    mix_at(buf, shutter_click(175.0, (3000, 7000), 0.0, 8.0, pan=0.0, seed=118), 0.072, 0.56)
    mix_at(buf, shutter_click(122.0, (1900, 5400), 4.0, 14.0, pan=-0.12, seed=119), 0.128, 0.90)
    wet = early_space(buf, room_ms=20.0, width=0.74, mix=0.28, bright_hz=4800.0, seed=120)
    return finalize(wet, target_peak_db=-7.2, fade_in_ms=1.2, fade_out_ms=34.0, deharsh_db=-1.8)


def e_ring_tick() -> np.ndarray:
    """Ultra-dry Leica aperture detent click — crisp, addictive, zero fatigue on fast scroll."""
    buf = make_buf(0.052)
    mix_at(buf, shutter_click(230.0, (3600, 9600), 0.0, 4.2, pan=0.0, seed=121), 0.0, 0.95)
    mix_at(buf, friction_slide(0.018, (4600, 9800), 95.0, (-0.12, 0.12), "decay", seed=122), 0.0, 0.24)
    wet = early_space(buf, room_ms=11.0, width=0.55, mix=0.18, bright_hz=7200.0, seed=123)
    return finalize(wet, target_peak_db=-8.4, fade_in_ms=0.3, fade_out_ms=10.0, deharsh_db=-1.6)


def e_flip_dream() -> np.ndarray:
    """Optical filter wheel stepping down into night aperture + deep negative-pressure exhale."""
    buf = make_buf(0.96)
    mix_at(buf, pressure_breath(0.84, (920.0, 150.0), reverse=False, width=0.90, sub_boost=0.68, seed=124), 0.02, 0.72)
    mix_at(buf, friction_slide(0.46, (950, 3200), 34.0, (0.58, -0.58), "bell", seed=125), 0.05, 0.42)
    steps = [0.02, 0.105, 0.195, 0.295, 0.405, 0.525]
    for i, t0 in enumerate(steps):
        hi = 8800.0 - i * 850.0
        lo = 2600.0 - i * 260.0
        pan = 0.44 - i * 0.17
        mix_at(buf, shutter_click(195.0 - i * 15.0, (lo, hi), 0.0, 7.0 + i * 1.6, pan=pan, seed=126 + i), t0, 0.45 + 0.06 * i)
    # Final deep optical lock into night hemisphere
    mix_at(buf, shutter_click(96.0, (1200, 4000), 6.0, 22.0, pan=0.0, seed=133), 0.61, 1.0)
    wet = early_space(buf, room_ms=34.0, width=0.92, mix=0.38, bright_hz=4200.0, seed=134)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=3.0, fade_out_ms=85.0, deharsh_db=-2.0)


def e_flip_wake() -> np.ndarray:
    """Crisp mechanical shutter curtain drawing open + fresh daylight air-gap expansion."""
    buf = make_buf(0.92)
    mix_at(buf, pressure_breath(0.76, (190.0, 1450.0), reverse=False, width=0.88, sub_boost=0.40, seed=135), 0.02, 0.62)
    mix_at(buf, friction_slide(0.42, (1100, 5600), 48.0, (-0.55, 0.55), "bell", seed=136), 0.04, 0.44)
    steps = [0.02, 0.10, 0.185, 0.275, 0.37, 0.47]
    for i, t0 in enumerate(steps):
        lo = 1800.0 + i * 360.0
        hi = 5200.0 + i * 900.0
        pan = -0.44 + i * 0.17
        mix_at(buf, shutter_click(135.0 + i * 16.0, (lo, hi), 0.0, 10.0 - i * 0.9, pan=pan, seed=137 + i), t0, 0.46 + 0.07 * i)
    mix_at(buf, shutter_click(155.0, (3400, 10400), 5.0, 12.0, pan=0.0, seed=144), 0.56, 1.0)
    mix_at(buf, micro_debris(0.28, 12, (4200, 10500), (1.0, 3.2), spread=0.72, curve="decay", seed=145), 0.57, 0.34)
    wet = early_space(buf, room_ms=30.0, width=0.90, mix=0.35, bright_hz=6600.0, seed=146)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=2.0, fade_out_ms=80.0, deharsh_db=-1.6)


def e_gate_nexus() -> np.ndarray:
    """Macro optical-shutter lock: accelerating iris escapement + vacuum swell -> dry cavernous threshold."""
    buf = make_buf(1.72)
    # 9-step optical pulse aligned to DOOR = 120ms tempo (0.0 .. 1.08s), accelerating tactility
    times = [0.00, 0.14, 0.27, 0.39, 0.50, 0.60, 0.69, 0.78, 0.87, 0.96, 1.05]
    for i, t0 in enumerate(times):
        u = i / (len(times) - 1)
        pan = ((-1) ** i) * (0.52 * (1.0 - 0.68 * u))
        mix_at(
            buf,
            shutter_click(120.0 + 95.0 * u, (1800 + 2400 * u, 5400 + 5200 * u), 0.0, 11.0 - 5.0 * u, pan=pan, seed=150 + i),
            t0,
            0.38 + 0.42 * u,
        )
    # Vacuum air-draw building tension right into the 1.12s whiteout threshold
    mix_at(buf, pressure_breath(1.10, (140.0, 1850.0), reverse=True, width=0.95, sub_boost=0.78, seed=165), 0.04, 0.84)
    mix_at(buf, friction_slide(0.88, (900, 5800), 38.0, (-0.65, 0.65), "swell", seed=166), 0.22, 0.46)
    # Threshold release: crisp mechanical seal + expansive sub-air exhale + fine dust scatter (no metallic tail)
    mix_at(buf, shutter_click(88.0, (2200, 9800), 8.0, 26.0, pan=0.0, seed=167), 1.13, 1.08)
    mix_at(buf, pressure_breath(0.56, (1250.0, 160.0), reverse=False, width=0.96, sub_boost=0.62, seed=168), 1.14, 0.72)
    mix_at(buf, micro_debris(0.45, 22, (3200, 10800), (1.0, 3.8), spread=0.88, curve="decay", seed=169), 1.15, 0.36)
    wet = early_space(buf, room_ms=42.0, width=0.96, mix=0.40, bright_hz=5800.0, seed=170)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=4.0, fade_out_ms=110.0, deharsh_db=-1.8)


RECIPES_E = {
    "e_hover_crystal": e_hover_crystal,
    "e_click_confirm": e_click_confirm,
    "e_star_open": e_star_open,
    "e_star_close": e_star_close,
    "e_ring_tick": e_ring_tick,
    "e_flip_dream": e_flip_dream,
    "e_flip_wake": e_flip_wake,
    "e_gate_nexus": e_gate_nexus,
}
