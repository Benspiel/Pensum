/* Löscht das Konto der aufrufenden Person samt allen Daten.
 *
 * Läuft serverseitig in Appwrite. Wer löscht, bestimmt allein der Server: Appwrite setzt
 * x-appwrite-user-id aus der Session des Aufrufs, der Browser kann die ID nicht angeben.
 * Der Schlüssel (x-appwrite-key) wird pro Aufruf erzeugt und gilt nur für die in
 * appwrite.config.json eingetragenen Rechte. Es steht kein API-Key im Repo oder im Frontend.
 * Läuft ohne Abhängigkeiten, weil auf dem Server nur die Laufzeit node-16.0 aktiv ist. */
const http = require("http");
const https = require("https");

const DATABASE_ID = "pensum";
const TABLES = ["grades", "subjects", "handwriting"];

function call(method, path, key) {
  const base = new URL(process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const lib = base.protocol === "https:" ? https : http;
  const url = new URL(base.pathname.replace(/\/$/, "") + path, base);
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID,
        "x-appwrite-key": key,
      },
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
        resolve(json);
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Zeitüberschreitung")));
    req.end();
  });
}

async function deleteOwnRows(table, userId, key) {
  const queries = [JSON.stringify({ method: "equal", attribute: "userId", values: [userId] }), JSON.stringify({ method: "limit", values: [100] })];
  const qs = queries.map((q) => `queries[]=${encodeURIComponent(q)}`).join("&");
  let removed = 0;
  for (let round = 0; round < 200; round++) {
    const page = await call("GET", `/tablesdb/${DATABASE_ID}/tables/${table}/rows?${qs}`, key);
    const rows = (page && page.rows) || [];
    if (!rows.length) break;
    for (const row of rows) {
      await call("DELETE", `/tablesdb/${DATABASE_ID}/tables/${table}/rows/${encodeURIComponent(row.$id)}`, key);
      removed++;
    }
  }
  return removed;
}

module.exports = async ({ req, res, log, error }) => {
  const userId = req.headers["x-appwrite-user-id"];
  const key = req.headers["x-appwrite-key"];
  if (!userId || !key) return res.json({ ok: false, error: "Nicht angemeldet." }, 401);

  try {
    let rows = 0;
    for (const table of TABLES) rows += await deleteOwnRows(table, userId, key);
    await call("DELETE", `/users/${encodeURIComponent(userId)}`, key);
    log(`Konto gelöscht, ${rows} Zeilen entfernt.`);
    return res.json({ ok: true, rows });
  } catch (e) {
    error(`Löschen fehlgeschlagen: ${e.message}`);
    return res.json({ ok: false, error: "Das Konto konnte nicht vollständig gelöscht werden. Versuch es später noch einmal." }, 500);
  }
};
