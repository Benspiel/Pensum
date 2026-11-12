/* Kleiner statischer Server für die lokale Entwicklung – ohne Abhängigkeiten.
 * Start: node scripts/serve.mjs [port]   (Standard: 5173)
 * Setzt dieselben Header wie vercel.json, damit sich lokal und auf Vercel alles gleich verhält. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5173);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

let headers = {};
try {
  const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
  const all = (vercel.headers || []).find((h) => h.source === "/(.*)");
  for (const { key, value } of (all && all.headers) || []) headers[key] = value;
} catch { /* ohne vercel.json einfach ohne Zusatz-Header */ }

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end("Forbidden"); return; }
    let info = await stat(file).catch(() => null);
    if (info && info.isDirectory()) {
      if (!url.pathname.endsWith("/")) { res.writeHead(308, { Location: url.pathname + "/" + url.search }).end(); return; }
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (!info) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 – nicht gefunden"); return; }
    res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => console.log(`Pensum läuft auf http://localhost:${port}`));
