"""Batch 2 — DIR H: Dispersive Foil (频散晶箔) + 4 Batch-2 Bonus Cues (y_*).
Avant-garde unpitched physical waveguide synthesis: cascaded allpass wave dispersion
(liquid-glass / ice-crack phase-velocity zip) + heavily damped KS micro-foil + dry binaural space.
"""
from __future__ import annotations
import numpy as np
from dsp import SR, make_buf, mix_at, pan_mono, biquad_filter, finalize
from dsp_v2 import (
    soft_sat,
    allpass_dispersion,
    ks_damped_wire,
    early_space,
    friction_slide,
    pressure_breath,
    shutter_click,
    formant_air_sweep,
    stft_spectral_blur,
    micro_debris,
    plate_2d_strike,
)


def _disp_impulse(dur: float, band: tuple[float, float], stages: int, coeff: float, pan: float, seed: int) -> np.ndarray:
    """Create a dry acoustic wave-dispersion zip by passing a razor-short burst through an allpass waveguide."""
    rng = np.random.default_rng(seed)
    n = max(128, int(round(dur * SR)))
    imp = np.zeros(n, dtype=np.float64)
    m = max(16, int(0.0028 * SR))
    raw = biquad_filter(rng.standard_normal(m), "bandpass", band, order=2)
    imp[:m] = raw * np.hanning(m)
    disp = allpass_dispersion(imp, stages=stages, coeff=coeff)
    # Normalize & soft-compress micro-peak so dispersive tail reads lush and tactile
    disp = disp / (float(np.max(np.abs(disp))) + 1e-9)
    disp = soft_sat(disp * 2.6, drive=1.85)
    t = np.arange(n, dtype=np.float64) / SR
    env = np.exp(-t / max(dur * 0.30, 0.018))
    return pan_mono(disp * env, pan)


# ==================== DIR H: DISPERSIVE FOIL ====================

def h_hover_crystal() -> np.ndarray:
    """Micro acoustic wave-dispersion flick — glassy phase-zip with zero musical pitch."""
    buf = make_buf(0.14)
    mix_at(buf, _disp_impulse(0.11, (2200, 9600), stages=26, coeff=0.72, pan=-0.14, seed=401), 0.0, 0.82)
    mix_at(buf, ks_damped_wire(640.0, 0.075, damp=0.84, bright=0.68, pan=0.18, seed=402), 0.008, 0.36)
    wet = early_space(buf, room_ms=16.0, width=0.78, mix=0.26, bright_hz=6800.0, seed=403)
    return finalize(wet, target_peak_db=-8.6, fade_in_ms=0.8, fade_out_ms=22.0, deharsh_db=-1.8)


def h_click_confirm() -> np.ndarray:
    """Crisp refractive snap: sharp contact -> dual stereo allpass foil ripple."""
    buf = make_buf(0.20)
    mix_at(buf, shutter_click(160.0, (3000, 9400), 0.0, 8.5, pan=-0.04, seed=404), 0.0, 0.78)
    mix_at(buf, _disp_impulse(0.15, (1600, 8800), stages=36, coeff=0.76, pan=0.14, seed=405), 0.004, 0.92)
    mix_at(buf, ks_damped_wire(490.0, 0.11, damp=0.88, bright=0.58, pan=-0.16, seed=406), 0.018, 0.42)
    wet = early_space(buf, room_ms=21.0, width=0.84, mix=0.30, bright_hz=6200.0, seed=407)
    return finalize(wet, target_peak_db=-5.6, fade_in_ms=0.5, fade_out_ms=28.0, deharsh_db=-1.6)


def h_star_open() -> np.ndarray:
    """Three staggered dispersive crystal-foil arcs unfolding across wide stereo."""
    buf = make_buf(0.46)
    arcs = [
        (0.00, (1400, 7400), 28, 0.70, -0.52, 0.72),
        (0.075, (2000, 8800), 38, 0.75, 0.04, 0.84),
        (0.155, (2600, 10200), 48, 0.79, 0.50, 0.94),
    ]
    for i, (t0, band, st, cf, p, g) in enumerate(arcs):
        mix_at(buf, _disp_impulse(0.22, band, stages=st, coeff=cf, pan=p, seed=408 + i), t0, g)
    mix_at(buf, friction_slide(0.24, (2200, 7200), 62.0, (-0.48, 0.48), "bell", seed=412), 0.02, 0.36)
    wet = early_space(buf, room_ms=26.0, width=0.90, mix=0.34, bright_hz=6600.0, seed=413)
    return finalize(wet, target_peak_db=-6.2, fade_in_ms=1.2, fade_out_ms=42.0, deharsh_db=-1.8)


def h_star_close() -> np.ndarray:
    """Negative-coeff inverse dispersion tucking foil edges back into a single crisp point."""
    buf = make_buf(0.34)
    mix_at(buf, _disp_impulse(0.18, (1800, 7800), stages=38, coeff=-0.76, pan=0.32, seed=414), 0.0, 0.78)
    mix_at(buf, _disp_impulse(0.16, (1200, 5600), stages=28, coeff=-0.70, pan=-0.22, seed=415), 0.068, 0.74)
    mix_at(buf, shutter_click(135.0, (2200, 6800), 0.0, 11.0, pan=0.0, seed=416), 0.135, 0.76)
    wet = early_space(buf, room_ms=20.0, width=0.74, mix=0.26, bright_hz=5000.0, seed=417)
    return finalize(wet, target_peak_db=-7.2, fade_in_ms=1.0, fade_out_ms=34.0, deharsh_db=-1.8)


def h_ring_tick() -> np.ndarray:
    """Micro ice-facet dispersion tick — ultra-short refractive snap, zero ringing."""
    buf = make_buf(0.056)
    mix_at(buf, _disp_impulse(0.044, (2800, 10400), stages=18, coeff=0.66, pan=0.0, seed=418), 0.0, 0.94)
    mix_at(buf, shutter_click(220.0, (4200, 10200), 0.0, 4.0, pan=0.0, seed=419), 0.0, 0.42)
    return finalize(buf, target_peak_db=-8.4, fade_in_ms=0.3, fade_out_ms=10.0, deharsh_db=-1.6)


def h_flip_dream() -> np.ndarray:
    """Acoustic horizon bending downward: deep waveguide dispersion sweep + damped wire + low air."""
    buf = make_buf(1.06)
    mix_at(buf, pressure_breath(0.92, (980.0, 135.0), reverse=False, width=0.92, sub_boost=0.72, seed=420), 0.02, 0.70)
    for i, (t0, cf, p) in enumerate([(0.02, 0.72, 0.48), (0.17, 0.78, 0.18), (0.34, 0.83, -0.16), (0.52, 0.86, -0.44)]):
        mix_at(buf, _disp_impulse(0.32, (900, 6200 - i * 800), stages=42 + i * 8, coeff=cf, pan=p, seed=421 + i), t0, 0.72)
    mix_at(buf, ks_damped_wire(215.0, 0.34, damp=0.90, bright=0.38, pan=0.0, seed=426), 0.56, 0.68)
    wet = early_space(buf, room_ms=36.0, width=0.94, mix=0.38, bright_hz=4200.0, seed=427)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=4.0, fade_out_ms=98.0, deharsh_db=-2.0)


def h_flip_wake() -> np.ndarray:
    """Prism refocus: negative-to-positive dispersion cascade snapping into crisp daylight focus."""
    buf = make_buf(1.00)
    mix_at(buf, pressure_breath(0.84, (175.0, 1480.0), reverse=False, width=0.90, sub_boost=0.40, seed=428), 0.02, 0.60)
    for i, (t0, cf, p) in enumerate([(0.02, -0.82, -0.46), (0.16, -0.76, -0.14), (0.32, 0.74, 0.18), (0.48, 0.80, 0.44)]):
        mix_at(buf, _disp_impulse(0.28, (1500 + i * 450, 7400 + i * 850), stages=36 + i * 6, coeff=cf, pan=p, seed=429 + i), t0, 0.76)
    mix_at(buf, ks_damped_wire(540.0, 0.22, damp=0.87, bright=0.72, pan=0.0, seed=434), 0.54, 0.56)
    wet = early_space(buf, room_ms=32.0, width=0.92, mix=0.36, bright_hz=6400.0, seed=435)
    return finalize(wet, target_peak_db=-4.8, fade_in_ms=3.0, fade_out_ms=90.0, deharsh_db=-1.8)


def h_gate_nexus() -> np.ndarray:
    """4D waveguide warp: escalating allpass dispersion zipper + vacuum suction -> hypercube phase-snap."""
    buf = make_buf(1.86)
    mix_at(buf, pressure_breath(1.12, (130.0, 2100.0), reverse=True, width=0.96, sub_boost=0.82, seed=436), 0.0, 0.86)
    times = [0.04, 0.22, 0.39, 0.55, 0.70, 0.83, 0.95, 1.05]
    for i, t0 in enumerate(times):
        u = i / (len(times) - 1)
        p = ((-1) ** i) * (0.58 * (1.0 - 0.65 * u))
        mix_at(buf, _disp_impulse(0.26, (1000 + 1800 * u, 5200 + 5400 * u), stages=28 + i * 6, coeff=0.68 + 0.19 * u, pan=p, seed=437 + i), t0, 0.52 + 0.38 * u)
    # 1.13s phase inversion: deep tactile lock + 64-stage wide stereo dispersion burst + micro-debris
    mix_at(buf, shutter_click(76.0, (1800, 9600), 6.0, 28.0, pan=0.0, seed=446), 1.13, 0.96)
    mix_at(buf, _disp_impulse(0.54, (800, 9800), stages=64, coeff=0.86, pan=-0.34, seed=447), 1.135, 0.96)
    mix_at(buf, _disp_impulse(0.54, (1100, 10200), stages=60, coeff=-0.84, pan=0.34, seed=448), 1.142, 0.92)
    mix_at(buf, micro_debris(0.52, 24, (3200, 11000), (1.0, 3.6), spread=0.92, curve="decay", seed=449), 1.16, 0.40)
    wet = early_space(buf, room_ms=44.0, width=0.96, mix=0.40, bright_hz=6000.0, seed=450)
    return finalize(wet, target_peak_db=-3.8, fade_in_ms=6.0, fade_out_ms=135.0, deharsh_db=-1.8)


# ==================== BATCH 2 BONUS: 4 NON-CLICHE SITE SIGNATURES (y_*) ====================

def y_sec_articles() -> np.ndarray:
    """断章 · 磨砂镜片扫风 (Frosted lens gliding through a clean formant breeze, zero chime)."""
    buf = make_buf(0.64)
    mix_at(buf, formant_air_sweep(0.48, (720, 2500), (2100, 5800), 0.22, (-0.62, 0.62), 1.45, seed=501), 0.0, 0.72)
    mix_at(buf, friction_slide(0.32, (2200, 7400), 54.0, (-0.42, 0.42), "bell", seed=502), 0.06, 0.56)
    mix_at(buf, _disp_impulse(0.14, (2800, 9200), stages=24, coeff=0.70, pan=0.22, seed=503), 0.14, 0.44)
    wet = early_space(buf, room_ms=26.0, width=0.88, mix=0.30, bright_hz=6200.0, seed=504)
    return finalize(wet, target_peak_db=-7.2, fade_in_ms=8.0, fade_out_ms=65.0, deharsh_db=-2.0)


def y_sec_moments() -> np.ndarray:
    """闪念 · 细雨散尘 (Dry micro-droplet quartz scatter vaporizing into soft STFT mist)."""
    buf = make_buf(0.66)
    mix_at(buf, micro_debris(0.46, 28, (2400, 9600), (1.4, 4.6), spread=0.84, curve="decay", seed=505), 0.0, 0.92)
    rng = np.random.default_rng(506)
    n = int(0.024 * SR)
    imp = pan_mono(biquad_filter(rng.standard_normal(n), "bandpass", (1400, 6600), order=2) * np.hanning(n), -0.14)
    mix_at(buf, stft_spectral_blur(imp, 0.80, 0.89, 0.92, 1.4, 0.48, seed=507), 0.02, 1.35)
    mix_at(buf, plate_2d_strike(660.0, 0.14, n_modes=18, stiffness=1.18, damp_base=0.026, damp_hi=2.4, mallet_ms=1.0, scrape_amt=0.22, pan=0.18, spread=0.32, seed=508), 0.02, 0.54)
    return finalize(buf, target_peak_db=-6.8, fade_in_ms=3.0, fade_out_ms=70.0, deharsh_db=-2.2)


def y_sec_projects() -> np.ndarray:
    """造物 · 晶格入槽 (Precision cube glide + two-stage magnetic ceramic dock into .pj-slot)."""
    buf = make_buf(0.56)
    mix_at(buf, friction_slide(0.22, (1200, 5600), 56.0, (-0.54, 0.12), "swell", seed=509), 0.0, 0.95)
    mix_at(buf, shutter_click(138.0, (2400, 8200), 4.0, 14.0, pan=0.16, seed=510), 0.175, 0.92)
    mix_at(buf, plate_2d_strike(540.0, 0.20, n_modes=20, stiffness=1.22, damp_base=0.036, damp_hi=2.3, mallet_ms=1.1, scrape_amt=0.24, pan=0.20, spread=0.36, seed=511), 0.178, 0.88)
    mix_at(buf, _disp_impulse(0.18, (2400, 9600), stages=26, coeff=0.72, pan=0.24, seed=512), 0.19, 0.56)
    wet = early_space(buf, room_ms=26.0, width=0.86, mix=0.36, bright_hz=5800.0, seed=513)
    return finalize(wet, target_peak_db=-6.4, fade_in_ms=2.0, fade_out_ms=58.0, deharsh_db=-1.8)


def y_fx_unlock() -> np.ndarray:
    """FX 声道激活 · 空气校准 (Aperture open + crisp dispersive arc + dry spatial pop, zero cliché chime)."""
    buf = make_buf(0.58)
    mix_at(buf, pressure_breath(0.36, (260.0, 1450.0), reverse=False, width=0.88, sub_boost=0.38, seed=514), 0.0, 0.58)
    mix_at(buf, shutter_click(175.0, (3200, 9600), 0.0, 8.0, pan=-0.12, seed=515), 0.02, 0.78)
    mix_at(buf, _disp_impulse(0.28, (1800, 9400), stages=36, coeff=0.76, pan=0.18, seed=516), 0.035, 0.88)
    mix_at(buf, micro_debris(0.30, 14, (3600, 10800), (1.0, 3.0), spread=0.78, curve="decay", seed=517), 0.06, 0.36)
    wet = early_space(buf, room_ms=28.0, width=0.90, mix=0.36, bright_hz=6400.0, seed=518)
    return finalize(wet, target_peak_db=-5.6, fade_in_ms=1.5, fade_out_ms=64.0, deharsh_db=-1.8)


RECIPES_H = {
    "h_hover_crystal": h_hover_crystal,
    "h_click_confirm": h_click_confirm,
    "h_star_open": h_star_open,
    "h_star_close": h_star_close,
    "h_ring_tick": h_ring_tick,
    "h_flip_dream": h_flip_dream,
    "h_flip_wake": h_flip_wake,
    "h_gate_nexus": h_gate_nexus,
    "y_sec_articles": y_sec_articles,
    "y_sec_moments": y_sec_moments,
    "y_sec_projects": y_sec_projects,
    "y_fx_unlock": y_fx_unlock,
}
