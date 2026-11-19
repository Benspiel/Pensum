/* Admin-Zahlen – Appwrite-Function für das Modul „Team“ (tools/admin).
 *
 * Liefert Summen über die ganze Plattform (Nutzer, Besuche je Tool, angelegte Inhalte) und mit action „people“ die Liste, wer welches Tool geöffnet hat
 * (Name, E-Mail, Aufrufe je Tool der letzten 30 Tage). Nie Inhalte der Tools.
 * Nur Mitglieder des Teams „admin“ dürfen: Das prüft diese Function selbst (x-appwrite-user-id setzt Appwrite aus der Session).
 * Optional: ADMIN_TEAM (Standard admin). Der Schlüssel (x-appwrite-key) wird pro Aufruf erzeugt und gilt nur für die Rechte in appwrite.config.json. */
"use strict";
const http = require("http");
const https = require("https");
const { TOOLS, CONTENT, lastDays, buildStats, inBatches, aggregatePeople } = require("./lib.js");

const DATABASE_ID = "pensum";

function appwrite(key) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const lib = base.protocol === "https:" ? https : http;
  return (path, queries) => new Promise((resolve, reject) => {
    const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
    for (const q of queries || []) url.searchParams.append("queries[]", q);
    const req = lib.request(url, { method: "GET", headers: { "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID, "x-appwrite-key": key } }, (r) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (c) => { data += c; });
      r.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) { /* leer */ }
        if (r.statusCode >= 400) return reject(Object.assign(new Error((json && json.message) || "HTTP " + r.statusCode), { status: r.statusCode }));
        resolve(json);
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("Zeitüberschreitung")));
    req.end();
  });
}

const PEOPLE_DAYS = 30;     // Zeitraum der Auswertung „Wer nutzt was“
const MAX_USERS = 1000;     // Obergrenze beim Lesen der Konten
const MAX_VISIT_PAGES = 50; // höchstens 5000 Aufrufe lesen

/** Alle Seiten einer Liste lesen (je 100, mit Cursor), höchstens maxPages. */
async function listAll(api, path, key, baseQueries, maxPages) {
  const out = [];
  let cursor = null, truncated = false;
  for (let page = 0; ; page++) {
    if (page >= maxPages) { truncated = true; break; }
    const queries = [...baseQueries, JSON.stringify({ method: "limit", values: [100] })];
    if (cursor) queries.push(JSON.stringify({ method: "cursorAfter", values: [cursor] }));
    const r = await api(path, queries);
    const rows = (r && r[key]) || [];
    out.push(...rows);
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].$id;
  }
  return { rows: out, truncated };
}

const q = (method, attribute, values) => JSON.stringify({ method, attribute, values });
const limit1 = JSON.stringify({ method: "limit", values: [1] });

module.exports = async ({ req, res, log, error }) => {
  const userId = req.headers["x-appwrite-user-id"];
  const key = req.headers["x-appwrite-key"];
  if (!userId || !key) return res.json({ ok: false, error: "Nicht angemeldet.", code: "auth" }, 401);
  const api = appwrite(key);

  try {
    const team = process.env.ADMIN_TEAM || "admin";
    const m = await api(`/users/${encodeURIComponent(userId)}/memberships`);
    if (!(m && (m.memberships || []).some((x) => x.teamId === team && x.confirm !== false))) return res.json({ ok: false, error: "Nur für das Team „Admin“.", code: "denied" }, 403);
  } catch (e) {
    error("Teamprüfung fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Der Dienst antwortet gerade nicht.", code: "error" }, 502);
  }

  let body = req.bodyJson;
  if (!body || typeof body !== "object") {
    try { body = JSON.parse(typeof req.body === "string" ? req.body : req.bodyRaw || "{}"); } catch (_) { body = {}; }
  }

  if (body && body.action === "people") {
    try {
      const since = lastDays(PEOPLE_DAYS)[0];
      const [u, v] = await Promise.all([
        listAll(api, "/users", "users", [], MAX_USERS / 100),
        listAll(api, `/tablesdb/${DATABASE_ID}/tables/tool_visits/rows`, "rows", [q("greaterThanEqual", "day", [since])], MAX_VISIT_PAGES),
      ]);
      const users = u.rows.map((x) => ({ id: x.$id, name: x.name, email: x.email, accessedAt: x.accessedAt }));
      const people = aggregatePeople(users, v.rows.map((r) => ({ userId: r.userId, tool: r.tool, day: r.day })));
      return res.json({ ok: true, people: { days: PEOPLE_DAYS, truncated: v.truncated || u.truncated, list: people } });
    } catch (e) {
      error("Wer nutzt was fehlgeschlagen: " + e.message);
      return res.json({ ok: false, error: "Die Nutzerliste konnte nicht geladen werden.", code: "error" }, 500);
    }
  }

  try {
    const days = lastDays();
    const since = days[0];
    const since7Iso = new Date(Date.now() - 7 * 86400000).toISOString();
    const table = (t) => `/tablesdb/${DATABASE_ID}/tables/${t}/rows`;
    const total = async (path, queries) => { const r = await api(path, [...(queries || []), limit1]); return r ? r.total : null; };

    // Jede Zahl ist eine eigene kleine Abfrage; eine fehlgeschlagene wird zu null (die Oberfläche zeigt „–“) und bricht nichts ab.
    const jobs = [];
    const slot = (name, fn) => { jobs.push({ name, fn }); };
    slot("users.total", () => total("/users"));
    slot("users.verified", () => total("/users", [q("equal", "emailVerification", [true])]));
    slot("users.new7", () => total("/users", [q("greaterThanEqual", "$createdAt", [since7Iso])]));
    slot("users.active7", () => total("/users", [q("greaterThanEqual", "accessedAt", [since7Iso])]));
    for (const t of ["tester", "ki-tester", "admin"]) slot("team." + t, async () => { const r = await api(`/teams/${t}`); return r ? r.total : null; });
    slot("visits.total", () => total(table("tool_visits")));
    slot("visits.last7", () => total(table("tool_visits"), [q("greaterThanEqual", "day", [since])]));
    for (const d of days) slot("day." + d, () => total(table("tool_visits"), [q("equal", "day", [d])]));
    for (const t of TOOLS) {
      slot("tool." + t + ".total", () => total(table("tool_visits"), [q("equal", "tool", [t])]));
      slot("tool." + t + ".last7", () => total(table("tool_visits"), [q("equal", "tool", [t]), q("greaterThanEqual", "day", [since])]));
    }
    for (const [name, t] of Object.entries(CONTENT)) slot("content." + name, () => total(table(t)));

    const values = await inBatches(jobs.map((j) => j.fn));
    const v = {};
    jobs.forEach((j, i) => { v[j.name] = values[i]; });

    const raw = {
      users: { total: v["users.total"], verified: v["users.verified"], new7: v["users.new7"], active7: v["users.active7"] },
      teams: { tester: v["team.tester"], kiTester: v["team.ki-tester"], admin: v["team.admin"] },
      visitsTotal: v["visits.total"], visits7: v["visits.last7"],
      perDay: Object.fromEntries(days.map((d) => [d, v["day." + d]])),
      byTool: Object.fromEntries(TOOLS.map((t) => [t, { total: v["tool." + t + ".total"], last7: v["tool." + t + ".last7"] }])),
      content: Object.fromEntries(Object.keys(CONTENT).map((k) => [k, v["content." + k]])),
    };
    const failed = jobs.filter((_, i) => values[i] === null).map((j) => j.name);
    if (failed.length) log("Nicht lesbar: " + failed.join(", "));
    return res.json({ ok: true, stats: buildStats(raw) });
  } catch (e) {
    error("Zahlen lesen fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Die Zahlen konnten nicht geladen werden.", code: "error" }, 500);
  }
};
