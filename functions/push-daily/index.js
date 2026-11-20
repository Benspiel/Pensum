/* Push-Erinnerungen – Appwrite-Function, läuft stündlich nach Zeitplan (appwrite.config.json: schedule).
 *
 * Liest aus `push_devices` die Geräte, deren gewählte Stunde (Europe/Berlin) gerade ist, und sendet über Appwrite Messaging (Anbieter „Pensum Apple“, APNs)
 * eine kurze Erinnerung (Karteikarten lernen / tägliche Mindmap). Nie Inhalte der Tools; die Nachricht ist ein fester Text.
 * Abgelaufene Push-Ziele markiert Appwrite selbst.
 * Läuft ohne Abhängigkeiten (Laufzeit node-16.0, daher kein fetch). Der Schlüssel (x-appwrite-key) gilt nur für die Rechte in appwrite.config.json. */
"use strict";
const http = require("http");
const https = require("https");
const { berlinHour, groupsFor, chunk } = require("./lib.js");

const DATABASE_ID = "pensum";
const TABLE = "push_devices";
const MAX_PAGES = 50; // höchstens 5000 Geräte je Stunde

function request(url, { method = "GET", headers = {}, body } = {}) {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers }, (r) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (c) => { data += c; });
      r.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) { /* leer */ }
        if (r.statusCode >= 400 && r.statusCode !== 404) return reject(Object.assign(new Error((json && json.message) || "HTTP " + r.statusCode), { status: r.statusCode }));
        resolve(json);
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Zeitüberschreitung")));
    if (body) req.write(body);
    req.end();
  });
}

function appwrite(key) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const headers = { "content-type": "application/json", "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID, "x-appwrite-key": key };
  return (method, path, queries, body) => {
    const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
    for (const q of queries || []) url.searchParams.append("queries[]", q);
    return request(url, { method, headers, body });
  };
}

const q = (method, attribute, values) => JSON.stringify({ method, attribute, values });

async function devicesFor(api, hour) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const queries = [
      JSON.stringify({ method: "or", values: [
        { method: "and", values: [q("equal", "cards", [true]), q("equal", "cardsHour", [hour])].map((s) => JSON.parse(s)) },
        { method: "and", values: [q("equal", "mindmap", [true]), q("equal", "mindmapHour", [hour])].map((s) => JSON.parse(s)) },
      ] }),
      JSON.stringify({ method: "limit", values: [100] }),
    ];
    if (cursor) queries.push(JSON.stringify({ method: "cursorAfter", values: [cursor] }));
    const r = await api("GET", `/tablesdb/${DATABASE_ID}/tables/${TABLE}/rows`, queries);
    const list = (r && r.rows) || [];
    rows.push(...list);
    if (list.length < 100) break;
    cursor = list[list.length - 1].$id;
  }
  return rows;
}

module.exports = async ({ req, res, log, error }) => {
  const key = req.headers["x-appwrite-key"];
  if (!key) return res.json({ ok: false, error: "Kein Schlüssel." }, 401);
  const api = appwrite(key);
  const hour = berlinHour(new Date());

  try {
    const groups = groupsFor(await devicesFor(api, hour), hour, { ai: process.env.AI_ENABLED === "true" });
    let sent = 0;
    for (const g of groups) {
      for (const part of chunk(g.targets, 100)) {
        const body = JSON.stringify({ messageId: "unique()", title: g.title, body: g.body, targets: part, data: { topic: g.topic }, sound: "default", priority: "high" });
        await api("POST", "/messaging/messages/push", [], body);
        sent += part.length;
      }
    }
    log(`Stunde ${hour}: ${sent} Geräte benachrichtigt.`);
    return res.json({ ok: true, hour, sent });
  } catch (e) {
    error("Versand fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Der Versand ist fehlgeschlagen." }, 502);
  }
};
