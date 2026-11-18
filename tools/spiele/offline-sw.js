/* Offline-Dateien für /tools/spiele/. ERZEUGT von scripts/build-offline.mjs (npm run build:offline), nicht von Hand ändern.
 * Erst das Netz fragen (online ist alles aktuell), bei Ausfall oder nach 4 Sekunden die gespeicherte Datei. Konto, KI und Appwrite laufen nie hierüber. */
const CACHE = "pensum-games-3891461b7c";
const SCOPE = "/tools/spiele/";
const FILES = ["/assets/apple-touch-icon.png","/assets/favicon-32.png","/assets/favicon.ico","/assets/favicon.png","/assets/icon.png","/assets/logo-light.png","/assets/logo.png","/css/pensum.css","/js/access.js","/js/auth.js","/js/config.js","/js/lock.js","/js/profile-menu.js","/js/shell.js","/js/theme.js","/js/tools.js","/js/whatsnew.js","/tools/spiele/","/tools/spiele/arcade/apple-touch-icon.png","/tools/spiele/arcade/assets/astro-wdsulJgd.js","/tools/spiele/arcade/assets/breakout-BLFEUaUS.js","/tools/spiele/arcade/assets/bubbles-B1w91LGb.js","/tools/spiele/arcade/assets/controls-BE7mDGYg.js","/tools/spiele/arcade/assets/controls-BMFSvtU9.js","/tools/spiele/arcade/assets/controls-BOuPZnXw.js","/tools/spiele/arcade/assets/controls-DDKpJIdu.js","/tools/spiele/arcade/assets/controls-DX0EwpU8.js","/tools/spiele/arcade/assets/crates-RKmKr0nN.js","/tools/spiele/arcade/assets/frame-By6fyDL0.js","/tools/spiele/arcade/assets/golf-CxT5c2FB.js","/tools/spiele/arcade/assets/hold-repeat-CsGOa4xR.js","/tools/spiele/arcade/assets/hop-KNM8Tqvi.js","/tools/spiele/arcade/assets/hub-CarVMzjR.js","/tools/spiele/arcade/assets/hub-F_kxjPgt.css","/tools/spiele/arcade/assets/lander-Bk83rxcq.js","/tools/spiele/arcade/assets/match-DJg25CPm.js","/tools/spiele/arcade/assets/maze-BRhKpMhS.js","/tools/spiele/arcade/assets/mines-9qqyN0PF.js","/tools/spiele/arcade/assets/palette-Cb-7kNCq.js","/tools/spiele/arcade/assets/palette-Dp41la40.css","/tools/spiele/arcade/assets/phaser-BSBLrfai.js","/tools/spiele/arcade/assets/phaser-config-D7NAOKnI.js","/tools/spiele/arcade/assets/phaser-config-nivRxHxK.css","/tools/spiele/arcade/assets/pinball-Bemhf6xR.js","/tools/spiele/arcade/assets/pong-B90fqcNK.js","/tools/spiele/arcade/assets/press-start-2p-latin-400-_wFEWmAB.woff2","/tools/spiele/arcade/assets/rolldown-runtime-DK3Fl9T5.js","/tools/spiele/arcade/assets/runner-DwrI_S_6.js","/tools/spiele/arcade/assets/siege-Cm0qO83o.js","/tools/spiele/arcade/assets/snake-BnzDe4Y2.js","/tools/spiele/arcade/assets/space-grotesk-latin-400-CJ-V5oYT.woff2","/tools/spiele/arcade/assets/space-grotesk-latin-500-lFbtlQH6.woff2","/tools/spiele/arcade/assets/space-grotesk-latin-700-RjhwGPKo.woff2","/tools/spiele/arcade/assets/stack-uImJJDur.js","/tools/spiele/arcade/assets/swipe-DdbOdzAx.js","/tools/spiele/arcade/assets/tanks-CeGqzHCN.js","/tools/spiele/arcade/assets/versus-EOKbhCCJ.js","/tools/spiele/arcade/favicon.svg","/tools/spiele/arcade/games/astro/index.html","/tools/spiele/arcade/games/breakout/index.html","/tools/spiele/arcade/games/bubbles/index.html","/tools/spiele/arcade/games/crates/index.html","/tools/spiele/arcade/games/golf/index.html","/tools/spiele/arcade/games/hop/index.html","/tools/spiele/arcade/games/lander/index.html","/tools/spiele/arcade/games/match/index.html","/tools/spiele/arcade/games/maze/index.html","/tools/spiele/arcade/games/mines/index.html","/tools/spiele/arcade/games/pinball/index.html","/tools/spiele/arcade/games/pong/index.html","/tools/spiele/arcade/games/runner/index.html","/tools/spiele/arcade/games/siege/index.html","/tools/spiele/arcade/games/snake/index.html","/tools/spiele/arcade/games/stack/index.html","/tools/spiele/arcade/games/tanks/index.html","/tools/spiele/arcade/index.html","/tools/spiele/arcade/manifest.webmanifest","/tools/spiele/arcade/pwa-192.png","/tools/spiele/arcade/pwa-512.png","/tools/spiele/arcade/pwa-maskable-512.png","/tools/spiele/arcade/thumbs/astro.jpg","/tools/spiele/arcade/thumbs/breakout.jpg","/tools/spiele/arcade/thumbs/bubbles.jpg","/tools/spiele/arcade/thumbs/crates.jpg","/tools/spiele/arcade/thumbs/golf.jpg","/tools/spiele/arcade/thumbs/hop.jpg","/tools/spiele/arcade/thumbs/lander.jpg","/tools/spiele/arcade/thumbs/match.jpg","/tools/spiele/arcade/thumbs/maze.jpg","/tools/spiele/arcade/thumbs/mines.jpg","/tools/spiele/arcade/thumbs/pinball.jpg","/tools/spiele/arcade/thumbs/pong.jpg","/tools/spiele/arcade/thumbs/runner.jpg","/tools/spiele/arcade/thumbs/siege.jpg","/tools/spiele/arcade/thumbs/snake.jpg","/tools/spiele/arcade/thumbs/stack.jpg","/tools/spiele/arcade/thumbs/tanks.jpg","/tools/spiele/catalog.js","/tools/spiele/chess/app.js","/tools/spiele/chess/chess.css","/tools/spiele/chess/engine.js","/tools/spiele/chess/index.html","/tools/spiele/chess/vorschau.png","/tools/spiele/chess/worker.js","/tools/spiele/common.js","/tools/spiele/connect4.js","/tools/spiele/index.html","/tools/spiele/spiele.css","/tools/spiele/spiele.js","/tools/spiele/ui-arcade.js","/tools/spiele/ui-embed.js","/tools/spiele/ui-vier.js","/tools/spiele/util.js","/vendor/appwrite.js","/vendor/fonts.css","/vendor/fonts/inter-latin-wght-normal.woff2"];
const WAIT_MS = 4000;
const known = new Set(FILES);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(FILES.map((path) => cache.add(new Request(path, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("pensum-games-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
