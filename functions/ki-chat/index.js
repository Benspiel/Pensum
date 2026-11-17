/* KI-Chat – Appwrite-Function.
 *
 * Normale Chats mit Gemini, die pro Konto gespeichert werden (Tabellen chats und chat_messages).
 * Nur Mitglieder des Teams „ki-tester“ dürfen (wird hier serverseitig geprüft, nicht nur in der Oberfläche).
 * Der Gemini-Schlüssel steht nur hier als Umgebungsvariable GEMINI_API_KEY (nie im Repo, nie im Browser):
 *   appwrite functions create-variable --function-id ki-chat --key GEMINI_API_KEY --value <schlüssel> --secret true
 * Optional: GEMINI_MODEL (Standard gemini-3.5-flash-lite), KI_TESTER_TEAM (Standard ki-tester).
 * Der Schlüssel (x-appwrite-key) der Ausführung wird pro Aufruf erzeugt und gilt nur für die Rechte in appwrite.config.json. */
"use strict";
const http = require("http");
const https = require("https");
const { handle, UserError } = require("./lib.js");

const DATABASE_ID = "pensum";
const T_CHATS = "chats";
const T_MESSAGES = "chat_messages";

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
  return async (method, path, body, query) => {
    const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
    if (query) for (const item of query) url.searchParams.append("queries[]", item);
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

const qEqual = (attribute, values) => JSON.stringify({ method: "equal", attribute, values });
const qLimit = (n) => JSON.stringify({ method: "limit", values: [n] });
const qOrder = (method, attribute) => JSON.stringify({ method, attribute });

function database(key) {
  const api = appwrite(key);
  const chats = `/tablesdb/${DATABASE_ID}/tables/${T_CHATS}/rows`;
  const messages = `/tablesdb/${DATABASE_ID}/tables/${T_MESSAGES}/rows`;
  const own = (userId) => [`read("user:${userId}")`];
  return {
    async getChat(id) { return api("GET", `${chats}/${id}`); },
    async countChats(userId) {
      const r = await api("GET", chats, undefined, [qEqual("userId", [userId]), qLimit(1)]);
      return r ? r.total || 0 : 0;
    },
    async createChat(userId, title) {
      return api("POST", chats, { rowId: "unique()", data: { userId, title }, permissions: own(userId) });
    },
    // Appwrite lehnt ein leeres Update ab: den Titel unverändert mitschicken, das setzt $updatedAt neu.
    async renameChat(id, title) { return api("PATCH", `${chats}/${id}`, { data: { title } }); },
    async touchChat(id, title) { return api("PATCH", `${chats}/${id}`, { data: { title } }); },
    async addMessage(userId, chatId, role, text) {
      return api("POST", messages, { rowId: "unique()", data: { userId, chatId, role, text }, permissions: own(userId) });
    },
    async recentMessages(chatId) {
      const r = await api("GET", messages, undefined, [qEqual("chatId", [chatId]), qOrder("orderDesc", "$createdAt"), qLimit(60)]);
      return ((r && r.rows) || []).reverse().map((m) => ({ role: m.role, text: m.text }));
    },
    async deleteChat(id) {
      for (let i = 0; i < 100; i++) { // Nachrichten seitenweise löschen, dann den Chat
        const r = await api("GET", messages, undefined, [qEqual("chatId", [id]), qLimit(100)]);
        const rows = (r && r.rows) || [];
        if (!rows.length) break;
        for (const m of rows) await api("DELETE", `${messages}/${m.$id}`);
      }
      await api("DELETE", `${chats}/${id}`);
    },
    /** Ist die Person bestätigtes Mitglied im Team? */
    async isMember(userId) {
      const team = process.env.KI_TESTER_TEAM || "ki-tester";
      const r = await api("GET", `/users/${encodeURIComponent(userId)}/memberships`);
      return !!(r && (r.memberships || []).some((m) => m.teamId === team && m.confirm !== false));
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_WAIT = [2500, 6000]; // bei Überlastung (503) und Ratenlimit (429) bis zu zweimal nach Wartezeit neu versuchen

/** opts: { image?: { mime, data } }. Gibt den Antworttext zurück. */
async function gemini(system, turns, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("GEMINI_API_KEY fehlt"), { setup: true });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t, i) => ({
      role: t.role,
      parts: i === turns.length - 1 && opts.image
        ? [{ inlineData: { mimeType: opts.image.mime, data: opts.image.data } }, { text: t.text }]
        : [{ text: t.text }],
    })),
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };

  let r;
  for (let attempt = 0; ; attempt++) {
    r = await request(https, url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey } }, body, 35000);
    if ((r.status !== 503 && r.status !== 429) || attempt >= RETRY_WAIT.length) break;
    await sleep(RETRY_WAIT[attempt]);
  }

  if (r.status === 503 || r.status === 429) throw new UserError("Die KI ist gerade überlastet. Probier es in ein paar Minuten noch einmal.", 503, "busy");
  if (r.status !== 200) throw new Error(`Gemini ${r.status}: ${(r.json && r.json.error && r.json.error.message) || "keine Antwort"}`);
  const cand = r.json && r.json.candidates && r.json.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || "").join("") : "";
  if (!text) throw new UserError("Dazu kann die KI nichts sagen. Formuliere die Frage anders.", 422, "blocked");
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

  const db = database(key);
  const result = await handle({ body, userId }, {
    db,
    gemini,
    isMember: (id) => db.isMember(id),
    log,
    error: (m) => error(String(m)),
  });
  return res.json(result.json, result.status);
};
