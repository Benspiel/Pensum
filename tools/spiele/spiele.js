/* Spiele – Übersicht und Spielansicht. Jedes Spiel steckt in einem eigenen Modul (ui-*.js) mit seiner Logik daneben.
 * Übersicht: große Kacheln mit kleiner Vorschau. Ein Tipp auf eine Kachel öffnet das Spiel über die ganze Seite, ohne Knöpfe:
 * oben nur die Nav (mit „‹ Spiele“ und dem Namen des Spiels), darunter das Spiel. Die offene Seite steht als #id in der Adresse. */
import { $, host, esc } from "./common.js";
import { toolById } from "/js/tools.js";
import { makeConnect4 } from "./ui-vier.js";
import { makeNeonDrift, makeSkyStack } from "./ui-arcade.js";
import { makeAsteroids, makeDino } from "./ui-embed.js";
import { LOCAL_GAMES, localUrl } from "./catalog.js";
import { onTesterChange, isLocked } from "/js/access.js";

/* ---------- Vorschau-Zeichnungen (kleine SVGs, unabhängig vom Hell/Dunkel-Modus) ---------- */

const board = (() => {
  const cols = 7, rows = 6, grid = [
    "..y....", "..r....", "..yr...", ".ryy...", ".yrr.y.", "yryrr.r",
  ];
  let out = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = grid[r][c], fill = v === "y" ? "#f2b84b" : v === "r" ? "#e5527a" : "#ffffff";
    out += `<circle cx="${52 + c * 36}" cy="${28 + r * 28}" r="11" fill="${fill}"/>`;
  }
  return out;
})();

const PREVIEW = {
  drift: `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" fill="#10152b"/><circle cx="65" cy="46" r="2" fill="white"/><circle cx="256" cy="74" r="3" fill="white"/><rect x="65" y="72" width="70" height="22" rx="9" fill="#ff7198"/><rect x="210" y="35" width="55" height="22" rx="9" fill="#ff7198"/><path d="M160 110l-25 53 25-10 25 10z" fill="#75e5ed"/></svg>`,
  stack: `<svg viewBox="0 0 320 200" aria-hidden="true"><rect width="320" height="200" fill="#10152b"/><rect x="90" y="150" width="140" height="20" rx="6" fill="#68dfec"/><rect x="102" y="125" width="125" height="20" rx="6" fill="#8bbaee"/><rect x="110" y="100" width="110" height="20" rx="6" fill="#ba9df4"/><rect x="140" y="55" width="110" height="20" rx="6" fill="white"/></svg>`,
  vier: `<svg viewBox="0 0 320 200" role="img" aria-hidden="true"><rect width="320" height="200" fill="#e8eefb"/><rect x="34" y="8" width="252" height="184" rx="16" fill="#0b5fc7"/>${board}</svg>`,
  asteroids: `<svg viewBox="0 0 320 200" role="img" aria-hidden="true"><rect width="320" height="200" fill="#0c0c0f"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M48 54l22-14 26 8 8 24-14 22-28 2-18-18z"/><path d="M232 28l30 6 14 26-12 24-30 4-18-22z"/><path d="M250 128l24 8 6 22-18 14-24-6-6-22z"/><path d="M158 100l12 28-24 0z" transform="rotate(-24 158 112)"/><path d="M96 150l8-10 10 6-4 12z"/></g><g fill="#fff"><circle cx="172" cy="66" r="2.2"/><circle cx="178" cy="46" r="2.2"/><circle cx="184" cy="26" r="2.2"/></g></svg>`,
  dino: `<svg viewBox="0 0 320 200" role="img" aria-hidden="true"><rect width="320" height="200" fill="#f7f7f7"/><path d="M0 150h320" stroke="#535353" stroke-width="2"/><path d="M20 160h28M96 166h18M200 160h40M268 168h22" stroke="#9a9a9a" stroke-width="2" stroke-linecap="round"/><g fill="#535353"><path d="M64 92h26v6h8v30h-8v6h-8v10h-8v-10h-8v10h-8v-10h-6v-16h-8v-8h-8v-8h-8v-8h-8v-8h8v-8h8v8h8v-6z" transform="translate(0 -4)"/><rect x="82" y="86" width="6" height="6" fill="#f7f7f7"/><rect x="228" y="108" width="12" height="42" rx="4"/><rect x="216" y="118" width="12" height="8" rx="3"/><rect x="216" y="118" width="8" height="20" rx="3"/><rect x="240" y="100" width="10" height="8" rx="3"/><rect x="244" y="100" width="8" height="24" rx="3"/><rect x="262" y="122" width="10" height="28" rx="3"/></g><path d="M44 44q10-12 22-6t24 0q14-8 24 2" fill="none" stroke="#c8c8c8" stroke-width="3" stroke-linecap="round" transform="translate(120 -10)"/></svg>`,
};

/* ---------- Spielwahl ---------- */

const GAMES = {
  drift: { title: "Neon Drift", tag: "Arcade · ziehen und ausweichen", make: makeNeonDrift },
  stack: { title: "Sky Stack", tag: "Geschicklichkeit · tippen und stapeln", make: makeSkyStack },
  vier: { title: "Vier gewinnt", tag: "Gegen den Computer · tippen", make: makeConnect4 },
  asteroids: { title: "Asteroids", tag: "Open Source · mit Bildschirm-Knöpfen", make: makeAsteroids, credit: "Asteroids von Doug McInnes (MIT-Lizenz), github.com/dmcinnes/HTML5-Asteroids." },
  dino: { title: "Dino-Runner", tag: "Open Source · tippen zum Springen", make: makeDino, credit: "Dino-Runner aus dem Chromium-Browser (BSD-Lizenz), Fassung von github.com/wayou/t-rex-runner." },
};

$("credits").textContent = Object.values(GAMES).map((g) => g.credit).filter(Boolean).join(" ");

const pensumGames = [
  { id: "vier", category: "Geschick" },
  { id: "asteroids", category: "Action" },
  { id: "dino", category: "Action" },
].map(({ id, category }) => ({ id, category, title: GAMES[id].title, description: GAMES[id].tag, pensum: true }));
const catalogGames = [...pensumGames, ...LOCAL_GAMES];
let category = "Alle";
const categories = ["Alle", ...new Set(catalogGames.map(g => g.category))];
function renderCatalog() {
  const query = $("gameSearch").value.trim().toLocaleLowerCase("de");
  const games = catalogGames.filter(g => (category === "Alle" || g.category === category) && `${g.title} ${g.category} ${g.description}`.toLocaleLowerCase("de").includes(query));
  $("gameFilters").innerHTML = categories.map(c => `<button type="button" data-category="${esc(c)}" aria-pressed="${c === category}">${esc(c)}</button>`).join("");
  $("externalGames").innerHTML = games.map(g => `<a class="sg-tile" href="#${esc(g.id)}" ${g.pensum ? "data-game" : "data-local-game"}="${esc(g.id)}">
    <span class="sg-thumb">${g.pensum ? PREVIEW[g.id] : `<img src="${esc(g.preview || `/tools/spiele/arcade/thumbs/${g.id}.jpg`)}" alt="" loading="lazy">`}</span>
    <span class="sg-name">${esc(g.title)}</span><span class="sg-tag">${esc(g.description)}</span>
  </a>`).join("");
  $("noGames").hidden = games.length > 0;
}
$("gameSearch").addEventListener("input", renderCatalog);
$("gameFilters").addEventListener("click", e => { const button = e.target.closest("[data-category]"); if (button) { category = button.dataset.category; renderCatalog(); $("gameFilters").querySelector(`[data-category="${category}"]`)?.focus(); } });
renderCatalog();

function makeLocalGame(game) {
  const frame = document.createElement("iframe");
  frame.className = "sg-local-frame";
  frame.title = game.title;
  frame.src = localUrl(game);
  frame.allow = "fullscreen; autoplay";
  host.controls(""); host.chips([]); host.stage.append(frame);
  return { canPause: false, key() { return false; }, restart() { frame.src = frame.src; }, destroy() { frame.remove(); } };
}

const nav = document.querySelector("pensum-nav");
const MENU_TITLE = document.title;
let current = null, currentId = null, locked = true, cameFromMenu = false;

function stop() {
  if (current) current.destroy();
  current = null; currentId = null;
  host.stage.replaceChildren();
  host.clearOverlay();
  host.chips([]);
}

/** Zeigt je nach Adresse die Übersicht oder das Spiel. */
function route() {
  const id = location.hash.slice(1);
  const local = LOCAL_GAMES.find(g => g.id === id);
  const game = local || GAMES[id];
  const playing = !locked && !!game;
  document.body.classList.toggle("sg-playing", playing);
  $("menu").hidden = playing;
  $("play").hidden = !playing;
  document.querySelector("pensum-footer").hidden = playing;
  if (!playing) {
    stop();
    document.title = MENU_TITLE;
    if (nav && nav.setContext) nav.setContext(null);
    return;
  }
  if (id !== currentId) {
    stop();
    currentId = id;
    current = local ? makeLocalGame(local) : game.make();
  }
  document.title = `${game.title} – Pensum`;
  if (nav && nav.setContext) nav.setContext({ title: game.title, backHref: location.pathname, backLabel: "Spiele" });
  window.scrollTo(0, 0);
}

/** Kachel tippen: Spiel öffnen. Dabei merken wir uns, dass „Zurück“ zur Übersicht führt. */
$("gameCatalog").addEventListener("click", (e) => {
  const tile = e.target.closest("[data-game], [data-local-game]");
  if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  cameFromMenu = true;
  history.pushState(null, "", "#" + (tile.dataset.game || tile.dataset.localGame));
  route();
});

/** „‹ Spiele“ in der Nav: zurück zur Übersicht, ohne die Seite neu zu laden. */
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-back") || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  if (cameFromMenu) { history.back(); return; }
  history.replaceState(null, "", location.pathname);
  route();
});
addEventListener("popstate", route);

/** Nach dem Spiel („Nochmal“) von vorn beginnen. */
$("overlayBtn").addEventListener("click", () => {
  if (!current) return;
  if (current.overlayAction) current.overlayAction();
  else if (current.canPause && current.paused) current.resume();
  else current.restart();
});

document.addEventListener("keydown", (e) => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (t instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return; // Knöpfe behalten ihr normales Verhalten
  if (current.key(e)) e.preventDefault();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && current && current.canPause) current.pause(); });

/** Gesperrt („Kommt bald“) für alle außer Mitgliedern des Teams „tester“ (js/access.js). */
onTesterChange((tester) => {
  locked = isLocked(toolById("spiele") || {}, tester);
  $("soon").hidden = !locked;
  $("gameCatalog").hidden = locked;
  $("credits").hidden = locked;
  route();
});

// Der Cache gilt nur für die lokalen Spieldateien, nicht für Konto oder Appwrite.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tools/spiele/offline-sw.js', { scope: '/tools/spiele/' }).catch(() => {});
}
