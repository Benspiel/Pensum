/* Notenrechner – reine Rechenlogik ohne DOM und ohne Speicher (getestet in /tests/notenrechner.test.mjs).
 *
 * Zwei Notensysteme:
 *   "note"   – Noten 1–6 (Sek I), kleiner ist besser. Tendenzen: 2+ = 1,67 · 2− = 2,33.
 *   "punkte" – 0–15 Punkte (Oberstufe), größer ist besser.
 *
 * Umrechnung nach der üblichen KMK-Zuordnung: Note = (17 − Punkte) / 3,
 * also 15 P = 1+ (0,67), 14 P = 1, 11 P = 2, 8 P = 3, 5 P = 4, 2 P = 5, 1 P = 5− (5,33).
 * 0 Punkte sind die Note 6; zwischen 1 und 0 Punkten wird linear verbunden, damit die
 * Umrechnung in beide Richtungen stetig und umkehrbar bleibt.
 */

export const SYSTEMS = {
  note: { id: "note", label: "Noten 1–6", unit: "Note", min: 1, max: 6, best: 1, worst: 6, lowerIsBetter: true },
  punkte: { id: "punkte", label: "Punkte 0–15", unit: "Punkte", min: 0, max: 15, best: 15, worst: 0, lowerIsBetter: false },
};

const NOTE_MIN = 2 / 3;   // 1+ (entspricht 15 Punkten)
const NOTE_AT_ONE_POINT = 16 / 3;
const EPS = 1e-9;

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function pointsToNote(p) {
  if (!isNum(p)) return null;
  p = clamp(p, 0, 15);
  return p >= 1 ? (17 - p) / 3 : 6 - p * (6 - NOTE_AT_ONE_POINT);
}

export function noteToPoints(n) {
  if (!isNum(n)) return null;
  n = clamp(n, NOTE_MIN, 6);
  return n <= NOTE_AT_ONE_POINT ? 17 - 3 * n : (6 - n) / (6 - NOTE_AT_ONE_POINT);
}

/** Wert von einem System ins andere umrechnen. */
export function convert(value, from, to) {
  if (!isNum(value)) return null;
  if (from === to) return value;
  return from === "note" ? noteToPoints(value) : pointsToNote(value);
}

const parseNumber = (s) => (/^\d+(?:[.,]\d+)?$/.test(s) ? parseFloat(s.replace(",", ".")) : NaN);

/**
 * Eingabe einer Note prüfen.
 * @returns {{ ok: true, value: number } | { ok: false, empty?: boolean, error?: string }}
 */
export function parseGrade(input, system) {
  const s = String(input ?? "").trim();
  if (!s) return { ok: false, empty: true };
  if (system === "punkte") {
    const v = parseNumber(s);
    if (!isNum(v) || v < 0 || v > 15) return { ok: false, error: "Punkte zwischen 0 und 15 eingeben." };
    return { ok: true, value: v };
  }
  // Tendenz: 2+ ist ein Drittel besser, 2− ein Drittel schlechter
  const t = s.match(/^([1-6])\s*([+\-−–])$/);
  if (t) {
    const v = Number(t[1]) + (t[2] === "+" ? -1 / 3 : 1 / 3);
    if (v > 6 + EPS) return { ok: false, error: "Schlechter als 6 geht nicht." };
    return { ok: true, value: v };
  }
  const v = parseNumber(s);
  if (!isNum(v) || v < 1 || v > 6) return { ok: false, error: "Note zwischen 1 und 6 eingeben, z. B. 2 oder 2,3." };
  return { ok: true, value: v };
}

/** Gewichtung prüfen: Zahl von 0 bis 100 (0 = zählt nicht). */
export function parseWeight(input) {
  const s = String(input ?? "").trim().replace(/^[x×]\s*|\s*[x×]$/gi, "");
  if (!s) return { ok: false, empty: true };
  const v = parseNumber(s);
  if (!isNum(v) || v > 100) return { ok: false, error: "Gewichtung zwischen 0 und 100 eingeben." };
  return { ok: true, value: v };
}

/**
 * Gewichteter Durchschnitt. Ungültige Einträge werden übersprungen.
 * @param {{ value: number, weight: number }[]} items
 * @returns {number | null} null, wenn nichts zählt (keine Einträge oder Gewichtssumme 0)
 */
export function weightedAverage(items) {
  let sum = 0, weights = 0;
  for (const it of items || []) {
    if (!it || !isNum(it.value) || !isNum(it.weight) || it.weight <= 0) continue;
    sum += it.value * it.weight;
    weights += it.weight;
  }
  return weights > 0 ? sum / weights : null;
}

/** Noten eines Fachs (beliebig gemischt eingegeben) ins Zielsystem bringen. */
export function toSystem(grades, system) {
  return (grades || [])
    .map((g) => ({ value: convert(g.value, g.system || system, system), weight: g.weight }))
    .filter((g) => isNum(g.value) && isNum(g.weight));
}

/** Durchschnitt eines Fachs im gewünschten System. */
export const subjectAverage = (grades, system) => weightedAverage(toSystem(grades, system));

/** Gesamtdurchschnitt: Mittel der Fachdurchschnitte; Fächer ohne Noten zählen nicht. */
export function overallAverage(averages) {
  const valid = (averages || []).filter(isNum);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

/**
 * Zielnote: Welche Note braucht die nächste Arbeit, damit der Durchschnitt das Ziel erreicht?
 *
 * @param {{ grades: { value: number, weight: number }[], target: number, nextWeight: number, system: "note" | "punkte" }} p
 *        grades bereits im angegebenen System (siehe toSystem)
 * @returns {{ status: "invalid", error: string }
 *   | { status: "reachable", needed: number, practical: number }   practical: nächste eintragbare Note
 *   | { status: "guaranteed", needed: number }                     jede Note reicht
 *   | { status: "unreachable", needed: number, bestCase: number }} bestCase: Durchschnitt mit der Bestnote
 */
export function requiredGrade({ grades, target, nextWeight, system }) {
  const sys = SYSTEMS[system];
  if (!sys) return { status: "invalid", error: "Unbekanntes Notensystem." };
  if (!isNum(target) || target < sys.min || target > sys.max) {
    return { status: "invalid", error: `Wunsch-Durchschnitt zwischen ${sys.min} und ${sys.max} eingeben.` };
  }
  if (!isNum(nextWeight) || nextWeight <= 0) {
    return { status: "invalid", error: "Die Gewichtung der nächsten Arbeit muss größer als 0 sein." };
  }
  let sum = 0, weights = 0;
  for (const g of grades || []) {
    if (!g || !isNum(g.value) || !isNum(g.weight) || g.weight <= 0) continue;
    sum += g.value * g.weight;
    weights += g.weight;
  }
  const needed = (target * (weights + nextWeight) - sum) / nextWeight;
  const bestCase = (sum + sys.best * nextWeight) / (weights + nextWeight);

  if (sys.lowerIsBetter) {
    if (needed >= sys.worst - EPS) return { status: "guaranteed", needed };
    if (needed < sys.best - EPS) return { status: "unreachable", needed, bestCase };
    return { status: "reachable", needed, practical: Math.max(sys.best, Math.floor(needed * 10 + EPS) / 10) };
  }
  if (needed <= sys.worst + EPS) return { status: "guaranteed", needed };
  if (needed > sys.best + EPS) return { status: "unreachable", needed, bestCase };
  return { status: "reachable", needed, practical: Math.min(sys.best, Math.ceil(needed - EPS)) };
}

/* ---------- Darstellung ---------- */

const nf = (digits) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NF = [nf(0), nf(1), nf(2)];

/** Zahl deutsch formatieren (Komma), feste Nachkommastellen. */
export const formatNumber = (x, digits = 2) => (isNum(x) ? NF[digits].format(x) : "–");

/** Wert für ein Eingabefeld: so kurz wie möglich, höchstens zwei Nachkommastellen. */
export function formatInput(x) {
  if (!isNum(x)) return "";
  return String(Math.round(x * 100) / 100).replace(".", ",");
}

/** „2,33 (≙ 10,0 Punkte)“ – Gegenwert im anderen System. */
export function formatOther(value, system) {
  if (!isNum(value)) return "";
  return system === "note"
    ? `≙ ${formatNumber(noteToPoints(value), 1)} Punkte`
    : `≙ Note ${formatNumber(pointsToNote(value), 2)}`;
}

/* ---------- Schuljahr / Halbjahr ---------- */

/** Schuljahr eines Datums, z. B. "2026/27" (Wechsel am 1. August). */
export function schoolYearOf(date = new Date()) {
  const y = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Halbjahr eines Datums: August–Januar = 1, Februar–Juli = 2. */
export function halfOf(date = new Date()) {
  const m = date.getMonth();
  return m >= 7 || m === 0 ? 1 : 2;
}

/** Auswahlliste: vorhandene Schuljahre plus das laufende, das vorige und das nächste. */
export function schoolYearOptions(existing = [], date = new Date()) {
  const start = Number(schoolYearOf(date).slice(0, 4));
  const label = (y) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
  const set = new Set([label(start - 1), label(start), label(start + 1), ...existing.filter((s) => /^\d{4}\/\d{2}$/.test(s))]);
  return [...set].sort().reverse();
}
