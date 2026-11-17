"""Zeichnet die Ergebnisse der KI über das Test-Blatt: grün = wahre Lücke, rot = Feld der KI, blau = Antwort so gesetzt wie im Tool.

Aufruf:  python scripts/aufgaben-test/viz.py <name> [blatt …]     (liest out/<blatt>.<name>.result.json, schreibt out/<blatt>.<name>.viz.png)
Die Textgröße folgt layoutFields/fitText aus tools/aufgaben/core.js (hier nachgebaut, mit der Schrift „Ink Free“ statt Caveat)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "out")
HAND = "C:/Windows/Fonts/Inkfree.ttf"
K, LINE_H = 1.0, 1.2

def measure(font_cache, size):
    s = max(6, round(size))
    if s not in font_cache: font_cache[s] = ImageFont.truetype(HAND, s)
    return font_cache[s]

def wrap(text, size, max_w, fc):
    f = measure(fc, size); lines = []
    for para in text.split("\n"):
        words = para.split()
        if not words: lines.append(""); continue
        line = ""
        for w in words:
            nxt = (line + " " + w) if line else w
            if not line or f.getlength(nxt) <= max_w: line = nxt; continue
            lines.append(line); line = w
        lines.append(line)
    return lines

def fit(text, rect_w, rect_h, max_size, min_size, pad, fc):
    w, h = max(1, rect_w - 2 * pad), max(1, rect_h - 2 * pad)
    hi = max(min_size, max_size); size = hi
    while size >= min_size:
        lines = wrap(text, size, w, fc)
        if len(lines) * size * LINE_H <= h + 0.5: return size, lines, True
        size = round((size - max(0.5, hi * 0.03)) * 10) / 10
    lines = wrap(text, min_size, w, fc)
    return min_size, lines, len(lines) * min_size * LINE_H <= h + 0.5

def render(name, tag):
    base = name.split("#")[0]
    img = Image.open(os.path.join(OUT, base + ".png")).convert("RGB")
    gt = json.load(open(os.path.join(OUT, base + ".gt.json"), encoding="utf-8"))
    res = json.load(open(os.path.join(OUT, f"{name}.{tag}.result.json"), encoding="utf-8"))["runs"][0]
    W, H = img.size
    d = ImageDraw.Draw(img, "RGBA"); fc = {}
    label = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    for g in gt["gaps"]:
        y0, x0, y1, x1 = g["box"]
        d.rectangle([x0 / 1000 * W, y0 / 1000 * H, x1 / 1000 * W, y1 / 1000 * H], outline=(0, 170, 70, 255), width=3)
    overflow = 0
    for f in res["fields"]:
        y0, x0, y1, x1 = f["box"]
        rx, ry, rw, rh = x0 / 1000 * W, y0 / 1000 * H, max(1, (x1 - x0) / 1000 * W), max(1, (y1 - y0) / 1000 * H)
        d.rectangle([rx, ry, rx + rw, ry + rh], outline=(220, 30, 30, 255), width=2)
        max_size = min(W * 0.036 * K, rh * 0.9 * K); min_size = max(6, W * 0.011 * K)
        size, lines, fits = fit(f["text"], rw, rh, max_size, min_size, min(3, rh * 0.04), fc)
        if not fits: overflow += 1
        n = len(lines); font = measure(fc, size)
        for i, ln in enumerate(lines):
            base = (ry + rh - min(rh * 0.18, size * 0.22)) if n == 1 else (ry + size * 0.92 + i * size * LINE_H)
            d.text((rx + 4, base), ln, font=font, fill=(29, 63, 158, 255), anchor="ls")
        d.text((rx, ry - 17), f"{f['id']}", font=label, fill=(220, 30, 30, 255))
    st = res["stats"]
    title = f"{name} [{tag}]  Box ok {st['goodBox']}/{st['gaps']}  Ø-IoU {st['meanIou']}  Text {st['textOk']}/{st['textTotal']}  Zusatz {st['extras']}  zu klein/überlaufend {overflow}"
    d.rectangle([0, 0, W, 34], fill=(255, 255, 255, 235)); d.text((10, 6), title, font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20), fill=(0, 0, 0, 255))
    path = os.path.join(OUT, f"{name}.{tag}.viz.png")
    img.save(path); print(path)

if __name__ == "__main__":
    tag = sys.argv[1]
    names = sys.argv[2:] or sorted(f.split("." + tag + ".result.json")[0] for f in os.listdir(OUT) if f.endswith("." + tag + ".result.json"))
    for n in names: render(n, tag)
