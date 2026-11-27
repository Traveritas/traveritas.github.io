"""Batch 2 — DIR F: Aero Spectral (气动霜雾).
Atmospheric spatiality WITHOUT reverb wash and WITHOUT ringing bells:
built from STFT phase-diffused frost vapor, dual-formant air curtains,
reverse pneumatic pressure, and stochastic quartz micro-dust.
"""
from __future__ import annotations
import numpy as np
from dsp import SR, make_buf, mix_at, pan_mono, biquad_filter, finalize
from dsp_v2 import (
    early_space,
    friction_slide,
    pressure_breath,
    shutter_click,
    formant_air_sweep,
    stft_spectral_blur,
    micro_debris,
)


def _vapor_puff(dur_imp: float, band: tuple[float, float], dec_lo: float, dec_hi: float, pad: float, pan: float, seed: int) -> np.ndarray:
    """Turn a tiny unpitched noise spark into a dry-edged, phase-diffused frost cloud."""
    rng = np.random.default_rng(seed)
    n = max(48, int(round(dur_imp * SR)))
    raw = biquad_filter(rng.standard_normal(n), "bandpass", band, order=2)
    env = np.hanning(n)
    imp = pan_mono(raw * env, pan)
    return stft_spectral_blur(imp, decay_lo=dec_lo, decay_hi=dec_hi, phase_diffuse=0.92, tilt_db=1.8, pad_sec=pad, seed=seed + 1)


def f_hover_crystal() -> np.ndarray:
    """Whisper-light cold air-gap parting + microscopic quartz vapor dissipation."""
    buf = make_buf(0.24)
    mix_at(buf, formant_air_sweep(0.16, (950, 2400), (2800, 6200), 0.24, (-0.32, 0.32), 1.5, seed=201), 0.0, 0.58)
    mix_at(buf, _vapor_puff(0.012, (2600, 7800), 0.72, 0.80, 0.18, 0.12, seed=202), 0.012, 0.44)
    mix_at(buf, micro_debris(0.14, 7, (3800, 9800), (1.0, 2.8), spread=0.62, curve="decay", seed=204), 0.008, 0.30)
    return finalize(buf, target_peak_db=-8.6, fade_in_ms=4.0, fade_out_ms=36.0, deharsh_db=-2.0)


def f_click_confirm() -> np.ndarray:
    """Crisp cold-quartz contact instantaneously vaporizing into a short stereo air halo."""
    buf = make_buf(0.32)
    mix_at(buf, shutter_click(175.0, (3400, 9400), 0.0, 7.0, pan=-0.06, seed=205), 0.0, 0.82)
    mix_at(buf, _vapor_puff(0.014, (1800, 6800), 0.74, 0.84, 0.26, 0.10, seed=206), 0.004, 0.68)
    mix_at(buf, formant_air_sweep(0.18, (800, 2600), (2200, 5600), 0.26, (-0.20, 0.35), 1.3, seed=208), 0.01, 0.42)
    wet = early_space(buf, room_ms=22.0, width=0.86, mix=0.28, bright_hz=6400.0, seed=209)
    return finalize(wet, target_peak_db=-5.8, fade_in_ms=0.8, fade_out_ms=45.0, deharsh_db=-2.0)


def f_star_open() -> np.ndarray:
    """Radial frosted-air bloom: pressurized aperture unfurling with stereo quartz mist."""
    buf = make_buf(0.56)
    mix_at(buf, formant_air_sweep(0.40, (480, 2100), (1600, 5400), 0.22, (-0.65, 0.65), 1.35, seed=210), 0.0, 0.70)
    mix_at(buf, pressure_breath(0.42, (240.0, 1080.0), reverse=False, width=0.92, sub_boost=0.45, seed=211), 0.02, 0.48)
    mix_at(buf, micro_debris(0.44, 18, (3000, 9800), (1.2, 4.0), spread=0.82, curve="bell", seed=212), 0.04, 0.44)
    mix_at(buf, _vapor_puff(0.018, (2200, 7600), 0.78, 0.87, 0.38, 0.0, seed=213), 0.08, 0.56)
    return finalize(buf, target_peak_db=-6.4, fade_in_ms=6.0, fade_out_ms=65.0, deharsh_db=-2.2)


def f_star_close() -> np.ndarray:
    """Inward vacuum condensation — air folding neatly back to center."""
    buf = make_buf(0.38)
    mix_at(buf, formant_air_sweep(0.28, (2400, 520), (5400, 1400), 0.24, (0.58, -0.18), 1.4, seed=215), 0.0, 0.68)
    mix_at(buf, pressure_breath(0.24, (780.0, 190.0), reverse=True, width=0.82, sub_boost=0.42, seed=216), 0.0, 0.48)
    mix_at(buf, shutter_click(142.0, (2000, 6200), 0.0, 10.0, pan=0.0, seed=217), 0.22, 0.56)
    wet = early_space(buf, room_ms=18.0, width=0.72, mix=0.22, bright_hz=4800.0, seed=218)
    return finalize(wet, target_peak_db=-7.4, fade_in_ms=4.0, fade_out_ms=44.0, deharsh_db=-2.0)


def f_ring_tick() -> np.ndarray:
    """Air-bearing micro-puff detent — featherlight pneumatic click with zero harshness."""
    buf = make_buf(0.068)
    mix_at(buf, shutter_click(260.0, (4200, 10200), 0.0, 3.8, pan=0.0, seed=219), 0.0, 0.62)
    mix_at(buf, friction_slide(0.032, (2600, 7600), 74.0, (-0.18, 0.18), "decay", seed=220), 0.0, 0.58)
    mix_at(buf, micro_debris(0.04, 4, (4500, 10800), (0.9, 2.2), spread=0.35, curve="decay", seed=221), 0.002, 0.35)
    return finalize(buf, target_peak_db=-8.8, fade_in_ms=0.5, fade_out_ms=12.0, deharsh_db=-2.2)


def f_flip_dream() -> np.ndarray:
    """Sub-zero atmospheric settling: descending air curtain + STFT frost descent + deep pressure drop."""
    buf = make_buf(1.18)
    mix_at(buf, pressure_breath(1.06, (1150.0, 130.0), reverse=False, width=0.96, sub_boost=0.76, seed=222), 0.0, 0.78)
    mix_at(buf, formant_air_sweep(0.86, (2600, 380), (5800, 1050), 0.25, (0.68, -0.68), 1.3, seed=223), 0.04, 0.66)
    mix_at(buf, _vapor_puff(0.025, (1600, 5600), 0.84, 0.90, 0.78, -0.18, seed=224), 0.24, 0.62)
    mix_at(buf, micro_debris(0.75, 24, (2400, 8200), (1.4, 4.5), spread=0.88, curve="decay", seed=226), 0.16, 0.36)
    return finalize(buf, target_peak_db=-4.8, fade_in_ms=14.0, fade_out_ms=130.0, deharsh_db=-2.4)


def f_flip_wake() -> np.ndarray:
    """Morning clarity: rising dual-formant breeze parting frosted haze + crisp crystal dust."""
    buf = make_buf(1.10)
    mix_at(buf, pressure_breath(0.94, (160.0, 1650.0), reverse=False, width=0.94, sub_boost=0.42, seed=227), 0.0, 0.68)
    mix_at(buf, formant_air_sweep(0.82, (420, 2850), (1250, 6400), 0.23, (-0.68, 0.68), 1.35, seed=228), 0.03, 0.74)
    mix_at(buf, micro_debris(0.70, 28, (3400, 10800), (1.0, 3.6), spread=0.85, curve="swell", seed=229), 0.06, 0.42)
    mix_at(buf, _vapor_puff(0.018, (2800, 8800), 0.78, 0.87, 0.50, 0.16, seed=230), 0.48, 0.56)
    return finalize(buf, target_peak_db=-4.8, fade_in_ms=10.0, fade_out_ms=115.0, deharsh_db=-2.0)


def f_gate_nexus() -> np.ndarray:
    """Pneumatic horizon warp: long reverse vacuum suction -> instantaneous zero-pitch whiteout vapor bloom."""
    buf = make_buf(1.92)
    # Reverse suction rising into 1.12s whiteout boundary
    mix_at(buf, pressure_breath(1.12, (120.0, 2400.0), reverse=True, width=0.96, sub_boost=0.85, seed=232), 0.0, 0.90)
    mix_at(buf, formant_air_sweep(1.06, (340, 3100), (1050, 7200), 0.20, (-0.75, 0.75), 1.8, seed=233), 0.04, 0.76)
    mix_at(buf, micro_debris(1.02, 36, (2600, 10600), (1.0, 3.8), spread=0.92, curve="swell", seed=234), 0.06, 0.48)
    # Threshold inversion at 1.13s: tactile seal + wide STFT frost expansion + deep exhale
    mix_at(buf, shutter_click(82.0, (1800, 8200), 0.0, 24.0, pan=0.0, seed=235), 1.13, 0.84)
    mix_at(buf, _vapor_puff(0.030, (1200, 8400), 0.85, 0.92, 0.74, 0.0, seed=236), 1.13, 0.92)
    mix_at(buf, pressure_breath(0.76, (1800.0, 140.0), reverse=False, width=0.98, sub_boost=0.68, seed=238), 1.14, 0.76)
    mix_at(buf, micro_debris(0.62, 28, (3600, 11200), (1.0, 3.2), spread=0.95, curve="decay", seed=239), 1.15, 0.42)
    return finalize(buf, target_peak_db=-3.8, fade_in_ms=16.0, fade_out_ms=150.0, deharsh_db=-2.2)


RECIPES_F = {
    "f_hover_crystal": f_hover_crystal,
    "f_click_confirm": f_click_confirm,
    "f_star_open": f_star_open,
    "f_star_close": f_star_close,
    "f_ring_tick": f_ring_tick,
    "f_flip_dream": f_flip_dream,
    "f_flip_wake": f_flip_wake,
    "f_gate_nexus": f_gate_nexus,
}
