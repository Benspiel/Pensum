/* Offline-Dateien für /tools/goodnotes/. ERZEUGT von scripts/build-offline.mjs (npm run build:offline), nicht von Hand ändern.
 * Erst das Netz fragen (online ist alles aktuell), bei Ausfall oder nach 4 Sekunden die gespeicherte Datei. Konto, KI und Appwrite laufen nie hierüber. */
const CACHE = "pensum-goodnotes-32014581e8";
const SCOPE = "/tools/goodnotes/";
const FILES = ["/assets/apple-touch-icon.png","/assets/favicon-32.png","/assets/favicon.ico","/assets/favicon.png","/assets/icon.png","/assets/logo-light.png","/assets/logo.png","/css/export-menu.css","/css/pensum.css","/css/stack-panel.css","/js/access.js","/js/auth.js","/js/config.js","/js/db.js","/js/export-core.js","/js/export-menu.js","/js/islands.js","/js/lock.js","/js/profile-menu.js","/js/promise-toast.js","/js/shell.js","/js/theme.js","/js/tools.js","/js/track.js","/js/whatsnew.js","/tools/abschreiben/core.js","/tools/goodnotes/","/tools/goodnotes/goodnotes.css","/tools/goodnotes/goodnotes.js","/tools/goodnotes/index.html","/tools/goodnotes/ink-engine.js","/tools/goodnotes/templates.js","/vendor/appwrite.js","/vendor/fonts.css","/vendor/fonts/inter-latin-wght-normal.woff2","/vendor/jspdf.umd.min.js","/vendor/jszip.min.js","/vendor/ui/islands.css","/vendor/ui/islands.js"];
const WAIT_MS = 4000;
const known = new Set(FILES);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(FILES.map((path) => cache.add(new Request(path, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("pensum-goodnotes-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
  if (!known.has(url.pathname)) return; // nur die Dateien dieser Liste (auch Seiten); alles andere bleibt unberührt
  event.respondWith(networkFirst(request));
});
