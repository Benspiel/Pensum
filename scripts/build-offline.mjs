/* Erzeugt die Offline-Dateien (Service Worker) der Tools, die ohne Internet laufen sollen.
 * Start: npm run build:offline   (nach Änderungen an diesen Tools oder an den gemeinsamen Dateien neu ausführen und mit einchecken)
 *
 * Jedes Offline-Tool bekommt tools/<name>/offline-sw.js mit der Liste seiner Dateien: alles aus seinem Ordner plus alles,
 * was die Seite über Skripte, Stile, Schriften und Bilder (auch über import) erreicht – also auch die gemeinsamen Dateien in /js, /css, /vendor.
 * Der Service Worker lädt die Liste beim ersten Besuch auf das Gerät. Danach gilt: erst das Netz fragen (so ist man online immer aktuell),
 * antwortet es nicht innerhalb von 4 Sekunden oder gar nicht, kommt die gespeicherte Datei. Alles andere (Konto, KI, Appwrite) bleibt unberührt. */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fsPath = (p) => join(root, ...p.split("/").filter(Boolean));

/** Offline-Tools: name = Cache-Name, scope = Ordner der Seite, entry = Startseiten (für das Verfolgen der Abhängigkeiten), skip = nicht mitnehmen. */
const TOOLS = [
  { name: "goodnotes", scope: "/tools/goodnotes/", entries: ["/tools/goodnotes/index.html"], skip: [/\/offline-sw\.js$/] },
  {
    name: "games", scope: "/tools/spiele/", entries: ["/tools/spiele/index.html"],
    skip: [/\/offline-sw\.js$/, /\/arcade\/sw\.js$/, /\/arcade\/workbox-/, /\.md$/i, /\/LICENSE$/, /\/UPSTREAM/],
  },
];

const ASSET_EXT = /\.(?:js|mjs|css|png|jpe?g|webp|svg|ico|woff2?|json|webmanifest|html|wasm|txt)$/i;
const exists = async (p) => { try { return (await stat(fsPath(p))).isFile(); } catch { return false; } };

async function walk(dir) {
  const out = [];
  for (const e of await readdir(fsPath(dir), { withFileTypes: true })) {
    const p = `${dir.replace(/\/$/, "")}/${e.name}`;
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

/** Verweise in einer Datei als Pfade der Website. */
function refsOf(path, text) {
  const found = new Set();
  const add = (ref) => {
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(ref)) return;
    const clean = ref.split(/[?#]/)[0];
    if (!clean) return;
    const abs = clean.startsWith("/") ? posix.normalize(clean) : clean.startsWith(".") ? posix.join(posix.dirname(path), clean) : null;
    if (abs && ASSET_EXT.test(abs)) found.add(abs);
  };
  if (/\.html?$/i.test(path)) {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(m[1]);
  } else if (/\.css$/i.test(path)) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g)) add(m[1]);
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) add(m[1]);
  } else {
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of text.matchAll(/["'`](\/[A-Za-z0-9_\-./]+\.(?:js|mjs|css|png|jpe?g|webp|svg|ico|woff2?|json|webmanifest|wasm))["'`]/g)) add(m[1]);
  }
  return [...found];
}

async function crawl(entries, skip) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p) || skip.some((re) => re.test(p)) || !(await exists(p))) continue;
    seen.add(p);
    if (!/\.(?:html?|js|mjs|css)$/i.test(p)) continue;
    for (const ref of refsOf(p, await readFile(fsPath(p), "utf8"))) queue.push(ref);
  }
  return seen;
}

const template = ({ name, scope, files, version }) => `/* Offline-Dateien für ${scope}. ERZEUGT von scripts/build-offline.mjs (npm run build:offline), nicht von Hand ändern.
 * Erst das Netz fragen (online ist alles aktuell), bei Ausfall oder nach 4 Sekunden die gespeicherte Datei. Konto, KI und Appwrite laufen nie hierüber. */
const CACHE = "pensum-${name}-${version}";
const SCOPE = ${JSON.stringify(scope)};
const FILES = ${JSON.stringify(files)};
const WAIT_MS = 4000;
const known = new Set(FILES);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(FILES.map((path) => cache.add(new Request(path, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("pensum-${name}-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** Netz zuerst; nach WAIT_MS ohne Antwort oder bei Fehler die gespeicherte Datei. Gute Antworten frischen den Speicher auf. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromCache = () => cache.match(request, { ignoreSearch: true });
  try {
    const net = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("langsam")), WAIT_MS));
    return await Promise.race([net, timeout]);
  } catch (_) {
    return (await fromCache()) || fetch(request).catch(() => new Response("Offline", { status: 503, statusText: "Offline" }));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const page = request.mode === "navigate" && url.pathname.startsWith(SCOPE);
  if (!page && !known.has(url.pathname)) return;
  event.respondWith(networkFirst(request));
});
`;

const only = process.argv[2];
for (const tool of TOOLS) {
  if (only && only !== tool.name) continue;
  const files = new Set(await crawl(tool.entries, tool.skip));
  for (const p of await walk(tool.scope)) if (!tool.skip.some((re) => re.test(p))) files.add(p);
  // Startseite des Tools auch unter ihrer Adresse mit Schrägstrich (die Seite hat trailingSlash)
  for (const e of tool.entries) if (e.endsWith("/index.html")) files.add(e.slice(0, -"index.html".length));
  const list = [...files].sort();
  const hash = createHash("sha1");
  for (const p of list) { if (!p.endsWith("/")) hash.update(p).update(await readFile(fsPath(p))); }
  const version = hash.digest("hex").slice(0, 10);
  const out = `${tool.scope}offline-sw.js`;
  await writeFile(fsPath(out), template({ name: tool.name, scope: tool.scope, files: list, version }));
  console.log(`${out}: ${list.length} Dateien, Version ${version}`);
}
