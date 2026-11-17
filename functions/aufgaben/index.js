/* Aufgaben – Appwrite-Function.
 *
 * Schickt das Foto eines Arbeitsblatts an Gemini und gibt die Antworten samt Schreibfeldern zurück. Erzwingt das Tageslimit (2 Läufe pro Konto).
 * Das Bild wird nicht gespeichert, nur der Zähler pro Konto und Tag.
 * Der Gemini-Schlüssel steht nur hier als Umgebungsvariable GEMINI_API_KEY (nie im Repo, nie im Browser):
 *   appwrite functions create-variable --function-id aufgaben --key GEMINI_API_KEY --value <schlüssel> --secret true
 * Optional: GEMINI_MODEL (Standard gemini-3.5-flash-lite).
 * Der Schlüssel (x-appwrite-key) der Ausführung wird pro Aufruf erzeugt und gilt nur für die Rechte in appwrite.config.json. */
"use strict";
const http = require("http");
const https = require("https");
const { handle, UserError } = require("./lib.js");

const DATABASE_ID = "pensum";
const T_USAGE = "aufgaben_usage";

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
  const rows = `/tablesdb/${DATABASE_ID}/tables/${T_USAGE}/rows`;
  const pick = (r) => (r ? { runs: r.runs || 0 } : null);
  return {
    async getUsage(id) { return pick(await api("GET", `${rows}/${id}`)); },
    async ensureUsage(id, data) {
      try {
        await api("POST", rows, { rowId: id, data: { ...data, runs: 0 }, permissions: [] });
      } catch (e) {
        if (e.status !== 409) throw e; // gibt es schon
      }
    },
    // Atomar mit Obergrenze: Appwrite lehnt ab, wenn der Wert über max steigen würde.
    async increment(id, column, max) {
      return pick(await api("PATCH", `${rows}/${id}/${column}/increment`, { value: 1, max }));
    },
    async decrement(id, column) {
      return pick(await api("PATCH", `${rows}/${id}/${column}/decrement`, { value: 1, min: 0 }));
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_WAIT = [2500, 6000]; // bei Überlastung (503) und Ratenlimit (429) bis zu zweimal nach Wartezeit neu versuchen

async function gemini(system, userText, image) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("GEMINI_API_KEY fehlt"), { setup: true });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mime, data: image.data } }, { text: userText }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 },
  };

  let r;
  for (let attempt = 0; ; attempt++) {
    r = await request(https, url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey } }, body, 35000);
    if ((r.status !== 503 && r.status !== 429) || attempt >= RETRY_WAIT.length) break;
    await sleep(RETRY_WAIT[attempt]);
  }

  if (r.status === 503 || r.status === 429) throw new UserError("Die KI ist gerade überlastet. Probier es in ein paar Minuten noch einmal. Dieser Versuch wurde nicht gezählt.", 503, "busy");
  if (r.status !== 200) throw new Error(`Gemini ${r.status}: ${(r.json && r.json.error && r.json.error.message) || "keine Antwort"}`);
  const cand = r.json && r.json.candidates && r.json.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
  if (!text) throw new UserError("Dieses Bild kann die KI nicht lesen. Versuch ein anderes Foto. Dieser Versuch wurde nicht gezählt.", 422, "blocked");
  return text;
}

module.exports = async ({ req, res, log, error }) => {
  let body = req.bodyJson;
  if (!body || typeof body !== "object") {
    try { body = JSON.parse(typeof req.body === "string" ? req.body : req.bodyRaw || "{}"); } catch (_) { body = {}; }
  }
  const key = req.headers["x-appwrite-key"];
  const userId = req.headers["x-appwrite-user-id"];
  if (!key) return res.json({ ok: false, error: "Nicht angemeldet.", code: "auth" }, 401);

  const result = await handle({ body, userId }, {
    db: database(key),
    gemini,
    log,
    error: (m) => error(String(m)),
  });
  return res.json(result.json, result.status);
};
