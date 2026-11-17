"""Zeichnet Test-Arbeitsblätter für das Aufgaben-Tool, bei denen jede Lücke bekannt ist.

Aufruf (aus dem Projektordner):  python scripts/aufgaben-test/gen_sheets.py
Ausgabe in scripts/aufgaben-test/out/:
  <name>.png        das Blatt in voller Größe
  <name>.send.jpg   so, wie der Browser es an die KI schickt (längste Kante höchstens 2000 px, JPEG)
  <name>.gt.json    { size, gaps: [{ id, box [ymin,xmin,ymax,xmax] in Promille, expect, kind }] }  (die Wahrheit)
Die Foto-Varianten (foto-*) sind gedreht, ungleich beleuchtet und verrauscht, die Wahrheit dreht mit.
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)
W, H = 1240, 1754  # A4 bei 150 dpi
FONTS = "C:/Windows/Fonts/"
def font(size, bold=False):
    return ImageFont.truetype(FONTS + ("arialbd.ttf" if bold else "arial.ttf"), size)

class Sheet:
    def __init__(self, title, hint):
        self.img = Image.new("RGB", (W, H), "white")
        self.d = ImageDraw.Draw(self.img)
        self.gaps = []
        self.y = 110
        self.d.text((90, self.y), title, font=font(52, True), fill="#111")
        self.y += 90
        self.d.text((90, self.y), hint, font=font(30), fill="#333")
        self.y += 40
        self.d.line([(90, self.y + 20), (W - 90, self.y + 20)], fill="#999", width=2)
        self.y += 70
        # Kopfzeile Name / Datum wie auf echten Blättern: bleibt leer und ist KEIN Ziel (die KI darf sie ausfüllen, wir zählen sie nicht)
        self.d.text((90, 40), "Name: ____________________", font=font(26), fill="#555")
        self.d.text((W - 460, 40), "Datum: ______________", font=font(26), fill="#555")

    def add_gap(self, x0, y0, x1, y1, expect, kind="gap"):
        self.gaps.append({"id": len(self.gaps) + 1, "px": [x0, y0, x1, y1], "expect": expect, "kind": kind})

    def text(self, x, y, s, size=32, bold=False, fill="#111"):
        self.d.text((x, y), s, font=font(size, bold), fill=fill)
        return x + self.d.textlength(s, font=font(size, bold))

    def line_gap(self, x, base_y, length, expect, size=32):
        """Linie zum Beschriften. Das Feld ist der freie Platz über der Linie."""
        self.d.line([(x, base_y), (x + length, base_y)], fill="#111", width=3)
        self.add_gap(x, base_y - int(size * 1.35), x + length, base_y + 3, expect, "gap")
        return x + length

    def save(self, name, photo=None):
        img = self.img
        gaps = [dict(g) for g in self.gaps]
        size = (W, H)
        corners = {g["id"]: [(g["px"][0], g["px"][1]), (g["px"][2], g["px"][1]), (g["px"][2], g["px"][3]), (g["px"][0], g["px"][3])] for g in gaps}
        if photo:
            img, corners, size = make_photo(img, corners, **photo)
        w, h = size
        out = []
        for g in gaps:
            xs = [p[0] for p in corners[g["id"]]]; ys = [p[1] for p in corners[g["id"]]]
            box = [max(0, min(ys)) / h * 1000, max(0, min(xs)) / w * 1000, min(h, max(ys)) / h * 1000, min(w, max(xs)) / w * 1000]
            out.append({"id": g["id"], "box": [round(v, 1) for v in box], "expect": g["expect"], "kind": g["kind"]})
        img.save(os.path.join(OUT, name + ".png"))
        s = img.copy()
        k = min(1.0, 2000 / max(s.size))
        if k < 1: s = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS)
        s.save(os.path.join(OUT, name + ".send.jpg"), quality=85)
        with open(os.path.join(OUT, name + ".gt.json"), "w", encoding="utf-8") as f:
            json.dump({"size": [w, h], "gaps": out}, f, ensure_ascii=False, indent=1)
        print(name, img.size, len(out), "Lücken")


def make_photo(img, corners, angle=2.5, shade=0.35, noise=9, blur=0.9, quality=72, margin=90):
    """Macht aus dem Blatt ein „Foto“: gedreht auf grauem Untergrund, ungleich beleuchtet, unscharf, verrauscht, stark komprimiert."""
    w, h = img.size
    bg = Image.new("RGB", (w + 2 * margin, h + 2 * margin), (96, 92, 88))
    bg.paste(img, (margin, margin))
    cx, cy = bg.width / 2, bg.height / 2
    rot = bg.rotate(angle, resample=Image.BICUBIC, center=(cx, cy), fillcolor=(96, 92, 88))
    a = math.radians(-angle)  # PIL dreht gegen den Uhrzeigersinn; Bild-y zeigt nach unten
    def tf(p):
        x, y = p[0] + margin - cx, p[1] + margin - cy
        return (cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))
    new = {k: [tf(p) for p in v] for k, v in corners.items()}
    px = rot.load()
    rnd = random.Random(7)
    for yy in range(rot.height):
        for xx in range(rot.width):
            r, g, b = px[xx, yy]
            f = 1 - shade * (xx / rot.width) * 0.8 - shade * (yy / rot.height) * 0.5  # Licht fällt von links oben ab
            n = rnd.gauss(0, noise)
            px[xx, yy] = (max(0, min(255, int(r * f + n))), max(0, min(255, int(g * f + n))), max(0, min(255, int(b * f * 0.97 + n))))
    rot = rot.filter(ImageFilter.GaussianBlur(blur))
    # Foto-Qualität: einmal als stark komprimiertes JPEG speichern und wieder laden
    tmp = os.path.join(OUT, "_tmp.jpg"); rot.save(tmp, quality=quality); rot = Image.open(tmp).convert("RGB"); rot.load()
    return rot, new, rot.size


# ---------- Blätter ----------

def sheet_luecken():
    s = Sheet("Lückentext: Europa", "Setze die fehlenden Wörter ein.")
    rows = [
        ("Die Hauptstadt von Frankreich ist", None, ".", "Paris", 330),
        ("Die Hauptstadt von Italien heißt", None, ".", "Rom", 300),
        ("In", None, "liegt das Brandenburger Tor.", "Berlin", 260),
        ("Die Hauptstadt von Spanien ist", None, ".", "Madrid", 320),
        ("Der Rhein mündet in die", None, ".", "Nordsee", 330),
        ("Die Schweiz hat die Hauptstadt", None, ".", "Bern", 280),
        ("Wien ist die Hauptstadt von", None, ".", "Österreich", 330),
    ]
    for i, (pre, _, post, ans, ln) in enumerate(rows, 1):
        y = s.y
        x = s.text(90, y, f"{i}. {pre} ")
        x = s.line_gap(x + 4, y + 40, ln, ans)
        s.text(x + 6, y, post)
        s.y += 120
    return s

def sheet_rechnen():
    s = Sheet("Mathe: Rechnen", "Rechne aus und schreibe das Ergebnis auf die Linie.")
    s.text(90, s.y, "Aufgabe 1", bold=True); s.y += 70
    for lab, term, ans in [("a)", "245 + 378 =", "623"), ("b)", "1000 − 457 =", "543"), ("c)", "36 · 12 =", "432"), ("d)", "144 : 6 =", "24")]:
        x = s.text(110, s.y, f"{lab}  {term}  ")
        s.line_gap(x + 6, s.y + 40, 230, ans)
        s.y += 90
    s.y += 30
    s.text(90, s.y, "Aufgabe 2", bold=True); s.y += 70
    s.text(90, s.y, "Lena kauft 3 Hefte für je 2,50 €."); s.y += 48
    s.text(90, s.y, "Wie viel muss sie bezahlen?"); s.y += 80
    s.text(90, s.y, "Rechnung:", size=28, fill="#444")
    bx0, by0, bx1, by1 = 260, s.y - 10, W - 90, s.y + 150
    s.d.rectangle([bx0, by0, bx1, by1], outline="#111", width=3)
    s.add_gap(bx0 + 4, by0 + 4, bx1 - 4, by1 - 4, "3 · 2,50 € = 7,50 €", "area")
    s.y = by1 + 55
    x = s.text(90, s.y, "Antwort: Lena muss ")
    x = s.line_gap(x + 4, s.y + 40, 260, "7,50 €")
    s.text(x + 6, s.y, "bezahlen.")
    s.y += 110
    s.text(90, s.y, "Aufgabe 3", bold=True); s.y += 70
    x = s.text(110, s.y, "1/2 + 1/4 =  ")
    s.line_gap(x + 6, s.y + 40, 230, "3/4")
    return s

def sheet_ankreuzen():
    s = Sheet("Quiz: Kreuze die richtige Antwort an", "Pro Frage ist genau eine Antwort richtig.")
    qs = [
        ("Wie viele Beine hat eine Spinne?", ["6", "8", "10"], 1),
        ("Welches Tier legt Eier?", ["Kuh", "Huhn", "Hund"], 1),
        ("Welche Farbe entsteht aus Blau und Gelb?", ["Grün", "Orange", "Lila"], 0),
        ("Was ist 7 · 8?", ["54", "56", "64"], 1),
        ("Welcher Planet ist der größte?", ["Mars", "Jupiter", "Erde"], 1),
    ]
    for n, (q, opts, right) in enumerate(qs, 1):
        s.text(90, s.y, f"{n}. {q}", bold=True); s.y += 62
        x = 130
        for i, o in enumerate(opts):
            box = 38
            s.d.rectangle([x, s.y + 2, x + box, s.y + 2 + box], outline="#111", width=3)
            if i == right:
                s.add_gap(x - 2, s.y, x + box + 2, s.y + box + 4, "X", "checkbox")
            end = s.text(x + box + 16, s.y, o)
            x = end + 90
        s.y += 100
    return s

def sheet_tabelle():
    s = Sheet("Englisch: Obst", "Schreibe die englischen Wörter in die Tabelle.")
    words = [("Apfel", "apple"), ("Banane", "banana"), ("Orange", "orange"), ("Birne", "pear"), ("Kirsche", "cherry"), ("Erdbeere", "strawberry"), ("Zitrone", "lemon"), ("Traube", "grape")]
    x0, x1, x2 = 130, 560, 1110
    rh = 105
    y = s.y
    s.d.rectangle([x0, y, x2, y + 80], outline="#111", width=3, fill="#eee")
    s.text(x0 + 20, y + 20, "Deutsch", bold=True); s.text(x1 + 20, y + 20, "Englisch", bold=True)
    y += 80
    for de, en in words:
        s.d.rectangle([x0, y, x1, y + rh], outline="#111", width=3)
        s.d.rectangle([x1, y, x2, y + rh], outline="#111", width=3)
        s.text(x0 + 20, y + 30, de)
        s.add_gap(x1 + 3, y + 3, x2 - 3, y + rh - 3, en, "cell")
        y += rh
    return s

def sheet_fragen():
    s = Sheet("Sachkunde: Fragen", "Beantworte in ganzen Sätzen.")
    for q, n, ans in [("1. Nenne zwei Haustiere.", 2, "Zwei Haustiere sind der Hund und die Katze."),
                      ("2. Was braucht eine Pflanze zum Wachsen?", 3, "Eine Pflanze braucht Licht, Wasser und Erde, damit sie wachsen kann."),
                      ("3. Wie heißt die Hauptstadt von Deutschland?", 1, "Die Hauptstadt von Deutschland heißt Berlin.")]:
        s.text(90, s.y, q, bold=True); s.y += 70
        top = s.y
        for i in range(n):
            s.d.line([(90, s.y + 60), (W - 90, s.y + 60)], fill="#777", width=2)
            s.y += 64
        s.add_gap(90, top, W - 90, s.y, ans, "area")
        s.y += 60
    return s


if __name__ == "__main__":
    sheets = {"luecken": sheet_luecken(), "rechnen": sheet_rechnen(), "ankreuzen": sheet_ankreuzen(), "tabelle": sheet_tabelle(), "fragen": sheet_fragen()}
    for name, sh in sheets.items():
        sh.save(name)
    sheet_rechnen().save("foto-rechnen", photo=dict(angle=2.5, shade=0.35, noise=9, blur=0.9, quality=70))
    sheet_tabelle().save("foto-tabelle", photo=dict(angle=-3.0, shade=0.45, noise=11, blur=1.1, quality=65))
    sheet_luecken().save("foto-luecken", photo=dict(angle=1.5, shade=0.25, noise=7, blur=0.7, quality=75))
    tmp = os.path.join(OUT, "_tmp.jpg")
    if os.path.exists(tmp): os.remove(tmp)
