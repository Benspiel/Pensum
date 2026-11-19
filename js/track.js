/* Besuchszähler: Zählt, wie oft ein Tool geöffnet wird (Tabelle tool_visits), damit das Modul „Team“ (tools/admin) es anzeigen kann.
 * Gezählt wird nur mit Konto (Gäste haben kein Konto, in das man schreiben könnte), höchstens einmal je Tool und halbe Stunde und Tab.
 * Gespeichert werden Konto-ID, Tool und Tag. Keine Inhalte. Die Zeile gehört der Person, ausgelesen werden nur Summen (functions/admin-stats). */

const WINDOW_MS = 30 * 60 * 1000;

/** Tool-ID aus dem Pfad: /tools/notenrechner/ → "notenrechner". Das Admin-Modul selbst zählt nicht mit. */
export function toolFromPath(pathname) {
  const m = /^\/tools\/([a-z0-9-]+)\//.exec(String(pathname || ""));
  return m && m[1] !== "admin" ? m[1] : null;
}

/** Heutiges Datum (JJJJ-MM-TT) in deutscher Zeit, wie in den Functions. */
export function berlinDay(date = new Date()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
  catch (_) { return date.toISOString().slice(0, 10); }
}

/** Soll jetzt gezählt werden? last = Zeitpunkt der letzten Zählung (ms) oder null. */
export const shouldCount = (last, now = Date.now()) => !Number.isFinite(last) || last === null || now - last >= WINDOW_MS;

export async function trackToolVisit() {
  const tool = toolFromPath(location.pathname);
  if (!tool) return;
  const key = "pensum.visit." + tool;
  let last = null;
  try { const v = sessionStorage.getItem(key); last = v ? Number(v) : null; } catch (_) { /* egal */ }
  if (!shouldCount(last)) return;

  const [{ onAuthChange }, { tablesDB, databaseId, tableIds, ID, ownerPermissions }] = await Promise.all([import("/js/auth.js"), import("/js/db.js")]);
  let done = false;
  onAuthChange(({ status, user }) => {
    if (done || status !== "ready" || !user) return;
    done = true;
    try { sessionStorage.setItem(key, String(Date.now())); } catch (_) { /* egal */ }
    tablesDB.createRow({
      databaseId, tableId: tableIds.toolVisits, rowId: ID.unique(),
      data: { userId: user.$id, tool, day: berlinDay() }, permissions: ownerPermissions(user.$id),
    }).catch(() => { /* Zählen ist nie wichtiger als das Tool */ });
  });
}
