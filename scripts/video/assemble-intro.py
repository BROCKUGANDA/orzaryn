# ORZARYN intro video assembly — 124 BPM beat-matched, placeholder-avatar intro.
# Narration is third-person/factual about the builder (no synthetic impersonation).
import os
import re
import subprocess
from PIL import Image, ImageDraw, ImageFont

BAR = 60 / 124 * 4
SRC = "scripts/video/cfr.mp4"
W, H = 1600, 900
OUT = "orzaryn-intro.mp4"
FF = "ffmpeg"
ACCENT = (52, 211, 153)

def font(size, bold=False):
    for path in ["C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
                 "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

def lower_third(path, text):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(34, True)
    tw = d.textlength(text, font=f)
    x0, y0 = 64, H - 118
    d.rounded_rectangle([x0, y0, x0 + tw + 52, y0 + 66], 10, fill=(10, 12, 14, 216))
    d.rounded_rectangle([x0 + 14, y0 + 14, x0 + 22, y0 + 52], 3, fill=ACCENT + (255,))
    d.text((x0 + 40, y0 + 14), text, font=f, fill=(238, 243, 245, 255))
    im.save(path)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-1500:])

# scene = {narr, segments: [("card", png) | ("broll", src_start, lt)], }
SCENES = [
    {"narr": "i1_intro",    "segs": [("card", "scripts/video/intro_avatar.png")]},
    {"narr": "i2_problem",  "segs": [("card", "scripts/video/intro_p1.png"),
                                     ("card", "scripts/video/intro_p2.png"),
                                     ("card", "scripts/video/intro_p3.png")]},
    {"narr": "i3_build",    "segs": [("broll", 35.6, "Mandates — enforced spending limits")]},
    {"narr": "i4_lifecycle","segs": [("broll", 58.5, "Work orders — proposal → approval → escrow → evidence"),
                                     ("broll", 67.6, "Settlements — release-on-acceptance receipts")]},
    {"narr": "i5_who",      "segs": [("card", "scripts/video/intro_why.png")]},
    {"narr": "i6_convict",  "segs": [("card", "scripts/video/intro_convict.png")]},
    {"narr": "i7_close",    "segs": [("broll", 21.8, None)]},  # dashboard live health
]
OUTRO_CARD = "scripts/video/intro_close.png"
OUTRO_BARS = 3

# narration -> bars per scene (from measured mp3 durations)
def duration_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

for sc in SCENES:
    narr = duration_of(f"scripts/video/narr_{sc['narr']}.mp3")
    sc["bars"] = max(2, -(-int((narr + 0.5) * 100) // int(BAR * 100)))
total_bars = sum(sc["bars"] for sc in SCENES) + OUTRO_BARS

# distribute scene bars across segments (min 2 bars per segment, largest gets remainder)
for sc in SCENES:
    n = len(sc["segs"])
    base = sc["bars"] // n
    rem = sc["bars"] - base * n
    sc["seg_bars"] = [base + (1 if i < rem else 0) for i in range(n)]
    if min(sc["seg_bars"]) < 1:
        raise SystemExit(f"scene {sc['narr']} segment bars < 1")

# music bed sized to total
run(["python", "scripts/video/gen-music.py", str(total_bars), "25", "28"])
music_dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                  "scripts/video/music.wav"], capture_output=True, text=True).stdout)
if abs(music_dur - total_bars * BAR) > 0.2:
    raise SystemExit(f"music length mismatch: {music_dur} vs {total_bars*BAR}")

parts = []
def render_card(png, dur, idx):
    if png:
        cmd = [FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=black:s={W}x{H}:d={dur:.5f}",
               "-i", png, "-filter_complex", "[0][1]overlay=0:0:format=auto,format=yuv420p"]
    else:
        cmd = [FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color={ACCENT[0]},{ACCENT[1]},{ACCENT[2]}:s={W}x{H}:d={dur:.5f}"]
    outp = f"scripts/video/iseg_{idx:02d}.mp4"
    run(cmd + ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", outp])
    return outp

def render_broll(src_start, dur, lt, idx):
    lt_png = None
    if lt:
        lt_png = f"scripts/video/ilt_{idx:02d}.png"
        lower_third(lt_png, lt)
    base = f"scale={W}:{H}:flags=lanczos,fps=30"
    if lt_png:
        cmd = [FF, "-v", "error", "-y", "-ss", f"{src_start:.3f}", "-t", f"{dur + 0.5:.3f}", "-i", SRC,
               "-loop", "1", "-t", f"{dur:.5f}", "-i", lt_png,
               "-filter_complex", f"[0:v]{base}[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[out]",
               "-map", "[out]", "-t", f"{dur:.5f}"]
    else:
        cmd = [FF, "-v", "error", "-y", "-ss", f"{src_start:.3f}", "-t", f"{dur + 0.5:.3f}", "-i", SRC,
               "-vf", base + ",format=yuv420p", "-t", f"{dur:.5f}"]
    outp = f"scripts/video/iseg_{idx:02d}.mp4"
    run(cmd + ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", outp])
    return outp

idx = 0
starts = []
bar_cursor = 0
for sc in SCENES:
    starts.append(bar_cursor * BAR + 0.35)
    for seg, seg_bars in zip(sc["segs"], sc["seg_bars"]):
        dur = seg_bars * BAR
        if seg[0] == "card":
            parts.append(render_card(seg[1], dur, idx))
        else:
            parts.append(render_broll(seg[1], dur, seg[2], idx))
        idx += 1
    bar_cursor += sc["bars"]

# outro card
parts.append(render_card(OUTRO_CARD, OUTRO_BARS * BAR, idx))

# concat (absolute paths — concat demuxer resolves relative to list location)
with open("scripts/video/iconcat.txt", "w") as f:
    for p in parts:
        f.write("file '" + os.path.abspath(p).replace("\\", "/") + "'\n")
run([FF, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "scripts/video/iconcat.txt",
     "-c", "copy", "scripts/video/intro_silent.mp4"])

# narration stems
inputs = ["-i", "scripts/video/music.wav"]
for sc in SCENES:
    inputs += ["-i", f"scripts/video/narr_{sc['narr']}.mp3"]
flt = []
for i, t in enumerate(starts):
    flt.append(f"[{i+1}:a]aresample=44100,adelay={int(t*1000)}|{int(t*1000)}[n{i}]")
mixins = "".join(f"[n{i}]" for i in range(len(SCENES)))
flt.append(f"{mixins}amix=inputs={len(SCENES)}:normalize=0,apad=whole_dur={total_bars*BAR:.3f}[voice]")
flt.append(f"[0:a]atrim=0:{total_bars*BAR:.3f},asetpts=PTS-STARTPTS[mus]")
flt.append(f"[voice]asplit=2[vside][vout]")
flt.append(f"[mus][vside]sidechaincompress=threshold=0.03:ratio=9:attack=40:release=500[ducked]")
run([FF, "-v", "error", "-y", *inputs, "-filter_complex", ";".join(flt),
     "-map", "[ducked]", "-t", f"{total_bars*BAR:.3f}", "scripts/video/imus_ducked.wav",
     "-map", "[vout]", "-t", f"{total_bars*BAR:.3f}", "scripts/video/ivoice.wav"])

def peak_of(path):
    r = subprocess.run([FF, "-y", "-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", "NUL"],
                       capture_output=True, text=True)
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr) or re.search(r"max_volume: (-?[\d.]+) dB", r.stdout)
    return 10 ** (float(m.group(1)) / 20)

pv, pm = peak_of("scripts/video/ivoice.wav"), peak_of("scripts/video/imus_ducked.wav")
gain = 0.891 / (pv + pm)
print(f"peaks: voice={pv:.3f} music={pm:.3f} -> gain {gain:.3f}")

run([FF, "-v", "error", "-y", "-i", "scripts/video/imus_ducked.wav", "-i", "scripts/video/ivoice.wav",
     "-i", "scripts/video/intro_silent.mp4",
     "-filter_complex", f"[0:a][1:a]amix=inputs=2:normalize=0,volume={gain:.5f}[aout]",
     "-map", "2:v", "-map", "[aout]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total_bars*BAR:.3f}", OUT])
print(f"DONE {OUT}: {os.path.getsize(OUT)/1e6:.1f} MB, {total_bars*BAR:.1f}s ({total_bars} bars)")
