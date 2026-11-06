# ORZARYN intro video — Pillow cards (avatar placeholder, statements, closing).
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 900
ACCENT = (52, 211, 153)
BG = (10, 12, 14)
GRID = (16, 20, 23)

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

def base():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 56):
        d.line([(x, 0), (x, H)], fill=GRID)
    for y in range(0, H, 56):
        d.line([(0, y), (W, y)], fill=GRID)
    return im, d

def center(d, text, y, f, fill):
    d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)

def avatar(d, cx, cy, r, initials, small=False):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(24, 30, 34), outline=ACCENT, width=4 if small else 6)
    f = font(int(r * 0.72), True)
    w = d.textlength(initials, font=f)
    d.text((cx - w / 2, cy - r * 0.42), initials, font=f, fill=(238, 243, 245))

def avatar_card(path):
    im, d = base()
    avatar(d, W // 2, 330, 130, "OO")
    center(d, "Otema Okot Araa Andrew", 500, font(52, True), (240, 245, 247))
    center(d, "Founder & Engineer — building ORZARYN end to end", 575, font(34), ACCENT)
    center(d, "placeholder avatar", 850, font(22), (95, 105, 112))
    im.save(path)

def statement_card(path, lines, sub=None):
    im, d = base()
    y = 330
    for i, ln in enumerate(lines):
        center(d, ln, y, font(64, True), (240, 245, 247) if i == 0 else (150, 160, 168))
        y += 92
    if sub:
        center(d, sub, y + 40, font(36), ACCENT)
    im.save(path)

def why_card(path):
    im, d = base()
    avatar(d, 400, 420, 110, "OO", small=True)
    center(d, "Built end to end by one engineer", 170, font(52, True), (240, 245, 247))
    center(d, "Otema Okot Araa Andrew", 240, font(34), ACCENT)
    items = ["Policy engine — reason-coded, fail-closed", "Double-entry ledger — idempotent, reconciled",
             "Work-order state machines — nothing skips a step", "Solana escrow program — Anchor, mandate-bounded"]
    f = font(36)
    y = 300
    for it in items:
        d.rounded_rectangle([620, y - 6, 1520, y + 56], 10, fill=(18, 22, 26))
        d.rounded_rectangle([638, y + 10, 648, y + 40], 3, fill=ACCENT)
        d.text((668, y + 4), it, font=f, fill=(225, 231, 235))
        y += 84
    center(d, "placeholder avatar", 850, font(22), (95, 105, 112))
    im.save(path)

def closing_card(path):
    im, d = base()
    center(d, "ORZARYN", 330, font(96, True), (240, 245, 247))
    center(d, "Authority, bounded. Settlement, proven.", 470, font(44), ACCENT)
    center(d, "github.com/BROCKUGANDA/orzaryn", 580, font(32), (150, 160, 168))
    im.save(path)

if __name__ == "__main__":
    avatar_card("scripts/video/intro_avatar.png")
    statement_card("scripts/video/intro_p1.png", ["AI agents are starting to buy things."], "data · APIs · compute")
    statement_card("scripts/video/intro_p2.png", ["Finance teams have no seat belt."])
    statement_card("scripts/video/intro_p3.png", ["Block everything —", "or hand them a card and pray."])
    statement_card("scripts/video/intro_convict.png", ["The durable company is the one", "that makes autonomy", "safe to spend."])
    why_card("scripts/video/intro_why.png")
    closing_card("scripts/video/intro_close.png")
    print("intro cards saved")
