# ORZARYN demo — procedural music bed (numpy).
# 124 BPM so the beat grid is exact and scene cuts can land ON beats.
# Minimal electronic bed: kick / hats / sub bass / soft pad. CC0-equivalent
# (generated here, no third-party rights).
import numpy as np
import wave

SR = 44100
BPM = 124.0
BEAT = 60.0 / BPM            # 0.48387s
BAR = 4 * BEAT               # 1.93548s
BARS = 54                    # 54 bars ≈ 1:45 (edit length)
N = int(BARS * BAR * SR)
t_all = np.arange(N) / SR

mix = np.zeros(N)

def add(sig, at_s):
    i = int(at_s * SR)
    j = min(N, i + len(sig))
    if i < N:
        mix[i:j] += sig[: j - i]

def kick(amp=0.9):
    d = int(0.28 * SR)
    t = np.arange(d) / SR
    f = 120 * np.exp(-t * 22) + 44
    env = np.exp(-t * 13)
    return amp * env * np.sin(2 * np.pi * np.cumsum(f) / SR)

def hat(amp=0.16, open_=False):
    d = int((0.24 if open_ else 0.06) * SR)
    t = np.arange(d) / SR
    noise = np.random.default_rng(7).standard_normal(d)
    hp = np.diff(noise, prepend=0)  # crude high-pass
    return amp * hp * np.exp(-t * (18 if open_ else 60))

def bass(freq, dur, amp=0.30):
    d = int(dur * SR)
    t = np.arange(d) / SR
    env = np.minimum(1, t * 60) * np.exp(-t * 2.2)
    sig = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t)
    return amp * env * sig

def pad(freqs, dur, amp=0.05):
    d = int(dur * SR)
    t = np.arange(d) / SR
    sig = np.zeros(d)
    for i, f in enumerate(freqs):
        det = 1 + 0.0015 * (i % 3)
        sig += np.sin(2 * np.pi * f * det * t + i)
        sig += 0.4 * np.sin(2 * np.pi * f * 2.002 * t + i * 2)
    env = np.minimum(1, t * 0.8) * np.minimum(1, (dur - t) * 0.8)
    return amp * env * sig / len(freqs)

A1, C2, E2, G2, F2 = 55.0, 65.41, 82.41, 98.0, 87.31
A3, C4, E4 = 220.0, 261.63, 329.63
progression = [A1, F2, C2, G2]  # per-bar roots

for bar in range(BARS):
    bt0 = bar * BAR
    root = progression[bar % 4]
    section = "intro" if bar < 4 else "out" if bar >= BARS - 6 else "break" if 33 <= bar < 37 else "main"

    for b in range(4):
        tb = bt0 + b * BEAT
        if section != "intro" or b == 0:
            add(kick(0.85 if section != "break" else 0.5), tb)
        add(hat(0.13 if section == "main" else 0.07), tb + BEAT / 2)
        if b == 2 and section == "main":
            add(hat(0.18, open_=True), tb + BEAT / 2)
        if section in ("main", "break") and b % 2 == 0:
            add(bass(root, BEAT * 1.8, 0.26 if section == "main" else 0.18), tb)
    if section == "intro":
        add(pad([A3, C4, E4], BAR, 0.045), bt0)
    elif section == "main":
        add(pad([root * 4, root * 4 * 1.189, root * 6], BAR, 0.035), bt0)
    elif section == "break":
        add(pad([root * 4, root * 4.5], BAR, 0.055), bt0)
    elif section == "out":
        add(pad([A3 * 2, C4 * 2, E4 * 2], BAR, 0.03), bt0)

# gentle limiter + fade out
mix = np.tanh(mix * 1.25) * 0.85
fade = int(2.5 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
fade_in = int(0.8 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)

pcm = (mix * 32767).astype(np.int16)
with wave.open("scripts/video/music.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"music.wav: {N/SR:.1f}s, {BPM} BPM, bar={BAR:.4f}s")
