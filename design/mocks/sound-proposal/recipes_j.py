"""Batch 3 — DIR J: 醒梦琉璃 (Felt & Starlight) + 4 Batch-3 Site Signatures (z_*).

Organic, tender, luminous intimacy built from felt-hammer celesta, bowed crystal
glass-harmonica, upward-floating micro-dew, and silky velvet-noise space.
Zero metallic FDN ring, zero shrill sine beeps, zero harsh industrial clicks.
"""
from __future__ import annotations
import numpy as np
from dsp import SR, make_buf, mix_at
from dsp_v3 import (
    NOTE3,
    felt_celesta,
    glass_harmonica,
    pixel_to_glass,
    tactile_bead,
    upward_dew,
    velvet_mist,
    silk_space,
    soft_finalize,
)


# ==================== DIR J: FELT & STARLIGHT ====================

def j_hover_crystal() -> np.ndarray:
    """Featherlight glass-rim breath + delicate felt-crystal harmonic glint."""
    buf = make_buf(0.38)
    mix_at(buf, glass_harmonica(NOTE3["Eb6"], dur=0.28, atk=0.055, pan=0.18, air=0.22, drift_hz=0.7, seed=701), 0.0, 0.36)
    mix_at(buf, felt_celesta(NOTE3["Ab5"], dur=0.30, bright=0.52, felt=0.82, pan=-0.16, decay_scale=0.68, seed=702), 0.006, 0.56)
    wet = silk_space(buf, rt60=0.85, wet=0.36, bright_hz=4200.0, predelay_ms=9.0, tail_pad=0.30, seed=703)
    return soft_finalize(wet, target_peak_db=-9.6, fade_in_ms=5.0, fade_out_ms=65.0)


def j_click_confirm() -> np.ndarray:
    """Warm felt-hammer celesta + clear resin-glass contact: poised, intimate confirmation."""
    buf = make_buf(0.54)
    mix_at(buf, felt_celesta(NOTE3["Ab4"], dur=0.44, bright=0.60, felt=0.86, pan=-0.10, decay_scale=0.88, seed=704), 0.0, 0.78)
    mix_at(buf, felt_celesta(NOTE3["Eb5"], dur=0.48, bright=0.68, felt=0.72, pan=0.14, decay_scale=0.92, seed=705), 0.018, 0.62)
    mix_at(buf, glass_harmonica(NOTE3["Ab5"], dur=0.34, atk=0.045, pan=0.20, air=0.16, seed=706), 0.022, 0.24)
    wet = silk_space(buf, rt60=1.02, wet=0.36, bright_hz=4400.0, predelay_ms=11.0, tail_pad=0.36, seed=707)
    return soft_finalize(wet, target_peak_db=-6.4, fade_in_ms=1.5, fade_out_ms=72.0)


def j_star_open() -> np.ndarray:
    """Three-axis star unfolding: warm felt-and-glass open chord blooming gently across stereo."""
    buf = make_buf(0.86)
    mix_at(buf, velvet_mist(0.52, (480, 1450), (1100, 3100), (-0.45, 0.45), seed=708), 0.0, 0.20)
    chord = [("F4", 0.0, -0.34, 0.62), ("C5", 0.064, -0.10, 0.68),
             ("Ab5", 0.132, 0.16, 0.72), ("Bb5", 0.205, 0.38, 0.56)]
    for i, (nm, t0, p, g) in enumerate(chord):
        mix_at(buf, felt_celesta(NOTE3[nm], dur=0.56, bright=0.58 + 0.06 * i, felt=0.80, pan=p, decay_scale=0.96, seed=710 + i), t0, g)
    mix_at(buf, glass_harmonica(NOTE3["Eb6"], dur=0.52, atk=0.14, pan=0.24, air=0.16, seed=715), 0.16, 0.24)
    wet = silk_space(buf, rt60=1.22, wet=0.40, bright_hz=4500.0, predelay_ms=12.0, tail_pad=0.44, shimmer=0.05, seed=716)
    return soft_finalize(wet, target_peak_db=-6.8, fade_in_ms=3.0, fade_out_ms=90.0)


def j_star_close() -> np.ndarray:
    """Tender wool-damped hush: two descending felt-glass tones tucking softly back to stillness."""
    buf = make_buf(0.62)
    mix_at(buf, felt_celesta(NOTE3["Ab5"], dur=0.36, bright=0.46, felt=0.88, pan=0.22, decay_scale=0.72, seed=717), 0.0, 0.58)
    mix_at(buf, felt_celesta(NOTE3["F5"], dur=0.46, bright=0.42, felt=0.92, pan=-0.16, decay_scale=0.82, seed=718), 0.068, 0.72)
    mix_at(buf, velvet_mist(0.32, (1200, 2600), (420, 1100), (0.30, -0.28), seed=719), 0.02, 0.16)
    wet = silk_space(buf, rt60=0.86, wet=0.34, bright_hz=3600.0, predelay_ms=10.0, tail_pad=0.32, seed=720)
    return soft_finalize(wet, target_peak_db=-7.8, fade_in_ms=2.5, fade_out_ms=70.0)


def j_ring_tick() -> np.ndarray:
    """Round, warm felt-on-crystal bead detent — gentle and effortless under fast scrolling."""
    buf = make_buf(0.095)
    mix_at(buf, tactile_bead(NOTE3["Ab5"], dur=0.062, quant_mix=0.0, felt=0.92, pan=0.0, seed=721), 0.0, 0.90)
    wet = silk_space(buf, rt60=0.30, wet=0.20, bright_hz=4200.0, predelay_ms=5.0, tail_pad=0.065, seed=722)
    return soft_finalize(wet, target_peak_db=-8.6, fade_in_ms=0.8, fade_out_ms=18.0)


def j_flip_dream() -> np.ndarray:
    """Day -> Night (入梦): clear felt tones melting into bowed twilight glass & warm sub-pillow."""
    buf = make_buf(1.68)
    mix_at(buf, velvet_mist(1.25, (1400, 3000), (260, 920), (0.45, -0.45), seed=723), 0.0, 0.22)
    # Descending twilight suspension (Eb5 -> Db5 -> C5 -> Bb4 -> F4)
    seq = [("Eb5", 0.02, 0.36, 0.56), ("Db5", 0.19, 0.16, 0.62),
           ("C5", 0.37, -0.06, 0.68), ("Bb4", 0.56, -0.24, 0.66), ("F4", 0.76, 0.0, 0.72)]
    for i, (nm, t0, p, g) in enumerate(seq):
        mix_at(buf, felt_celesta(NOTE3[nm], dur=0.78, bright=0.60 - 0.07 * i, felt=0.84, pan=p, decay_scale=1.15, seed=725 + i), t0, g)
    # Warm dream-loop sub-pillow & bowed glass halo emerging as twilight deepens
    mix_at(buf, glass_harmonica(NOTE3["F3"], dur=1.22, atk=0.42, pan=-0.16, air=0.08, drift_hz=0.4, seed=732), 0.38, 0.48)
    mix_at(buf, glass_harmonica(NOTE3["C4"], dur=1.14, atk=0.38, pan=0.18, air=0.12, drift_hz=0.5, seed=733), 0.46, 0.38)
    mix_at(buf, glass_harmonica(NOTE3["Ab4"], dur=0.98, atk=0.34, pan=0.0, air=0.14, drift_hz=0.55, seed=734), 0.58, 0.28)
    wet = silk_space(buf, rt60=1.75, wet=0.46, bright_hz=3500.0, predelay_ms=16.0, tail_pad=0.65, shimmer=0.06, seed=735)
    return soft_finalize(wet, target_peak_db=-4.8, fade_in_ms=10.0, fade_out_ms=175.0, lp_hz=6400.0)


def j_flip_wake() -> np.ndarray:
    """Night -> Day (醒来): soft glass dawn mist parting upward into luminous morning felt notes."""
    buf = make_buf(1.58)
    mix_at(buf, velvet_mist(1.12, (340, 1100), (1350, 3600), (-0.48, 0.48), seed=736), 0.0, 0.22)
    mix_at(buf, glass_harmonica(NOTE3["F4"], dur=0.95, atk=0.22, pan=-0.26, air=0.16, seed=737), 0.0, 0.32)
    seq = [("F4", 0.04, -0.34, 0.54), ("Ab4", 0.19, -0.14, 0.62),
           ("C5", 0.35, 0.08, 0.68), ("Eb5", 0.52, 0.28, 0.70), ("F5", 0.70, 0.0, 0.62)]
    for i, (nm, t0, p, g) in enumerate(seq):
        mix_at(buf, felt_celesta(NOTE3[nm], dur=0.72, bright=0.48 + 0.09 * i, felt=0.76 - 0.05 * i, pan=p, decay_scale=1.05, seed=740 + i), t0, g)
    mix_at(buf, upward_dew(NOTE3["Bb5"] * 0.92, NOTE3["Eb6"], dur=0.28, pan=0.26, seed=746), 0.62, 0.30)
    wet = silk_space(buf, rt60=1.48, wet=0.42, bright_hz=4900.0, predelay_ms=14.0, tail_pad=0.58, shimmer=0.08, seed=747)
    return soft_finalize(wet, target_peak_db=-4.8, fade_in_ms=8.0, fade_out_ms=160.0)


def j_gate_nexus() -> np.ndarray:
    """NEXUS threshold: quiet, reverent 4D glass-harmonica choir rising into serene white sky."""
    buf = make_buf(2.38)
    # Breathing glass-harmonica fifth slowly swelling from silence
    mix_at(buf, glass_harmonica(NOTE3["F4"], dur=1.95, atk=0.65, pan=-0.28, air=0.12, drift_hz=0.38, seed=750), 0.0, 0.44)
    mix_at(buf, glass_harmonica(NOTE3["C5"], dur=1.90, atk=0.68, pan=0.28, air=0.14, drift_hz=0.44, seed=751), 0.06, 0.44)
    mix_at(buf, velvet_mist(1.32, (360, 1150), (1300, 3800), (-0.50, 0.50), swell=True, seed=752), 0.04, 0.24)
    # Slow luminous felt-crystal facets turning into alignment toward t=1.14s
    facets = [("Ab4", 0.18, -0.40, 0.36), ("Bb4", 0.42, 0.36, 0.42),
              ("Eb5", 0.64, -0.26, 0.48), ("F5", 0.84, 0.22, 0.54), ("Ab5", 1.00, -0.10, 0.58)]
    for i, (nm, t0, p, g) in enumerate(facets):
        mix_at(buf, felt_celesta(NOTE3[nm], dur=0.78, bright=0.56 + 0.07 * i, felt=0.78, pan=p, decay_scale=1.15, seed=755 + i), t0, g)
    # 1.14s white-out bloom: warm open harmonic horizon (F4 + C5 + Ab5 + Eb6 + F6)
    for nm, p, g, dt in [
        ("Ab5", -0.32, 0.40, 0.0),
        ("Eb6", 0.32, 0.36, 0.02),
        ("Bb5", -0.14, 0.32, 0.03),
        ("F6", 0.16, 0.22, 0.05),
    ]:
        mix_at(buf, glass_harmonica(NOTE3[nm], dur=1.22, atk=0.18, pan=p, air=0.15, drift_hz=0.42, seed=765 + int(dt * 1000)), 1.12 + dt, g)
    mix_at(buf, felt_celesta(NOTE3["F5"], dur=1.05, bright=0.74, felt=0.72, pan=0.0, decay_scale=1.30, seed=770), 1.14, 0.52)
    wet = silk_space(buf, rt60=2.25, wet=0.52, bright_hz=4800.0, predelay_ms=18.0, tail_pad=0.80, shimmer=0.12, seed=771)
    return soft_finalize(wet, target_peak_db=-3.8, fade_in_ms=22.0, fade_out_ms=240.0)


# ==================== BATCH 3 BONUS: 4 SITE-INSPIRED SIGNATURES (z_*) ====================

def z_sec_articles() -> np.ndarray:
    """断章 · 14° 像素风与玻璃页 (Gentle 14-deg wind sheen smoothing through a clear reading sheet)."""
    buf = make_buf(0.76)
    mix_at(buf, velvet_mist(0.58, (640, 1750), (1250, 3400), (-0.56, 0.56), seed=801), 0.0, 0.42)
    mix_at(buf, pixel_to_glass(NOTE3["C5"], dur=0.52, morph_s=0.12, hold_hz=2600.0, pan=-0.14, bright=0.60, seed=802), 0.04, 0.52)
    mix_at(buf, glass_harmonica(NOTE3["G5"], dur=0.48, atk=0.14, pan=0.24, air=0.18, seed=803), 0.10, 0.30)
    wet = silk_space(buf, rt60=1.18, wet=0.42, bright_hz=4400.0, predelay_ms=12.0, tail_pad=0.38, seed=804)
    return soft_finalize(wet, target_peak_db=-7.4, fade_in_ms=10.0, fade_out_ms=85.0)


def z2_sec_articles() -> np.ndarray:
    """断章 · 雾蓝棱镜 / 无风声掠光 (Pure breeze-like L->R glass-prism motion, zero noise whoosh)."""
    buf = make_buf(0.84)
    # Suggest 14-deg wind solely via gentle oblique stereo phrasing across a cool misty-blue fifth+seventh
    mix_at(buf, felt_celesta(NOTE3["C5"], dur=0.52, bright=0.56, felt=0.86, pan=-0.34, decay_scale=0.90, seed=831), 0.0, 0.48)
    mix_at(buf, felt_celesta(NOTE3["G5"], dur=0.56, bright=0.64, felt=0.80, pan=0.02, decay_scale=0.98, seed=832), 0.072, 0.62)
    mix_at(buf, felt_celesta(NOTE3["Bb5"], dur=0.52, bright=0.60, felt=0.82, pan=0.34, decay_scale=0.92, seed=833), 0.152, 0.44)
    # Delicate translucent glass-rim sheen gliding behind (air kept whisper-low at 0.05)
    mix_at(buf, glass_harmonica(NOTE3["C6"], dur=0.60, atk=0.16, pan=0.22, air=0.05, drift_hz=0.5, seed=834), 0.09, 0.24)
    wet = silk_space(buf, rt60=1.22, wet=0.40, bright_hz=4500.0, predelay_ms=12.0, tail_pad=0.40, shimmer=0.05, seed=835)
    return soft_finalize(wet, target_peak_db=-7.4, fade_in_ms=6.0, fade_out_ms=90.0)


def z3_sec_articles() -> np.ndarray:
    """断章 · 静页折光 / 琉璃书签 (Composed literary open-fifth pixel-to-glass bloom, no wind)."""
    buf = make_buf(0.82)
    # Microscopic warm felt-bead touch (like resting a fingertip on a calm glass reading sheet)
    mix_at(buf, tactile_bead(NOTE3["C5"], dur=0.058, quant_mix=0.28, felt=0.90, pan=-0.18, seed=841), 0.0, 0.34)
    # Cool blue slender bipyramid: pixel-to-glass open fifth (F5 -> C6) + subtle G5 glass halo
    mix_at(buf, pixel_to_glass(NOTE3["F5"], dur=0.54, morph_s=0.095, hold_hz=2900.0, pan=-0.16, bright=0.62, seed=842), 0.014, 0.64)
    mix_at(buf, felt_celesta(NOTE3["C6"], dur=0.58, bright=0.66, felt=0.84, pan=0.22, decay_scale=1.02, seed=843), 0.092, 0.56)
    mix_at(buf, glass_harmonica(NOTE3["G5"], dur=0.58, atk=0.18, pan=0.06, air=0.04, drift_hz=0.45, seed=844), 0.06, 0.26)
    wet = silk_space(buf, rt60=1.16, wet=0.38, bright_hz=4400.0, predelay_ms=11.0, tail_pad=0.38, shimmer=0.04, seed=845)
    return soft_finalize(wet, target_peak_db=-7.4, fade_in_ms=4.0, fade_out_ms=88.0)


def z_sec_moments() -> np.ndarray:
    """闪念 · 逆升细雨与色晕 (Upward-drifting luminous micro-raindrops blooming into pastel glass)."""
    buf = make_buf(0.80)
    mix_at(buf, upward_dew(NOTE3["F5"] * 0.88, NOTE3["Ab5"], dur=0.28, pan=-0.26, seed=805), 0.0, 0.64)
    mix_at(buf, upward_dew(NOTE3["Bb5"] * 0.90, NOTE3["Eb6"], dur=0.26, pan=0.22, seed=806), 0.105, 0.54)
    mix_at(buf, upward_dew(NOTE3["C6"] * 0.92, NOTE3["F6"], dur=0.22, pan=-0.04, seed=807), 0.215, 0.36)
    mix_at(buf, glass_harmonica(NOTE3["Ab5"], dur=0.56, atk=0.16, pan=0.08, air=0.16, seed=808), 0.08, 0.28)
    wet = silk_space(buf, rt60=1.28, wet=0.44, bright_hz=4600.0, predelay_ms=12.0, tail_pad=0.42, shimmer=0.07, seed=809)
    return soft_finalize(wet, target_peak_db=-7.2, fade_in_ms=4.0, fade_out_ms=90.0)


def z_sec_projects() -> np.ndarray:
    """造物 · 三层星尘与立方落槽 (3 parallax stardust breaths far->mid->near + amber felt-crystal dock)."""
    buf = make_buf(0.74)
    # 3 parallax layers: far (soft, narrow), mid, near (crisp, wide)
    mix_at(buf, tactile_bead(NOTE3["C6"], dur=0.055, quant_mix=0.60, felt=0.70, pan=-0.42, seed=810), 0.0, 0.28)
    mix_at(buf, tactile_bead(NOTE3["Bb5"], dur=0.060, quant_mix=0.38, felt=0.72, pan=-0.14, seed=811), 0.068, 0.44)
    mix_at(buf, tactile_bead(NOTE3["F5"], dur=0.065, quant_mix=0.20, felt=0.78, pan=0.12, seed=812), 0.132, 0.62)
    # Warm amber cube gently settling into .pj-slot
    mix_at(buf, felt_celesta(NOTE3["F5"], dur=0.48, bright=0.64, felt=0.84, pan=0.18, decay_scale=0.92, seed=813), 0.165, 0.74)
    mix_at(buf, pixel_to_glass(NOTE3["C6"], dur=0.44, morph_s=0.09, hold_hz=3200.0, pan=0.26, bright=0.70, seed=814), 0.182, 0.56)
    wet = silk_space(buf, rt60=1.08, wet=0.38, bright_hz=4500.0, predelay_ms=11.0, tail_pad=0.36, seed=815)
    return soft_finalize(wet, target_peak_db=-6.8, fade_in_ms=2.0, fade_out_ms=75.0)


def z_fx_unlock() -> np.ndarray:
    """FX 声道启封 · 醒梦初响 (Affectionate luminous greeting motif when pulling FX arc up from 0)."""
    buf = make_buf(0.92)
    motif = [("F5", 0.0, -0.26, 0.58), ("C6", 0.075, 0.04, 0.68),
             ("Bb5", 0.155, -0.08, 0.56), ("Eb6", 0.235, 0.28, 0.62)]
    for i, (nm, t0, p, g) in enumerate(motif):
        mix_at(buf, pixel_to_glass(NOTE3[nm], dur=0.52, morph_s=0.08, hold_hz=2800.0 + i * 380.0,
                                   pan=p, bright=0.68, seed=820 + i), t0, g)
    mix_at(buf, glass_harmonica(NOTE3["F5"], dur=0.62, atk=0.14, pan=0.0, air=0.14, seed=825), 0.12, 0.28)
    wet = silk_space(buf, rt60=1.35, wet=0.42, bright_hz=4800.0, predelay_ms=12.0, tail_pad=0.44, shimmer=0.08, seed=826)
    return soft_finalize(wet, target_peak_db=-5.8, fade_in_ms=2.5, fade_out_ms=95.0)


RECIPES_J = {
    "j_hover_crystal": j_hover_crystal,
    "j_click_confirm": j_click_confirm,
    "j_star_open": j_star_open,
    "j_star_close": j_star_close,
    "j_ring_tick": j_ring_tick,
    "j_flip_dream": j_flip_dream,
    "j_flip_wake": j_flip_wake,
    "j_gate_nexus": j_gate_nexus,
    "z_sec_articles": z_sec_articles,
    "z2_sec_articles": z2_sec_articles,
    "z3_sec_articles": z3_sec_articles,
    "z_sec_moments": z_sec_moments,
    "z_sec_projects": z_sec_projects,
    "z_fx_unlock": z_fx_unlock,
}
