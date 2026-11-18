/* Mindmap-Generator – Appwrite-Function.
 *
 * Ruft Gemini auf und erzwingt die Tageslimits (1 Mindmap, 3 KI-Änderungen pro Nutzer).
 * Der Gemini-Schlüssel steht nur hier als Umgebungsvariable GEMINI_API_KEY (nie im Repo, nie im Browser):
 *   appwrite functions create-variable --function-id mindmap --key GEMINI_API_KEY --value <schlüssel> --secret true
 * Optional: GEMINI_MODEL (Standard gemini-3.5-flash-lite).
 * Der Schlüssel (x-appwrite-key) der Ausführung wird pro Aufruf erzeugt und gilt nur für die Rechte in appwrite.config.json. */
"use strict";
const http = require("http");
const https = require("https");
const { handle, UserError } = require("./lib.js");

const DATABASE_ID = "pensum";
const T_MAPS = "mindmaps";
const T_USAGE = "mindmap_usage";

function request(lib, url, options, body, timeout) {
  return new Promise((resolve, reject) => {
    const req = lib.request(url, options, (r) => {
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
    req.setTimeout(timeout, () => req.destroy(new Error("Zeitüberschreitung")));
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Appwrite-REST mit dem Schlüssel dieser Ausführung. 404 ergibt null, andere Fehler werfen. */
function appwrite(key) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const lib = base.protocol === "https:" ? https : http;
  return async (method, path, body) => {
    const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
    const r = await request(lib, url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID,
        "x-appwrite-key": key,
      },
    }, body, 20000);
    if (r.status === 404) return null;
    if (r.status >= 400) {
      const err = new Error((r.json && r.json.message) || "HTTP " + r.status);
      err.status = r.status;
      throw err;
    }
    return r.json;
  };
}

function database(key) {
  const api = appwrite(key);
  const rows = (table) => `/tablesdb/${DATABASE_ID}/tables/${table}/rows`;
  const pick = (r) => (r ? { created: r.created || 0, edits: r.edits || 0 } : null);
  return {
    async getUsage(id) { return pick(await api("GET", `${rows(T_USAGE)}/${id}`)); },
    async ensureUsage(id, data) {
      try {
        await api("POST", rows(T_USAGE), { rowId: id, data: { ...data, created: 0, edits: 0 }, permissions: [] });
      } catch (e) {
        if (e.status !== 409) throw e; // gibt es schon
      }
    },
    // Atomar mit Obergrenze: Appwrite lehnt ab, wenn der Wert über max steigen würde.
    async increment(id, column, max) {
      return pick(await api("PATCH", `${rows(T_USAGE)}/${id}/${column}/increment`, { value: 1, max }));
    },
    async decrement(id, column) {
      return pick(await api("PATCH", `${rows(T_USAGE)}/${id}/${column}/decrement`, { value: 1, min: 0 }));
    },
    async createMap(id, data, userId) {
      const own = `user:${userId}`;
      await api("POST", rows(T_MAPS), {
        rowId: id,
        data,
        permissions: [`read("${own}")`, `update("${own}")`, `delete("${own}")`],
      });
    },
  };
}

async function gemini(system, user) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("GEMINI_API_KEY fehlt"), { setup: true });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const r = await request(https, new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`), {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
  }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.5, maxOutputTokens: 8192 },
  }, 50000);

  if (r.status === 429) throw new UserError("Die KI ist gerade ausgelastet. Probier es in ein paar Minuten noch einmal. Dieser Versuch wurde nicht gezählt.", 503, "busy");
  if (r.status !== 200) throw new Error(`Gemini ${r.status}: ${(r.json && r.json.error && r.json.error.message) || "keine Antwort"}`);
  const cand = r.json && r.json.candidates && r.json.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
  if (!text) throw new UserError("Dazu kann die KI keine Mindmap erstellen. Versuch ein anderes Thema. Dieser Versuch wurde nicht gezählt.", 422, "blocked");
  return text;
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

module.exports = async ({ req, res, log, error }) => {
  let body = req.bodyJson;
  if (!body || typeof body !== "object") {
    try { body = JSON.parse(typeof req.body === "string" ? req.body : req.bodyRaw || "{}"); } catch (_) { body = {}; }
  }
  const key = req.headers["x-appwrite-key"];
  const userId = req.headers["x-appwrite-user-id"];
  if (!key) return res.json({ ok: false, error: "Nicht angemeldet.", code: "auth" }, 401);
  try {
    if (!userId || !(await isVerified(key, userId))) return res.json({ ok: false, error: "Bitte bestätige zuerst deine E-Mail-Adresse.", code: "unverified" }, 403);
  } catch (e) {
    error("Prüfung der E-Mail-Bestätigung fehlgeschlagen: " + e.message);
    return res.json({ ok: false, error: "Der Dienst antwortet gerade nicht. Versuch es später noch einmal.", code: "error" }, 502);
  }

  const result = await handle({ body, userId }, {
    db: database(key),
    gemini,
    log,
    error: (m) => error(String(m)),
  });
  return res.json(result.json, result.status);
};
