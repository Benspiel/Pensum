/* Admin-Zahlen – reine Logik der Function (ohne Netzwerk, damit sie sich testen lässt). Läuft ohne Abhängigkeiten auf node-16.0. */
"use strict";

/** Tools, deren Besuche gezählt werden (Ordnername unter /tools/). */
const TOOLS = ["goodnotes", "notenrechner", "karteikarten", "planer", "abschreiben", "aufgaben", "mindmap", "kichat", "spiele", "videos"];
/** Tabellen, deren Zeilen unter „Inhalte“ gezählt werden: Anzeigename → Tabelle. */
const CONTENT = { decks: "decks", cards: "cards", mindmaps: "mindmaps", chats: "chats", messages: "chat_messages", planner: "planner", grades: "grades" };
const DAYS = 7;

/** Datum (JJJJ-MM-TT) in deutscher Zeit. */
function berlinDay(date = new Date()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
  catch (_) { return date.toISOString().slice(0, 10); }
}

/** Die letzten n Tage als JJJJ-MM-TT, ältester zuerst, heute zuletzt. */
function lastDays(n = DAYS, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(berlinDay(new Date(now.getTime() - i * 86400000)));
  return out;
}

const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** Fügt die Rohzahlen zur Antwort zusammen. Fehlt eine Zahl (Abfrage fehlgeschlagen), bleibt sie null statt 0. */
function buildStats(raw, now = new Date()) {
  const days = lastDays(DAYS, now);
  const series = days.map((day) => ({ day, count: num((raw.perDay || {})[day]) }));
  const byTool = TOOLS.map((tool) => {
    const t = (raw.byTool || {})[tool] || {};
    return { tool, total: num(t.total), last7: num(t.last7) };
  }).sort((a, b) => (b.last7 || 0) - (a.last7 || 0) || (b.total || 0) - (a.total || 0));
  const content = {};
  for (const key of Object.keys(CONTENT)) content[key] = num((raw.content || {})[key]);
  const teams = raw.teams || {};
  const users = raw.users || {};
  return {
    generatedAt: now.toISOString(),
    users: { total: num(users.total), verified: num(users.verified), new7: num(users.new7), active7: num(users.active7) },
    teams: { tester: num(teams.tester), kiTester: num(teams.kiTester), admin: num(teams.admin) },
    visits: { total: num(raw.visitsTotal), last7: num(raw.visits7), today: series[series.length - 1].count, series, byTool },
    content,
  };
}

/** Führt Aufgaben (Funktionen, die Promises liefern) höchstens `size` gleichzeitig aus. Ergebnisse in derselben Reihenfolge, Fehler werden zu null. */
async function inBatches(tasks, size = 8) {
  const out = new Array(tasks.length).fill(null);
  for (let i = 0; i < tasks.length; i += size) {
    await Promise.all(tasks.slice(i, i + size).map(async (task, j) => { try { out[i + j] = await task(); } catch (_) { out[i + j] = null; } }));
  }
  return out;
}

/** Wer hat welches Tool genutzt? users: [{ id, name, email, accessedAt }], visits: [{ userId, tool, day }].
 *  Ergebnis: Personen mit Aufrufen je Tool, mehr Aufrufe zuerst; Aufrufe unbekannter Tools oder gelöschter Konten werden übergangen. */
function aggregatePeople(users, visits) {
  const byId = new Map();
  for (const u of users || []) {
    byId.set(u.id, { id: u.id, name: String(u.name || "").slice(0, 80), email: String(u.email || "").slice(0, 120), lastSeen: u.accessedAt || null, total: 0, lastDay: null, tools: {} });
  }
  for (const v of visits || []) {
    const p = byId.get(v.userId);
    if (!p || !TOOLS.includes(v.tool)) continue;
    p.total++;
    p.tools[v.tool] = (p.tools[v.tool] || 0) + 1;
    if (typeof v.day === "string" && (!p.lastDay || v.day > p.lastDay)) p.lastDay = v.day;
  }
  return [...byId.values()].filter((p) => p.total > 0).sort((a, b) => b.total - a.total || String(b.lastDay).localeCompare(String(a.lastDay)));
}

module.exports = { TOOLS, CONTENT, DAYS, berlinDay, lastDays, buildStats, inBatches, aggregatePeople };
