"""Advanced physical, dispersive, granular, and STFT spectral DSP primitives (Batch 2).
Designed for rich, multi-layered, non-cliche, unpitched / quasi-pitched spatial SFX.
"""
from __future__ import annotations
import math
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, stft, istft
from dsp import SR, make_buf, pan_mono, mix_at, biquad_filter, finalize


def soft_sat(sig: np.ndarray, drive: float = 1.6) -> np.ndarray:
    return np.tanh(sig * drive) / math.tanh(drive)


def allpass_dispersion(sig: np.ndarray, stages: int = 28, coeff: float = 0.72) -> np.ndarray:
    """Cascaded 1st-order allpass chain: creates physical acoustic wave dispersion
    (high frequencies travel faster than lows -> crisp glassy/metallic micro-zip, unpitched).
    H(z) = (-a + z^-1) / (1 - a z^-1).
    """
    a = float(np.clip(coeff, -0.96, 0.96))
    # Pair into 2nd-order SOS blocks for vectorized C-speed filtering
    # Two identical 1st-order sections: (-a + z^-1)^2 / (1 - a z^-1)^2
    b2 = np.array([a * a, -2.0 * a, 1.0])
    a2 = np.array([1.0, -2.0 * a, a * a])
    n_pairs = max(1, stages // 2)
    sos = np.tile(np.concatenate([b2, a2]), (n_pairs, 1))
    return sosfilt(sos, sig, axis=0)


def plate_2d_strike(
    base_hz: float = 420.0,
    dur: float = 0.45,
    n_modes: int = 24,
    stiffness: float = 1.0,
    damp_base: float = 0.14,
    damp_hi: float = 1.8,
    mallet_ms: float = 1.4,
    scrape_amt: float = 0.18,
    pan: float = 0.0,
    spread: float = 0.48,
    seed: int = 7,
) -> np.ndarray:
    """2D inharmonic circular/rectangular plate (porcelain, obsidian, quartz) physical model.
    Uses dense Chladni-like inharmonic eigenmodes excited by a Hertzian contact pulse
    + optional micro-friction scrape so it reads as tactile material, not a pitched bell.
    """
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR

    # Hertzian contact exciter: sin(pi*t/tau)^1.5 + brief micro-scrape noise
    m_n = max(6, int(round(mallet_ms * 0.001 * SR)))
    exc = np.zeros(n, dtype=np.float64)
    exc[:m_n] = np.sin(math.pi * np.arange(m_n) / m_n) ** 1.5
    if scrape_amt > 0:
        sn = min(n, m_n * 4)
        sc = biquad_filter(rng.standard_normal(sn), "bandpass", (1800, 9600), order=2)
        exc[:sn] += sc * np.exp(-np.arange(sn) / max(1.0, m_n * 1.1)) * scrape_amt

    # Generate 2D plate eigenmode ratios f_mn ~ ((m + 0.5)^2 + k*(n + 0.5)^2)^stiffness
    ratios = []
    for m in range(1, 8):
        for k in range(1, 7):
            r = ((m * m + 1.37 * k * k) / 2.37) ** (0.5 * stiffness)
            ratios.append(r * rng.uniform(0.96, 1.04))
    ratios = sorted(set(ratios))[:n_modes]

    out = np.zeros((n, 2), dtype=np.float64)
    for idx, r in enumerate(ratios):
        f = base_hz * r
        if f > SR * 0.43 or f < 65.0:
            continue
        # High modes decay much faster (real material internal friction)
        tau = damp_base / (1.0 + (f / 1400.0) ** damp_hi)
        amp = (1.0 / (1.0 + 0.28 * idx)) * rng.uniform(0.55, 1.25)
        # Mode radiation pattern varies across stereo field
        p = float(np.clip(pan + rng.uniform(-spread, spread), -0.95, 0.95))
        ang = (p + 1.0) * (math.pi * 0.25)
        ph = rng.uniform(0.0, 2.0 * math.pi)
        # Resonant mode response (2nd-order impulse response excited by Hertzian contact)
        dt_l = 1.0 + rng.uniform(-0.002, 0.002)
        dt_r = 1.0 + rng.uniform(-0.002, 0.002)
        env = np.exp(-t / max(tau, 0.003))
        # Convolve short exciter impact envelope cleanly with mode decay
        ir_l = np.sin(2.0 * math.pi * f * dt_l * t + ph) * env
        ir_r = np.sin(2.0 * math.pi * f * dt_r * t + ph + 0.35) * env
        out[:, 0] += amp * ir_l * math.cos(ang)
        out[:, 1] += amp * ir_r * math.sin(ang)

    # Blend raw contact transient (surface knock) with plate resonance
    contact = pan_mono(biquad_filter(exc, "bandpass", (500, 11000), order=2), pan)
    # Apply Hertzian attack smoothing to plate body
    atk = np.clip(t / max(mallet_ms * 0.0007, 0.0003), 0.0, 1.0)
    return out * atk[:, None] * 0.36 + contact * 0.92


def early_space(
    sig: np.ndarray,
    room_ms: float = 24.0,
    width: float = 0.85,
    mix: float = 0.34,
    bright_hz: float = 5400.0,
    hp_hz: float = 240.0,
    seed: int = 31,
) -> np.ndarray:
    """Zero-tail binaural early reflections & Haas stereo positioning.
    Creates unmistakable physical 3D room presence WITHOUT any washed-out reverb tail!
    """
    rng = np.random.default_rng(seed)
    pad_n = int(round((room_ms * 1.4 + 12.0) * 0.001 * SR))
    x = np.vstack((sig, np.zeros((pad_n, 2))))
    ir_len = max(pad_n + 64, 512)
    ir = np.zeros((ir_len, 2), dtype=np.float64)
    # 9 asymmetric geometric early bounces (1.4 ms .. room_ms) with air-damped polarity
    rel_times = [0.06, 0.11, 0.18, 0.27, 0.38, 0.51, 0.67, 0.83, 1.0]
    for idx, rt in enumerate(rel_times):
        dt = (1.2 + rt * room_ms) * 0.001
        k_base = int(round(dt * SR))
        # Subtle binaural ITD between L and R (0.18 .. 0.65 ms)
        itd = int(round(rng.uniform(0.15, 0.62) * 0.001 * SR))
        side = -1 if idx % 2 == 0 else 1
        kl = min(ir_len - 1, max(1, k_base + (0 if side < 0 else itd)))
        kr = min(ir_len - 1, max(1, k_base + (itd if side < 0 else 0)))
        amp = (0.68 ** (idx * 0.55)) * rng.choice([-1.0, 1.0])
        g_main = 0.5 + 0.42 * width
        g_opp = 0.5 - 0.35 * width
        ir[kl, 0] += amp * (g_main if side < 0 else g_opp)
        ir[kr, 1] += amp * (g_opp if side < 0 else g_main)

    ir = biquad_filter(biquad_filter(ir, "lowpass", bright_hz, order=2), "highpass", hp_hz, order=2)
    ir /= (np.sqrt(np.sum(ir ** 2)) + 1e-9)
    el = fftconvolve(x[:, 0] * 0.78 + x[:, 1] * 0.22, ir[:, 0], mode="full")[:len(x)]
    er = fftconvolve(x[:, 1] * 0.78 + x[:, 0] * 0.22, ir[:, 1], mode="full")[:len(x)]
    return x + np.column_stack((el, er)) * mix


def friction_slide(
    dur: float = 0.22,
    band: tuple[float, float] = (1400.0, 6200.0),
    rough_hz: float = 48.0,
    pan_lr: tuple[float, float] = (-0.35, 0.35),
    curve: str = "bell",
    seed: int = 71,
) -> np.ndarray:
    """Stick-slip surface micro-friction (frosted glass, matte stone, precision lens ring).
    Zero tonal ring — pure realistic tactile surface roughness moving across stereo.
    """
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    u = np.linspace(0.0, 1.0, n)
    raw = rng.standard_normal(n)
    # Stick-slip micro-roughness AM envelope (filtered noise + subtle irregular grain)
    mod_raw = biquad_filter(rng.standard_normal(n), "lowpass", rough_hz, order=2)
    mod = 0.45 + 0.55 * np.clip(np.abs(mod_raw) * 2.6, 0.0, 1.0)
    tex = biquad_filter(raw * mod, "bandpass", band, order=2)
    # Add whisper-quiet ultra-fine upper grit for physical closeness
    grit = biquad_filter(raw, "bandpass", (min(band[1] * 0.85, 8500.0), min(band[1] * 1.45, 13000.0)), order=2)
    mono = tex + grit * 0.22
    if curve == "decay":
        env = np.clip(u / 0.08, 0.0, 1.0) * np.exp(-u * 4.2)
    elif curve == "swell":
        env = (u ** 1.6) * np.clip((1.0 - u) / 0.12, 0.0, 1.0)
    else:
        env = np.sin(math.pi * u) ** 1.25
    mono *= env
    pan = pan_lr[0] + (pan_lr[1] - pan_lr[0]) * u
    ang = (np.clip(pan, -1.0, 1.0) + 1.0) * (math.pi * 0.25)
    return np.column_stack((mono * np.cos(ang), mono * np.sin(ang)))


def pressure_breath(
    dur: float = 0.85,
    f_move: tuple[float, float] = (180.0, 980.0),
    reverse: bool = False,
    width: float = 0.85,
    sub_boost: float = 0.55,
    seed: int = 91,
) -> np.ndarray:
    """Unpitched acoustic air-pressure & aperture breath (spatial depth without reverb wash)."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    # Decorrelated stereo brown-pink airflow
    l_raw = biquad_filter(rng.standard_normal(n), "lowpass", 2800.0, order=1)
    r_raw = biquad_filter(rng.standard_normal(n), "lowpass", 2800.0, order=1)
    mid = 0.5 * (l_raw + r_raw)
    side = 0.5 * (l_raw - r_raw) * width
    # Time-varying warm aperture sweep via overlap-add
    hop, win = 512, 2048
    w = np.hanning(win)
    out = np.zeros((n, 2), dtype=np.float64)
    norm = np.zeros(n, dtype=np.float64)
    st_in = np.column_stack((mid + side, mid - side))
    for pos in range(0, n, hop):
        u = min(1.0, pos / max(n - 1, 1))
        m = min(win, n - pos)
        seg = np.zeros((win, 2), dtype=np.float64)
        seg[:m] = st_in[pos:pos + m]
        fc = f_move[0] * ((f_move[1] / max(f_move[0], 45.0)) ** u)
        bp = biquad_filter(seg, "bandpass", (max(48.0, fc * 0.45), min(SR * 0.43, fc * 2.1)), order=2)
        sub = biquad_filter(seg, "bandpass", (42.0, 140.0), order=2) * sub_boost
        out[pos:pos + m] += (bp[:m] + sub[:m]) * w[:m, None]
        norm[pos:pos + m] += w[:m]
    out /= (norm[:, None] + 1e-6)
    u = np.linspace(0.0, 1.0, n)
    if reverse:
        env = (u ** 2.1) * np.clip((1.0 - u) / 0.045, 0.0, 1.0)
    else:
        env = (np.sin(math.pi * u) ** 1.35) * (0.45 + 0.55 * (1.0 - u))
    return out * env[:, None]


def stft_spectral_blur(
    sig: np.ndarray,
    decay_lo: float = 0.86,
    decay_hi: float = 0.94,
    phase_diffuse: float = 0.85,
    tilt_db: float = 1.5,
    pad_sec: float = 0.75,
    seed: int = 19,
) -> np.ndarray:
    """STFT Phase-Diffused Spectral Blur & Vaporizer.
    Turns any sharp micro-transient into an airy, unpitched, shimmering vapor cloud
    by applying per-bin exponential smoothing + progressive random phase diffusion.
    """
    rng = np.random.default_rng(seed)
    pad_n = int(round(pad_sec * SR))
    x = np.vstack((sig, np.zeros((pad_n, 2)))) if pad_n > 0 else sig.copy()
    nperseg, noverlap = 1024, 768
    out = np.zeros_like(x)
    for ch in range(2):
        freqs, _, Z = stft(x[:, ch], fs=SR, nperseg=nperseg, noverlap=noverlap, window="hann")
        mag = np.abs(Z)
        ph = np.angle(Z)
        # Frequency-dependent per-frame retention (higher bins linger airier or vice versa)
        u_f = np.clip((freqs - 250.0) / 8000.0, 0.0, 1.0)
        dec = decay_lo + (decay_hi - decay_lo) * u_f
        tilt = 10.0 ** ((tilt_db * (u_f - 0.35)) / 20.0)

        sm_mag = np.zeros_like(mag)
        sm_mag[:, 0] = mag[:, 0]
        for k in range(1, mag.shape[1]):
            sm_mag[:, k] = np.maximum(mag[:, k], sm_mag[:, k - 1] * dec)
        sm_mag *= tilt[:, None]

        # Progressive random phase diffusion above 600 Hz -> lush unpitched frost mist
        diff_mask = np.clip((freqs - 500.0) / 2200.0, 0.0, 1.0)[:, None] * phase_diffuse
        rand_ph = rng.uniform(-math.pi, math.pi, size=ph.shape)
        new_ph = ph * (1.0 - diff_mask) + rand_ph * diff_mask
        Z_new = sm_mag * np.exp(1j * new_ph)
        _, rec = istft(Z_new, fs=SR, nperseg=nperseg, noverlap=noverlap, window="hann")
        m = min(len(out), len(rec))
        out[:m, ch] = rec[:m]
    return biquad_filter(out, "highpass", 180.0, order=2)


def velvet_reverb(
    sig: np.ndarray,
    rt60: float = 1.4,
    wet: float = 0.42,
    density: float = 2200.0,
    bright_hz: float = 6200.0,
    hp_hz: float = 220.0,
    predelay_ms: float = 12.0,
    er_mix: float = 0.45,
    tail_pad: float = 0.0,
    seed: int = 23,
) -> np.ndarray:
    """Velvet-noise sparse impulse convolution reverb + binaural early reflections.
    Far silkier, cleaner, and less metallic than classic delay-line FDN reverb!
    """
    rng = np.random.default_rng(seed)
    pad_n = int(round(tail_pad * SR))
    x = np.vstack((sig, np.zeros((pad_n, 2)))) if pad_n > 0 else sig.copy()
    ir_len = max(int(round(min(rt60 * 1.15, 2.8) * SR)), 2048)
    t_ir = np.arange(ir_len, dtype=np.float64) / SR
    env = np.exp(-6.9078 * t_ir / max(rt60, 0.12))

    # Build sparse velvet noise IR for L and R independently (wide decorrelated silk)
    grid = max(8, int(round(SR / density)))
    ir = np.zeros((ir_len, 2), dtype=np.float64)
    pre = int(round(predelay_ms * 0.001 * SR))
    for ch in range(2):
        n_cells = max(1, (ir_len - pre) // grid)
        offsets = rng.integers(0, grid, size=n_cells)
        idx = pre + np.arange(n_cells) * grid + offsets
        idx = idx[idx < ir_len]
        signs = rng.choice([-1.0, 1.0], size=len(idx))
        ir[idx, ch] = signs * env[idx]

    # Add crisp early reflections (asymmetric stereo taps 2ms..36ms)
    er_taps = [
        (0.0032, -0.65, 0.55), (0.0058, 0.58, 0.48), (0.0094, -0.40, 0.40),
        (0.0142, 0.72, 0.34), (0.0205, -0.52, 0.26), (0.0288, 0.44, 0.20),
    ]
    for dt, p, g in er_taps:
        k = int(round(dt * SR))
        if k < ir_len:
            ang = (p + 1.0) * (math.pi * 0.25)
            ir[k, 0] += g * er_mix * math.cos(ang)
            ir[k, 1] += g * er_mix * math.sin(ang)

    # Air absorption damping across time via split-band filtering
    ir_lp = biquad_filter(ir, "lowpass", bright_hz, order=2)
    ir_hp = biquad_filter(ir, "highpass", bright_hz * 0.85, order=2) * np.exp(-t_ir / max(rt60 * 0.28, 0.05))[:, None]
    ir_tot = biquad_filter(ir_lp + ir_hp * 0.65, "highpass", hp_hz, order=2)
    ir_norm = ir_tot / (np.sqrt(np.mean(ir_tot ** 2)) * 22.0 + 1e-12)

    # True stereo convolution with subtle cross-bleed for natural spatial coherence
    wl = fftconvolve(x[:, 0] * 0.82 + x[:, 1] * 0.18, ir_norm[:, 0], mode="full")[:len(x)]
    wr = fftconvolve(x[:, 1] * 0.82 + x[:, 0] * 0.18, ir_norm[:, 1], mode="full")[:len(x)]
    wet_sig = np.column_stack((wl, wr))
    return x * (1.0 - 0.32 * wet) + wet_sig * wet


def micro_debris(
    dur: float = 0.6,
    count: int = 24,
    band: tuple[float, float] = (2800.0, 10500.0),
    grain_ms: tuple[float, float] = (1.2, 5.5),
    spread: float = 0.75,
    curve: str = "decay",
    seed: int = 41,
) -> np.ndarray:
    """Stochastic Poisson micro-crystal / frost / quartz sparkle stream (zero pitch)."""
    rng = np.random.default_rng(seed)
    buf = make_buf(dur)
    for _ in range(count):
        u = rng.random()
        if curve == "decay":
            t0 = (u ** 1.7) * max(dur - 0.02, 0.01)
            g = (1.0 - t0 / max(dur, 0.01)) ** 0.7
        elif curve == "swell":
            t0 = (1.0 - u ** 1.7) * max(dur - 0.02, 0.01)
            g = (t0 / max(dur, 0.01)) ** 0.8
        else:
            t0 = u * max(dur - 0.02, 0.01)
            g = math.sin(math.pi * t0 / max(dur, 0.01)) ** 0.8
        gms = rng.uniform(grain_ms[0], grain_ms[1])
        gn = max(12, int(round(gms * 0.001 * SR)))
        raw = rng.standard_normal(gn)
        f_lo = rng.uniform(band[0], (band[0] + band[1]) * 0.45)
        f_hi = min(SR * 0.44, f_lo * rng.uniform(1.35, 2.2))
        gr = biquad_filter(raw, "bandpass", (f_lo, f_hi), order=2)
        env = np.hanning(gn) * np.exp(-np.arange(gn) / max(gn * 0.32, 1.0))
        pan = rng.uniform(-spread, spread)
        mix_at(buf, pan_mono(gr * env, pan), t0, g * rng.uniform(0.4, 1.0))
    return buf


def formant_air_sweep(
    dur: float = 0.5,
    f1: tuple[float, float] = (650.0, 2200.0),
    f2: tuple[float, float] = (1900.0, 5200.0),
    bw_ratio: float = 0.24,
    pan_lr: tuple[float, float] = (-0.45, 0.45),
    env_pow: float = 1.4,
    seed: int = 53,
) -> np.ndarray:
    """Time-varying dual-formant air-gap / brushed-glass sweep (smooth overlap-add frames)."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    raw = rng.standard_normal(n)
    hop = 512
    win = 2048
    w = np.hanning(win)
    out = np.zeros((n, 2), dtype=np.float64)
    norm = np.zeros(n, dtype=np.float64)
    for pos in range(0, n, hop):
        u = min(1.0, pos / max(n - 1, 1))
        seg = np.zeros(win, dtype=np.float64)
        m = min(win, n - pos)
        seg[:m] = raw[pos:pos + m]
        # Log-interpolated dual formant centers
        c1 = f1[0] * ((f1[1] / max(f1[0], 40.0)) ** u)
        c2 = f2[0] * ((f2[1] / max(f2[0], 40.0)) ** u)
        s1 = biquad_filter(seg, "bandpass", (max(70, c1 * (1 - bw_ratio)), min(SR * 0.44, c1 * (1 + bw_ratio))), order=2)
        s2 = biquad_filter(seg, "bandpass", (max(90, c2 * (1 - bw_ratio)), min(SR * 0.44, c2 * (1 + bw_ratio))), order=2)
        frame = (s1 + 0.62 * s2) * w
        pan = pan_lr[0] + (pan_lr[1] - pan_lr[0]) * u
        ang = (np.clip(pan, -1.0, 1.0) + 1.0) * (math.pi * 0.25)
        out[pos:pos + m, 0] += frame[:m] * math.cos(ang)
        out[pos:pos + m, 1] += frame[:m] * math.sin(ang)
        norm[pos:pos + m] += w[:m]
    out /= (norm[:, None] + 1e-6)
    t_u = np.linspace(0.0, 1.0, n)
    env = np.sin(math.pi * t_u) ** env_pow
    return out * env[:, None]


def ks_damped_wire(
    freq: float = 380.0,
    dur: float = 0.28,
    damp: float = 0.965,
    bright: float = 0.55,
    pan: float = 0.0,
    seed: int = 67,
) -> np.ndarray:
    """Heavily-damped Karplus-Strong micro-wire / foil pluck (tactile acoustic texture)."""
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    d = max(12, int(round(SR / max(freq, 60.0))))
    buf = np.zeros(n + d, dtype=np.float64)
    # Comb-filtered noise burst excitation
    exc = biquad_filter(rng.standard_normal(d), "highpass", 280.0, order=2)
    buf[:d] = exc * np.hanning(d)
    # Vectorizable block feedback with lowpass averaging
    b0 = 0.5 + 0.45 * bright
    b1 = 1.0 - b0
    pos = d
    while pos < n + d:
        m = min(d - 1, n + d - pos)
        prev = buf[pos - d:pos - d + m]
        prev1 = buf[pos - d + 1:pos - d + 1 + m]
        buf[pos:pos + m] = damp * (b0 * prev + b1 * prev1)
        pos += m
    return pan_mono(buf[d:d + n], pan)


def shutter_click(
    sub_hz: float = 165.0,
    snap_band: tuple[float, float] = (2600.0, 8800.0),
    pre_ms: float = 0.0,
    body_ms: float = 14.0,
    pan: float = 0.0,
    seed: int = 83,
) -> np.ndarray:
    """3-stage precision tactile micro-mechanism: optional pre-latch + nonlinear snap + tiny body."""
    rng = np.random.default_rng(seed)
    dur = max(0.075, pre_ms * 0.001 + body_ms * 0.004 + 0.04)
    buf = make_buf(dur)
    t_main = pre_ms * 0.001

    if pre_ms > 0.5:
        pn = max(24, int(0.004 * SR))
        p_raw = biquad_filter(rng.standard_normal(pn), "bandpass", (3600, 10200), order=2)
        p_env = np.exp(-np.arange(pn) / (0.0009 * SR))
        mix_at(buf, pan_mono(p_raw * p_env, pan * 0.6), 0.0, 0.28)

    # Main crisp surface contact (non-pitched, high-definition transient)
    sn = int(0.018 * SR)
    s_raw = biquad_filter(rng.standard_normal(sn), "bandpass", snap_band, order=2)
    s_env = np.clip(np.arange(sn) / 14.0, 0.0, 1.0) * np.exp(-np.arange(sn) / (0.0022 * SR))
    snap = soft_sat(s_raw * s_env * 2.2, drive=1.9)
    mix_at(buf, pan_mono(snap, pan), t_main, 0.92)

    # Tight tactile sub-body (fast pitch-dropped membrane thump, no audible musical note)
    bn = int(round(max(0.03, body_ms * 0.003) * SR))
    tb = np.arange(bn) / SR
    f_drop = sub_hz * (0.42 + 1.8 * np.exp(-tb / 0.0022))
    body = np.sin(2.0 * math.pi * np.cumsum(f_drop) / SR) * np.exp(-tb / (body_ms * 0.00055))
    mix_at(buf, pan_mono(soft_sat(body, 1.4), pan * 0.5), t_main, 0.62)
    return buf
