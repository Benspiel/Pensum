/* Abschreiben – reine Logik ohne Oberfläche (getestet in tests/abschreiben.test.mjs). */

/** Längste Bildkante, auf die das Foto vor dem Senden verkleinert wird. Reicht, damit Tafelschrift lesbar bleibt. */
export const MAX_SIDE = 1800;
/** Obergrenze für das Base64-Bild (Zeichen). Die Function lehnt über 2,4 Mio. ab. */
export const MAX_BASE64 = 1_900_000;
/** JPEG-Qualitäten, die der Reihe nach probiert werden, bis das Bild klein genug ist. */
export const QUALITIES = [0.82, 0.7, 0.58, 0.46];

/** Zielgröße mit gleichem Seitenverhältnis, nie größer als das Original. */
export function fitSize(width, height, max = MAX_SIDE) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/* ---------- Übergabe ans Goodnotes-Tool ----------
   Der Text geht über sessionStorage in dieselbe Browser-Registerkarte. Er wird nirgends hochgeladen und
   nach dem ersten Lesen gelöscht. Veraltete Übergaben werden ignoriert. */

export const HANDOFF_KEY = "pensum.abschreiben.handoff.v1";
export const HANDOFF_MAX_AGE = 10 * 60 * 1000;

export function makeHandoff(text, name = "Tafelbild", now = Date.now()) {
  return JSON.stringify({ text: String(text || ""), name: String(name || "Tafelbild"), at: now });
}

/** Liest eine Übergabe. Gibt { text, name } oder null zurück (leer, kaputt oder zu alt). */
export function readHandoff(raw, now = Date.now()) {
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (_) { return null; }
  if (!data || typeof data.text !== "string" || !data.text.trim()) return null;
  if (typeof data.at !== "number" || now - data.at > HANDOFF_MAX_AGE || data.at > now + 60_000) return null;
  return { text: data.text, name: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 80) : "Tafelbild" };
}

/** Dateiname-Vorschlag aus dem ersten Satz: erste Überschrift oder erste Zeile, sonst „Tafelbild“. */
export function suggestName(text) {
  const line = String(text || "").split("\n").map((l) => l.replace(/^#+\s*/, "").replace(/^[-*]\s+/, "").trim()).find((l) => l && !/^\[.*\]$/.test(l));
  if (!line) return "Tafelbild";
  const clean = line.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  return clean || "Tafelbild";
}
