"""Studio-grade 48 kHz stereo DSP primitives for AveritA SFX proposals.
Harmonic center locked to site BGM: F Natural Minor / Ab Major (F, G, Ab, Bb, C, Db, Eb).
"""
from __future__ import annotations
import math
import numpy as np
from scipy.signal import butter, sosfilt, lfilter, lfilter_zi

SR = 48000

# F natural minor / Ab major reference frequencies (Hz)
NOTE = {
    "F3": 174.614, "G3": 195.998, "Ab3": 207.652, "Bb3": 233.082, "C4": 261.626,
    "Db4": 277.183, "Eb4": 311.127, "F4": 349.228, "G4": 391.995, "Ab4": 415.305,
    "Bb4": 466.164, "C5": 523.251, "Db5": 554.365, "Eb5": 622.254, "F5": 698.456,
    "G5": 783.991, "Ab5": 830.609, "Bb5": 932.328, "C6": 1046.502, "Db6": 1108.731,
    "Eb6": 1244.508, "F6": 1396.913, "G6": 1567.982, "Ab6": 1661.219,
    "Bb6": 1864.655, "C7": 2093.005,
}


def hadamard8() -> np.ndarray:
    h = np.array([[1.0]])
    for _ in range(3):
        h = np.block([[h, h], [h, -h]])
    return h / math.sqrt(8.0)


H8 = hadamard8()


def make_buf(dur: float) -> np.ndarray:
    return np.zeros((int(round(dur * SR)), 2), dtype=np.float64)


def pan_mono(sig: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Equal-power stereo pan: pan in [-1.0, 1.0]."""
    ang = (np.clip(pan, -1.0, 1.0) + 1.0) * (math.pi * 0.25)
    return np.column_stack((sig * math.cos(ang), sig * math.sin(ang)))


def mix_at(dst: np.ndarray, src: np.ndarray, t0: float, gain: float = 1.0) -> None:
    i0 = max(0, int(round(t0 * SR)))
    if i0 >= len(dst):
        return
    n = min(len(src), len(dst) - i0)
    if n > 0:
        dst[i0:i0 + n] += src[:n] * gain


def biquad_filter(sig: np.ndarray, kind: str, cutoff, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, sig, axis=0)


def high_shelf_trim(sig: np.ndarray, fc: float = 4200.0, db: float = -3.0) -> np.ndarray:
    """Gentle de-harshing high shelf matching site voice aesthetic."""
    g = 10.0 ** (db / 20.0)
    lp = biquad_filter(sig, "lowpass", fc, order=2)
    hp = sig - lp
    return lp + hp * g


def env_ad(n: int, atk: float, dec: float, curve: float = 1.0) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / SR
    a = np.clip(t / max(atk, 1e-4), 0.0, 1.0) ** 0.7
    d = np.exp(-np.maximum(0.0, t - atk) / max(dec, 1e-4)) ** curve
    return a * d


def modal_strike(
    freq: float,
    dur: float,
    ratios: list[tuple[float, float, float]],
    atk: float = 0.002,
    detune_cents: float = 2.5,
    pan: float = 0.0,
    spread: float = 0.28,
    drift_hz: float = 0.0,
) -> np.ndarray:
    """Physical modal bank with micro-stereo detune & per-partial decay.
    ratios: list of (freq_ratio, amp, decay_sec).
    """
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros((n, 2), dtype=np.float64)
    a_env = np.clip(t / max(atk, 1e-4), 0.0, 1.0)
    for idx, (r, amp, dec) in enumerate(ratios):
        f = freq * r
        if f >= SR * 0.44:
            continue
        dt_ratio = 2.0 ** ((detune_cents * (0.5 + 0.2 * idx)) / 1200.0)
        vib = 0.0 if drift_hz <= 0 else (0.0018 * np.sin(2.0 * math.pi * drift_hz * t + idx))
        ph_l = 2.0 * math.pi * f * (1.0 / math.sqrt(dt_ratio)) * (t + vib) + 0.37 * idx
        ph_r = 2.0 * math.pi * f * math.sqrt(dt_ratio) * (t - vib) + 1.13 * idx
        env = a_env * np.exp(-t / max(dec, 1e-3))
        p_pan = np.clip(pan + ((-1) ** idx) * spread * (0.3 + 0.15 * idx), -0.92, 0.92)
        ang = (p_pan + 1.0) * (math.pi * 0.25)
        out[:, 0] += amp * env * np.sin(ph_l) * math.cos(ang)
        out[:, 1] += amp * env * np.sin(ph_r) * math.sin(ang)
    return out


def air_transient(
    dur: float = 0.03,
    band: tuple[float, float] = (2400.0, 7800.0),
    decay: float = 0.006,
    pan: float = 0.0,
    seed: int = 11,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    noise = rng.standard_normal(n)
    filt = biquad_filter(noise, "bandpass", band, order=2)
    env = np.clip(t / 0.0008, 0.0, 1.0) * np.exp(-t / max(decay, 1e-4))
    return pan_mono(filt * env, pan)


def water_drop(
    f0: float,
    f1: float,
    dur: float = 0.085,
    decay: float = 0.022,
    pan: float = 0.0,
    cavity_hz: float | None = None,
) -> np.ndarray:
    """Minnaert bubble rising-pitch droplet + optional hollow stone/ceramic cavity."""
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    tau = max(dur * 0.42, 0.008)
    # Instantaneous frequency rises exponentially from f0 to f1
    f_t = f0 + (f1 - f0) * (1.0 - np.exp(-t / tau))
    phase = 2.0 * math.pi * np.cumsum(f_t) / SR
    env = np.clip(t / 0.0018, 0.0, 1.0) * np.exp(-t / max(decay, 1e-3))
    mono = np.sin(phase) * env + 0.14 * np.sin(2.0 * phase) * (env ** 1.6)
    out = pan_mono(mono, pan)
    if cavity_hz:
        cav = modal_strike(
            cavity_hz, max(dur * 3.5, 0.35),
            [(1.0, 0.32, 0.16), (1.498, 0.14, 0.11), (2.21, 0.06, 0.06)],
            atk=0.004, detune_cents=4.0, pan=pan * 0.6, spread=0.35,
        )
        res = make_buf(max(dur, len(cav) / SR))
        mix_at(res, out, 0.0, 1.0)
        mix_at(res, cav, 0.003, 0.85)
        return res
    return out


def micro_pulse(
    f_start: float,
    f_end: float,
    dur: float = 0.028,
    decay: float = 0.0055,
    pan: float = 0.0,
    metal_hz: float | None = None,
) -> np.ndarray:
    """Ultra-crisp precision tactile impulse + optional hairspring overtone."""
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f_t = f_end + (f_start - f_end) * np.exp(-t / 0.0016)
    ph = 2.0 * math.pi * np.cumsum(f_t) / SR
    env = np.clip(t / 0.0004, 0.0, 1.0) * np.exp(-t / max(decay, 1e-4))
    mono = np.sin(ph) * env
    out = pan_mono(mono, pan)
    if metal_hz:
        ring = modal_strike(
            metal_hz, max(dur, 0.16),
            [(1.0, 0.18, 0.045), (2.41, 0.08, 0.024)],
            atk=0.0006, detune_cents=1.8, pan=pan, spread=0.22,
        )
        buf = make_buf(max(dur, len(ring) / SR))
        mix_at(buf, out, 0.0, 1.0)
        mix_at(buf, ring, 0.0, 0.9)
        return buf
    return out


def octave_shimmer_feed(sig: np.ndarray) -> np.ndarray:
    """Clean +12st octave-up windowed pitch feed for airy shimmer tails."""
    n = len(sig)
    win = 2048
    hop = 512
    out = np.zeros_like(sig)
    w = np.hanning(win)[:, None]
    for pos in range(0, n - win, hop):
        chunk = sig[pos:pos + win]
        # 2x speed read wrapped cleanly across chunk under Hann window
        idx = (np.arange(win) * 2) % win
        up = chunk[idx] * w
        out[pos:pos + win] += up * 0.45
    return biquad_filter(out, "bandpass", (900.0, 7200.0), order=2)


def fdn_reverb(
    sig: np.ndarray,
    rt60: float = 1.6,
    wet: float = 0.42,
    damp_hz: float = 5200.0,
    hp_hz: float = 200.0,
    shimmer: float = 0.0,
    predelay_ms: float = 14.0,
    tail_pad: float = 0.0,
) -> np.ndarray:
    """Sample-exact 8-channel block Hadamard FDN stereo reverb + early reflections."""
    pad_n = int(round(tail_pad * SR))
    x = np.vstack((sig, np.zeros((pad_n, 2)))) if pad_n > 0 else sig.copy()
    n = len(x)
    # Early reflections (6 crisp stereo taps)
    er = np.zeros_like(x)
    taps = [(0.009, -0.55, 0.24), (0.014, 0.48, 0.21), (0.021, -0.35, 0.17),
            (0.029, 0.62, 0.14), (0.038, -0.68, 0.11), (0.049, 0.30, 0.09)]
    for dt, p, g in taps:
        d = int(round(dt * SR))
        if d < n:
            m = 0.5 * (x[:n - d, 0] + x[:n - d, 1])
            er[d:] += pan_mono(m, p) * g
    er = biquad_filter(er, "lowpass", min(damp_hz * 1.35, 9500.0), order=1)

    # 8 mutually-prime delay lengths (15.3 ms to 62.7 ms), block size <= min delay
    delays = np.array([733, 997, 1289, 1559, 1871, 2207, 2593, 3011], dtype=int)
    blk = 512
    pre = int(round(predelay_ms * 0.001 * SR))
    feed = np.zeros_like(x)
    if pre < n:
        feed[pre:] = x[:n - pre]
    if shimmer > 0.0:
        feed = feed + octave_shimmer_feed(feed) * shimmer

    # Per-line feedback gain matching target RT60 & 1-pole air-absorption damping
    fb_g = np.power(10.0, -3.0 * (delays / SR) / max(rt60, 0.15))
    alpha = math.exp(-2.0 * math.pi * damp_hz / SR)
    b_lp = np.array([1.0 - alpha])
    a_lp = np.array([1.0, -alpha])
    zi = np.zeros((8, 1), dtype=np.float64)

    max_d = int(delays.max())
    ring = np.zeros((8, n + max_d + blk), dtype=np.float64)
    wet_out = np.zeros((n, 2), dtype=np.float64)
    in_w = np.array([[1, -1, 1, -1, 1, -1, 1, -1],
                     [1, 1, -1, -1, 1, 1, -1, -1]], dtype=np.float64) * 0.35
    out_l = np.array([1, 0, 1, 0, -1, 0, -1, 0], dtype=np.float64) * 0.5
    out_r = np.array([0, 1, 0, -1, 0, 1, 0, -1], dtype=np.float64) * 0.5

    for pos in range(0, n, blk):
        m = min(blk, n - pos)
        wpos = pos + max_d
        rd = np.empty((8, m), dtype=np.float64)
        for ch in range(8):
            s0 = wpos - delays[ch]
            rd[ch] = ring[ch, s0:s0 + m]
        # Damping filter per line with continuous state
        filt = np.empty_like(rd)
        for ch in range(8):
            filt[ch], zi[ch] = lfilter(b_lp, a_lp, rd[ch], zi=zi[ch])
        mixed = H8 @ (filt * fb_g[:, None])
        injected = in_w[0][:, None] * feed[pos:pos + m, 0] + in_w[1][:, None] * feed[pos:pos + m, 1]
        ring[:, wpos:wpos + m] = injected + mixed
        wet_out[pos:pos + m, 0] = out_l @ rd
        wet_out[pos:pos + m, 1] = out_r @ rd

    wet_tot = biquad_filter(wet_out * 0.78 + er * 0.38, "highpass", hp_hz, order=2)
    return x * (1.0 - 0.35 * wet) + wet_tot * wet


def finalize(
    sig: np.ndarray,
    target_peak_db: float = -4.0,
    fade_in_ms: float = 2.0,
    fade_out_ms: float = 32.0,
    hp_hz: float = 42.0,
    deharsh_db: float = -2.2,
) -> np.ndarray:
    """Clean DC/sub-bass, gently de-harsh, peak-normalize with soft limiter & fades."""
    y = biquad_filter(sig, "highpass", hp_hz, order=2)
    if deharsh_db != 0.0:
        y = high_shelf_trim(y, 4400.0, deharsh_db)
    fi = min(int(round(fade_in_ms * 0.001 * SR)), len(y) // 4)
    fo = min(int(round(fade_out_ms * 0.001 * SR)), len(y) // 2)
    if fi > 1:
        y[:fi] *= np.linspace(0.0, 1.0, fi)[:, None]
    if fo > 1:
        y[-fo:] *= np.linspace(1.0, 0.0, fo)[:, None]
    peak = float(np.max(np.abs(y))) + 1e-12
    target_lin = 10.0 ** (target_peak_db / 20.0)
    y = y * (target_lin / peak)
    # Soft-knee ceiling at -1.5 dBFS
    ceil = 10.0 ** (-1.5 / 20.0)
    return np.tanh(y / ceil) * ceil


def analyze(sig: np.ndarray) -> dict:
    peak = float(np.max(np.abs(sig))) + 1e-12
    rms = float(np.sqrt(np.mean(sig ** 2))) + 1e-12
    l, r = sig[:, 0], sig[:, 1]
    denom = float(np.sqrt(np.sum(l * l) * np.sum(r * r))) + 1e-12
    corr = float(np.sum(l * r) / denom)
    mono = 0.5 * (l + r)
    spec = np.abs(np.fft.rfft(mono))
    freqs = np.fft.rfftfreq(len(mono), 1.0 / SR)
    dom_hz = float(freqs[int(np.argmax(spec))])
    return {
        "dur_s": round(len(sig) / SR, 3),
        "peak_db": round(20.0 * math.log10(peak), 2),
        "rms_db": round(20.0 * math.log10(rms), 2),
        "lr_corr": round(corr, 2),
        "dom_hz": round(dom_hz, 1),
    }
