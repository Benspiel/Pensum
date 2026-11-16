/* Spiele – Oberfläche: 2048, Snake, Tetris, Minesweeper. Die Regeln liegen in g2048.js, snake.js, tetris.js und
 * minesweeper.js (ohne Oberfläche, getestet). Bestwerte liegen nur im localStorage dieses Browsers. */
import { toast, esc } from "/js/shell.js";
import * as G from "./g2048.js";
import * as S from "./snake.js";
import * as T from "./tetris.js";
import * as M from "./minesweeper.js";

const $ = (id) => document.getElementById(id);
const BEST_KEY = "pensum.spiele.best.v1";
const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------- Bestwerte ---------- */

const best = {
  read() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {}; } catch (_) { return {}; } },
  get(key) { const v = this.read()[key]; return typeof v === "number" ? v : null; },
  /** Speichert nur Verbesserungen. lower: kleinere Werte sind besser (Zeit). Liefert true bei neuem Bestwert. */
  set(key, value, lower = false) {
    const all = this.read(), old = all[key];
    if (typeof old === "number" && (lower ? value >= old : value <= old)) return false;
    all[key] = value;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (_) { /* privater Modus: dann eben nicht */ }
    return true;
  },
};

/* ---------- Gemeinsame Oberfläche ---------- */

const host = {
  stage: $("stage"),
  chips(list) {
    $("chips").innerHTML = list.map(([label, value]) => `<span class="chip-stat">${esc(label)} <strong>${esc(value)}</strong></span>`).join("");
  },
  overlay(title, text, action = "Nochmal") {
    $("overlayTitle").textContent = title; $("overlayText").textContent = text; $("overlayBtn").textContent = action;
    $("overlay").hidden = false;
    $("overlayBtn").focus({ preventScroll: true });
  },
  clearOverlay() { $("overlay").hidden = true; },
  controls(html, { touchOnly = true } = {}) {
    const c = $("controls");
    c.innerHTML = html;
    c.classList.toggle("touch-only", touchOnly);
    return c;
  },
};

/** Wischgesten: ruft cb("left" | "right" | "up" | "down") auf. */
function onSwipe(el, cb, min = 24) {
  let start = null;
  const down = (e) => { start = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", () => { start = null; });
  return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", up); };
}

/** Leinwand scharf zeichnen: passt die Pixelgröße an die Anzeigegröße an. */
function sizeCanvas(canvas, cols, rows) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.width = w; canvas.height = Math.round((w * rows) / cols);
  return canvas.width / cols; // Pixel je Feld
}
const roundRect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down" };

/* ---------- 2048 ---------- */

function make2048() {
  const KEY = "g2048";
  const el = document.createElement("div");
  el.className = "g2048";
  el.setAttribute("role", "grid");
  el.setAttribute("aria-label", "2048-Spielfeld");
  host.stage.append(el);
  let board, score, over, won;

  const chips = () => host.chips([["Punkte", score], ["Bestwert", best.get(KEY) || 0]]);
  const draw = (fresh = -1) => {
    el.innerHTML = board.flat().map((v, i) => `<div class="tile t${v > 2048 ? "big" : v}${i === fresh && !reduceMotion() ? " is-new" : ""}" role="gridcell"${v ? ` aria-label="${v}"` : ""}>${v || ""}</div>`).join("");
    chips();
  };
  function restart() { board = G.newGame(); score = 0; over = false; won = false; host.clearOverlay(); draw(); }
  function act(dir) {
    if (over) return;
    const r = G.move(board, dir);
    if (!r.moved) return;
    score += r.score;
    const t = G.addTile(r.board);
    board = t.board;
    best.set(KEY, score);
    draw(t.y * 4 + t.x);
    if (!won && G.maxTile(board) >= 2048) { won = true; toast("2048 erreicht! Du kannst weiterspielen."); }
    if (!G.canMove(board)) { over = true; host.overlay("Keine Züge mehr", `Dein Ergebnis: ${score} Punkte.`); }
  }
  const stopSwipe = onSwipe(el, act);
  restart();
  host.controls("");
  return {
    restart, canPause: false,
    key(e) { const d = KEYS[e.key]; if (!d) return false; act(d); return true; },
    destroy() { stopSwipe(); el.remove(); },
  };
}

/* ---------- Snake ---------- */

function makeSnake() {
  const KEY = "snake", W = 18, H = 18;
  const canvas = Object.assign(document.createElement("canvas"), { className: "sp-canvas" });
  canvas.style.aspectRatio = `${W} / ${H}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Snake-Spielfeld");
  host.stage.append(canvas);
  let state, timer = 0, running = false, paused = false;

  const chips = () => host.chips([["Punkte", state.score], ["Bestwert", best.get(KEY) || 0]]);
  function draw() {
    const k = sizeCanvas(canvas, W, H), c = canvas.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#f4f4f4";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2) c.fillRect(x * k, y * k, k, k);
    if (state.food) { c.fillStyle = "#b92658"; c.beginPath(); c.arc((state.food.x + 0.5) * k, (state.food.y + 0.5) * k, k * 0.36, 0, Math.PI * 2); c.fill(); }
    state.snake.forEach((p, i) => {
      c.fillStyle = i === 0 ? "#0a47b0" : "#0b5fc7";
      roundRect(c, p.x * k + k * 0.06, p.y * k + k * 0.06, k * 0.88, k * 0.88, k * 0.3); c.fill();
    });
    const h = state.snake[0];
    c.fillStyle = "#fff"; // Augen
    const d = S.DIRS[state.dir], ex = -d.y, ey = d.x;
    for (const s of [-1, 1]) { c.beginPath(); c.arc((h.x + 0.5 + d.x * 0.18 + ex * 0.2 * s) * k, (h.y + 0.5 + d.y * 0.18 + ey * 0.2 * s) * k, k * 0.08, 0, Math.PI * 2); c.fill(); }
    chips();
  }
  const loop = () => {
    timer = setTimeout(() => {
      if (!running || paused) return;
      const r = S.step(state);
      if (r && r.ate) best.set(KEY, state.score);
      draw();
      if (!state.alive) { running = false; host.overlay(state.won ? "Geschafft!" : "Game over", `Dein Ergebnis: ${state.score} Punkte.`); return; }
      loop();
    }, S.interval(state));
  };
  function begin() { if (!running && state.alive) { running = true; host.clearOverlay(); loop(); } }
  function restart() {
    clearTimeout(timer); state = S.createSnake(W, H); running = false; paused = false; setPauseLabel();
    draw();
    host.overlay("Bereit?", "Wische, tippe auf einen Pfeil oder drücke eine Pfeiltaste zum Start.", "Los");
  }
  function go(dir) { if (paused) return; S.turn(state, dir); begin(); }
  function setPauseLabel() { $("pauseBtn").textContent = paused ? "Weiter" : "Pause"; }
  const stopSwipe = onSwipe(canvas, go, 20);
  const ctl = host.controls(`<div class="dpad" role="group" aria-label="Steuerung">
    <button class="pad-btn up" type="button" data-d="up" aria-label="Hoch">↑</button><button class="pad-btn left" type="button" data-d="left" aria-label="Links">←</button>
    <button class="pad-btn down" type="button" data-d="down" aria-label="Runter">↓</button><button class="pad-btn right" type="button" data-d="right" aria-label="Rechts">→</button></div>`);
  const onPad = (e) => { const b = e.target.closest("[data-d]"); if (b) go(b.dataset.d); };
  ctl.addEventListener("pointerdown", onPad);
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  restart();
  return {
    restart, canPause: true,
    get paused() { return paused; },
    overlayAction() { if (paused) this.resume(); else if (!running && state.alive) begin(); else restart(); },
    pause() { if (running && !paused) { paused = true; clearTimeout(timer); setPauseLabel(); host.overlay("Pause", "Mit „Weiter“ geht es los.", "Weiter"); } },
    resume() { if (paused) { paused = false; setPauseLabel(); host.clearOverlay(); loop(); } },
    key(e) {
      if (e.key === " " || e.key === "p" || e.key === "P") { if (running) { paused ? this.resume() : this.pause(); } return true; }
      const d = KEYS[e.key]; if (!d) return false; go(d); return true;
    },
    destroy() { clearTimeout(timer); running = false; stopSwipe(); ctl.removeEventListener("pointerdown", onPad); window.removeEventListener("resize", onResize); canvas.remove(); },
  };
}

/* ---------- Tetris ---------- */

const TCOLORS = { I: "#3d82ff", O: "#f2b84b", T: "#8b5cf6", S: "#34a96b", Z: "#e5527a", J: "#0057d9", L: "#e08a1e" };

function makeTetris() {
  const KEY = "tetris";
  const wrap = document.createElement("div");
  wrap.className = "tetris";
  wrap.innerHTML = `<div class="board"><canvas class="sp-canvas" role="img" aria-label="Tetris-Spielfeld"></canvas></div>
    <div class="side"><div><p class="caption">Nächster</p><div class="next"><canvas role="img" aria-label="Nächster Stein"></canvas></div></div></div>`;
  host.stage.append(wrap);
  const canvas = wrap.querySelector(".board canvas"), nextCanvas = wrap.querySelector(".next canvas");
  canvas.style.aspectRatio = `${T.COLS} / ${T.ROWS}`;
  nextCanvas.style.aspectRatio = "1 / 1";
  let game, timer = 0, running = false, paused = false;

  const chips = () => host.chips([["Punkte", game.score], ["Stufe", game.level], ["Zeilen", game.lines], ["Bestwert", best.get(KEY) || 0]]);
  const cell = (c, x, y, k, color, alpha = 1) => {
    c.globalAlpha = alpha; c.fillStyle = color;
    roundRect(c, x * k + 1, y * k + 1, k - 2, k - 2, k * 0.22); c.fill(); c.globalAlpha = 1;
  };
  function draw() {
    const k = sizeCanvas(canvas, T.COLS, T.ROWS), c = canvas.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#f4f4f4";
    for (let y = 0; y < T.ROWS; y++) for (let x = 0; x < T.COLS; x++) if ((x + y) % 2) c.fillRect(x * k, y * k, k, k);
    game.board.forEach((row, y) => row.forEach((t, x) => { if (t) cell(c, x, y, k, TCOLORS[t]); }));
    if (!game.over) {
      const gy = T.ghostY(game);
      game.cur.matrix.forEach((row, ry) => row.forEach((v, rx) => { if (v) cell(c, game.cur.x + rx, gy + ry, k, TCOLORS[game.cur.type], 0.22); }));
      game.cur.matrix.forEach((row, ry) => row.forEach((v, rx) => { if (v && game.cur.y + ry >= 0) cell(c, game.cur.x + rx, game.cur.y + ry, k, TCOLORS[game.cur.type]); }));
    }
    const nk = sizeCanvas(nextCanvas, 4, 4), n = nextCanvas.getContext("2d");
    n.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const m = T.shapeOf(game.next), ox = (4 - m[0].length) / 2, oy = game.next === "I" ? 0 : (4 - m.length) / 2 - 0.5;
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cell(n, ox + x, oy + y + (game.next === "I" ? 0 : 0.5), nk, TCOLORS[game.next]); }));
    chips();
  }
  const finish = () => { running = false; clearTimeout(timer); host.overlay("Game over", `${game.score} Punkte, ${game.lines} Zeilen.`); };
  const afterLock = () => { best.set(KEY, game.score); if (game.over) finish(); };
  const loop = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!running || paused) return;
      const r = T.tick(game);
      if (r.locked) afterLock();
      draw();
      if (running) loop();
    }, T.dropInterval(game.level));
  };
  const setPauseLabel = () => { $("pauseBtn").textContent = paused ? "Weiter" : "Pause"; };
  function restart() {
    clearTimeout(timer); game = T.createGame(); running = true; paused = false; setPauseLabel(); host.clearOverlay(); draw(); loop();
  }
  const act = {
    left() { T.tryMove(game, -1, 0); },
    right() { T.tryMove(game, 1, 0); },
    rotate() { T.tryRotate(game); },
    down() { if (T.tryMove(game, 0, 1)) game.score += 1; else { if (T.tick(game).locked) afterLock(); loop(); } },
    drop() { T.hardDrop(game); afterLock(); loop(); },
  };
  const press = (name) => { if (!running || paused || game.over) return; act[name](); draw(); };

  // Knöpfe: Links, Rechts und Runter wiederholen beim Halten
  const ctl = host.controls(`<div class="sp-controls-row" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center" role="group" aria-label="Steuerung">
    <button class="pad-btn" type="button" data-a="left" aria-label="Nach links">←</button>
    <button class="pad-btn" type="button" data-a="rotate" aria-label="Drehen">⟳</button>
    <button class="pad-btn" type="button" data-a="right" aria-label="Nach rechts">→</button>
    <button class="pad-btn" type="button" data-a="down" aria-label="Schneller fallen">↓</button>
    <button class="pad-btn" type="button" data-a="drop" aria-label="Sofort fallen lassen">⤓</button></div>`);
  let hold = 0;
  const stopHold = () => { clearInterval(hold); hold = 0; };
  const onDown = (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a; press(a); stopHold();
    if (a === "left" || a === "right" || a === "down") hold = setInterval(() => press(a), 90);
  };
  ctl.addEventListener("pointerdown", onDown);
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) ctl.addEventListener(ev, stopHold);
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  restart();
  return {
    restart, canPause: true,
    get paused() { return paused; },
    pause() { if (running && !paused) { paused = true; clearTimeout(timer); setPauseLabel(); host.overlay("Pause", "Mit „Weiter“ geht es los.", "Weiter"); } },
    resume() { if (paused) { paused = false; setPauseLabel(); host.clearOverlay(); loop(); } },
    key(e) {
      if (e.key === "p" || e.key === "P") { paused ? this.resume() : this.pause(); return true; }
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "rotate", x: "rotate", X: "rotate", " ": "drop", a: "left", d: "right", s: "down", w: "rotate" };
      const a = map[e.key]; if (!a) return false; press(a); return true;
    },
    destroy() { clearTimeout(timer); stopHold(); running = false; ctl.removeEventListener("pointerdown", onDown); window.removeEventListener("resize", onResize); wrap.remove(); },
  };
}

/* ---------- Minesweeper ---------- */

function makeMinesweeper() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="mines-bar">
      <div class="segmented" id="mineLevels" role="group" aria-label="Schwierigkeit">${Object.entries(M.LEVELS).map(([id, l]) => `<button type="button" data-level="${id}" aria-pressed="false">${l.label}</button>`).join("")}</div>
      <button class="btn btn-soft btn-sm flag-toggle" type="button" id="flagMode" aria-pressed="false">Fahne setzen</button>
    </div><div class="mine-grid" id="mineGrid" role="grid" aria-label="Minesweeper-Spielfeld"></div>`;
  host.stage.append(wrap);
  const grid = wrap.querySelector("#mineGrid"), levelBar = wrap.querySelector("#mineLevels"), flagBtn = wrap.querySelector("#flagMode");
  let level = "leicht", board, startedAt = 0, ticker = 0, elapsed = 0, flagMode = false, longPress = 0, cursor = [0, 0];

  const bestKey = () => "mine_" + level;
  const timeText = () => `${Math.min(999, Math.floor(elapsed))} s`;
  const chips = () => {
    const b = best.get(bestKey());
    host.chips([["Minen", M.flagsLeft(board)], ["Zeit", timeText()], ["Bestzeit", b == null ? "–" : b + " s"]]);
  };
  function render() {
    levelBar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.level === level)));
    grid.style.setProperty("--cols", board.w);
    grid.innerHTML = board.cells.map((row, y) => row.map((c, x) => {
      let cls = "mine-cell", text = "", label = "verdecktes Feld";
      if (c.open) { cls += " is-open"; if (c.mine) { cls += " is-mine"; text = "●"; label = "Mine"; } else if (c.n) { cls += " n" + c.n; text = c.n; label = c.n + " Minen in der Nähe"; } else label = "leeres Feld"; }
      else if (c.flag) { text = "⚑"; label = "Fahne"; }
      return `<button class="${cls}" type="button" role="gridcell" data-x="${x}" data-y="${y}" aria-label="${label}, Spalte ${x + 1}, Zeile ${y + 1}" tabindex="${x === cursor[0] && y === cursor[1] ? 0 : -1}">${text}</button>`;
    }).join("")).join("");
    chips();
  }
  function stopTimer() { clearInterval(ticker); ticker = 0; }
  function startTimer() { if (ticker) return; startedAt = performance.now(); ticker = setInterval(() => { elapsed = (performance.now() - startedAt) / 1000; chips(); }, 500); }
  function check() {
    if (board.state === "play") startTimer();
    if (board.state === "won" || board.state === "lost") {
      stopTimer();
      if (startedAt) elapsed = (performance.now() - startedAt) / 1000;
      if (board.state === "won") {
        const t = Math.max(1, Math.round(elapsed));
        const record = best.set(bestKey(), t, true);
        host.overlay("Geschafft!", `${t} s${record ? ", neue Bestzeit!" : ""}`);
      } else host.overlay("Boom!", "Eine Mine. Probier es noch einmal.");
    }
    render();
  }
  function restart() {
    stopTimer(); board = M.createBoard(M.LEVELS[level].w, M.LEVELS[level].h, M.LEVELS[level].mines); elapsed = 0; startedAt = 0; cursor = [0, 0];
    host.clearOverlay(); render();
  }
  function open(x, y) {
    const c = board.cells[y][x];
    if (flagMode && !c.open) M.toggleFlag(board, x, y);
    else if (c.open) M.chord(board, x, y);
    else M.reveal(board, x, y);
    check();
  }
  levelBar.addEventListener("click", (e) => { const b = e.target.closest("[data-level]"); if (b && b.dataset.level !== level) { level = b.dataset.level; restart(); } });
  flagBtn.addEventListener("click", () => { flagMode = !flagMode; flagBtn.setAttribute("aria-pressed", String(flagMode)); });
  const target = (e) => { const b = e.target.closest(".mine-cell"); return b ? [Number(b.dataset.x), Number(b.dataset.y)] : null; };
  let suppress = false;
  grid.addEventListener("click", (e) => { const t = target(e); if (!t) return; if (suppress) { suppress = false; return; } cursor = t; open(...t); });
  grid.addEventListener("contextmenu", (e) => { const t = target(e); if (!t) return; e.preventDefault(); cursor = t; M.toggleFlag(board, ...t); check(); });
  // Lange drücken setzt auf dem Handy eine Fahne
  grid.addEventListener("pointerdown", (e) => {
    const t = e.pointerType === "mouse" ? null : target(e); if (!t) return;
    clearTimeout(longPress);
    longPress = setTimeout(() => { suppress = true; cursor = t; M.toggleFlag(board, ...t); if (navigator.vibrate) navigator.vibrate(15); check(); }, 450);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave", "pointermove"]) grid.addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(longPress); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        cursor = [Math.min(board.w - 1, Math.max(0, cursor[0] + d[0])), Math.min(board.h - 1, Math.max(0, cursor[1] + d[1]))];
        render(); grid.querySelector(`[data-x="${cursor[0]}"][data-y="${cursor[1]}"]`)?.focus(); return true;
      }
      if (e.key === "f" || e.key === "F") { M.toggleFlag(board, ...cursor); check(); grid.querySelector(`[data-x="${cursor[0]}"][data-y="${cursor[1]}"]`)?.focus(); return true; }
      if (e.key === " " || e.key === "Enter") { open(...cursor); grid.querySelector(`[data-x="${cursor[0]}"][data-y="${cursor[1]}"]`)?.focus(); return true; }
      return false;
    },
    destroy() { stopTimer(); clearTimeout(longPress); wrap.remove(); },
  };
}

/* ---------- Spielwahl ---------- */

const GAMES = {
  "2048": { title: "2048.", make: make2048, help: "Wische oder nutze die Pfeiltasten. Gleiche Zahlen verschmelzen. Erreiche die 2048." },
  snake: { title: "Snake.", make: makeSnake, help: "Pfeiltasten, WASD, Wischen oder die Knöpfe. Leertaste oder P pausiert. Friss die roten Punkte, ohne Wand und eigenen Körper zu berühren." },
  tetris: { title: "Tetris.", make: makeTetris, help: "← → bewegen, ↑ oder X drehen, ↓ schneller, Leertaste lässt den Stein fallen, P pausiert. Am Handy nutzt du die Knöpfe (halten wiederholt)." },
  minesweeper: { title: "Minesweeper.", make: makeMinesweeper, help: "Klick deckt auf, Rechtsklick oder F setzt eine Fahne (am Handy lange drücken oder „Fahne setzen“). Auf eine Zahl klicken deckt die Nachbarn auf, wenn genug Fahnen stehen. Das erste Feld ist immer sicher." },
};

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
$("gameTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-game]"); if (b) { select(b.dataset.game); focusStage(); } });
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

select(GAMES[location.hash.slice(1)] ? location.hash.slice(1) : "2048", { push: false });
