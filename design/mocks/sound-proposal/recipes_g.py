"""Batch 2 — DIR G: Matte Ceramic (哑光陶石).
Ultra-damped architectural foley: unglazed porcelain, wet slate, obsidian knocks,
stick-slip stone sliding, and dry geometric room reflections.
Zero bell-like ringing, zero metallic sustain, zero syrupy reverb.
"""
from __future__ import annotations
import numpy as np
from dsp import SR, make_buf, mix_at, finalize
from dsp_v2 import (
    plate_2d_strike,
    early_space,
    friction_slide,
    pressure_breath,
    shutter_click,
)


def g_hover_crystal() -> np.ndarray:
    """Fingertip brushing matte unglazed porcelain + subtle dry slate contact."""
    buf = make_buf(0.14)
    mix_at(buf, friction_slide(0.068, (1200, 4200), 38.0, (-0.28, 0.24), "decay", seed=301), 0.0, 0.55)
    mix_at(buf, plate_2d_strike(680.0, 0.11, n_modes=18, stiffness=1.18, damp_base=0.022, damp_hi=2.6, mallet_ms=1.1, scrape_amt=0.28, pan=0.06, spread=0.32, seed=302), 0.008, 0.58)
    wet = early_space(buf, room_ms=18.0, width=0.72, mix=0.28, bright_hz=4400.0, seed=303)
    return finalize(wet, target_peak_db=-8.6, fade_in_ms=1.8, fade_out_ms=24.0, deharsh_db=-2.2)


def g_click_confirm() -> np.ndarray:
    """Two-stone architectural tap: crisp obsidian edge + damped ceramic settle."""
    buf = make_buf(0.20)
    mix_at(buf, plate_2d_strike(520.0, 0.14, n_modes=22, stiffness=1.22, damp_base=0.028, damp_hi=2.5, mallet_ms=1.0, scrape_amt=0.22, pan=-0.08, spread=0.38, seed=304), 0.0, 0.92)
    mix_at(buf, shutter_click(128.0, (1600, 5200), 0.0, 12.0, pan=0.04, seed=305), 0.002, 0.58)
    mix_at(buf, plate_2d_strike(780.0, 0.10, n_modes=16, stiffness=1.15, damp_base=0.020, damp_hi=2.7, mallet_ms=0.9, scrape_amt=0.16, pan=0.14, spread=0.28, seed=306), 0.032, 0.44)
    wet = early_space(buf, room_ms=22.0, width=0.80, mix=0.32, bright_hz=4600.0, seed=307)
    return finalize(wet, target_peak_db=-5.6, fade_in_ms=0.6, fade_out_ms=28.0, deharsh_db=-2.0)


def g_star_open() -> np.ndarray:
    """Slate tiles sliding apart across a quiet gallery table with three damped ceramic stops."""
    buf = make_buf(0.45)
    mix_at(buf, friction_slide(0.28, (750, 3200), 30.0, (-0.58, 0.54), "bell", seed=308), 0.0, 0.62)
    taps = [
        (0.015, 440.0, -0.40, 0.58),
        (0.085, 590.0, 0.02, 0.66),
        (0.168, 760.0, 0.42, 0.84),
    ]
    for i, (t0, hz, p, g) in enumerate(taps):
        mix_at(buf, plate_2d_strike(hz, 0.16, n_modes=20, stiffness=1.20, damp_base=0.032, damp_hi=2.4, mallet_ms=1.2, scrape_amt=0.24, pan=p, spread=0.34, seed=310 + i), t0, g)
    wet = early_space(buf, room_ms=28.0, width=0.86, mix=0.35, bright_hz=4400.0, seed=314)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=2.0, fade_out_ms=42.0, deharsh_db=-2.2)


def g_star_close() -> np.ndarray:
    """Matte stone lid gliding shut and seating with a muffled low-mass thud."""
    buf = make_buf(0.35)
    mix_at(buf, friction_slide(0.19, (680, 2600), 28.0, (0.48, -0.36), "bell", seed=315), 0.0, 0.64)
    mix_at(buf, plate_2d_strike(610.0, 0.12, n_modes=18, stiffness=1.16, damp_base=0.024, damp_hi=2.6, mallet_ms=1.3, scrape_amt=0.20, pan=0.20, spread=0.28, seed=316), 0.04, 0.50)
    mix_at(buf, plate_2d_strike(320.0, 0.18, n_modes=20, stiffness=1.26, damp_base=0.038, damp_hi=2.5, mallet_ms=1.8, scrape_amt=0.26, pan=-0.10, spread=0.36, seed=317), 0.135, 0.94)
    mix_at(buf, shutter_click(102.0, (900, 3200), 0.0, 16.0, pan=-0.06, seed=318), 0.136, 0.56)
    wet = early_space(buf, room_ms=24.0, width=0.76, mix=0.30, bright_hz=3600.0, seed=319)
    return finalize(wet, target_peak_db=-7.0, fade_in_ms=1.5, fade_out_ms=38.0, deharsh_db=-2.4)


def g_ring_tick() -> np.ndarray:
    """Dry riverbed-pebble / ceramic bead click — warm, solid, ultra-short."""
    buf = make_buf(0.062)
    mix_at(buf, plate_2d_strike(820.0, 0.045, n_modes=16, stiffness=1.24, damp_base=0.015, damp_hi=2.8, mallet_ms=0.8, scrape_amt=0.22, pan=0.0, spread=0.24, seed=320), 0.0, 0.92)
    mix_at(buf, shutter_click(175.0, (2200, 6200), 0.0, 5.5, pan=0.0, seed=321), 0.0, 0.45)
    wet = early_space(buf, room_ms=12.0, width=0.52, mix=0.18, bright_hz=4800.0, seed=322)
    return finalize(wet, target_peak_db=-8.4, fade_in_ms=0.3, fade_out_ms=12.0, deharsh_db=-2.0)


def g_flip_dream() -> np.ndarray:
    """Heavy dark-slate partition sliding closed + muffled sub-floor acoustic drop."""
    buf = make_buf(1.02)
    mix_at(buf, friction_slide(0.62, (480, 2400), 24.0, (0.62, -0.62), "bell", seed=323), 0.02, 0.72)
    mix_at(buf, pressure_breath(0.88, (720.0, 115.0), reverse=False, width=0.88, sub_boost=0.82, seed=324), 0.04, 0.74)
    for i, (t0, hz, p) in enumerate([(0.06, 620.0, 0.38), (0.24, 490.0, 0.08), (0.44, 370.0, -0.24)]):
        mix_at(buf, plate_2d_strike(hz, 0.18, n_modes=20, stiffness=1.22, damp_base=0.036, damp_hi=2.4, mallet_ms=1.5, scrape_amt=0.25, pan=p, spread=0.38, seed=325 + i), t0, 0.56 + 0.08 * i)
    mix_at(buf, plate_2d_strike(235.0, 0.28, n_modes=24, stiffness=1.28, damp_base=0.052, damp_hi=2.6, mallet_ms=2.2, scrape_amt=0.30, pan=0.0, spread=0.45, seed=329), 0.62, 0.96)
    mix_at(buf, shutter_click(78.0, (700, 2600), 5.0, 26.0, pan=0.0, seed=330), 0.62, 0.76)
    wet = early_space(buf, room_ms=38.0, width=0.92, mix=0.40, bright_hz=3200.0, seed=331)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=4.0, fade_out_ms=95.0, deharsh_db=-2.4)


def g_flip_wake() -> np.ndarray:
    """Porcelain & travertine screens parting into dry morning courtyard clarity."""
    buf = make_buf(0.96)
    mix_at(buf, friction_slide(0.56, (900, 4200), 34.0, (-0.60, 0.60), "bell", seed=332), 0.02, 0.66)
    mix_at(buf, pressure_breath(0.80, (170.0, 1180.0), reverse=False, width=0.86, sub_boost=0.44, seed=333), 0.03, 0.58)
    for i, (t0, hz, p) in enumerate([(0.05, 380.0, -0.36), (0.21, 540.0, -0.04), (0.38, 720.0, 0.28)]):
        mix_at(buf, plate_2d_strike(hz, 0.16, n_modes=20, stiffness=1.18, damp_base=0.030, damp_hi=2.3, mallet_ms=1.1, scrape_amt=0.22, pan=p, spread=0.36, seed=334 + i), t0, 0.58 + 0.08 * i)
    mix_at(buf, plate_2d_strike(890.0, 0.22, n_modes=22, stiffness=1.14, damp_base=0.034, damp_hi=2.2, mallet_ms=0.9, scrape_amt=0.24, pan=0.0, spread=0.46, seed=338), 0.56, 0.92)
    wet = early_space(buf, room_ms=34.0, width=0.90, mix=0.38, bright_hz=5400.0, seed=339)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=3.0, fade_out_ms=88.0, deharsh_db=-2.0)


def g_gate_nexus() -> np.ndarray:
    """Monolithic obsidian-and-glass chamber: grinding stone draw -> seismic dry threshold seal."""
    buf = make_buf(1.78)
    mix_at(buf, friction_slide(1.06, (420, 2900), 22.0, (-0.70, 0.70), "swell", seed=340), 0.04, 0.74)
    mix_at(buf, pressure_breath(1.10, (110.0, 1450.0), reverse=True, width=0.94, sub_boost=0.88, seed=341), 0.02, 0.86)
    # 5 spaced heavy ceramic/stone locking detents accelerating toward 1.12s
    for i, (t0, hz, p) in enumerate([
        (0.14, 340.0, -0.45), (0.42, 430.0, 0.40), (0.68, 550.0, -0.32),
        (0.89, 680.0, 0.26), (1.04, 820.0, -0.14),
    ]):
        mix_at(buf, plate_2d_strike(hz, 0.18, n_modes=22, stiffness=1.24, damp_base=0.035, damp_hi=2.4, mallet_ms=1.3, scrape_amt=0.28, pan=p, spread=0.40, seed=342 + i), t0, 0.50 + 0.09 * i)
    # Seismic matte seal at 1.13s + dry reverberant architectural early reflections (zero metallic ring)
    mix_at(buf, plate_2d_strike(195.0, 0.42, n_modes=24, stiffness=1.30, damp_base=0.062, damp_hi=2.6, mallet_ms=2.4, scrape_amt=0.34, pan=0.0, spread=0.58, seed=350), 1.13, 1.05)
    mix_at(buf, shutter_click(68.0, (900, 4800), 7.0, 32.0, pan=0.0, seed=351), 1.13, 0.92)
    mix_at(buf, pressure_breath(0.58, (980.0, 120.0), reverse=False, width=0.96, sub_boost=0.72, seed=352), 1.14, 0.70)
    wet = early_space(buf, room_ms=48.0, width=0.96, mix=0.44, bright_hz=4400.0, seed=353)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=6.0, fade_out_ms=125.0, deharsh_db=-2.2)


RECIPES_G = {
    "g_hover_crystal": g_hover_crystal,
    "g_click_confirm": g_click_confirm,
    "g_star_open": g_star_open,
    "g_star_close": g_star_close,
    "g_ring_tick": g_ring_tick,
    "g_flip_dream": g_flip_dream,
    "g_flip_wake": g_flip_wake,
    "g_gate_nexus": g_gate_nexus,
}
