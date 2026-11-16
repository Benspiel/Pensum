/* Spiele – Auswahl und gemeinsame Steuerung. Jedes Spiel steckt in einem eigenen Modul (ui-*.js) mit seiner Logik daneben. */
import { $, host, esc, reduceMotion } from "./common.js";
import { toolById } from "/js/tools.js";
import { make2048, makeSnake, makeTetris, makeMinesweeper } from "./ui-klassiker.js";
import { makeSudoku, makeMemory, makeConnect4, makeTicTacToe, makeSlide, makeLightsOut, makeMastermind, makeHangman, makeMathSprint } from "./ui-denken.js";
import { makeBreakout, makePong, makeHuepfer, makeSimon } from "./ui-geschick.js";

/* ---------- Spielwahl ---------- */

const GAMES = {
  "2048": { title: "2048.", tag: "Zahlen schieben", group: "Klassiker", make: make2048, help: "Wische oder nutze die Pfeiltasten. Gleiche Zahlen verschmelzen. Erreiche die 2048." },
  snake: { title: "Snake.", tag: "Wachsen und ausweichen", group: "Klassiker", make: makeSnake, help: "Pfeiltasten, WASD, Wischen oder die Knöpfe. Leertaste oder P pausiert. Friss die roten Punkte, ohne Wand und eigenen Körper zu berühren." },
  tetris: { title: "Tetris.", tag: "Steine stapeln", group: "Klassiker", make: makeTetris, help: "← → bewegen, ↑ oder X drehen, ↓ schneller, Leertaste lässt den Stein fallen, P pausiert. Am Handy nutzt du die Knöpfe (halten wiederholt)." },
  minesweeper: { title: "Minesweeper.", tag: "Minen finden", group: "Klassiker", make: makeMinesweeper, help: "Klick deckt auf, Rechtsklick oder F setzt eine Fahne (am Handy lange drücken oder „Fahne setzen“). Auf eine Zahl klicken deckt die Nachbarn auf, wenn genug Fahnen stehen. Das erste Feld ist immer sicher." },
  sudoku: { title: "Sudoku.", tag: "Zahlenrätsel", group: "Denken und Rätseln", make: makeSudoku, help: "Jede Zahl von 1 bis 9 kommt in jeder Zeile, Spalte und jedem 3×3-Block genau einmal vor. Feld wählen, dann Zahl tippen oder auf der Tastatur eingeben. Doppelte Zahlen werden markiert." },
  memory: { title: "Memory.", tag: "Paare finden", group: "Denken und Rätseln", make: makeMemory, help: "Deck zwei Karten auf. Gleiche Paare bleiben offen. Finde alle Paare mit möglichst wenigen Zügen." },
  vier: { title: "Vier gewinnt.", tag: "Gegen den Computer", group: "Denken und Rätseln", make: makeConnect4, help: "Wirf abwechselnd Steine in die Spalten. Wer zuerst vier in einer Reihe hat, gewinnt. Spalte anklicken oder Taste 1 bis 7." },
  tictactoe: { title: "Tic-Tac-Toe.", tag: "Drei in einer Reihe", group: "Denken und Rätseln", make: makeTicTacToe, help: "Drei gleiche Zeichen in einer Reihe gewinnen. Der Unschlagbare-Computer verliert nie. Felder auch mit Taste 1 bis 9." },
  schiebepuzzle: { title: "Schiebepuzzle.", tag: "Zahlen sortieren", group: "Denken und Rätseln", make: makeSlide, help: "Schiebe die Plättchen in die Lücke, bis alle Zahlen der Reihe nach stehen. Klick oder Pfeiltasten." },
  lightsout: { title: "Lights Out.", tag: "Lichter löschen", group: "Denken und Rätseln", make: makeLightsOut, help: "Ein Klick dreht das Feld und seine vier Nachbarn um. Mach alle Lichter aus, mit möglichst wenigen Zügen." },
  mastermind: { title: "Mastermind.", tag: "Farbcode knacken", group: "Denken und Rätseln", make: makeMastermind, help: "Rate den Farbcode aus vier Farben in höchstens zehn Versuchen. Schwarzer Punkt: richtige Farbe am richtigen Platz. Weißer Punkt: richtige Farbe, falscher Platz. Tasten 1 bis 6, Rücktaste und Enter." },
  galgen: { title: "Galgenmännchen.", tag: "Wörter raten", group: "Wörter und Zahlen", make: makeHangman, help: "Rate das Wort Buchstabe für Buchstabe. Acht Fehler sind erlaubt. Du kannst auch auf der Tastatur tippen, mit Ä, Ö und Ü." },
  kopfrechnen: { title: "Kopfrechnen-Blitz.", tag: "60 Sekunden", group: "Wörter und Zahlen", make: makeMathSprint, help: "Löse in 60 Sekunden so viele Aufgaben wie möglich. Die richtige Antwort zählt sofort, mit Enter gibst du auf und siehst die Lösung." },
  breakout: { title: "Breakout.", tag: "Steine ausbrechen", group: "Geschick und Reaktion", make: makeBreakout, help: "Bewege den Schläger mit Maus, Finger oder Pfeiltasten. Tippen oder Leertaste startet den Ball. P pausiert." },
  pong: { title: "Pong.", tag: "Gegen den Computer", group: "Geschick und Reaktion", make: makePong, help: "Bewege deinen Schläger links mit Maus, Finger oder W/S bzw. Pfeiltasten. Wer zuerst 7 Punkte hat, gewinnt. Tippen oder Leertaste für den Anstoß." },
  huepfer: { title: "Hüpfer.", tag: "Durch die Lücken", group: "Geschick und Reaktion", make: makeHuepfer, help: "Tippe oder drücke die Leertaste, um zu flattern. Flieg durch die Lücken der Röhren, ohne anzustoßen." },
  simon: { title: "Simon.", tag: "Farbfolge merken", group: "Geschick und Reaktion", make: makeSimon, help: "Merk dir die Farbfolge und spiel sie nach. Jede Runde kommt ein Ton dazu. Tasten 1 bis 4, optional mit Ton." },
};

/** Spielwahl: Kacheln nach Gruppen. */
(function buildPicker() {
  const groups = {};
  for (const [id, g] of Object.entries(GAMES)) (groups[g.group] = groups[g.group] || []).push([id, g]);
  $("gameTabs").innerHTML = Object.entries(groups).map(([name, list]) => `<section class="sp-group" aria-label="${esc(name)}"><h2 class="caption sp-group-title">${esc(name)}</h2><div class="sp-tiles">${
    list.map(([id, g]) => `<button class="game-tile" type="button" data-game="${esc(id)}" aria-pressed="false"><span class="name">${esc(g.title.replace(/\.$/, ""))}</span><span class="tag">${esc(g.tag)}</span></button>`).join("")}</div></section>`).join("");
})();

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

if (toolById("spiele") && toolById("spiele").soon) {
  // Noch nicht freigeschaltet: nur der Hinweis „Kommt bald“ statt der Spiele
  $("soon").hidden = false;
  $("gameTabs").hidden = true;
  document.querySelector(".sp-panel").hidden = true;
  document.querySelector(".tool-head .body-lg").textContent = "Noch nicht freigeschaltet.";
} else {
  select(GAMES[location.hash.slice(1)] ? location.hash.slice(1) : "2048", { push: false });
}
