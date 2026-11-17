/* Verknüpft ein Google-Konto mit einem bestehenden Pensum-Konto.
 *
 * Warum eine Function: Pensum und Appwrite liegen auf verschiedenen Domains, Safari blockiert dann die
 * Cookies, mit denen Appwrite beim Google-Login ein angemeldetes Konto erkennen würde. Appwrite legt
 * deshalb ein eigenes Google-Konto (B) an. Diese Function merkt sich in der Tabelle google_links,
 * dass B zum Pensum-Konto A gehört (Zeilen-ID = B, userId = A), und tauscht beim Google-Login
 * die Session von B gegen eine für A.
 *
 * Aktionen (Body: { action, jwt? }). Wer aufruft, bestimmt allein der Server (x-appwrite-user-id):
 *  - link:    Aufrufer ist B (frisch über Google angemeldet), jwt gehört zu A. Beides ist damit bewiesen.
 *  - resolve: Aufrufer ist B. Ist B verknüpft, kommt ein Einmal-Token für A zurück.
 *  - status:  Aufrufer ist A. Liefert, ob und mit welcher Google-Adresse verknüpft.
 *  - unlink:  Aufrufer ist A. Löscht die Verknüpfung.
 * Läuft ohne Abhängigkeiten (Laufzeit node-16.0, kein fetch). */
const http = require("http");
const https = require("https");

const DB = "pensum";
const TABLE = "google_links";
const rowsPath = `/tablesdb/${DB}/tables/${TABLE}/rows`;

function call(method, path, headers = {}, body) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const lib = base.protocol === "https:" ? https : http;
  const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method,
      headers: { "content-type": "application/json", "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID, ...headers },
    }, (r) => {
      let data = "";
      r.on("data", (c) => { data += c; });
      r.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) { /* leer */ }
        if (r.statusCode >= 400 && r.statusCode !== 404) {
          const err = new Error((json && json.message) || `HTTP ${r.statusCode}`);
          err.status = r.statusCode;
          return reject(err);
        }
        resolve(r.statusCode === 404 ? null : json);
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Zeitüberschreitung")));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const query = (q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`;

module.exports = async ({ req, res, log, error }) => {
  const callerId = req.headers["x-appwrite-user-id"];
  const key = req.headers["x-appwrite-key"];
  if (!callerId || !key) return res.json({ ok: false, error: "Nicht angemeldet." }, 401);
  const k = { "x-appwrite-key": key };

  let body = req.bodyJson || req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  const token = async (userId) => call("POST", `/users/${encodeURIComponent(userId)}/tokens`, k, {});
  const rowOf = (googleUserId) => call("GET", `${rowsPath}/${encodeURIComponent(googleUserId)}`, k);
  const rowsOfUser = async (userId) => ((await call("GET", `${rowsPath}?${query({ method: "equal", attribute: "userId", values: [userId] })}`, k)) || {}).rows || [];

  try {
    if (body.action === "resolve") {
      const row = await rowOf(callerId);
      if (!row || !row.userId) return res.json({ ok: true, linked: false });
      const t = await token(row.userId);
      if (!t || !t.secret) { // Pensum-Konto gibt es nicht mehr: Verknüpfung aufräumen
        await call("DELETE", `${rowsPath}/${encodeURIComponent(callerId)}`, k);
        return res.json({ ok: true, linked: false });
      }
      return res.json({ ok: true, linked: true, userId: t.userId, secret: t.secret });
    }

    if (body.action === "link") {
      const jwt = String(body.jwt || "");
      if (!jwt) return res.json({ ok: false, error: "Bitte melde dich neu an und versuch es noch einmal." }, 400);
      const me = await call("GET", "/account", { "x-appwrite-jwt": jwt });
      if (!me || !me.$id) return res.json({ ok: false, error: "Die Anmeldung ist abgelaufen. Versuch es noch einmal." }, 401);
      const target = me.$id;
      if (target === callerId) return res.json({ ok: true, linked: true, same: true });

      const ids = await call("GET", `/users/${encodeURIComponent(callerId)}/identities`, k);
      if (!((ids && ids.identities) || []).some((i) => i.provider === "google")) {
        return res.json({ ok: false, error: "Das war keine Google-Anmeldung." }, 400);
      }
      const existing = await rowOf(callerId);
      if (existing && existing.userId && existing.userId !== target) {
        return res.json({ ok: false, error: "Dieses Google-Konto ist schon mit einem anderen Pensum-Konto verbunden." }, 409);
      }
      for (const old of await rowsOfUser(target)) await call("DELETE", `${rowsPath}/${encodeURIComponent(old.$id)}`, k);
      await call("POST", rowsPath, k, { rowId: callerId, data: { userId: target }, permissions: [] });
      const t = await token(target);
      log(`Google-Konto ${callerId} mit ${target} verknüpft.`);
      return res.json({ ok: true, linked: true, userId: t.userId, secret: t.secret });
    }

    if (body.action === "status") {
      const rows = await rowsOfUser(callerId);
      if (!rows.length) return res.json({ ok: true, linked: false });
      const g = await call("GET", `/users/${encodeURIComponent(rows[0].$id)}`, k);
      return res.json({ ok: true, linked: true, email: (g && g.email) || "" });
    }

    if (body.action === "unlink") {
      for (const row of await rowsOfUser(callerId)) await call("DELETE", `${rowsPath}/${encodeURIComponent(row.$id)}`, k);
      return res.json({ ok: true, linked: false });
    }

    return res.json({ ok: false, error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    error(`google-link ${body.action}: ${e.message}`);
    return res.json({ ok: false, error: "Das hat nicht geklappt. Versuch es später noch einmal." }, 500);
  }
};
