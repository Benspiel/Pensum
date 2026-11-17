/* Spiele – Auswahl und gemeinsame Steuerung. Jedes Spiel steckt in einem eigenen Modul (ui-*.js) mit seiner Logik daneben. */
import { $, host, esc, reduceMotion } from "./common.js";
import { toolById } from "/js/tools.js";
import { makeConnect4 } from "./ui-vier.js";
import { makeAsteroids, makeDino } from "./ui-embed.js";
import { onTesterChange, isLocked } from "/js/access.js";

/* ---------- Spielwahl ---------- */

const GAMES = {
  vier: { title: "Vier gewinnt.", tag: "Gegen den Computer", group: "Denken", make: makeConnect4, help: "Wirf abwechselnd Steine in die Spalten. Wer zuerst vier in einer Reihe hat, gewinnt. Spalte anklicken oder Taste 1 bis 7." },
  asteroids: { title: "Asteroids.", tag: "Open Source", group: "Open Source", make: makeAsteroids, help: "Pfeil links/rechts dreht, Pfeil hoch gibt Schub, Leertaste schießt, Esc pausiert. Klick ins Spiel, damit die Tasten ankommen. Am Handy nicht spielbar. Open Source von Doug McInnes (MIT-Lizenz), Quelle: github.com/dmcinnes/HTML5-Asteroids." },
  dino: { title: "Dino-Runner.", tag: "Open Source", group: "Open Source", make: makeDino, help: "Leertaste oder Pfeil hoch springt, Pfeil runter duckt (am Handy tippen). Klick ins Spiel, damit die Tasten ankommen. Das Spiel aus dem Chromium-Browser, Open Source unter BSD-Lizenz, Fassung von github.com/wayou/t-rex-runner." },
};

/** Spielwahl: Kacheln nach Gruppen. */
(function buildPicker() {
  const groups = {};
  for (const [id, g] of Object.entries(GAMES)) (groups[g.group] = groups[g.group] || []).push([id, g]);
  $("gameTabs").innerHTML = Object.entries(groups).map(([name, list]) => `<section class="sp-group" aria-label="${esc(name)}"><h2 class="caption sp-group-title">${esc(name)}</h2><div class="sp-tiles">${
    list.map(([id, g]) => `<button class="game-tile" type="button" data-game="${esc(id)}" aria-pressed="false"><span class="name">${esc(g.title.replace(/\.$/, ""))}</span><span class="tag">${esc(g.tag)}</span></button>`).join("")}</div></section>`).join("");
})();

const INTRO = document.querySelector(".tool-head .body-lg").textContent;
let current = null, currentId = null;

function select(id, { push = true } = {}) {
  if (!GAMES[id] || id === currentId) return;
  if (current) current.destroy();
  host.stage.replaceChildren();
  host.clearOverlay();
  currentId = id;
  document.querySelectorAll("#gameTabs [data-game]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.game === id)));
  $("gameTitle").textContent = GAMES[id].title;
  $("help").textContent = GAMES[id].help;
  current = GAMES[id].make();
  $("pauseBtn").hidden = !current.canPause;
  if (push) history.replaceState(null, "", "#" + id);
}

/** Nach einem Klick auf Tab, Pause oder Neustart geht der Fokus aufs Spielfeld, damit Leertaste und Pfeile das Spiel steuern. */
const focusStage = () => { const st = $("stage"); st.tabIndex = -1; st.focus({ preventScroll: true }); };
$("gameTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-game]");
  if (!b) return;
  select(b.dataset.game);
  focusStage();
  document.querySelector(".sp-panel").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" }); // am Handy liegt das Spiel unter der Auswahl
});
$("restartBtn").addEventListener("click", () => { if (current) current.restart(); focusStage(); });
$("pauseBtn").addEventListener("click", () => { if (!current || !current.canPause) return; current.paused ? current.resume() : current.pause(); focusStage(); });
$("overlayBtn").addEventListener("click", () => {
  if (!current) return;
  setTimeout(focusStage, 0);
  if (current.overlayAction) current.overlayAction();
  else if (current.canPause && current.paused) current.resume();
  else current.restart();
});

document.addEventListener("keydown", (e) => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (t instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter") && !t.classList.contains("mine-cell")) return; // Knöpfe behalten ihr normales Verhalten
  if (current.key(e)) e.preventDefault();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && current && current.canPause) current.pause(); });

const startId = () => (GAMES[location.hash.slice(1)] ? location.hash.slice(1) : "vier");

/** Gesperrt („Kommt bald“) für alle außer Mitgliedern des Teams „tester“ (js/access.js). */
onTesterChange((tester) => {
  const locked = isLocked(toolById("spiele") || {}, tester);
  $("soon").hidden = !locked;
  $("gameTabs").hidden = locked;
  document.querySelector(".sp-panel").hidden = locked;
  document.querySelector(".tool-head .body-lg").textContent = locked ? "Noch nicht freigeschaltet." : INTRO;
  if (locked) { if (current) { current.destroy(); current = null; currentId = null; host.stage.replaceChildren(); } return; }
  if (!current) select(startId(), { push: false });
});
