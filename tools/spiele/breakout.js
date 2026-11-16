/* Breakout (Steine ausbrechen) – Physik und Regeln. Koordinaten in einer festen Spielwelt W × H. */
export const W = 320, H = 440;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function create(level = 1) {
  const rows = Math.min(8, 4 + level), cols = 8, bw = 34, bh = 14, gap = 4, left = (W - (cols * (bw + gap) - gap)) / 2;
  const bricks = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ x: left + c * (bw + gap), y: 44 + r * (bh + gap), w: bw, h: bh, row: r, alive: true });
  const paddle = { x: W / 2, y: H - 28, w: 64, h: 10 };
  return { level, bricks, paddle, ball: { x: W / 2, y: paddle.y - 7, vx: 0, vy: 0, r: 6 }, stuck: true, speed: 230 + level * 20, lives: 3, score: 0, over: false, won: false };
}

export function movePaddle(s, x) {
  s.paddle.x = clamp(x, s.paddle.w / 2, W - s.paddle.w / 2);
  if (s.stuck) s.ball.x = s.paddle.x;
}

export function launch(s, rng = Math.random) {
  if (!s.stuck || s.over || s.won) return;
  const a = (-90 + (rng() * 40 - 20)) * Math.PI / 180;
  s.ball.vx = Math.cos(a) * s.speed; s.ball.vy = Math.sin(a) * s.speed; s.stuck = false;
}

/** Ein Zeitschritt von dt Sekunden (in kleinen Teilschritten, damit nichts durchfliegt). */
export function step(s, dt) {
  if (s.over || s.won || s.stuck) return;
  const n = Math.max(1, Math.ceil((s.speed * dt) / 3));
  for (let i = 0; i < n; i++) {
    const b = s.ball, h = dt / n, px = b.x, py = b.y;
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
    const p = s.paddle;
    if (b.vy > 0 && b.y + b.r >= p.y && b.y + b.r <= p.y + p.h + 6 && Math.abs(b.x - p.x) <= p.w / 2 + b.r) {
      const hit = clamp((b.x - p.x) / (p.w / 2), -1, 1), a = hit * 62 * Math.PI / 180;
      b.vx = Math.sin(a) * s.speed; b.vy = -Math.cos(a) * s.speed; b.y = p.y - b.r;
    }
    for (const br of s.bricks) {
      if (!br.alive) continue;
      const cx = clamp(b.x, br.x, br.x + br.w), cy = clamp(b.y, br.y, br.y + br.h);
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 > b.r * b.r) continue;
      br.alive = false; s.score += 10 * (8 - Math.min(br.row, 7));
      // Von wo kam der Ball? Danach richtet sich, wohin er abprallt (Richtung wird gesetzt, nicht gespiegelt: kein Doppeltreffer)
      if (py >= br.y + br.h) { b.vy = Math.abs(b.vy); b.y = br.y + br.h + b.r; }
      else if (py <= br.y) { b.vy = -Math.abs(b.vy); b.y = br.y - b.r; }
      else if (px <= br.x) { b.vx = -Math.abs(b.vx); b.x = br.x - b.r; }
      else { b.vx = Math.abs(b.vx); b.x = br.x + br.w + b.r; }
      s.speed = Math.min(430, s.speed + 2);
      const v = Math.hypot(b.vx, b.vy); b.vx = b.vx / v * s.speed; b.vy = b.vy / v * s.speed;
      break;
    }
    if (s.bricks.every((x) => !x.alive)) { s.won = true; return; }
    if (b.y - b.r > H) {
      s.lives--; s.stuck = true; b.vx = 0; b.vy = 0; b.x = s.paddle.x; b.y = s.paddle.y - b.r - 1;
      if (s.lives <= 0) s.over = true;
      return;
    }
  }
}
