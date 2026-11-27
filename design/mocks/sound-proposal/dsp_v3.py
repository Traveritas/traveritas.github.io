"""Batch 3 DSP primitives: AveritA Wake/Dream organic-luminous synthesis.

Designed specifically for AveritA's dual world:
  1) Pixelated Bayer-dithered luminous ground <-> Bilinear-interpolated clear glass (DIR I)
  2) Felt-hammer celesta, bowed glass-harmonica & silk velvet space (DIR J)

Harmonic center locked to actual measured site BGM (wake-loop + dream-loop):
  F natural minor / Bb minor / Ab major (core open tones: F, Bb, C, Eb, Ab; color: Db, G).
"""
from __future__ import annotations
import math
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from dsp import SR, NOTE, make_buf, pan_mono, mix_at, biquad_filter, high_shelf_trim

# Extended low/high notes aligned with measured site BGM (wake-loop & dream-loop)
NOTE3 = {
    **NOTE,
    "F2": 87.307, "C3": 130.813, "Eb3": 155.563, "Bb2": 116.541,
    "Db3": 138.591, "Ab2": 103.826, "G2": 97.999,
    "F7": 2793.826,
}


def _cosine_env(n: int, atk_s: float, rel_s: float) -> np.ndarray:
    """Click-free smooth cosine attack + smooth tail release."""
    t = np.arange(n, dtype=np.float64) / SR
    na = max(1, int(round(atk_s * SR)))
    nr = max(1, int(round(rel_s * SR)))
    env = np.ones(n, dtype=np.float64)
    if na < n:
        env[:na] = 0.5 * (1.0 - np.cos(math.pi * np.arange(na) / na))
    if nr < n:
        env[-nr:] *= 0.5 * (1.0 + np.cos(math.pi * np.arange(nr) / nr))
    return env


def soft_quantize(
    sig: np.ndarray,
    hold_hz: float = 2800.0,
    levels: int = 24,
    wet: float = 0.65,
    smooth_hz: float = 4200.0,
) -> np.ndarray:
    """Velvety, non-harsh pixel-ground quantization (warm backlit phosphor, never harsh chiptune).
    Applies gentle sample-and-hold + soft amplitude stepping, then immediately kisses
    away digital aliasing with a warm lowpass filter.
    """
    n = len(sig)
    step = max(2, int(round(SR / max(hold_hz, 180.0))))
    idx = (np.arange(n) // step) * step
    held = sig[np.minimum(idx, n - 1)]
    if levels > 0:
        peak = float(np.max(np.abs(held))) + 1e-9
        norm = held / peak
        # Soft-dithered quantization so quiet tails don't gate abruptly
        q = np.round(norm * levels) / levels
        held = q * peak
    # Smooth off harsh aliasing edges so it feels like frosted pixel light
    warm = biquad_filter(held, "lowpass", min(smooth_hz, SR * 0.42), order=2)
    return sig * (1.0 - wet) + warm * wet


def felt_celesta(
    freq: float,
    dur: float = 0.72,
    bright: float = 0.65,
    felt: float = 0.72,
    pan: float = 0.0,
    spread: float = 0.30,
    decay_scale: float = 1.0,
    seed: int = 11,
) -> np.ndarray:
    """Intimate felt-hammer celesta / translucent glass-bar note.
    Combines a warm soft-felt impact (zero harsh click), slight physical strike pitch
    settle, and delicately detuned stereo partials with fast high-partial damping.
    """
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros((n, 2), dtype=np.float64)

    # Physical strike micro-pitch settle (+5 cents dropping in 14ms)
    pitch_mult = 1.0 + 0.0028 * np.exp(-t / 0.014)
    cum_t = np.cumsum(pitch_mult) / SR

    # Soft cosine attack (felt hammer contact ~3.5-7ms)
    atk_s = 0.0032 + 0.0042 * felt
    a_env = np.where(t < atk_s, 0.5 * (1.0 - np.cos(math.pi * t / atk_s)), 1.0)

    # Warm celesta + thin-glass partial ratios: (ratio, amp, tau_s)
    partials = [
        (1.000, 1.00, 0.34 * decay_scale),
        (2.001, 0.28 * bright, 0.17 * decay_scale),
        (2.998, 0.11 * bright, 0.095 * decay_scale),
        (4.006, 0.055 * bright, 0.055 * decay_scale),
        (5.410, 0.025 * bright * (1.0 - 0.5 * felt), 0.026 * decay_scale),
    ]
    for idx, (r, amp, tau) in enumerate(partials):
        f = freq * r
        if f > SR * 0.40 or amp < 1e-4:
            continue
        # Subtle organic stereo beating (1.4-2.8 cents) with focused fundamental core
        dt = 2.0 ** ((1.4 + 0.45 * idx) / 1200.0)
        # Double-exponential decay: quick shimmer settle + warm tail
        env = a_env * (0.64 * np.exp(-t / max(tau * 0.52, 0.008)) + 0.36 * np.exp(-t / max(tau * 1.40, 0.015)))
        ph0 = rng.uniform(0.0, 2.0 * math.pi)
        p_pan = pan if idx == 0 else float(np.clip(pan + ((-1) ** idx) * spread * (0.22 + 0.12 * idx), -0.85, 0.85))
        ang = (p_pan + 1.0) * (math.pi * 0.25)
        out[:, 0] += amp * env * np.sin(2.0 * math.pi * f / math.sqrt(dt) * cum_t + ph0) * math.cos(ang)
        out[:, 1] += amp * env * np.sin(2.0 * math.pi * f * math.sqrt(dt) * cum_t + ph0 + (0.06 if idx == 0 else 0.18)) * math.sin(ang)

    # Soft felt hammer thump (warm low-mid body + whisper felt-fiber brush)
    if felt > 0.05:
        th_n = min(n, int(0.036 * SR))
        raw = rng.standard_normal(th_n)
        thump = biquad_filter(raw, "bandpass", (190.0, 880.0), order=2)
        th_t = np.arange(th_n) / SR
        th_env = np.sin(math.pi * np.clip(th_t / 0.0045, 0.0, 0.5)) * np.exp(-th_t / 0.0075)
        hair = biquad_filter(raw, "bandpass", (1800.0, 4400.0), order=2) * np.exp(-th_t / 0.0038)
        felt_sig = pan_mono((thump * th_env * 0.26 + hair * th_env * 0.07) * felt, pan)
        mix_at(out, felt_sig, 0.0, 1.0)

    return out


def glass_harmonica(
    freq: float,
    dur: float = 0.95,
    atk: float = 0.14,
    pan: float = 0.0,
    air: float = 0.18,
    drift_hz: float = 0.55,
    seed: int = 23,
) -> np.ndarray:
    """Bowed / rubbed crystal-rim tone: pure translucent glass light with slow breathing
    micro-beating and a whisper of tuned frosted-air halo.
    """
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    u = t / max(dur, 1e-4)
    # Smooth S-swell attack + silky exponential fade
    a_env = np.where(t < atk, 0.5 * (1.0 - np.cos(math.pi * t / max(atk, 1e-3))), 1.0)
    d_env = np.exp(-np.maximum(0.0, t - atk * 0.7) / max(dur * 0.42, 0.06))
    env = a_env * d_env * (1.0 - u ** 6)

    vib = 0.0014 * np.sin(2.0 * math.pi * drift_hz * t + rng.uniform(0, 6.28))
    dt = 2.0 ** (2.4 / 1200.0)
    ph_l = 2.0 * math.pi * freq / math.sqrt(dt) * (t + vib)
    ph_r = 2.0 * math.pi * freq * math.sqrt(dt) * (t - vib) + 0.7

    # Pure crystal glass rim: dominant fundamental + very delicate 2nd & 3rd overtone
    sig_l = np.sin(ph_l) + 0.14 * np.sin(2.0 * ph_l + 0.4) * (env ** 0.5) + 0.045 * np.sin(3.0 * ph_l + 1.1)
    sig_r = np.sin(ph_r) + 0.14 * np.sin(2.0 * ph_r + 0.9) * (env ** 0.5) + 0.045 * np.sin(3.0 * ph_r + 1.7)
    ang = (np.clip(pan, -0.9, 0.9) + 1.0) * (math.pi * 0.25)
    out = np.column_stack((sig_l * env * math.cos(ang), sig_r * env * math.sin(ang)))

    # Tuned narrowband frosted-air halo around the glass rim
    if air > 0.01:
        f_lo = max(240.0, freq * 1.4)
        f_hi = min(5600.0, freq * 2.8)
        if f_hi > f_lo + 120.0:
            raw_l = biquad_filter(rng.standard_normal(n), "bandpass", (f_lo, f_hi), order=2)
            raw_r = biquad_filter(rng.standard_normal(n), "bandpass", (f_lo, f_hi), order=2)
            out += np.column_stack((raw_l, raw_r)) * (env[:, None] ** 1.2) * (air * 0.18)
    return out


def pixel_to_glass(
    freq: float,
    dur: float = 0.52,
    morph_s: float = 0.09,
    hold_hz: float = 2600.0,
    reverse: bool = False,
    pan: float = 0.0,
    bright: float = 0.72,
    seed: int = 37,
) -> np.ndarray:
    """Signature AveritA '玻璃 = 插值' sound primitive:
    Smoothly interpolates between softly quantized pixel-ground grain and pure translucent
    glass resonance (or reverse: glass coarsening gently into pixel twilight).
    """
    base = felt_celesta(freq, dur=dur, bright=bright, felt=0.52, pan=pan, spread=0.34, decay_scale=0.95, seed=seed)
    pix = soft_quantize(base, hold_hz=hold_hz, levels=18, wet=0.92, smooth_hz=4400.0)
    # Add tiny twinkling phosphor-grid dust at the pixel end
    rng = np.random.default_rng(seed + 101)
    n = len(base)
    t = np.arange(n, dtype=np.float64) / SR
    if not reverse:
        # u: 0 (pixel) -> 1 (clear glass)
        u = np.clip(t / max(morph_s, 0.015), 0.0, 1.0)
        u = u * u * (3.0 - 2.0 * u)
    else:
        # u: 1 (clear glass) -> 0 (soft pixel tail)
        u = 1.0 - np.clip(t / max(morph_s, 0.025), 0.0, 1.0)
        u = u * u * (3.0 - 2.0 * u)
    blended = pix * (1.0 - u[:, None]) + base * u[:, None]
    # Whisper-light high sparkle grain aligned with pixel phase
    dust_env = (1.0 - u) * np.exp(-t / max(morph_s * 1.4, 0.03))
    dust = biquad_filter(rng.standard_normal(n), "bandpass", (2400.0, 5800.0), order=2) * dust_env * 0.045
    return blended + pan_mono(dust, pan)


def tactile_bead(
    freq: float = 1046.5,
    dur: float = 0.075,
    quant_mix: float = 0.0,
    felt: float = 0.65,
    pan: float = 0.0,
    seed: int = 51,
) -> np.ndarray:
    """Fatigue-free short frosted-glass / felt bead pip for rapid wheel & orbit ticks."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    # Micro pitch settle for round, tactile feel
    f_t = freq * (1.0 + 0.035 * np.exp(-t / 0.0022))
    ph = 2.0 * math.pi * np.cumsum(f_t) / SR
    atk = np.where(t < 0.0014, 0.5 * (1.0 - np.cos(math.pi * t / 0.0014)), 1.0)
    body = (np.sin(ph) * np.exp(-t / 0.015)
            + 0.22 * np.sin(2.0 * ph + 0.6) * np.exp(-t / 0.0065)) * atk
    # Warm woody-felt tap underneath
    tap = biquad_filter(rng.standard_normal(n), "bandpass", (320.0, 1800.0), order=2)
    tap_env = atk * np.exp(-t / 0.0038)
    mono = body * 0.78 + tap * tap_env * (0.28 * felt)
    sig = pan_mono(mono, pan)
    if quant_mix > 0.01:
        sig = soft_quantize(sig, hold_hz=3600.0, levels=16, wet=quant_mix, smooth_hz=4800.0)
    return sig


def upward_dew(
    f0: float,
    f1: float,
    dur: float = 0.26,
    pan: float = 0.0,
    seed: int = 67,
) -> np.ndarray:
    """Weightless upward-floating luminous droplet (inspired by 闪念's slow upward pixel rain)."""
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    tau = max(dur * 0.26, 0.025)
    f_t = f0 + (f1 - f0) * (1.0 - np.exp(-t / tau))
    ph = 2.0 * math.pi * np.cumsum(f_t) / SR
    atk = np.where(t < 0.008, 0.5 * (1.0 - np.cos(math.pi * t / 0.008)), 1.0)
    env = atk * np.exp(-t / max(dur * 0.34, 0.035))
    mono = (np.sin(ph) + 0.16 * np.sin(2.0 * ph + 0.4) * np.exp(-t / 0.045)) * env
    return pan_mono(mono, pan)


def velvet_mist(
    dur: float = 0.65,
    band_start: tuple[float, float] = (500.0, 1600.0),
    band_end: tuple[float, float] = (1100.0, 3400.0),
    pan_lr: tuple[float, float] = (-0.45, 0.45),
    swell: bool = False,
    seed: int = 73,
) -> np.ndarray:
    """Warm, silky low-harshness air mist (never hissy white noise)."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    u = np.linspace(0.0, 1.0, n)
    raw = rng.standard_normal(n)
    b1 = biquad_filter(raw, "bandpass", band_start, order=2)
    b2 = biquad_filter(raw, "bandpass", band_end, order=2)
    env = (u ** 1.8) * np.clip((1.0 - u) / 0.10, 0.0, 1.0) if swell else (np.sin(math.pi * u) ** 1.5)
    mono = (b1 * (1.0 - u) + b2 * u) * env
    pan = pan_lr[0] + (pan_lr[1] - pan_lr[0]) * u
    ang = (np.clip(pan, -0.92, 0.92) + 1.0) * (math.pi * 0.25)
    return np.column_stack((mono * np.cos(ang), mono * np.sin(ang)))


def silk_space(
    sig: np.ndarray,
    rt60: float = 0.95,
    wet: float = 0.34,
    bright_hz: float = 4400.0,
    predelay_ms: float = 10.0,
    tail_pad: float = 0.38,
    shimmer: float = 0.0,
    seed: int = 89,
) -> np.ndarray:
    """Silky frosted-glass velvet convolution space: zero metallic FDN ringing,
    warm air absorption, and optional translucent +12st glass air halo.
    """
    rng = np.random.default_rng(seed)
    pad_n = int(round(tail_pad * SR))
    x = np.vstack((sig, np.zeros((pad_n, 2)))) if pad_n > 0 else sig.copy()
    ir_len = max(int(round(min(rt60 * 1.1, 2.4) * SR)), 2048)
    t_ir = np.arange(ir_len, dtype=np.float64) / SR
    env = np.exp(-6.9078 * t_ir / max(rt60, 0.12))

    # Sparse velvet-noise silk tail (2400 pulses/sec, decorrelated L/R)
    grid = max(10, int(round(SR / 2400.0)))
    pre = int(round(predelay_ms * 0.001 * SR))
    ir = np.zeros((ir_len, 2), dtype=np.float64)
    for ch in range(2):
        nc = max(1, (ir_len - pre) // grid)
        idx = pre + np.arange(nc) * grid + rng.integers(0, grid, size=nc)
        idx = idx[idx < ir_len]
        ir[idx, ch] = rng.choice([-1.0, 1.0], size=len(idx)) * env[idx]

    # Soft frosted-glass early bounces (4..28ms)
    for dt, p, g in [(0.0045, -0.52, 0.36), (0.0085, 0.48, 0.30), (0.0145, -0.34, 0.24), (0.0225, 0.56, 0.18)]:
        k = int(round(dt * SR))
        if k < ir_len:
            ang = (p + 1.0) * (math.pi * 0.25)
            ir[k, 0] += g * math.cos(ang)
            ir[k, 1] += g * math.sin(ang)

    ir_lp = biquad_filter(ir, "lowpass", bright_hz, order=2)
    ir_tot = biquad_filter(ir_lp, "highpass", 190.0, order=2)
    # Calibrated energy normalization so wet=0.35 sits cleanly ~10dB under dry transient
    ir_norm = ir_tot / (np.sqrt(np.sum(ir_tot ** 2)) * 2.15 + 1e-12)

    feed = x
    if shimmer > 0.005:
        # Gentle octave-up glass air shimmer (kept very clean and narrowband)
        n = len(x)
        win, hop = 2048, 512
        w = np.hanning(win)[:, None]
        sh = np.zeros_like(x)
        idx2 = (np.arange(win) * 2) % win
        for pos in range(0, n - win, hop):
            sh[pos:pos + win] += x[pos:pos + win][idx2] * w * 0.42
        sh = biquad_filter(sh, "bandpass", (950.0, 5600.0), order=2)
        feed = x + sh * shimmer

    wl = fftconvolve(feed[:, 0] * 0.76 + feed[:, 1] * 0.24, ir_norm[:, 0], mode="full")[:len(x)]
    wr = fftconvolve(feed[:, 1] * 0.76 + feed[:, 0] * 0.24, ir_norm[:, 1], mode="full")[:len(x)]
    # Gentle M/S coherence so velvet tail stays wide yet never phasey in mono
    mid_w = 0.5 * (wl + wr)
    side_w = 0.5 * (wl - wr) * 0.72
    wet_sig = np.column_stack((mid_w + side_w, mid_w - side_w))
    return x * (1.0 - 0.16 * wet) + wet_sig * wet


def soft_finalize(
    sig: np.ndarray,
    target_peak_db: float = -5.8,
    fade_in_ms: float = 2.0,
    fade_out_ms: float = 55.0,
    lp_hz: float = 9600.0,
    deharsh_db: float = -2.4,
) -> np.ndarray:
    """Warm, ear-safe mastering tuned to sit gracefully over AveritA's twilight BGM."""
    y = biquad_filter(sig, "highpass", 36.0, order=2)
    y = biquad_filter(y, "lowpass", lp_hz, order=2)
    if deharsh_db != 0.0:
        y = high_shelf_trim(y, 4400.0, deharsh_db)
    fi = min(int(round(fade_in_ms * 0.001 * SR)), len(y) // 4)
    fo = min(int(round(fade_out_ms * 0.001 * SR)), len(y) // 2)
    if fi > 1:
        y[:fi] *= (0.5 * (1.0 - np.cos(math.pi * np.arange(fi) / fi)))[:, None]
    if fo > 1:
        y[-fo:] *= (0.5 * (1.0 + np.cos(math.pi * np.arange(fo) / fo)))[:, None]
    peak = float(np.max(np.abs(y))) + 1e-12
    y = y * ((10.0 ** (target_peak_db / 20.0)) / peak)
    ceil = 10.0 ** (-1.8 / 20.0)
    return np.tanh(y / ceil) * ceil
