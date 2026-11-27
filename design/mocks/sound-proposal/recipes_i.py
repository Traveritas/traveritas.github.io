"""Batch 3 — DIR I: 柔格折光 (Pixel & Glass).

Directly inspired by AveritA's core WebGL visual axiom in ground.js:
  '地面是像素化的流光场，玻璃 = 插值，晶体里的世界永远是清楚的。'
Every cue bridges two tactile worlds: velvety low-passed pixel-ground grain
(Bayer-dithered twilight shimmer) smoothly interpolating into pure translucent
crystal resonance, locked to the site's actual F minor / Bb minor / Ab major BGM.
"""
from __future__ import annotations
import math
import numpy as np
from dsp import SR, make_buf, pan_mono, mix_at, biquad_filter
from dsp_v3 import (
    NOTE3,
    soft_quantize,
    felt_celesta,
    glass_harmonica,
    pixel_to_glass,
    tactile_bead,
    velvet_mist,
    silk_space,
    soft_finalize,
)


def i_hover_crystal() -> np.ndarray:
    """Cursor illuminates pixel field beneath a crystal -> interpolates into clear glint."""
    buf = make_buf(0.32)
    mix_at(buf, tactile_bead(NOTE3["C6"], dur=0.055, quant_mix=0.55, felt=0.55, pan=-0.16, seed=601), 0.0, 0.36)
    mix_at(buf, pixel_to_glass(NOTE3["Eb6"], dur=0.28, morph_s=0.075, hold_hz=2800.0, pan=0.18, bright=0.62, seed=602), 0.022, 0.58)
    mix_at(buf, velvet_mist(0.20, (1200, 2600), (2000, 4400), (-0.28, 0.28), seed=603), 0.0, 0.14)
    wet = silk_space(buf, rt60=0.72, wet=0.34, bright_hz=4600.0, predelay_ms=8.0, tail_pad=0.26, seed=604)
    return soft_finalize(wet, target_peak_db=-9.4, fade_in_ms=3.0, fade_out_ms=50.0)


def i_click_confirm() -> np.ndarray:
    """Warm felt-on-glass tap + brief phosphor grain resolving cleanly into F5 -> C6 fifth."""
    buf = make_buf(0.46)
    mix_at(buf, tactile_bead(NOTE3["F5"], dur=0.068, quant_mix=0.42, felt=0.78, pan=-0.10, seed=605), 0.0, 0.72)
    mix_at(buf, pixel_to_glass(NOTE3["F5"], dur=0.38, morph_s=0.060, hold_hz=3100.0, pan=-0.08, bright=0.68, seed=606), 0.0, 0.64)
    mix_at(buf, pixel_to_glass(NOTE3["C6"], dur=0.40, morph_s=0.085, hold_hz=3400.0, pan=0.16, bright=0.74, seed=607), 0.036, 0.68)
    wet = silk_space(buf, rt60=0.92, wet=0.34, bright_hz=4800.0, predelay_ms=10.0, tail_pad=0.34, seed=608)
    return soft_finalize(wet, target_peak_db=-6.4, fade_in_ms=1.5, fade_out_ms=65.0)


def i_star_open() -> np.ndarray:
    """Toolstar orbit ring unfolding at 12fps-kissed cadence: 4 gossamer pixel-to-glass drops."""
    buf = make_buf(0.76)
    mix_at(buf, velvet_mist(0.48, (620, 1750), (1400, 3800), (-0.50, 0.50), seed=610), 0.0, 0.22)
    notes = [("F5", 0.0, -0.38, 0.58), ("Ab5", 0.068, -0.14, 0.66),
             ("Bb5", 0.136, 0.14, 0.70), ("C6", 0.208, 0.40, 0.62)]
    for idx, (nm, t0, p, g) in enumerate(notes):
        mix_at(buf, pixel_to_glass(NOTE3[nm], dur=0.46, morph_s=0.085, hold_hz=2400.0 + idx * 450.0,
                                   pan=p, bright=0.64 + 0.05 * idx, seed=611 + idx), t0, g)
    wet = silk_space(buf, rt60=1.08, wet=0.38, bright_hz=4800.0, predelay_ms=12.0, tail_pad=0.42, shimmer=0.06, seed=616)
    return soft_finalize(wet, target_peak_db=-6.6, fade_in_ms=2.5, fade_out_ms=80.0)


def i_star_close() -> np.ndarray:
    """Orbit ring folding inward: clear glass softly coarsening back into quiet twilight pixels."""
    buf = make_buf(0.56)
    mix_at(buf, velvet_mist(0.34, (1600, 3400), (540, 1400), (0.42, -0.36), seed=617), 0.0, 0.18)
    notes = [("C6", 0.0, 0.26, 0.56), ("Ab5", 0.058, 0.0, 0.64), ("F5", 0.118, -0.24, 0.72)]
    for idx, (nm, t0, p, g) in enumerate(notes):
        mix_at(buf, pixel_to_glass(NOTE3[nm], dur=0.36, morph_s=0.14, hold_hz=2600.0 - idx * 420.0,
                                   reverse=True, pan=p, bright=0.58, seed=618 + idx), t0, g)
    wet = silk_space(buf, rt60=0.78, wet=0.32, bright_hz=3800.0, predelay_ms=9.0, tail_pad=0.30, seed=622)
    return soft_finalize(wet, target_peak_db=-7.6, fade_in_ms=2.0, fade_out_ms=60.0)


def i_ring_tick() -> np.ndarray:
    """Addictive frosted-glass bead + tiny phosphor-dot pip — super clean under fast scroll."""
    buf = make_buf(0.088)
    mix_at(buf, tactile_bead(NOTE3["Bb5"], dur=0.058, quant_mix=0.48, felt=0.72, pan=0.0, seed=623), 0.0, 0.92)
    wet = silk_space(buf, rt60=0.28, wet=0.18, bright_hz=4800.0, predelay_ms=5.0, tail_pad=0.06, seed=624)
    return soft_finalize(wet, target_peak_db=-8.6, fade_in_ms=0.6, fade_out_ms=16.0)


def i_flip_dream() -> np.ndarray:
    """Day -> Night (900ms PULSE): luminous glass stepping down & coarsening into 12fps twilight."""
    buf = make_buf(1.50)
    # Exact site PULSE = [1, 2, 4, 7, 7, 5, 3, 2, 1] x 100ms
    pulse = [1, 2, 4, 7, 7, 5, 3, 2, 1]
    notes = ["Eb6", "C6", "Bb5", "Ab5", "F5", "Eb5", "Db5", "C5", "F4"]
    mix_at(buf, velvet_mist(1.12, (1600, 3600), (320, 1100), (0.50, -0.50), seed=625), 0.0, 0.26)
    # Deep twilight glass-rim bed settling in the second half (matches dream-loop warmth)
    mix_at(buf, glass_harmonica(NOTE3["F3"], dur=1.08, atk=0.36, pan=-0.12, air=0.10, seed=626), 0.36, 0.42)
    mix_at(buf, glass_harmonica(NOTE3["C4"], dur=1.02, atk=0.34, pan=0.14, air=0.12, seed=627), 0.42, 0.34)
    for i, (lvl, nm) in enumerate(zip(pulse, notes)):
        t0 = i * 0.100
        # Higher coarseness at peak pulse (i=3,4) -> soft phosphor step-down
        hold_hz = max(1100.0, 4200.0 - lvl * 380.0)
        pan = 0.42 - 0.84 * (i / 8.0)
        g = 0.28 + 0.055 * lvl
        grain = felt_celesta(NOTE3[nm], dur=0.34, bright=0.66 - 0.04 * i, felt=0.64, pan=pan, decay_scale=0.75, seed=630 + i)
        grain = soft_quantize(grain, hold_hz=hold_hz, levels=max(10, 26 - lvl * 2), wet=0.30 + 0.08 * lvl, smooth_hz=3900.0)
        mix_at(buf, grain, t0, g)
    wet = silk_space(buf, rt60=1.55, wet=0.44, bright_hz=3600.0, predelay_ms=16.0, tail_pad=0.58, shimmer=0.06, seed=640)
    return soft_finalize(wet, target_peak_db=-4.8, fade_in_ms=8.0, fade_out_ms=150.0, lp_hz=6800.0)


def i_flip_wake() -> np.ndarray:
    """Night -> Day (900ms PULSE): coarsened pixel mist interpolating upward into clear daylight glass."""
    buf = make_buf(1.44)
    pulse = [1, 2, 4, 7, 7, 5, 3, 2, 1]
    notes = ["F4", "Bb4", "C5", "Eb5", "F5", "Ab5", "Bb5", "C6", "Eb6"]
    mix_at(buf, velvet_mist(1.04, (420, 1250), (1500, 4000), (-0.50, 0.50), seed=641), 0.0, 0.24)
    # Bright, clear glass-rim dawn halo rising as pixels resolve
    mix_at(buf, glass_harmonica(NOTE3["Ab4"], dur=0.95, atk=0.30, pan=-0.16, air=0.14, seed=642), 0.34, 0.32)
    mix_at(buf, glass_harmonica(NOTE3["Eb5"], dur=0.92, atk=0.32, pan=0.18, air=0.14, seed=643), 0.42, 0.28)
    for i, (lvl, nm) in enumerate(zip(pulse, notes)):
        t0 = i * 0.100
        # Starts softly quantized and progressively clarifies into pure interpolated glass
        u = i / 8.0
        hold_hz = 1600.0 + u * 3400.0
        pan = -0.40 + 0.80 * u
        g = 0.28 + 0.055 * lvl
        grain = felt_celesta(NOTE3[nm], dur=0.36, bright=0.48 + 0.36 * u, felt=0.56, pan=pan, decay_scale=0.80, seed=645 + i)
        grain = soft_quantize(grain, hold_hz=hold_hz, levels=int(12 + 20 * u), wet=max(0.08, 0.82 * (1.0 - u)), smooth_hz=4600.0)
        mix_at(buf, grain, t0, g)
    wet = silk_space(buf, rt60=1.35, wet=0.40, bright_hz=5000.0, predelay_ms=14.0, tail_pad=0.52, shimmer=0.09, seed=656)
    return soft_finalize(wet, target_peak_db=-4.8, fade_in_ms=6.0, fade_out_ms=140.0)


def i_gate_nexus() -> np.ndarray:
    """NEXUS 4D slice (DOOR = 9x120ms): quantized lattice ascending -> dissolves into pure white light."""
    buf = make_buf(2.25)
    mix_at(buf, velvet_mist(1.30, (380, 1200), (1400, 4400), (-0.55, 0.55), swell=True, seed=657), 0.0, 0.32)
    # 9-step 120ms DOOR cadence: pixel coarseness swells as the 4D slice expands
    door_notes = ["F4", "Ab4", "Bb4", "C5", "Eb5", "F5", "Ab5", "Bb5", "C6"]
    for i, nm in enumerate(door_notes):
        t0 = i * 0.120
        u = i / 8.0
        pan = ((-1) ** i) * (0.44 * (1.0 - 0.55 * u))
        step_sig = pixel_to_glass(
            NOTE3[nm], dur=0.44 + 0.04 * i, morph_s=0.14,
            hold_hz=3200.0 - 1500.0 * u, reverse=True, pan=pan, bright=0.62 + 0.25 * u, seed=660 + i,
        )
        mix_at(buf, step_sig, t0, 0.26 + 0.36 * u)
    # Threshold white-out at 1.12s: ALL quantization vanishes into a pure translucent glass chord
    for nm, p, g, dt in [
        ("F4", -0.22, 0.42, 0.0),
        ("C5", 0.22, 0.44, 0.01),
        ("Ab5", -0.34, 0.38, 0.02),
        ("Eb6", 0.34, 0.34, 0.03),
        ("Bb5", 0.0, 0.30, 0.04),
    ]:
        mix_at(buf, glass_harmonica(NOTE3[nm], dur=1.18, atk=0.14, pan=p, air=0.14, drift_hz=0.45, seed=675 + int(dt * 1000)), 1.08 + dt, g)
    mix_at(buf, felt_celesta(NOTE3["F5"], dur=0.90, bright=0.78, felt=0.55, pan=-0.12, seed=682), 1.12, 0.48)
    mix_at(buf, felt_celesta(NOTE3["C6"], dur=0.86, bright=0.82, felt=0.50, pan=0.14, seed=683), 1.14, 0.42)
    wet = silk_space(buf, rt60=2.10, wet=0.50, bright_hz=5000.0, predelay_ms=18.0, tail_pad=0.75, shimmer=0.12, seed=684)
    return soft_finalize(wet, target_peak_db=-3.8, fade_in_ms=12.0, fade_out_ms=210.0)


RECIPES_I = {
    "i_hover_crystal": i_hover_crystal,
    "i_click_confirm": i_click_confirm,
    "i_star_open": i_star_open,
    "i_star_close": i_star_close,
    "i_ring_tick": i_ring_tick,
    "i_flip_dream": i_flip_dream,
    "i_flip_wake": i_flip_wake,
    "i_gate_nexus": i_gate_nexus,
}
