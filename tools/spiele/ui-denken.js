/* Spiele – Denk- und Rätselspiele: Sudoku, Memory, Vier gewinnt, Tic-Tac-Toe, Schiebepuzzle, Lights Out, Mastermind,
 * Galgenmännchen, Kopfrechnen. Die Regeln liegen jeweils in einem eigenen Modul daneben (ohne Oberfläche, getestet). */
import { $, best, host, esc, reduceMotion, segmented, bar, clock } from "./common.js";
import * as SU from "./sudoku.js";
import * as ME from "./memory.js";
import * as C4 from "./connect4.js";
import * as TT from "./tictactoe.js";
import * as SL from "./slide.js";
import * as LO from "./lightsout.js";
import * as MM from "./mastermind.js";
import * as HM from "./hangman.js";
import * as MS from "./mathsprint.js";

const root = (cls) => { const el = document.createElement("div"); el.className = cls; host.stage.append(el); return el; };
const digits = (e) => (/^[1-9]$/.test(e.key) ? Number(e.key) : null);

/** Gemeinsame Stoppuhr: tickt jede halbe Sekunde, onTick bekommt die Sekunden. */
function stopwatch(onTick) {
  let t0 = 0, timer = 0, elapsed = 0;
  return {
    start() { if (timer) return; t0 = performance.now() - elapsed * 1000; timer = setInterval(() => { elapsed = (performance.now() - t0) / 1000; onTick(elapsed); }, 500); },
    stop() { clearInterval(timer); timer = 0; if (t0) elapsed = (performance.now() - t0) / 1000; return elapsed; },
    reset() { clearInterval(timer); timer = 0; elapsed = 0; t0 = 0; },
    get seconds() { return elapsed; },
  };
}

/* ---------- Sudoku ---------- */

const SU_LEVELS = { leicht: { clues: 42, label: "Leicht" }, mittel: { clues: 34, label: "Mittel" }, schwer: { clues: 28, label: "Schwer" } };

export function makeSudoku() {
  let level = "leicht", grid, given, solution, sel = 40, done = false;
  const wrap = root("su");
  const sw = stopwatch(() => chips());
  const levelBar = segmented(Object.entries(SU_LEVELS).map(([id, l]) => [id, l.label]), level, (id) => { level = id; restart(); }, "Schwierigkeit");
  const boardEl = document.createElement("div"); boardEl.className = "su-grid"; boardEl.setAttribute("role", "grid"); boardEl.setAttribute("aria-label", "Sudoku-Feld");
  const padEl = document.createElement("div"); padEl.className = "su-pad";
  padEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="pad-btn" type="button" data-n="${n}" aria-label="Zahl ${n}">${n}</button>`).join("") + '<button class="pad-btn" type="button" data-n="0" aria-label="Feld leeren">⌫</button>';
  wrap.append(bar(levelBar), boardEl, padEl);

  const key = () => "sudoku_" + level;
  const chips = () => { const b = best.get(key()); host.chips([["Zeit", clock(sw.seconds)], ["Bestzeit", b == null ? "–" : clock(b)]]); };
  function render() {
    const bad = SU.conflicts(grid), cur = grid[sel];
    boardEl.innerHTML = grid.map((v, i) => {
      const r = Math.floor(i / 9), c = i % 9;
      const cls = ["su-cell", given[i] ? "is-given" : "", i === sel ? "is-sel" : "", cur && v === cur && i !== sel ? "is-same" : "", bad.has(i) ? "is-bad" : "", c % 3 === 2 && c < 8 ? "b-r" : "", r % 3 === 2 && r < 8 ? "b-b" : ""].join(" ");
      return `<button class="${cls}" type="button" role="gridcell" data-i="${i}" aria-label="Zeile ${r + 1}, Spalte ${c + 1}, ${v || "leer"}${given[i] ? ", vorgegeben" : ""}" tabindex="${i === sel ? 0 : -1}">${v || ""}</button>`;
    }).join("");
    chips();
  }
  function restart() {
    host.clearOverlay(); sw.reset(); done = false;
    const g = SU.generate(SU_LEVELS[level].clues);
    grid = g.puzzle.slice(); solution = g.solution; given = g.puzzle.map(Boolean); sel = grid.findIndex((v) => !v);
    render();
  }
  function put(n) {
    if (done || given[sel]) return;
    sw.start();
    grid[sel] = n;
    render();
    if (SU.isComplete(grid)) {
      done = true; const t = Math.round(sw.stop());
      const record = best.set(key(), t, true);
      render(); host.overlay("Gelöst!", `${clock(t)}${record ? ", neue Bestzeit!" : ""}`);
    }
  }
  boardEl.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { sel = Number(b.dataset.i); render(); } });
  padEl.addEventListener("click", (e) => { const b = e.target.closest("[data-n]"); if (b) put(Number(b.dataset.n)); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) {
      const n = digits(e);
      if (n) { put(n); return true; }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { put(0); return true; }
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
      if (!d) return false;
      const next = sel + d;
      if (next >= 0 && next < 81 && !(d === -1 && sel % 9 === 0) && !(d === 1 && sel % 9 === 8)) { sel = next; render(); boardEl.querySelector(`[data-i="${sel}"]`)?.focus(); }
      return true;
    },
    destroy() { sw.reset(); wrap.remove(); },
  };
}

/* ---------- Memory ---------- */

export function makeMemory() {
  let size = "mittel", cards, open = [], moves = 0, lock = false, flipTimer = 0;
  const wrap = root("mem");
  const sw = stopwatch(() => chips());
  const sizeBar = segmented(Object.entries(ME.SIZES).map(([id, s]) => [id, s.label]), size, (id) => { size = id; restart(); }, "Spielfeldgröße");
  const gridEl = document.createElement("div"); gridEl.className = "mem-grid"; gridEl.setAttribute("role", "grid"); gridEl.setAttribute("aria-label", "Memory-Karten");
  wrap.append(bar(sizeBar), gridEl);
  const key = () => "memory_" + size;
  const chips = () => { const b = best.get(key()); host.chips([["Züge", moves], ["Zeit", clock(sw.seconds)], ["Beste Züge", b == null ? "–" : b]]); };
  function render() {
    gridEl.style.setProperty("--cols", ME.SIZES[size].cols);
    gridEl.innerHTML = cards.map((c) => `<button class="mem-card tone${c.tone}${c.open || c.matched ? " is-open" : ""}${c.matched ? " is-matched" : ""}" type="button" role="gridcell" data-i="${c.index}" ${c.open || c.matched ? "disabled" : ""} aria-label="${c.open || c.matched ? "Karte " + c.symbol : "verdeckte Karte"} ${c.index + 1}">${c.open || c.matched ? c.symbol : ""}</button>`).join("");
    chips();
  }
  function restart() {
    clearTimeout(flipTimer); host.clearOverlay(); sw.reset(); open = []; moves = 0; lock = false;
    const s = ME.SIZES[size]; cards = ME.deck((s.cols * s.rows) / 2); render();
  }
  function flip(i) {
    const c = cards[i];
    if (lock || c.open || c.matched) return;
    sw.start(); c.open = true; open.push(c);
    if (open.length === 2) {
      moves++;
      const [a, b] = open;
      if (a.id === b.id) { a.matched = b.matched = true; a.open = b.open = false; open = []; render(); finish(); return; }
      lock = true; render();
      flipTimer = setTimeout(() => { a.open = b.open = false; open = []; lock = false; render(); }, reduceMotion() ? 500 : 800);
      return;
    }
    render();
  }
  function finish() {
    if (!ME.isDone(cards)) return;
    const t = Math.round(sw.stop()), record = best.set(key(), moves, true);
    host.overlay("Alle Paare gefunden!", `${moves} Züge in ${clock(t)}${record ? ", neue Bestleistung!" : ""}`);
  }
  gridEl.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) flip(Number(b.dataset.i)); });
  host.controls("");
  restart();
  return { restart, canPause: false, key: () => false, destroy() { clearTimeout(flipTimer); sw.reset(); wrap.remove(); } };
}

/* ---------- Vier gewinnt ---------- */

const C4_LEVELS = { leicht: { depth: 2, label: "Leicht" }, mittel: { depth: 4, label: "Mittel" }, schwer: { depth: 6, label: "Schwer" } };

export function makeConnect4() {
  let level = "mittel", board, over, thinking, win = null, lastDrop = null, aiTimer = 0;
  const wrap = root("c4");
  const levelBar = segmented(Object.entries(C4_LEVELS).map(([id, l]) => [id, l.label]), level, (id) => { level = id; restart(); }, "Stärke des Computers");
  const boardEl = document.createElement("div"); boardEl.className = "c4-board"; boardEl.setAttribute("role", "group"); boardEl.setAttribute("aria-label", "Vier gewinnt");
  wrap.append(bar(levelBar), boardEl);
  const key = () => "c4wins_" + level;
  const chips = () => host.chips([["Du", "gelb"], ["Computer", "rot"], ["Siege hier", best.get(key()) || 0]]);
  function render() {
    const winCells = new Set((win ? win.cells : []).map(([r, c]) => r + "," + c));
    boardEl.innerHTML = [...Array(C4.COLS).keys()].map((c) => `<button class="c4-col" type="button" data-c="${c}" aria-label="Spalte ${c + 1}${board[0][c] ? ", voll" : ""}" ${over || thinking || board[0][c] ? "disabled" : ""}>${
      [...Array(C4.ROWS).keys()].map((r) => { const v = board[r][c]; return `<span class="c4-disc${v ? " p" + v : ""}${winCells.has(r + "," + c) ? " is-win" : ""}${lastDrop && lastDrop[0] === r && lastDrop[1] === c && !reduceMotion() ? " is-drop" : ""}" style="--fall:${r + 1}"></span>`; }).join("")}</button>`).join("");
    chips();
  }
  function end(w) {
    over = true; win = w; render();
    if (!w) host.overlay("Unentschieden", "Das Brett ist voll.");
    else if (w.player === 1) { best.set(key(), (best.get(key()) || 0) + 1); render(); host.overlay("Du gewinnst!", "Vier in einer Reihe."); }
    else host.overlay("Der Computer gewinnt", "Probier es noch einmal.");
  }
  function play(col, player) {
    const r = C4.drop(board, col, player);
    if (!r) return false;
    board = r.board; lastDrop = [r.row, col];
    const w = C4.winner(board);
    if (w) { end(w); return true; }
    if (C4.isFull(board)) { end(null); return true; }
    return true;
  }
  function human(col) {
    if (over || thinking || !play(col, 1) || over) return;
    thinking = true; render();
    aiTimer = setTimeout(() => { thinking = false; play(C4.aiMove(board, 2, C4_LEVELS[level].depth), 2); if (!over) render(); }, 350);
  }
  function restart() { clearTimeout(aiTimer); host.clearOverlay(); board = C4.emptyBoard(); over = false; thinking = false; win = null; lastDrop = null; render(); }
  boardEl.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) human(Number(b.dataset.c)); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) { const n = digits(e); if (n && n <= 7) { human(n - 1); return true; } return false; },
    destroy() { clearTimeout(aiTimer); wrap.remove(); },
  };
}

/* ---------- Tic-Tac-Toe ---------- */

export function makeTicTacToe() {
  let level = "unschlagbar", first = "du", board, over, win = null, aiTimer = 0;
  const tally = { du: 0, comp: 0, remis: 0 };
  const wrap = root("ttt");
  const levelBar = segmented([["leicht", "Leicht"], ["unschlagbar", "Unschlagbar"]], level, (id) => { level = id; restart(); }, "Stärke des Computers");
  const firstBar = segmented([["du", "Du fängst an"], ["comp", "Computer fängt an"]], first, (id) => { first = id; restart(); }, "Wer beginnt");
  const gridEl = document.createElement("div"); gridEl.className = "ttt-grid"; gridEl.setAttribute("role", "grid"); gridEl.setAttribute("aria-label", "Tic-Tac-Toe");
  wrap.append(bar(levelBar, firstBar), gridEl);
  const chips = () => host.chips([["Du (X)", tally.du], ["Computer (O)", tally.comp], ["Remis", tally.remis]]);
  function render() {
    const winCells = new Set(win ? win.line : []);
    gridEl.innerHTML = board.map((v, i) => `<button class="ttt-cell${v === 1 ? " x" : v === 2 ? " o" : ""}${winCells.has(i) ? " is-win" : ""}" type="button" role="gridcell" data-i="${i}" ${v || over ? "disabled" : ""} aria-label="Feld ${i + 1}${v ? ", " + (v === 1 ? "X" : "O") : ", leer"}">${v === 1 ? "✕" : v === 2 ? "◯" : ""}</button>`).join("");
    chips();
  }
  function check() {
    const w = TT.winner(board);
    if (!w && !TT.isFull(board)) return false;
    over = true; win = w;
    if (!w) { tally.remis++; render(); host.overlay("Unentschieden", "Gut gespielt."); }
    else if (w.player === 1) { tally.du++; best.set("ttt_siege", (best.get("ttt_siege") || 0) + 1); render(); host.overlay("Du gewinnst!", "Gegen den Computer."); }
    else { tally.comp++; render(); host.overlay("Der Computer gewinnt", "Probier es noch einmal."); }
    return true;
  }
  function compMove() {
    const move = level === "leicht" && Math.random() < 0.6 ? TT.randomMove(board) : TT.bestMove(board, 2);
    board[move] = 2;
    if (!check()) render();
  }
  function human(i) {
    if (over || board[i]) return;
    board[i] = 1;
    if (check()) return;
    render();
    aiTimer = setTimeout(compMove, 300);
  }
  function restart() {
    clearTimeout(aiTimer); host.clearOverlay(); board = Array(9).fill(0); over = false; win = null; render();
    if (first === "comp") aiTimer = setTimeout(compMove, 300);
  }
  gridEl.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) human(Number(b.dataset.i)); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) { const n = digits(e); if (n) { human(n - 1); return true; } return false; },
    destroy() { clearTimeout(aiTimer); wrap.remove(); },
  };
}

/* ---------- Schiebepuzzle ---------- */

export function makeSlide() {
  let n = 3, board, moves = 0, done = false;
  const wrap = root("sl");
  const sw = stopwatch(() => chips());
  const sizeBar = segmented([["3", "3 × 3"], ["4", "4 × 4"]], String(n), (id) => { n = Number(id); restart(); }, "Größe");
  const gridEl = document.createElement("div"); gridEl.className = "sl-grid"; gridEl.setAttribute("role", "grid"); gridEl.setAttribute("aria-label", "Schiebepuzzle");
  wrap.append(bar(sizeBar), gridEl);
  const key = () => "slide_" + n;
  const chips = () => { const b = best.get(key()); host.chips([["Züge", moves], ["Zeit", clock(sw.seconds)], ["Beste Züge", b == null ? "–" : b]]); };
  function render() {
    gridEl.style.setProperty("--n", n);
    gridEl.innerHTML = board.map((v, i) => `<button class="sl-tile${v ? "" : " is-empty"}" type="button" role="gridcell" data-i="${i}" ${v ? "" : "tabindex=\"-1\" aria-hidden=\"true\" disabled"} aria-label="${v ? "Plättchen " + v : "Lücke"}">${v || ""}</button>`).join("");
    chips();
  }
  function restart() { host.clearOverlay(); sw.reset(); board = SL.shuffled(n); moves = 0; done = false; render(); }
  function tap(i) {
    if (done) return false;
    const nb = SL.move(board, n, i);
    if (!nb) return false;
    sw.start(); board = nb; moves++; render();
    if (SL.isSolved(board, n)) {
      done = true; const t = Math.round(sw.stop()), record = best.set(key(), moves, true);
      host.overlay("Geschafft!", `${moves} Züge in ${clock(t)}${record ? ", neue Bestleistung!" : ""}`);
    }
    return true;
  }
  gridEl.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) tap(Number(b.dataset.i)); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) {
      // Pfeil = Richtung, in die ein Plättchen rutscht
      const z = board.indexOf(0), d = { ArrowUp: n, ArrowDown: -n, ArrowLeft: 1, ArrowRight: -1 }[e.key];
      if (!d) return false;
      if ((d === 1 && z % n === n - 1) || (d === -1 && z % n === 0)) return true;
      tap(z + d);
      return true;
    },
    destroy() { sw.reset(); wrap.remove(); },
  };
}

/* ---------- Lights Out ---------- */

export function makeLightsOut() {
  let board, moves = 0, done = false;
  const wrap = root("lo");
  const gridEl = document.createElement("div"); gridEl.className = "lo-grid"; gridEl.setAttribute("role", "grid"); gridEl.setAttribute("aria-label", "Lights Out");
  const hint = document.createElement("p"); hint.className = "body-sm muted-tint"; hint.style.textAlign = "center"; hint.textContent = "Ein Klick dreht das Feld und seine Nachbarn um. Mach alle Lichter aus.";
  wrap.append(gridEl, hint);
  const chips = () => { const b = best.get("lightsout"); host.chips([["Züge", moves], ["Beste Züge", b == null ? "–" : b]]); };
  function render() {
    gridEl.innerHTML = board.map((v, i) => `<button class="lo-cell${v ? " is-on" : ""}" type="button" role="gridcell" data-i="${i}" aria-label="Zeile ${Math.floor(i / LO.N) + 1}, Spalte ${(i % LO.N) + 1}, ${v ? "an" : "aus"}"></button>`).join("");
    chips();
  }
  function restart() { host.clearOverlay(); board = LO.randomBoard(); moves = 0; done = false; render(); }
  gridEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]"); if (!b || done) return;
    const i = Number(b.dataset.i);
    board = LO.toggle(board, i % LO.N, Math.floor(i / LO.N)); moves++; render();
    if (LO.isSolved(board)) { done = true; const record = best.set("lightsout", moves, true); host.overlay("Alle Lichter aus!", `${moves} Züge${record ? ", neue Bestleistung!" : ""}`); }
  });
  host.controls("");
  restart();
  return { restart, canPause: false, key: () => false, destroy() { wrap.remove(); } };
}

/* ---------- Mastermind ---------- */

const MM_COLORS = ["#0b5fc7", "#34a96b", "#f2b84b", "#e5527a", "#8b5cf6", "#141414"];
const MM_NAMES = ["Blau", "Grün", "Gelb", "Rosa", "Violett", "Schwarz"];

export function makeMastermind() {
  let secret, guesses, current, over;
  const wrap = root("mm");
  const rowsEl = document.createElement("div"); rowsEl.className = "mm-rows"; rowsEl.setAttribute("aria-label", "Bisherige Versuche");
  const paletteEl = document.createElement("div"); paletteEl.className = "mm-palette"; paletteEl.setAttribute("role", "group"); paletteEl.setAttribute("aria-label", "Farben");
  paletteEl.innerHTML = MM_COLORS.map((c, i) => `<button class="mm-color" type="button" data-c="${i}" style="--c:${c}" aria-label="${MM_NAMES[i]} (Taste ${i + 1})"></button>`).join("") + '<button class="pad-btn" type="button" data-act="back" aria-label="Letzte Farbe entfernen">⌫</button><button class="btn btn-primary" type="button" data-act="go">Raten</button>';
  wrap.append(rowsEl, paletteEl);
  const peg = (kind) => `<i class="mm-peg ${kind}"></i>`;
  const slots = (arr, lock) => [...Array(MM.LEN).keys()].map((i) => `<span class="mm-slot" ${arr[i] != null ? `style="--c:${MM_COLORS[arr[i]]}"` : ""} ${lock ? "" : `data-s="${i}"`}></span>`).join("");
  const chips = () => { const b = best.get("mastermind"); host.chips([["Versuch", `${Math.min(guesses.length + 1, MM.MAX_TRIES)} / ${MM.MAX_TRIES}`], ["Beste", b == null ? "–" : b]]); };
  function render() {
    const rows = guesses.map((g) => `<div class="mm-row"><div class="mm-slots">${slots(g.guess, true)}</div><div class="mm-pegs" aria-label="${g.exact} richtig, ${g.partial} an falscher Stelle">${peg("hit").repeat(g.exact)}${peg("near").repeat(g.partial)}${peg("none").repeat(MM.LEN - g.exact - g.partial)}</div></div>`);
    if (!over) rows.push(`<div class="mm-row is-current"><div class="mm-slots">${slots(current, false)}</div></div>`);
    rowsEl.innerHTML = rows.join("");
    chips();
    const full = current.length === MM.LEN;
    paletteEl.querySelector('[data-act="go"]').disabled = over || !full;
  }
  function restart() { host.clearOverlay(); secret = MM.randomSecret(); guesses = []; current = []; over = false; render(); }
  function add(c) { if (!over && current.length < MM.LEN) { current.push(c); render(); } }
  function back() { if (!over) { current.pop(); render(); } }
  function submit() {
    if (over || current.length < MM.LEN) return;
    const r = MM.score(secret, current);
    guesses.push({ guess: current.slice(), ...r }); current = [];
    const reveal = `<span class="mm-slots inline">${slots(secret, true)}</span>`;
    if (r.exact === MM.LEN) { over = true; const record = best.set("mastermind", guesses.length, true); render(); host.overlay("Code geknackt!", `In ${guesses.length} Versuchen${record ? ", neue Bestleistung!" : ""}`); }
    else if (guesses.length >= MM.MAX_TRIES) { over = true; render(); host.overlay("Leider verloren", "Der Code war " + secret.map((c) => MM_NAMES[c]).join(", ") + "."); void reveal; }
    else render();
  }
  paletteEl.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]"); if (c) return add(Number(c.dataset.c));
    const a = e.target.closest("[data-act]"); if (a) a.dataset.act === "back" ? back() : submit();
  });
  rowsEl.addEventListener("click", (e) => { const s = e.target.closest("[data-s]"); if (s && Number(s.dataset.s) < current.length) { current.splice(Number(s.dataset.s), 1); render(); } });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) {
      const n = digits(e);
      if (n && n <= 6) { add(n - 1); return true; }
      if (e.key === "Backspace") { back(); return true; }
      if (e.key === "Enter") { submit(); return true; }
      return false;
    },
    destroy() { wrap.remove(); },
  };
}

/* ---------- Galgenmännchen ---------- */

const HM_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ"];
const HM_PARTS = [
  '<line x1="20" y1="190" x2="120" y2="190"/>', '<line x1="50" y1="190" x2="50" y2="20"/>', '<line x1="50" y1="20" x2="130" y2="20"/><line x1="50" y1="50" x2="80" y2="20"/>',
  '<line x1="130" y1="20" x2="130" y2="45"/>', '<circle cx="130" cy="58" r="13"/>', '<line x1="130" y1="71" x2="130" y2="125"/>',
  '<line x1="130" y1="82" x2="108" y2="105"/><line x1="130" y1="82" x2="152" y2="105"/>', '<line x1="130" y1="125" x2="112" y2="160"/><line x1="130" y1="125" x2="148" y2="160"/>',
];

export function makeHangman() {
  let state, streak = 0;
  const wrap = root("hm");
  const figure = document.createElement("div"); figure.className = "hm-figure";
  const wordEl = document.createElement("p"); wordEl.className = "hm-word"; wordEl.setAttribute("aria-live", "polite");
  const keysEl = document.createElement("div"); keysEl.className = "hm-keys"; keysEl.setAttribute("role", "group"); keysEl.setAttribute("aria-label", "Buchstaben");
  keysEl.innerHTML = HM_LETTERS.map((l) => `<button class="hm-key" type="button" data-l="${l}">${l}</button>`).join("");
  wrap.append(figure, wordEl, keysEl);
  const chips = () => host.chips([["Fehler", `${state.wrong} / ${HM.MAX_WRONG}`], ["Serie", streak], ["Beste Serie", best.get("hangman") || 0]]);
  function render() {
    figure.innerHTML = `<svg viewBox="0 0 170 200" role="img" aria-label="Galgen mit ${state.wrong} von ${HM.MAX_WRONG} Teilen" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">${HM_PARTS.slice(0, state.wrong).join("")}</svg>`;
    wordEl.textContent = HM.mask(state).join(" ");
    keysEl.querySelectorAll("[data-l]").forEach((b) => {
      const l = b.dataset.l, used = state.guessed.includes(l);
      b.disabled = used || HM.isWon(state) || HM.isLost(state);
      b.classList.toggle("is-hit", used && state.word.includes(l)); b.classList.toggle("is-miss", used && !state.word.includes(l));
    });
    chips();
  }
  function restart() { host.clearOverlay(); state = HM.create(HM.pick()); render(); }
  function letter(l) {
    if (HM.guess(state, l) === null) return;
    render();
    if (HM.isWon(state)) { streak++; best.set("hangman", streak); render(); host.overlay("Richtig geraten!", `Das Wort war ${state.word}.`); }
    else if (HM.isLost(state)) { streak = 0; render(); host.overlay("Leider verloren", `Das Wort war ${state.word}.`); }
  }
  keysEl.addEventListener("click", (e) => { const b = e.target.closest("[data-l]"); if (b) letter(b.dataset.l); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) { const l = e.key.length === 1 ? e.key.toUpperCase() : ""; if (HM_LETTERS.includes(l)) { letter(l); return true; } return false; },
    destroy() { wrap.remove(); },
  };
}

/* ---------- Kopfrechnen-Blitz ---------- */

const MS_LEVELS = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };

export function makeMathSprint() {
  const DURATION = 60;
  let level = 1, q, score = 0, solved = 0, left = DURATION, timer = 0, running = false, deadline = 0;
  const wrap = root("mp");
  const levelBar = segmented(Object.entries(MS_LEVELS), String(level), (id) => { level = Number(id); restart(); }, "Schwierigkeit");
  const card = document.createElement("div"); card.className = "mp-card";
  card.innerHTML = '<p class="mp-q" id="mpQ" aria-live="polite">–</p><label class="sr-only" for="mpA">Antwort</label><input class="input mp-a" id="mpA" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Antwort" disabled><p class="mp-fb body-sm" id="mpFb" aria-live="polite"></p>';
  wrap.append(bar(levelBar), card);
  const qEl = card.querySelector("#mpQ"), aEl = card.querySelector("#mpA"), fbEl = card.querySelector("#mpFb");
  const key = () => "mathsprint_" + level;
  const chips = () => host.chips([["Zeit", `${Math.max(0, Math.ceil(left))} s`], ["Punkte", score], ["Richtig", solved], ["Bestwert", best.get(key()) || 0]]);
  function next() { q = MS.makeQuestion(level); qEl.textContent = q.text + " = ?"; aEl.value = ""; }
  function finish() {
    running = false; clearInterval(timer); aEl.disabled = true; aEl.blur();
    const record = best.set(key(), score);
    chips(); host.overlay("Zeit ist um!", `${solved} richtig, ${score} Punkte${record && score > 0 ? ", neuer Bestwert!" : ""}`);
  }
  function begin() {
    host.clearOverlay(); score = 0; solved = 0; left = DURATION; running = true; deadline = performance.now() + DURATION * 1000;
    aEl.disabled = false; aEl.focus({ preventScroll: true }); fbEl.textContent = ""; next(); chips();
    clearInterval(timer);
    timer = setInterval(() => { left = (deadline - performance.now()) / 1000; if (left <= 0) { left = 0; finish(); } else chips(); }, 250);
  }
  function restart() {
    clearInterval(timer); running = false; aEl.disabled = true; score = 0; solved = 0; left = DURATION; qEl.textContent = "–"; aEl.value = ""; fbEl.textContent = ""; chips();
    host.overlay("Bereit?", `${DURATION} Sekunden, so viele Aufgaben wie möglich.`, "Los");
  }
  aEl.addEventListener("input", () => {
    if (!running) return;
    aEl.value = aEl.value.replace(/\D/g, "");
    if (aEl.value !== "" && Number(aEl.value) === q.answer) { score += MS.points(level); solved++; fbEl.textContent = "Richtig!"; next(); chips(); }
  });
  aEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !running) return;
    e.preventDefault();
    if (aEl.value !== "" && Number(aEl.value) !== q.answer) { fbEl.textContent = `Nicht ganz: ${q.text} = ${q.answer}`; next(); }
  });
  host.controls("");
  restart();
  return {
    restart, canPause: false, key: () => false,
    overlayAction() { begin(); },
    destroy() { clearInterval(timer); wrap.remove(); },
  };
}
