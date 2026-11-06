# ORZARYN demo — final assembly (pillow cards + ffmpeg beat-matched edit).
# Every scene cut lands on a bar boundary of the 124 BPM bed (beat matching);
# narration starts 0.35s into each scene; music ducks under voice.
import os
import re
import subprocess
from PIL import Image, ImageDraw, ImageFont

BAR = 60 / 124 * 4          # 1.93548s
SRC = "scripts/video/cfr.mp4"
OUT = "orzaryn-demo.mp4"
W, H = 1600, 900
ACCENT = (52, 211, 153)     # the app's emerald

# (name, src_start, src_end, bars, narr_file, lower-third or None)
SCENES = [
    ("landing",   0.4,  12.9, 6, "s01_landing",   None),
    ("auth",     13.0,  22.1, 4, "s02_auth",      "Signed, expiring credentials — no shared keys"),
    ("dashboard",22.3,  35.4, 6, "s03_dashboard", "Live system health — Alchemy RPC · solana-devnet"),
    ("mandates", 35.6,  47.2, 6, "s04_mandates",  "Mandates — enforced spending limits"),
    ("agents",   47.4,  58.6, 5, "s05_agents",    "Agents — scoped API credentials"),
    ("workorders",58.8, 67.6, 5, "s06_workorders","Work orders — proposal → approval → escrow → evidence → settlement"),
    ("settlements",67.8, 77.7, 4, "s07_settle",   "Settlements — release-on-acceptance receipts"),
    ("treasury", 77.9,  88.8, 5, "s08_treasury",  "Treasury — double-entry escrow accounting"),
    ("reports",  89.0,  97.9, 4, "s09_reports",   "Reports — every entry traceable to its source"),
    ("close",    98.0, 106.9, 3, "s10_close",    None),
]
INTRO_BARS, OUTRO_BARS = 2, 4

def font(size, bold=False):
    for path in [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

def title_card(path, title, sub, lines):
    im = Image.new("RGB", (W, H), (10, 12, 14))
    d = ImageDraw.Draw(im)
    # subtle grid like the product's landing
    for x in range(0, W, 56):
        d.line([(x, 0), (x, H)], fill=(16, 20, 23))
    for y in range(0, H, 56):
        d.line([(0, y), (W, y)], fill=(16, 20, 23))
    f1, f2, f3 = font(96, True), font(40), font(30)
    w = d.textlength(title, font=f1)
    d.text(((W - w) / 2, 300), title, font=f1, fill=(240, 245, 247))
    d.text(((W - d.textlength(sub, font=f2)) / 2, 430), sub, font=f2, fill=ACCENT)
    y = 520
    for ln in lines:
        d.text(((W - d.textlength(ln, font=f3)) / 2, y), ln, font=f3, fill=(150, 160, 168))
        y += 44
    im.save(path)

def lower_third(path, text):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(34, True)
    tw = d.textlength(text, font=f)
    x0, y0 = 64, H - 118
    pad = 26
    d.rounded_rectangle([x0, y0, x0 + tw + 2 * pad + 14, y0 + 66], 10, fill=(10, 12, 14, 216))
    d.rounded_rectangle([x0 + 14, y0 + 14, x0 + 22, y0 + 52], 3, fill=ACCENT + (255,))
    d.text((x0 + pad + 14, y0 + 14), text, font=f, fill=(238, 243, 245, 255))
    im.save(path)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-1500:])

FF = "ffmpeg"
parts = []

# cards
title_card("scripts/video/card_intro.png", "ORZARYN", "Controlled autonomy for agent procurement",
           ["USDC settlement on Solana · mandate-bounded AI agents", "Live product demo — staging environment"])
title_card("scripts/video/card_outro.png", "ORZARYN", "Authority, bounded. Settlement, proven.",
           ["github.com/BROCKUGANDA/orzaryn", "Live demo · solana-devnet staging · all data DEMO-labelled"])

# intro card
run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=black:s={W}x{H}:d={INTRO_BARS*BAR:.5f}",
     "-i", "scripts/video/card_intro.png",
     "-filter_complex", "[0][1]overlay=0:0:format=auto,format=yuv420p",
     "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "scripts/video/seg_intro.mp4"])
parts.append("scripts/video/seg_intro.mp4")

# scenes
start_bar = INTRO_BARS
for i, (name, s0, s1, bars, narr, lt) in enumerate(SCENES):
    dur = bars * BAR
    lt_png = None
    if lt:
        lt_png = f"scripts/video/lt_{name}.png"
        lower_third(lt_png, lt)
    base = f"scale={W}:{H}:flags=lanczos,fps=30"
    if s1 - s0 < dur:
        base = f"tpad=stop_mode=clone:stop_duration={dur-(s1-s0)+0.5:.3f}," + base
    outp = f"scripts/video/seg_{i:02d}_{name}.mp4"
    if lt_png:
        cmd = [FF, "-v", "error", "-y", "-ss", f"{s0:.3f}", "-t", f"{dur + 0.6:.3f}", "-i", SRC,
               "-loop", "1", "-t", f"{dur:.5f}", "-i", lt_png,
               "-filter_complex", f"[0:v]{base}[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[out]",
               "-map", "[out]", "-t", f"{dur:.5f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", outp]
    else:
        cmd = [FF, "-v", "error", "-y", "-ss", f"{s0:.3f}", "-t", f"{dur + 0.4:.3f}", "-i", SRC,
               "-vf", base + ",format=yuv420p", "-t", f"{dur:.5f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", outp]
    run(cmd)
    parts.append(outp)
    start_bar += bars

# outro card
run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=black:s={W}x{H}:d={OUTRO_BARS*BAR:.5f}",
     "-i", "scripts/video/card_outro.png",
     "-filter_complex", "[0][1]overlay=0:0:format=auto,format=yuv420p",
     "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "scripts/video/seg_outro.mp4"])
parts.append("scripts/video/seg_outro.mp4")

# concat
with open("scripts/video/concat.txt", "w") as f:
    for p in parts:
        f.write("file '" + os.path.abspath(p).replace(chr(92), '/') + "'" + chr(10) + "") if False else f.write(f"file '{os.path.abspath(p).replace(chr(92), '/')}'\n")
run([FF, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "scripts/video/concat.txt",
     "-c", "copy", "scripts/video/video_silent.mp4"])

# narration placement: scene starts (bar-cumulative) + 0.35s
starts, b = [], INTRO_BARS
for (_, _, _, bars, _, _) in SCENES:
    starts.append(b * BAR + 0.35)
    b += bars

inputs = ["-i", "scripts/video/music.wav"]
for sc in SCENES:
    inputs += ["-i", f"scripts/video/narr_{sc[4]}.mp3"]
flt = []
for i, t in enumerate(starts):
    flt.append(f"[{i+1}:a]aresample=44100,adelay={int(t*1000)}|{int(t*1000)}[n{i}]")
mixins = "".join(f"[n{i}]" for i in range(len(starts)))
total = b + OUTRO_BARS
flt.append(f"{mixins}amix=inputs={len(starts)}:normalize=0,apad=whole_dur={total*BAR:.3f}[voice]")
flt.append(f"[0:a]atrim=0:{total*BAR:.3f},asetpts=PTS-STARTPTS[mus]")
flt.append(f"[mus][voice]sidechaincompress=threshold=0.03:ratio=9:attack=40:release=500[ducked]")
flt.append(f"[ducked]anull[musout]")
flt.append(f"[voice]anull[vout]")
run([FF, "-v", "error", "-y", *inputs, "-i", "scripts/video/video_silent.mp4",
     "-filter_complex", ";".join(flt),
     "-map", "[musout]", "-t", f"{total*BAR:.3f}", "scripts/video/mus_ducked.wav",
     "-map", "[vout]", "-t", f"{total*BAR:.3f}", "scripts/video/voice.wav"])

def peak_of(path):
    r = subprocess.run([FF, "-y", "-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", "NUL"],
                       capture_output=True, text=True)
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr) or re.search(r"max_volume: (-?[\d.]+) dB", r.stdout)
    return 10 ** (float(m.group(1)) / 20)

pv, pm = peak_of("scripts/video/voice.wav"), peak_of("scripts/video/mus_ducked.wav")
gain = 0.707 / (pv + pm)  # worst-case sum -> -3 dBFS ceiling, AAC overshoot lands <= 0
print(f"peaks: voice={pv:.3f} music={pm:.3f} -> final gain {gain:.3f}")

run([FF, "-v", "error", "-y", "-i", "scripts/video/mus_ducked.wav", "-i", "scripts/video/voice.wav", "-i", "scripts/video/video_silent.mp4",
     "-filter_complex", f"[0:a][1:a]amix=inputs=2:normalize=0,volume={gain:.5f}[aout]",
     "-map", "2:v", "-map", "[aout]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total*BAR:.3f}", OUT])

import os
print(f"DONE {OUT}: {os.path.getsize(OUT)/1e6:.1f} MB, {total*BAR:.1f}s ({total} bars @124BPM)")
