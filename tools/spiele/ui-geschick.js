/* Spiele – Geschicklichkeit und Reaktion: Breakout, Pong, Hüpfer, Simon. Physik und Regeln: breakout.js, pong.js, huepfer.js, simon.js. */
import { $, best, host, onSwipe, sizeCanvas, roundRect, reduceMotion, segmented, bar, esc } from "./common.js";
import * as BO from "./breakout.js";
import * as PO from "./pong.js";
import * as HU from "./huepfer.js";
import * as SI from "./simon.js";

/** Bildschirm-Schleife mit begrenzter Schrittweite (läuft nur, solange sie gestartet ist). */
function loop(update, draw) {
  let raf = 0, last = 0, on = false;
  const frame = (t) => {
    if (!on) return;
    const dt = Math.min(0.033, (t - last) / 1000); last = t;
    update(dt); draw();
    raf = requestAnimationFrame(frame);
  };
  return {
    start() { if (on) return; on = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { on = false; cancelAnimationFrame(raf); },
    get on() { return on; },
  };
}

function makeCanvas(w, h, label) {
  const canvas = Object.assign(document.createElement("canvas"), { className: "sp-canvas" });
  canvas.style.aspectRatio = `${w} / ${h}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  host.stage.append(canvas);
  return canvas;
}

/** Position eines Zeigers in Spielwelt-Koordinaten. */
const toWorld = (canvas, e, w, h) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h]; };

/* ---------- Breakout ---------- */

const BRICK_COLORS = ["#e5527a", "#e08a1e", "#f2b84b", "#34a96b", "#3d82ff", "#8b5cf6", "#0057d9", "#141414"];

export function makeBreakout() {
  const canvas = makeCanvas(BO.W, BO.H, "Breakout-Spielfeld");
  let s = BO.create(1), level = 1, paused = false;

  const chips = () => host.chips([["Punkte", s.score], ["Leben", "♥".repeat(Math.max(0, s.lives))], ["Stufe", level], ["Bestwert", best.get("breakout") || 0]]);
  function draw() {
    const k = sizeCanvas(canvas, BO.W, BO.H), c = canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.scale(k, k);
    for (const b of s.bricks) if (b.alive) { c.fillStyle = BRICK_COLORS[b.row % BRICK_COLORS.length]; roundRect(c, b.x, b.y, b.w, b.h, 4); c.fill(); }
    c.fillStyle = "#141414"; roundRect(c, s.paddle.x - s.paddle.w / 2, s.paddle.y, s.paddle.w, s.paddle.h, 5); c.fill();
    c.fillStyle = "#0b5fc7"; c.beginPath(); c.arc(s.ball.x, s.ball.y, s.ball.r, 0, Math.PI * 2); c.fill();
    if (s.stuck && !s.over && !s.won) { c.fillStyle = "#707070"; c.font = "13px Inter Variable, sans-serif"; c.textAlign = "center"; c.fillText("Tippen oder Leertaste zum Start", BO.W / 2, BO.H / 2 + 40); }
    chips();
  }
  const runner = loop((dt) => {
    BO.step(s, dt);
    if (s.over) { runner.stop(); best.set("breakout", s.score); draw(); host.overlay("Game over", `${s.score} Punkte.`); }
    else if (s.won) { runner.stop(); best.set("breakout", s.score); draw(); host.overlay("Stufe geschafft!", `${s.score} Punkte. Weiter zu Stufe ${level + 1}.`, "Weiter"); }
  }, draw);
  function restart() { runner.stop(); paused = false; level = 1; s = BO.create(1); host.clearOverlay(); setPauseLabel(); draw(); runner.start(); }
  function nextLevel() { const { score, lives } = s; level++; s = BO.create(level); s.score = score; s.lives = Math.min(5, lives + 1); host.clearOverlay(); draw(); runner.start(); }
  const setPauseLabel = () => { $("pauseBtn").textContent = paused ? "Weiter" : "Pause"; };
  const go = () => { if (!paused) BO.launch(s); };
  canvas.addEventListener("pointermove", (e) => { if (!paused) BO.movePaddle(s, toWorld(canvas, e, BO.W, BO.H)[0]); });
  canvas.addEventListener("pointerdown", (e) => { if (!paused) { BO.movePaddle(s, toWorld(canvas, e, BO.W, BO.H)[0]); go(); } });
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  host.controls("");
  restart();
  return {
    restart, canPause: true,
    get paused() { return paused; },
    overlayAction() { if (paused) this.resume(); else if (s.won) nextLevel(); else restart(); },
    pause() { if (!paused && !s.over && !s.won) { paused = true; runner.stop(); setPauseLabel(); host.overlay("Pause", "Mit „Weiter“ geht es los.", "Weiter"); } },
    resume() { if (paused) { paused = false; setPauseLabel(); host.clearOverlay(); runner.start(); } },
    key(e) {
      if (e.key === "p" || e.key === "P") { paused ? this.resume() : this.pause(); return true; }
      if (e.key === " ") { go(); return true; }
      const d = { ArrowLeft: -26, ArrowRight: 26, a: -26, d: 26 }[e.key];
      if (!d) return false;
      if (!paused) BO.movePaddle(s, s.paddle.x + d);
      return true;
    },
    destroy() { runner.stop(); window.removeEventListener("resize", onResize); canvas.remove(); },
  };
}

/* ---------- Pong ---------- */

const PONG_LEVELS = { leicht: { speed: 120, label: "Leicht" }, mittel: { speed: 190, label: "Mittel" }, schwer: { speed: 280, label: "Schwer" } };

export function makePong() {
  const levelBar = segmented(Object.entries(PONG_LEVELS).map(([id, l]) => [id, l.label]), "mittel", (id) => { level = id; restart(); }, "Stärke des Computers");
  host.stage.append(bar(levelBar));
  const canvas = makeCanvas(PO.W, PO.H, "Pong-Spielfeld");
  let level = "mittel", s = PO.create(), paused = false, serveDir = 1;

  const key = () => "pong_" + level;
  const chips = () => host.chips([["Du", s.score[0]], ["Computer", s.score[1]], ["Siege hier", best.get(key()) || 0]]);
  function draw() {
    const k = sizeCanvas(canvas, PO.W, PO.H), c = canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.scale(k, k);
    c.strokeStyle = "#e0e0e0"; c.lineWidth = 3; c.setLineDash([8, 10]); c.beginPath(); c.moveTo(PO.W / 2, 0); c.lineTo(PO.W / 2, PO.H); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#e9e9e9"; c.font = "650 64px Inter Variable, sans-serif"; c.textAlign = "center";
    c.fillText(String(s.score[0]), PO.W / 2 - 60, 80); c.fillText(String(s.score[1]), PO.W / 2 + 60, 80);
    c.fillStyle = "#0b5fc7"; roundRect(c, PO.PADDLE.margin, s.left.y - PO.PADDLE.h / 2, PO.PADDLE.w, PO.PADDLE.h, 4); c.fill();
    c.fillStyle = "#141414"; roundRect(c, PO.W - PO.PADDLE.margin - PO.PADDLE.w, s.right.y - PO.PADDLE.h / 2, PO.PADDLE.w, PO.PADDLE.h, 4); c.fill();
    if (!s.serving) { c.fillStyle = "#b92658"; c.beginPath(); c.arc(s.ball.x, s.ball.y, s.ball.r, 0, Math.PI * 2); c.fill(); }
    else if (!s.over) { c.fillStyle = "#707070"; c.font = "14px Inter Variable, sans-serif"; c.fillText("Tippen oder Leertaste zum Anstoß", PO.W / 2, PO.H - 24); }
    chips();
  }
  const runner = loop((dt) => {
    const r = PO.step(s, dt, PONG_LEVELS[level].speed);
    if (r && r.scored) serveDir = r.scored === "ai" ? -1 : 1;
    if (s.over) {
      runner.stop(); draw();
      if (s.winner === "player") { best.set(key(), (best.get(key()) || 0) + 1); draw(); host.overlay("Du gewinnst!", `${s.score[0]} : ${s.score[1]}`); }
      else host.overlay("Der Computer gewinnt", `${s.score[0]} : ${s.score[1]}`);
    }
  }, draw);
  const setPauseLabel = () => { $("pauseBtn").textContent = paused ? "Weiter" : "Pause"; };
  function restart() { runner.stop(); paused = false; s = PO.create(); serveDir = 1; host.clearOverlay(); setPauseLabel(); draw(); runner.start(); }
  const serve = () => { if (!paused && s.serving && !s.over) PO.serve(s, serveDir); };
  canvas.addEventListener("pointermove", (e) => { if (!paused) PO.movePlayer(s, toWorld(canvas, e, PO.W, PO.H)[1]); });
  canvas.addEventListener("pointerdown", (e) => { if (!paused) { PO.movePlayer(s, toWorld(canvas, e, PO.W, PO.H)[1]); serve(); } });
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  host.controls("");
  restart();
  return {
    restart, canPause: true,
    get paused() { return paused; },
    pause() { if (!paused && !s.over) { paused = true; runner.stop(); setPauseLabel(); host.overlay("Pause", "Mit „Weiter“ geht es los.", "Weiter"); } },
    resume() { if (paused) { paused = false; setPauseLabel(); host.clearOverlay(); runner.start(); } },
    key(e) {
      if (e.key === "p" || e.key === "P") { paused ? this.resume() : this.pause(); return true; }
      if (e.key === " ") { serve(); return true; }
      const d = { ArrowUp: -26, ArrowDown: 26, w: -26, s: 26, W: -26, S: 26 }[e.key];
      if (!d) return false;
      if (!paused) PO.movePlayer(s, s.left.y + d);
      return true;
    },
    destroy() { runner.stop(); window.removeEventListener("resize", onResize); canvas.remove(); host.stage.querySelector(".sp-bar")?.remove(); },
  };
}

/* ---------- Hüpfer ---------- */

export function makeHuepfer() {
  const canvas = makeCanvas(HU.W, HU.H, "Hüpfer-Spielfeld");
  let s = HU.create(), paused = false, over = false, t = 0;

  const chips = () => host.chips([["Punkte", s.score], ["Bestwert", best.get("huepfer") || 0]]);
  function draw() {
    const k = sizeCanvas(canvas, HU.W, HU.H), c = canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#eaf2ff"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.scale(k, k);
    for (const p of s.pipes) {
      c.fillStyle = "#34a96b";
      c.fillRect(p.x, 0, 52, p.gapY - HU.GAP_SIZE / 2); c.fillRect(p.x, p.gapY + HU.GAP_SIZE / 2, 52, HU.H - HU.GROUND - (p.gapY + HU.GAP_SIZE / 2));
      c.fillStyle = "#238a51"; c.fillRect(p.x - 4, p.gapY - HU.GAP_SIZE / 2 - 16, 60, 16); c.fillRect(p.x - 4, p.gapY + HU.GAP_SIZE / 2, 60, 16);
    }
    c.fillStyle = "#e0e0e0"; c.fillRect(0, HU.H - HU.GROUND, HU.W, HU.GROUND);
    c.fillStyle = "#cfcfcf"; for (let x = -((t * 125) % 24); x < HU.W; x += 24) c.fillRect(x, HU.H - HU.GROUND, 12, 6);
    const y = s.started ? s.y : s.y + Math.sin(t * 5) * 6, tilt = Math.max(-0.5, Math.min(0.9, s.vy / 600));
    c.save(); c.translate(HU.BIRD_X, y); c.rotate(tilt);
    c.fillStyle = "#f2b84b"; c.beginPath(); c.arc(0, 0, HU.BIRD_R, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#e08a1e"; c.beginPath(); c.moveTo(HU.BIRD_R - 2, -2); c.lineTo(HU.BIRD_R + 9, 2); c.lineTo(HU.BIRD_R - 2, 6); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(4, -4, 4, 0, Math.PI * 2); c.fill(); c.fillStyle = "#141414"; c.beginPath(); c.arc(5.5, -4, 1.8, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = "#141414"; c.font = "650 40px Inter Variable, sans-serif"; c.textAlign = "center"; c.fillText(String(s.score), HU.W / 2, 64);
    if (!s.started && !over) { c.fillStyle = "#707070"; c.font = "14px Inter Variable, sans-serif"; c.fillText("Tippen oder Leertaste zum Flattern", HU.W / 2, HU.H / 2 + 70); }
    chips();
  }
  const runner = loop((dt) => {
    t += dt;
    HU.step(s, dt);
    if (s.over && !over) { over = true; best.set("huepfer", s.score); runner.stop(); draw(); host.overlay("Autsch!", `${s.score} Punkte.`); }
  }, draw);
  const setPauseLabel = () => { $("pauseBtn").textContent = paused ? "Weiter" : "Pause"; };
  function restart() { runner.stop(); paused = false; over = false; s = HU.create(); host.clearOverlay(); setPauseLabel(); draw(); runner.start(); }
  const flap = () => { if (!paused && !over) HU.flap(s); };
  canvas.addEventListener("pointerdown", flap);
  const onResize = () => draw();
  window.addEventListener("resize", onResize);
  host.controls("");
  restart();
  return {
    restart, canPause: true,
    get paused() { return paused; },
    pause() { if (!paused && !over && s.started) { paused = true; runner.stop(); setPauseLabel(); host.overlay("Pause", "Mit „Weiter“ geht es los.", "Weiter"); } },
    resume() { if (paused) { paused = false; setPauseLabel(); host.clearOverlay(); runner.start(); } },
    key(e) {
      if (e.key === "p" || e.key === "P") { paused ? this.resume() : this.pause(); return true; }
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") { flap(); return true; }
      return false;
    },
    destroy() { runner.stop(); window.removeEventListener("resize", onResize); canvas.remove(); },
  };
}

/* ---------- Simon ---------- */

const SIMON_COLORS = ["#0b5fc7", "#34a96b", "#f2b84b", "#e5527a"];
const SIMON_NAMES = ["Blau", "Grün", "Gelb", "Rosa"];
const SIMON_FREQ = [329.63, 261.63, 392, 523.25];

export function makeSimon() {
  let seq = [], input = [], phase = "idle", sound = false, audio = null;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const wrap = document.createElement("div"); wrap.className = "si";
  const soundBtn = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-soft btn-sm flag-toggle", textContent: "Ton" });
  soundBtn.setAttribute("aria-pressed", "false");
  wrap.append(bar(soundBtn));
  const grid = document.createElement("div"); grid.className = "si-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "Simon-Felder");
  grid.innerHTML = SIMON_COLORS.map((c, i) => `<button class="si-pad" type="button" data-p="${i}" style="--c:${c}" aria-label="${SIMON_NAMES[i]} (Taste ${i + 1})"></button>`).join("");
  wrap.append(grid);
  host.stage.append(wrap);
  const pads = [...grid.children];

  const chips = () => host.chips([["Runde", Math.max(0, seq.length - (phase === "over" ? 1 : 0))], ["Bestwert", best.get("simon") || 0]]);
  function beep(i) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = SIMON_FREQ[i]; g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.3);
    } catch (_) { /* kein Ton möglich */ }
  }
  function flash(i, ms = 380) { pads[i].classList.add("is-lit"); beep(i); later(() => pads[i].classList.remove("is-lit"), ms); }
  function setLocked(v) { pads.forEach((p) => { p.disabled = v; }); }
  function playback() {
    phase = "showing"; input = []; setLocked(true); chips();
    const gap = Math.max(260, 620 - seq.length * 22);
    seq.forEach((p, k) => later(() => flash(p, gap * 0.7), 700 + k * gap));
    later(() => { phase = "input"; setLocked(false); pads[0].focus({ preventScroll: true }); }, 700 + seq.length * gap);
  }
  function begin() { host.clearOverlay(); seq = SI.extend([]); phase = "showing"; playback(); }
  function restart() {
    timers.forEach(clearTimeout); timers.clear(); seq = []; input = []; phase = "idle"; setLocked(true); pads.forEach((p) => p.classList.remove("is-lit")); chips();
    host.overlay("Bereit?", "Merk dir die Farbfolge und spiel sie nach.", "Los");
  }
  function press(i) {
    if (phase !== "input") return;
    flash(i, 200); input.push(i);
    const r = SI.check(seq, input);
    if (r === "wrong") { phase = "over"; setLocked(true); const rounds = seq.length - 1; best.set("simon", rounds); chips(); host.overlay("Falsch!", `Du hast ${rounds} ${rounds === 1 ? "Runde" : "Runden"} geschafft.`); }
    else if (r === "done") { phase = "showing"; setLocked(true); best.set("simon", seq.length); seq = SI.extend(seq); chips(); later(playback, 800); }
  }
  grid.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-p]"); if (b) { e.preventDefault(); press(Number(b.dataset.p)); } });
  soundBtn.addEventListener("click", () => { sound = !sound; soundBtn.setAttribute("aria-pressed", String(sound)); soundBtn.textContent = sound ? "Ton an" : "Ton"; });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    overlayAction() { phase === "idle" ? begin() : restart() || begin(); },
    key(e) { const n = /^[1-4]$/.test(e.key) ? Number(e.key) - 1 : null; if (n === null) return false; press(n); return true; },
    destroy() { timers.forEach(clearTimeout); timers.clear(); wrap.remove(); },
  };
}
