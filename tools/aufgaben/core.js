/* Aufgaben – reine Logik ohne Oberfläche (getestet in tests/aufgaben.test.mjs).
 * Rechnet die Felder der KI (Promille) in Pixel um, bricht Text um und findet die größte Schriftgröße, die ins Feld passt. */
import { fitSize, MAX_BASE64, QUALITIES } from "../abschreiben/core.js";

export { fitSize, MAX_BASE64, QUALITIES };

/** Längste Bildkante des Fotos, das an die KI geht. Etwas mehr als beim Abschreiben, weil Arbeitsblätter kleine Schrift haben. */
export const SEND_SIDE = 2000;
/** Längste Bildkante des Blatts, auf das geschrieben und das exportiert wird. */
export const OUT_SIDE = 2600;

/** Ausgabearten: normale Schrift, Schriftarten mit Handschrift-Look und die eigene Handschrift aus dem Goodnotes-Tool. */
export const FONTS = [
  { id: "normal", label: "Normale Schrift", css: '"Inter Variable", Inter, system-ui, sans-serif', load: '600 20px "Inter Variable"', hand: false, k: 0.9, lineH: 1.22 },
  { id: "caveat", label: "Caveat", css: "Caveat, cursive", load: "400 20px Caveat", hand: true, k: 1.1, lineH: 1.12 },
  { id: "kalam", label: "Kalam", css: "Kalam, cursive", load: "400 20px Kalam", hand: true, k: 0.9, lineH: 1.3 },
  { id: "patrick", label: "Patrick Hand", css: '"Patrick Hand", cursive', load: '400 20px "Patrick Hand"', hand: true, k: 0.95, lineH: 1.2 },
  { id: "indie", label: "Indie Flower", css: '"Indie Flower", cursive', load: '400 20px "Indie Flower"', hand: true, k: 0.9, lineH: 1.2 },
  { id: "mine", label: "Meine Handschrift", css: "", load: "", hand: true, k: 1, lineH: 1.25, own: true },
];
export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[1];

export const INKS = [
  { id: "blue", label: "Blau", color: "#1d3f9e" },
  { id: "black", label: "Schwarz", color: "#1a1a1f" },
  { id: "pencil", label: "Bleistift", color: "#4a4d55" },
  { id: "green", label: "Grün", color: "#17643d" },
  { id: "red", label: "Rot", color: "#b3261e" },
];
export const inkById = (id) => INKS.find((i) => i.id === id) || INKS[0];

/** Promille-Rechteck [ymin, xmin, ymax, xmax] in Pixel { x, y, w, h } für ein Bild der Größe width × height. */
export function boxToRect(box, width, height) {
  const [ymin, xmin, ymax, xmax] = box;
  const x = (xmin / 1000) * width, y = (ymin / 1000) * height;
  return { x, y, w: Math.max(1, (xmax / 1000) * width - x), h: Math.max(1, (ymax / 1000) * height - y) };
}

/** Pixel-Rechteck zurück in Promille (gerundet, auf 0–1000 begrenzt). */
export function rectToBox(rect, width, height) {
  const c = (n) => Math.min(1000, Math.max(0, Math.round(n)));
  return [c((rect.y / height) * 1000), c((rect.x / width) * 1000), c(((rect.y + rect.h) / height) * 1000), c(((rect.x + rect.w) / width) * 1000)];
}

/** Bricht Text in Zeilen der Breite maxW. Eigene Zeilenumbrüche bleiben, zu lange Wörter werden zeichenweise getrennt.
 * measure(text, size) liefert die Breite in Pixeln. */
export function wrapText(measure, text, size, maxW) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (!line || measure(next, size) <= maxW) { line = next; continue; }
      lines.push(line);
      line = word;
    }
    // zu langes einzelnes Wort: zeichenweise brechen
    while (measure(line, size) > maxW && line.length > 1) {
      let n = line.length - 1;
      while (n > 1 && measure(line.slice(0, n), size) > maxW) n--;
      lines.push(line.slice(0, n));
      line = line.slice(n);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Größte Schriftgröße, bei der der Text in das Feld passt.
 * @param {(text: string, size: number) => number} measure  Textbreite in Pixeln
 * @param {string} text
 * @param {{ w: number, h: number }} rect  Feld in Pixeln
 * @param {{ lineH?: number, maxSize: number, minSize: number, pad?: number }} opts  lineH = Zeilenabstand als Vielfaches der Größe
 * @returns {{ size: number, lines: string[], lineH: number, fits: boolean }}
 */
export function fitText(measure, text, rect, { lineH = 1.2, maxSize, minSize, pad = 0 }) {
  const w = Math.max(1, rect.w - pad * 2), h = Math.max(1, rect.h - pad * 2);
  const hi = Math.max(minSize, maxSize);
  let size = hi, result = null;
  while (size >= minSize) {
    const lines = wrapText(measure, text, size, w);
    if (lines.length * size * lineH <= h + 0.5) { result = { size, lines }; break; }
    size = Math.round((size - Math.max(0.5, hi * 0.03)) * 10) / 10;
  }
  if (result) return { size: result.size, lines: result.lines, lineH, fits: true };
  const lines = wrapText(measure, text, minSize, w);
  return { size: minSize, lines, lineH, fits: lines.length * minSize * lineH <= h + 0.5 };
}

/** Kleine, gleichbleibende „Zufallszahl“ 0..1 aus Feld-Nummer und Zeile, damit die Schrift lebendig wirkt, aber bei jedem Neuzeichnen gleich aussieht. */
export function jitter(id, line, salt = 0) {
  let h = (Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(line + 7, 0x85ebca6b) ^ Math.imul(salt + 3, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Legt alle Felder auf das Blatt.
 * @param {Array<{id:number, box:number[], text:string}>} fields
 * @param {{ width: number, height: number, measure: (text:string,size:number)=>number, lineH: number, k: number, scale: number }} o
 * @returns {Array<{ id:number, rect:object, size:number, lines:string[], lineH:number, fits:boolean, baselines:number[], dx:number[], rot:number[] }>}
 *  scale = Größenfaktor des Nutzers (1 = automatisch), k = Schriftfaktor, damit Handschriftarten gleich groß wirken.
 */
export function layoutFields(fields, { width, height, measure, lineH, k = 1, scale = 1 }) {
  const maxSize = width * 0.036 * k * scale;
  const minSize = Math.max(6, width * 0.011 * k);
  return fields.map((f) => {
    const rect = boxToRect(f.box, width, height);
    const fit = fitText(measure, f.text, rect, { lineH, maxSize: Math.min(maxSize, rect.h * 0.9 * scale * k), minSize, pad: Math.min(3, rect.h * 0.04) });
    const n = fit.lines.length;
    // Eine Zeile sitzt unten im Feld auf der Linie, mehrere Zeilen füllen es von oben
    const baselines = fit.lines.map((_, i) =>
      n === 1 ? rect.y + rect.h - Math.min(rect.h * 0.18, fit.size * 0.22) : rect.y + fit.size * 0.92 + i * fit.size * fit.lineH);
    return {
      id: f.id, rect, ...fit, baselines,
      dx: fit.lines.map((_, i) => (jitter(f.id, i, 1) - 0.5) * fit.size * 0.12),
      rot: fit.lines.map((_, i) => (jitter(f.id, i, 2) - 0.5) * 0.012),
    };
  });
}

/** Dateiname-Vorschlag aus Datum und (optional) Fach: „Aufgaben 2026-11-17“. */
export function fileName(date = new Date(), ext = "pdf") {
  const p = (n) => String(n).padStart(2, "0");
  return `Aufgaben ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.${ext}`;
}
