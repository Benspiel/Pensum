/* Kleine Arcade-Spiele mit gemeinsamer Touch- und Tastatursteuerung. */
import { host, best, haptic } from './common.js';

function arcade(kind) {
  const canvas = document.createElement('canvas');
  canvas.className = 'arcade-canvas'; canvas.width = 600; canvas.height = 700;
  canvas.setAttribute('aria-label', kind === 'dodge' ? 'Neon Drift: Ziehe nach links oder rechts, um Hindernissen auszuweichen.' : 'Sky Stack: Tippe, um den schwebenden Block abzusetzen.');
  host.stage.append(canvas); host.controls('');
  const ctx = canvas.getContext('2d');
  let running = false, paused = false, ended = false, raf = 0, last = 0, score = 0, player, blocks, spawn, stack, moving, direction;
  const keyName = 'arcade_' + kind;
  function stats() { host.chips([['Punkte', score], ['Bestwert', best.get(keyName) || 0]]); }
  function init() {
    score = 0; player = 300; blocks = []; spawn = 0;
    stack = [{ x: 180, w: 240 }]; moving = { x: 0, w: 240 }; direction = 1;
    last = 0; running = false; paused = false; ended = false; stats(); draw();
    host.overlay(kind === 'dodge' ? 'Neon Drift' : 'Sky Stack', kind === 'dodge' ? 'Ziehe dein Schiff und weiche den Hindernissen aus. Mit Pfeiltasten geht’s auch.' : 'Tippe im richtigen Moment: Staple die Blöcke so hoch wie möglich.', 'Los geht’s');
  }
  function start() { host.clearOverlay(); running = true; paused = false; last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
  function finish() {
    running = false; ended = true; haptic([35, 50, 35]); best.set(keyName, score); stats(); draw();
    host.overlay('Runde beendet', `${score} Punkte · Bestwert ${best.get(keyName) || 0}`, 'Nochmal');
  }
  function action() {
    if (!running || kind !== 'stack') return;
    const previous = stack[stack.length - 1], left = Math.max(previous.x, moving.x), right = Math.min(previous.x + previous.w, moving.x + moving.w);
    if (right - left < 8) { finish(); return; }
    const perfect = Math.abs(moving.x - previous.x) < 9;
    stack.push({ x: perfect ? previous.x : left, w: perfect ? previous.w : right - left });
    score++; haptic(perfect ? [10, 30, 10] : 10); stats();
    moving = { x: direction > 0 ? 600 - stack.at(-1).w : 0, w: stack.at(-1).w }; direction *= -1;
    draw();
  }
  function tick(now) {
    if (!running) return;
    const dt = Math.min((now - (last || now)) / 1000, .035); last = now;
    if (kind === 'dodge') {
      spawn -= dt;
      if (spawn <= 0) { blocks.push({ x: 25 + Math.random() * 500, y: -60, w: 50 + Math.random() * 50 }); spawn = Math.max(.42, 1.05 - score * .012); }
      for (const b of blocks) b.y += (240 + score * 4) * dt;
      for (const b of blocks) if (b.y > 585 && b.y < 650 && Math.abs((b.x + b.w / 2) - player) < b.w / 2 + 20) { finish(); return; }
      const before = blocks.length; blocks = blocks.filter(b => b.y < 730);
      if (blocks.length !== before) { score += before - blocks.length; stats(); }
    } else {
      moving.x += direction * (190 + score * 9) * dt;
      if (moving.x <= 0 || moving.x + moving.w >= 600) { moving.x = Math.max(0, Math.min(600 - moving.w, moving.x)); direction *= -1; }
    }
    draw(); raf = requestAnimationFrame(tick);
  }
  function draw() {
    ctx.fillStyle = '#10152b'; ctx.fillRect(0, 0, 600, 700);
    ctx.fillStyle = '#ffffff12'; for (let i = 0; i < 25; i++) ctx.fillRect((i * 173 + 31) % 600, (i * 109 + 20) % 700, 3, 3);
    if (kind === 'dodge') {
      ctx.fillStyle = '#ff7198'; blocks.forEach(b => { ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, 35, 12); ctx.fill(); });
      ctx.fillStyle = '#75e5ed'; ctx.beginPath(); ctx.moveTo(player, 580); ctx.lineTo(player - 25, 640); ctx.lineTo(player, 628); ctx.lineTo(player + 25, 640); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff99'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ZIEHEN ZUM STEUERN', 300, 680);
    } else {
      const visible = stack.slice(-10), base = 650;
      visible.forEach((b, i) => { ctx.fillStyle = `hsl(${185 + (score - visible.length + i) * 13} 75% 65%)`; ctx.beginPath(); ctx.roundRect(b.x, base - i * 46, b.w, 39, 8); ctx.fill(); });
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(moving.x, base - visible.length * 46, moving.w, 39, 8); ctx.fill();
      ctx.fillStyle = '#ffffff99'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TIPPEN ZUM ABSETZEN', 300, 50);
    }
  }
  let pointer = null;
  function move(e) { if (kind !== 'dodge' || !running || pointer !== e.pointerId) return; const r = canvas.getBoundingClientRect(); player = Math.max(25, Math.min(575, (e.clientX - r.left) / r.width * 600)); }
  canvas.addEventListener('pointerdown', e => { if (!running) return; e.preventDefault(); pointer = e.pointerId; canvas.setPointerCapture(e.pointerId); if (kind === 'dodge') move(e); else action(); });
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', () => { pointer = null; });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  init();
  return {
    get paused() { return paused; }, canPause: true,
    pause() { if (!running) return; running = false; paused = true; cancelAnimationFrame(raf); host.overlay('Pause', 'Bereit für die nächste Runde?', 'Weiter'); },
    resume: start,
    overlayAction() { if (paused) start(); else if (ended) { init(); start(); } else start(); },
    restart() { init(); start(); },
    key(e) { if (!running) return false; if (kind === 'stack' && (e.key === ' ' || e.key === 'Enter')) { action(); return true; } if (kind === 'dodge' && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { player = Math.max(25, Math.min(575, player + (e.key === 'ArrowLeft' ? -35 : 35))); return true; } return false; },
    destroy() { running = false; cancelAnimationFrame(raf); canvas.remove(); },
  };
}
export const makeNeonDrift = () => arcade('dodge');
export const makeSkyStack = () => arcade('stack');
