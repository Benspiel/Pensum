/* Mindmap – eigene Handschrift.
 * Liest das Handschrift-Profil, das im Goodnotes-Tool gezeichnet wurde (Tabelle „handwriting“, eine Zeile je Benutzer),
 * und setzt Text daraus als Striche (SVG-Pfade) – nichts wird hochgeladen oder gespeichert. */
import { createInkEngine } from "/tools/goodnotes/ink-engine.js";
import { tablesDB, databaseId, tableIds } from "/js/db.js";

const SPACE = 0.32;     // Breite eines Leerzeichens (wie im Goodnotes-Tool)
const MISSING = 0.45;   // Vorschub für nicht gezeichnete Zeichen
const STROKE = 0.075;   // Strichbreite in Geviert-Einheiten
const ALIAS = { "„": '"', "“": '"', "”": '"', "«": '"', "»": '"', "‚": "'", "‘": "'", "’": "'", "–": "-", "—": "-", "•": "." };

let engine = null;

/** Gespeicherte Handschrift (gepackt) in das Laufzeitformat umwandeln; null, wenn nichts Brauchbares drin ist. */
export function unpack(packed) {
  if (!packed || typeof packed !== "object") return null;
  engine = engine || createInkEngine();
  const hand = engine.unpackHand(packed);
  return Object.keys(hand.glyphs).length ? hand : null;
}

/** Handschrift des angemeldeten Benutzers laden (null = keine hinterlegt). */
export async function loadHand(userId) {
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: tableIds.handwriting, rowId: userId });
    return unpack(JSON.parse(row.glyphs || "null"));
  } catch (e) {
    if (e && e.code === 404) return null;
    throw e;
  }
}

function glyph(hand, ch) {
  const g = hand.glyphs;
  if (g[ch]) return g[ch];
  const alt = ALIAS[ch] || (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase());
  return g[alt] || null;
}

const advance = (hand, ch) => (ch.trim() ? (glyph(hand, ch) || { adv: MISSING }).adv : SPACE);

/** Breite eines Textes in Pixeln bei Schriftgröße size. */
export function width(hand, text, size) {
  let w = 0;
  for (const ch of String(text)) w += advance(hand, ch);
  return w * size;
}

export const strokeWidth = (size) => STROKE * size;

/** SVG-Pfad (d) für den Text; x = linker Rand, baseline = Grundlinie. */
export function pathData(hand, text, size, x, baseline) {
  const f = (n) => Math.round(n * 10) / 10;
  let pen = x, d = "";
  for (const ch of String(text)) {
    const g = ch.trim() ? glyph(hand, ch) : null;
    if (g) {
      for (const pts of g.strokes) {
        if (!pts.length) continue;
        d += `M${f(pen + pts[0][0] * size)} ${f(baseline + pts[0][1] * size)}`;
        if (pts.length === 1) d += "h0.1";
        for (let i = 1; i < pts.length; i++) d += `L${f(pen + pts[i][0] * size)} ${f(baseline + pts[i][1] * size)}`;
      }
    }
    pen += advance(hand, ch) * size;
  }
  return d;
}

/** Wie pathData, aber als Punktlisten je Strich ([[x, y], …][]) – für den Goodnotes-Export. */
export function strokes(hand, text, size, x, baseline) {
  const out = [];
  let pen = x;
  for (const ch of String(text)) {
    const g = ch.trim() ? glyph(hand, ch) : null;
    if (g) for (const pts of g.strokes) if (pts.length) out.push(pts.map(([px, py]) => [pen + px * size, baseline + py * size]));
    pen += advance(hand, ch) * size;
  }
  return out;
}
