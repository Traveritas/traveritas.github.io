"""Click Refinement Audition Suite (K1–K4 × 4 Click Roles).

Four cohesive tactile directions tailored to AveritA's frosted-glass & Wake/Dream world:
  K1 · 霜璃微触 (Frosted Glass)     — crisp visionOS-like glass micro-tactile
  K2 · 绒晶微光 (Silk Felt & Prism) — refined, clear, cutoff-free evolution of DIR J
  K3 · 像素凝晶 (Pixel-to-Glass)    — velvety pixel grain resolving into clear glass
  K4 · 露滴玉瓷 (Dew & Porcelain)   — ultra-quiet matte ceramic + crystal dew, zero bell fatigue

Four click roles per direction:
  click_tap   — light select / expand / toggle-on / font-size / TOC jump
  click_back  — soft collapse / deselect / toggle-off / return back
  click_nav   — page enter / section door / card navigation (with 300ms transition space)
  click_out   — external link / RSS (optional airy outward open)
"""
from __future__ import annotations
import math
import numpy as np
from dsp import SR, make_buf, pan_mono, mix_at, biquad_filter
from dsp_v3 import (
    NOTE3,
    soft_quantize,
    glass_harmonica,
    pixel_to_glass,
    upward_dew,
    silk_space,
    soft_finalize,
)


def glass_contact(
    freq: float = 2200.0,
    crisp: float = 0.72,
    warmth: float = 0.55,
    pan: float = 0.0,
    seed: int = 901,
) -> np.ndarray:
    """Precision 2-4ms frosted-glass micro-contact transient (crisp yet ear-safe)."""
    rng = np.random.default_rng(seed)
    dur = 0.032
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    # Damped micro-impulse with subtle downward pitch settle (finger hitting resin/glass)
    f_t = freq * (1.0 + 0.14 * np.exp(-t / 0.0012))
    ph = 2.0 * math.pi * np.cumsum(f_t) / SR
    atk = np.where(t < 0.0007, 0.5 * (1.0 - np.cos(math.pi * t / 0.0007)), 1.0)
    ping = np.sin(ph) * atk * np.exp(-t / 0.0032) * crisp

    raw = rng.standard_normal(n)
    sheen = biquad_filter(raw, "bandpass", (2400.0, 5400.0), order=2) * atk * np.exp(-t / 0.0020) * (0.34 * crisp)
    body = biquad_filter(raw, "bandpass", (260.0, 820.0), order=2) * atk * np.exp(-t / 0.0052) * (0.42 * warmth)
    mono = ping * 0.78 + sheen + body
    rel_n = n // 3
    mono[-rel_n:] *= 0.5 * (1.0 + np.cos(math.pi * np.arange(rel_n) / rel_n))
    return pan_mono(mono, pan)


def prism_note(
    freq: float,
    dur: float = 0.28,
    bright: float = 0.65,
    warmth: float = 0.45,
    pan: float = 0.0,
    decay_scale: float = 0.55,
    seed: int = 910,
) -> np.ndarray:
    """Clear, delicate crystal-prism note with fast high-partial damping & smooth zero-cliff release."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros((n, 2), dtype=np.float64)

    pitch_mult = 1.0 + 0.0022 * np.exp(-t / 0.008)
    cum_t = np.cumsum(pitch_mult) / SR
    atk_s = 0.0018 + 0.0026 * warmth
    a_env = np.where(t < atk_s, 0.5 * (1.0 - np.cos(math.pi * t / atk_s)), 1.0)

    partials = [
        (1.000, 1.00, 0.16 * decay_scale),
        (2.001, 0.24 * bright, 0.075 * decay_scale),
        (2.998, 0.09 * bright, 0.038 * decay_scale),
        (4.012, 0.04 * bright * (1.0 - 0.4 * warmth), 0.018 * decay_scale),
    ]
    for idx, (r, amp, tau) in enumerate(partials):
        f = freq * r
        if f > SR * 0.42 or amp < 1e-4:
            continue
        dt = 2.0 ** ((1.2 + 0.35 * idx) / 1200.0)
        env = a_env * (0.72 * np.exp(-t / max(tau * 0.58, 0.006)) + 0.28 * np.exp(-t / max(tau * 1.35, 0.012)))
        ph0 = rng.uniform(0.0, 2.0 * math.pi)
        p_pan = pan if idx == 0 else float(np.clip(pan + ((-1) ** idx) * 0.18, -0.75, 0.75))
        ang = (p_pan + 1.0) * (math.pi * 0.25)
        out[:, 0] += amp * env * np.sin(2.0 * math.pi * f / math.sqrt(dt) * cum_t + ph0) * math.cos(ang)
        out[:, 1] += amp * env * np.sin(2.0 * math.pi * f * math.sqrt(dt) * cum_t + ph0 + 0.08) * math.sin(ang)

    rel_n = min(n // 2, max(int(round(0.040 * SR)), int(round(dur * 0.38 * SR))))
    if rel_n > 1:
        out[-rel_n:] *= (0.5 * (1.0 + np.cos(math.pi * np.arange(rel_n) / rel_n)))[:, None]
    return out


def porcelain_tap(
    freq: float = 920.0,
    dur: float = 0.14,
    pan: float = 0.0,
    soft: float = 0.55,
    seed: int = 920,
) -> np.ndarray:
    """Matte translucent porcelain / smooth mineral micro-tap (damped, non-bell)."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    atk_s = 0.0012 + 0.0018 * soft
    atk = np.where(t < atk_s, 0.5 * (1.0 - np.cos(math.pi * t / atk_s)), 1.0)
    # Non-harmonic porcelain plate modes with rapid internal damping
    modes = [(1.0, 1.0, 0.022), (2.34, 0.34 * (1.0 - 0.35 * soft), 0.0095), (3.88, 0.14 * (1.0 - 0.45 * soft), 0.0042)]
    mono = np.zeros(n, dtype=np.float64)
    for r, amp, tau in modes:
        f_t = freq * r * (1.0 + 0.025 * np.exp(-t / 0.0025))
        ph = 2.0 * math.pi * np.cumsum(f_t) / SR
        mono += amp * np.sin(ph) * atk * np.exp(-t / tau)
    thump = biquad_filter(rng.standard_normal(n), "bandpass", (220.0, 1100.0), order=2) * atk * np.exp(-t / 0.0045)
    mono = mono * 0.78 + thump * (0.28 + 0.16 * soft)
    rel_n = min(n // 2, int(round(dur * 0.35 * SR)))
    mono[-rel_n:] *= 0.5 * (1.0 + np.cos(math.pi * np.arange(rel_n) / rel_n))
    return pan_mono(mono, pan)


# ==================== K1: 霜璃微触 (Frosted Glass) ====================

def k1_click_tap() -> np.ndarray:
    buf = make_buf(0.32)
    mix_at(buf, glass_contact(2650.0, crisp=0.78, warmth=0.40, pan=-0.04, seed=1001), 0.0, 0.76)
    mix_at(buf, prism_note(NOTE3["C6"], dur=0.30, bright=0.66, warmth=0.30, pan=0.06, decay_scale=0.34, seed=1002), 0.002, 0.62)
    wet = silk_space(buf, rt60=0.42, wet=0.22, bright_hz=5000.0, predelay_ms=6.0, tail_pad=0.16, seed=1003)
    return soft_finalize(wet, target_peak_db=-7.6, fade_in_ms=0.6, fade_out_ms=65.0)


def k1_click_back() -> np.ndarray:
    buf = make_buf(0.30)
    mix_at(buf, glass_contact(1950.0, crisp=0.52, warmth=0.62, pan=0.04, seed=1004), 0.0, 0.68)
    mix_at(buf, prism_note(NOTE3["Bb5"], dur=0.20, bright=0.48, warmth=0.48, pan=0.06, decay_scale=0.24, seed=1005), 0.0, 0.42)
    mix_at(buf, prism_note(NOTE3["Ab5"], dur=0.26, bright=0.42, warmth=0.56, pan=-0.08, decay_scale=0.30, seed=1006), 0.022, 0.56)
    wet = silk_space(buf, rt60=0.38, wet=0.20, bright_hz=4100.0, predelay_ms=6.0, tail_pad=0.15, seed=1007)
    return soft_finalize(wet, target_peak_db=-8.4, fade_in_ms=0.8, fade_out_ms=60.0)


def k1_click_nav() -> np.ndarray:
    buf = make_buf(0.58)
    mix_at(buf, glass_contact(2400.0, crisp=0.72, warmth=0.48, pan=-0.08, seed=1008), 0.0, 0.72)
    mix_at(buf, prism_note(NOTE3["F5"], dur=0.50, bright=0.64, warmth=0.42, pan=-0.08, decay_scale=0.74, seed=1009), 0.002, 0.68)
    mix_at(buf, prism_note(NOTE3["C6"], dur=0.54, bright=0.72, warmth=0.34, pan=0.12, decay_scale=0.84, seed=1010), 0.026, 0.66)
    mix_at(buf, glass_harmonica(NOTE3["Eb6"], dur=0.44, atk=0.055, pan=0.18, air=0.12, seed=1011), 0.032, 0.20)
    wet = silk_space(buf, rt60=0.82, wet=0.30, bright_hz=5000.0, predelay_ms=9.0, tail_pad=0.34, seed=1012)
    return soft_finalize(wet, target_peak_db=-6.4, fade_in_ms=0.8, fade_out_ms=105.0)


def k1_click_out() -> np.ndarray:
    buf = make_buf(0.48)
    mix_at(buf, glass_contact(2800.0, crisp=0.70, warmth=0.32, pan=-0.06, seed=1013), 0.0, 0.62)
    mix_at(buf, prism_note(NOTE3["Ab5"], dur=0.36, bright=0.66, warmth=0.30, pan=-0.08, decay_scale=0.48, seed=1014), 0.002, 0.56)
    mix_at(buf, prism_note(NOTE3["Eb6"], dur=0.43, bright=0.76, warmth=0.25, pan=0.20, decay_scale=0.62, seed=1015), 0.030, 0.60)
    wet = silk_space(buf, rt60=0.72, wet=0.30, bright_hz=5400.0, predelay_ms=8.0, tail_pad=0.28, seed=1016)
    return soft_finalize(wet, target_peak_db=-7.0, fade_in_ms=0.8, fade_out_ms=90.0)


# ==================== K2: 绒晶微光 (Silk Felt & Prism) ====================

def k2_click_tap() -> np.ndarray:
    buf = make_buf(0.36)
    mix_at(buf, glass_contact(2100.0, crisp=0.55, warmth=0.68, pan=-0.04, seed=1021), 0.0, 0.64)
    mix_at(buf, prism_note(NOTE3["Ab5"], dur=0.34, bright=0.58, warmth=0.64, pan=0.05, decay_scale=0.42, seed=1022), 0.002, 0.72)
    wet = silk_space(buf, rt60=0.48, wet=0.24, bright_hz=4300.0, predelay_ms=7.0, tail_pad=0.18, seed=1023)
    return soft_finalize(wet, target_peak_db=-7.4, fade_in_ms=1.0, fade_out_ms=72.0)


def k2_click_back() -> np.ndarray:
    buf = make_buf(0.34)
    mix_at(buf, glass_contact(1650.0, crisp=0.40, warmth=0.78, pan=0.04, seed=1024), 0.0, 0.60)
    mix_at(buf, prism_note(NOTE3["Ab5"], dur=0.22, bright=0.44, warmth=0.70, pan=0.06, decay_scale=0.28, seed=1025), 0.0, 0.44)
    mix_at(buf, prism_note(NOTE3["F5"], dur=0.30, bright=0.40, warmth=0.78, pan=-0.08, decay_scale=0.38, seed=1026), 0.024, 0.62)
    wet = silk_space(buf, rt60=0.44, wet=0.22, bright_hz=3700.0, predelay_ms=7.0, tail_pad=0.17, seed=1027)
    return soft_finalize(wet, target_peak_db=-8.2, fade_in_ms=1.2, fade_out_ms=68.0)


def k2_click_nav() -> np.ndarray:
    buf = make_buf(0.58)
    mix_at(buf, glass_contact(1980.0, crisp=0.54, warmth=0.72, pan=-0.08, seed=1028), 0.0, 0.62)
    mix_at(buf, prism_note(NOTE3["F5"], dur=0.50, bright=0.58, warmth=0.68, pan=-0.10, decay_scale=0.84, seed=1029), 0.002, 0.72)
    mix_at(buf, prism_note(NOTE3["C6"], dur=0.54, bright=0.66, warmth=0.58, pan=0.14, decay_scale=0.92, seed=1030), 0.022, 0.64)
    mix_at(buf, glass_harmonica(NOTE3["Ab5"], dur=0.46, atk=0.055, pan=0.18, air=0.14, seed=1031), 0.026, 0.24)
    wet = silk_space(buf, rt60=0.92, wet=0.32, bright_hz=4400.0, predelay_ms=10.0, tail_pad=0.36, seed=1032)
    return soft_finalize(wet, target_peak_db=-6.2, fade_in_ms=1.0, fade_out_ms=105.0)


def k2_click_out() -> np.ndarray:
    buf = make_buf(0.50)
    mix_at(buf, glass_contact(2300.0, crisp=0.52, warmth=0.56, pan=-0.06, seed=1033), 0.0, 0.56)
    mix_at(buf, prism_note(NOTE3["Bb5"], dur=0.38, bright=0.62, warmth=0.56, pan=-0.08, decay_scale=0.56, seed=1034), 0.002, 0.62)
    mix_at(buf, prism_note(NOTE3["F6"], dur=0.44, bright=0.68, warmth=0.46, pan=0.22, decay_scale=0.68, seed=1035), 0.032, 0.52)
    wet = silk_space(buf, rt60=0.80, wet=0.32, bright_hz=4800.0, predelay_ms=9.0, tail_pad=0.30, seed=1036)
    return soft_finalize(wet, target_peak_db=-6.8, fade_in_ms=1.0, fade_out_ms=92.0)


# ==================== K3: 像素凝晶 (Pixel-to-Glass) ====================

def k3_click_tap() -> np.ndarray:
    buf = make_buf(0.34)
    mix_at(buf, glass_contact(2450.0, crisp=0.66, warmth=0.48, pan=-0.06, seed=1041), 0.0, 0.64)
    note = prism_note(NOTE3["Bb5"], dur=0.32, bright=0.64, warmth=0.42, pan=0.08, decay_scale=0.38, seed=1042)
    pix = soft_quantize(note, hold_hz=3200.0, levels=18, wet=0.85, smooth_hz=4600.0)
    u = np.clip(np.arange(len(note)) / (0.032 * SR), 0.0, 1.0)
    u = u * u * (3.0 - 2.0 * u)
    mix_at(buf, pix * (1.0 - u[:, None]) + note * u[:, None], 0.001, 0.72)
    wet = silk_space(buf, rt60=0.44, wet=0.24, bright_hz=4700.0, predelay_ms=6.0, tail_pad=0.17, seed=1043)
    return soft_finalize(wet, target_peak_db=-7.6, fade_in_ms=0.8, fade_out_ms=68.0)


def k3_click_back() -> np.ndarray:
    buf = make_buf(0.32)
    mix_at(buf, glass_contact(1850.0, crisp=0.48, warmth=0.60, pan=0.05, seed=1044), 0.0, 0.58)
    note = prism_note(NOTE3["Ab5"], dur=0.30, bright=0.50, warmth=0.55, pan=-0.06, decay_scale=0.34, seed=1045)
    pix = soft_quantize(note, hold_hz=2600.0, levels=0, wet=0.78, smooth_hz=3900.0)
    u = np.clip(np.arange(len(note)) / (0.055 * SR), 0.0, 1.0)
    u = u * u * (3.0 - 2.0 * u)
    # Reverse: clear glass softly coarsening into twilight pixel hush
    mix_at(buf, note * (1.0 - u[:, None]) + pix * u[:, None], 0.002, 0.68)
    wet = silk_space(buf, rt60=0.40, wet=0.22, bright_hz=3900.0, predelay_ms=6.0, tail_pad=0.16, seed=1046)
    return soft_finalize(wet, target_peak_db=-8.4, fade_in_ms=0.8, fade_out_ms=64.0)


def k3_click_nav() -> np.ndarray:
    buf = make_buf(0.58)
    mix_at(buf, glass_contact(2300.0, crisp=0.64, warmth=0.52, pan=-0.08, seed=1047), 0.0, 0.64)
    n1 = prism_note(NOTE3["F5"], dur=0.50, bright=0.64, warmth=0.48, pan=-0.08, decay_scale=0.76, seed=1048)
    p1 = soft_quantize(n1, hold_hz=3000.0, levels=0, wet=0.85, smooth_hz=4500.0)
    u1 = np.clip(np.arange(len(n1)) / (0.048 * SR), 0.0, 1.0)
    u1 = u1 * u1 * (3.0 - 2.0 * u1)
    mix_at(buf, p1 * (1.0 - u1[:, None]) + n1 * u1[:, None], 0.002, 0.64)
    n2 = prism_note(NOTE3["C6"], dur=0.53, bright=0.70, warmth=0.44, pan=0.16, decay_scale=0.86, seed=1049)
    p2 = soft_quantize(n2, hold_hz=3400.0, levels=0, wet=0.85, smooth_hz=4700.0)
    u2 = np.clip(np.arange(len(n2)) / (0.062 * SR), 0.0, 1.0)
    u2 = u2 * u2 * (3.0 - 2.0 * u2)
    mix_at(buf, p2 * (1.0 - u2[:, None]) + n2 * u2[:, None], 0.032, 0.66)
    wet = silk_space(buf, rt60=0.86, wet=0.30, bright_hz=4800.0, predelay_ms=9.0, tail_pad=0.34, seed=1050)
    return soft_finalize(wet, target_peak_db=-6.4, fade_in_ms=0.8, fade_out_ms=100.0)


def k3_click_out() -> np.ndarray:
    buf = make_buf(0.50)
    mix_at(buf, glass_contact(2650.0, crisp=0.62, warmth=0.38, pan=-0.08, seed=1051), 0.0, 0.56)
    mix_at(buf, pixel_to_glass(NOTE3["Eb6"], dur=0.46, morph_s=0.055, hold_hz=3600.0, pan=0.18, bright=0.72, seed=1052), 0.016, 0.64)
    wet = silk_space(buf, rt60=0.74, wet=0.30, bright_hz=5200.0, predelay_ms=8.0, tail_pad=0.28, seed=1053)
    return soft_finalize(wet, target_peak_db=-7.0, fade_in_ms=0.8, fade_out_ms=90.0)


# ==================== K4: 露滴玉瓷 (Dew & Porcelain) ====================

def k4_click_tap() -> np.ndarray:
    buf = make_buf(0.30)
    mix_at(buf, porcelain_tap(980.0, dur=0.14, pan=-0.04, soft=0.48, seed=1061), 0.0, 0.82)
    mix_at(buf, upward_dew(NOTE3["Ab5"] * 0.94, NOTE3["C6"], dur=0.28, decay_s=0.052, pan=0.08, seed=1062), 0.006, 0.36)
    wet = silk_space(buf, rt60=0.40, wet=0.22, bright_hz=4200.0, predelay_ms=6.0, tail_pad=0.16, seed=1063)
    return soft_finalize(wet, target_peak_db=-7.8, fade_in_ms=0.8, fade_out_ms=60.0)


def k4_click_back() -> np.ndarray:
    buf = make_buf(0.28)
    mix_at(buf, porcelain_tap(760.0, dur=0.14, pan=0.04, soft=0.72, seed=1064), 0.0, 0.84)
    mix_at(buf, upward_dew(NOTE3["Ab5"], NOTE3["F5"] * 1.03, dur=0.26, decay_s=0.048, pan=-0.06, seed=1065), 0.005, 0.30)
    wet = silk_space(buf, rt60=0.36, wet=0.20, bright_hz=3600.0, predelay_ms=6.0, tail_pad=0.15, seed=1066)
    return soft_finalize(wet, target_peak_db=-8.6, fade_in_ms=0.8, fade_out_ms=56.0)


def k4_click_nav() -> np.ndarray:
    buf = make_buf(0.52)
    mix_at(buf, porcelain_tap(880.0, dur=0.14, pan=-0.08, soft=0.55, seed=1067), 0.0, 0.72)
    mix_at(buf, porcelain_tap(1180.0, dur=0.14, pan=0.10, soft=0.44, seed=1068), 0.026, 0.56)
    mix_at(buf, glass_harmonica(NOTE3["Ab5"], dur=0.44, atk=0.038, pan=0.06, air=0.12, seed=1069), 0.012, 0.36)
    mix_at(buf, prism_note(NOTE3["C6"], dur=0.46, bright=0.52, warmth=0.62, pan=0.14, decay_scale=0.68, seed=1070), 0.028, 0.42)
    wet = silk_space(buf, rt60=0.80, wet=0.28, bright_hz=4300.0, predelay_ms=9.0, tail_pad=0.32, seed=1071)
    return soft_finalize(wet, target_peak_db=-6.6, fade_in_ms=0.8, fade_out_ms=95.0)


def k4_click_out() -> np.ndarray:
    buf = make_buf(0.46)
    mix_at(buf, porcelain_tap(1080.0, dur=0.13, pan=-0.06, soft=0.42, seed=1072), 0.0, 0.68)
    mix_at(buf, upward_dew(NOTE3["C6"] * 0.92, NOTE3["F6"], dur=0.42, decay_s=0.082, pan=0.18, seed=1073), 0.010, 0.52)
    wet = silk_space(buf, rt60=0.72, wet=0.28, bright_hz=4800.0, predelay_ms=8.0, tail_pad=0.26, seed=1074)
    return soft_finalize(wet, target_peak_db=-7.2, fade_in_ms=0.8, fade_out_ms=85.0)


RECIPES_CLICK = {
    "k1_click_tap": k1_click_tap,
    "k1_click_back": k1_click_back,
    "k1_click_nav": k1_click_nav,
    "k1_click_out": k1_click_out,
    "k2_click_tap": k2_click_tap,
    "k2_click_back": k2_click_back,
    "k2_click_nav": k2_click_nav,
    "k2_click_out": k2_click_out,
    "k3_click_tap": k3_click_tap,
    "k3_click_back": k3_click_back,
    "k3_click_nav": k3_click_nav,
    "k3_click_out": k3_click_out,
    "k4_click_tap": k4_click_tap,
    "k4_click_back": k4_click_back,
    "k4_click_nav": k4_click_nav,
    "k4_click_out": k4_click_out,
}
