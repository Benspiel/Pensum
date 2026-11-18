/* Videosuche für das Videos-Modul – Appwrite-Function.
 *
 * Sucht zu einem Thema Videos auf dem YouTube-Kanal „Lehrer Schmidt“ (YouTube Data API v3).
 * Der API-Schlüssel steht nur hier als geheime Umgebungsvariable YOUTUBE_API_KEY (nie im Repo, nie im Browser):
 *   appwrite functions create-variable --function-id lehrer-schmidt --key YOUTUBE_API_KEY --value <schlüssel> --secret true
 * Optional: CHANNEL_HANDLE (Standard "LehrerSchmidt") oder direkt CHANNEL_ID.
 * Nur angemeldete Personen dürfen aufrufen (execute: users); Appwrite setzt x-appwrite-user-id selbst.
 * Läuft ohne Abhängigkeiten, weil auf dem Server nur die Laufzeit node-16.0 aktiv ist. */
"use strict";
const http = require("http");
const https = require("https");
const { UserError, cleanTopic, mapResults, searchUrl, channelUrl, createCache } = require("./lib.js");

const results = createCache(6 * 60 * 60 * 1000);   // gleiche Suche: 6 Stunden aus dem Speicher
let channelId = process.env.CHANNEL_ID || null;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { accept: "application/json" } }, (r) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (c) => { data += c; });
      r.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) { /* leer */ }
        resolve({ status: r.statusCode, json });
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("Zeitüberschreitung")));
  });
}

function apiError(r) {
  const reason = r.json && r.json.error && r.json.error.errors && r.json.error.errors[0] && r.json.error.errors[0].reason;
  if (r.status === 403 && /quota/i.test(String(reason))) return new UserError("Heute wurden zu viele Videos gesucht. Versuch es morgen noch einmal.");
  return new Error("YouTube-API " + r.status + (reason ? " (" + reason + ")" : ""));
}

async function resolveChannel(key) {
  if (channelId) return channelId;
  const handle = (process.env.CHANNEL_HANDLE || "LehrerSchmidt").replace(/^@/, "");
  const r = await getJson(channelUrl({ handle, key }));
  if (r.status !== 200) throw apiError(r);
  const id = r.json && r.json.items && r.json.items[0] && r.json.items[0].id;
  if (!id) throw new Error("Kanal nicht gefunden: " + handle);
  channelId = id;
  return id;
}

/** Nur Konten mit bestätigter E-Mail-Adresse dürfen Funktionen mit Kosten nutzen (die Prüfung im Browser allein ließe sich umgehen). */
async function isVerified(key, userId) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const lib = base.protocol === "https:" ? https : http;
  const url = new URL(base.pathname.replace(/\/$/, "") + "/users/" + encodeURIComponent(userId), base);
  const r = await new Promise((resolve, reject) => {
    const req = lib.request(url, { method: "GET", headers: { "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID, "x-appwrite-key": key } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => { try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }); } catch (_) { resolve({ status: res.statusCode, json: null }); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("Zeitüberschreitung")));
    req.end();
  });
  return r.status === 200 && !!(r.json && r.json.emailVerification);
}

/** Einfache Obergrenze pro Person und Tag im Speicher der Function (setzt sich beim Neustart zurück, schützt vor Dauerfeuer eines einzelnen Kontos). */
const perDay = new Map();
function overLimit(userId, max) {
  const day = new Date().toISOString().slice(0, 10);
  if (perDay.size > 5000) perDay.clear();
  const cur = perDay.get(userId);
  const n = cur && cur.day === day ? cur.n + 1 : 1;
  perDay.set(userId, { day, n });
  return n > max;
}

module.exports = async ({ req, res, log, error }) => {
  const userId = req.headers["x-appwrite-user-id"];
  const appKey = req.headers["x-appwrite-key"];
  if (!userId || !appKey) return res.json({ ok: false, error: "Bitte melde dich an." }, 401);
  try {
    if (!(await isVerified(appKey, userId))) return res.json({ ok: false, error: "Bitte bestätige zuerst deine E-Mail-Adresse." }, 403);
  } catch (e) {
    error("Prüfung der E-Mail-Bestätigung fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Die Videosuche antwortet gerade nicht. Versuch es später noch einmal." }, 502);
  }
  if (overLimit(userId, 30)) return res.json({ ok: false, error: "Heute wurden schon viele Videos gesucht. Versuch es morgen noch einmal." }, 429);
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.json({ ok: false, error: "Die Videosuche ist noch nicht eingerichtet." }, 503);

  try {
    let body = {};
    try { body = JSON.parse(req.bodyText || req.body || "{}"); } catch (_) { throw new UserError("Ungültige Anfrage."); }
    const topic = cleanTopic(body.topic);
    if (topic.length < 2) throw new UserError("Gib ein Thema ein, z. B. „Satz des Pythagoras“.");

    const cacheKey = topic.toLowerCase();
    let list = results.get(cacheKey);
    if (!list) {
      const id = await resolveChannel(key);
      const r = await getJson(searchUrl({ topic, channelId: id, key }));
      if (r.status !== 200) throw apiError(r);
      list = mapResults(r.json);
      results.set(cacheKey, list);
    }
    return res.json({ ok: true, topic, results: list });
  } catch (e) {
    if (e instanceof UserError) return res.json({ ok: false, error: e.message }, 400);
    error("Videosuche fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Die Videosuche antwortet gerade nicht. Versuch es später noch einmal." }, 502);
  }
};
