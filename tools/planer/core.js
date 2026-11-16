/* Planer – reine Logik (Datum, Gruppen, Beschriftungen), ohne Oberfläche und deshalb testbar.
 *
 * Eintrag: { id, kind: "task" | "exam", title, subject, date: "JJJJ-MM-TT" oder "", note, done, deckId }
 *   task = Hausaufgabe (date = Fälligkeit), exam = Klausur (date = Termin, deckId = verknüpfter Karteikarten-Stapel).
 * Alle Daten sind lokale Kalendertage als Text, so gibt es keine Zeitzonen-Fehler. */
export const MAX_ITEMS = 500;

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_SHORT = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

/** Tage seit 1970 für einen Text „JJJJ-MM-TT“, sonst null (auch bei Daten wie 31.02.). */
export function parseDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}

export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Tage von today bis iso (negativ = vorbei), null ohne gültiges Datum. */
export function daysUntil(iso, today) {
  const a = parseDay(iso), b = parseDay(today);
  return a == null || b == null ? null : a - b;
}

export function formatDate(iso, today) {
  const n = parseDay(iso);
  if (n == null) return "";
  const [y, m, d] = iso.split("-");
  const wd = DAY_SHORT[(n + 4) % 7];
  const sameYear = today && String(today).slice(0, 4) === y;
  return sameYear ? `${wd} ${d}.${m}.` : `${wd} ${d}.${m}.${y}`;
}

/** Beschriftung der Fälligkeit einer Hausaufgabe. */
export function dueLabel(iso, today) {
  const diff = daysUntil(iso, today);
  if (diff == null) return "Ohne Datum";
  if (diff < -1) return `${-diff} Tage überfällig`;
  if (diff === -1) return "Gestern fällig";
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === 2) return "Übermorgen";
  if (diff < 7) return DAY_NAMES[(parseDay(iso) + 4) % 7];
  return formatDate(iso, today);
}

/** Countdown bei Klausuren. */
export function examCountdown(iso, today) {
  const diff = daysUntil(iso, today);
  if (diff == null) return { big: "?", small: "kein Datum", state: "none" };
  if (diff < 0) return { big: "✓", small: "vorbei", state: "past" };
  if (diff === 0) return { big: "Heute", small: "schreibst du", state: "today" };
  if (diff === 1) return { big: "Morgen", small: "schreibst du", state: "soon" };
  return { big: String(diff), small: "Tage noch", state: diff <= 7 ? "soon" : "later" };
}

/** Offene Hausaufgaben nach Dringlichkeit gruppieren (leere Gruppen fallen weg). */
export function groupTasks(tasks, today) {
  const open = tasks.filter((t) => !t.done);
  const byDate = (a, b) => (parseDay(a.date) ?? Infinity) - (parseDay(b.date) ?? Infinity);
  const groups = [
    { key: "overdue", label: "Überfällig", test: (d) => d != null && d < 0 },
    { key: "today", label: "Heute", test: (d) => d === 0 },
    { key: "week", label: "Diese Woche", test: (d) => d != null && d >= 1 && d <= 7 },
    { key: "later", label: "Später", test: (d) => d != null && d > 7 },
    { key: "none", label: "Ohne Datum", test: (d) => d == null },
  ];
  return groups
    .map((g) => ({ key: g.key, label: g.label, items: open.filter((t) => g.test(daysUntil(t.date, today))).sort(byDate) }))
    .filter((g) => g.items.length);
}

/** Klausuren: kommende nach Datum, vergangene getrennt (neueste zuerst). */
export function splitExams(exams, today) {
  const upcoming = [], past = [];
  for (const e of exams) (daysUntil(e.date, today) != null && daysUntil(e.date, today) < 0 ? past : upcoming).push(e);
  const key = (e) => parseDay(e.date) ?? Infinity;
  upcoming.sort((a, b) => key(a) - key(b));
  past.sort((a, b) => key(b) - key(a));
  return { upcoming, past };
}

/** Kennzahlen für den Kopf der Seite. */
export function stats(items, today) {
  const tasks = items.filter((i) => i.kind === "task");
  const exams = items.filter((i) => i.kind === "exam");
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => { const d = daysUntil(t.date, today); return d != null && d < 0; }).length;
  const dueToday = open.filter((t) => daysUntil(t.date, today) === 0).length;
  const next = splitExams(exams, today).upcoming.find((e) => daysUntil(e.date, today) != null) || null;
  return { open: open.length, overdue, dueToday, nextExam: next, nextExamDays: next ? daysUntil(next.date, today) : null };
}

/** Fächer, die schon vorkommen (für die Vorschlagsliste im Formular). */
export function usedSubjects(items) {
  return [...new Set(items.map((i) => i.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}
