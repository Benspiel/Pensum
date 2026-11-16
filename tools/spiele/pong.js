/* Pong gegen den Computer – Physik und Regeln. Wer zuerst WIN_SCORE Punkte hat, gewinnt. */
export const W = 480, H = 300, WIN_SCORE = 7;
const PH = 64, PW = 8, MARGIN = 14;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function create() {
  const s = { left: { y: H / 2 }, right: { y: H / 2 }, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 6 }, score: [0, 0], over: false, winner: null, serving: true, speed: 260 };
  return s;
}

export function serve(s, dir = 1, rng = Math.random) {
  const a = (rng() * 50 - 25) * Math.PI / 180;
  s.ball.x = W / 2; s.ball.y = H / 2; s.speed = 260;
  s.ball.vx = Math.cos(a) * s.speed * dir; s.ball.vy = Math.sin(a) * s.speed; s.serving = false;
}

export const movePlayer = (s, y) => { s.left.y = clamp(y, PH / 2, H - PH / 2); };

/** aiSpeed: wie schnell der Computer-Schläger höchstens ist (Pixel pro Sekunde). */
export function step(s, dt, aiSpeed = 190) {
  if (s.over || s.serving) return null;
  const b = s.ball;
  // Computer: folgt dem Ball mit begrenzter Geschwindigkeit
  const target = b.vx > 0 ? b.y : H / 2, d = target - s.right.y;
  s.right.y = clamp(s.right.y + clamp(d, -aiSpeed * dt, aiSpeed * dt), PH / 2, H - PH / 2);
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
  if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
  const hitPaddle = (p, x, dir) => {
    if (Math.abs(b.y - p.y) > PH / 2 + b.r) return false;
    const a = clamp((b.y - p.y) / (PH / 2), -1, 1) * 55 * Math.PI / 180;
    s.speed = Math.min(520, s.speed + 14);
    b.vx = Math.cos(a) * s.speed * dir; b.vy = Math.sin(a) * s.speed; b.x = x + dir * b.r;
    return true;
  };
  if (b.vx < 0 && b.x - b.r <= MARGIN + PW) hitPaddle(s.left, MARGIN + PW, 1);
  if (b.vx > 0 && b.x + b.r >= W - MARGIN - PW) hitPaddle(s.right, W - MARGIN - PW, -1);
  if (b.x < -b.r) { s.score[1]++; s.serving = true; }
  else if (b.x > W + b.r) { s.score[0]++; s.serving = true; }
  else return null;
  if (s.score[0] >= WIN_SCORE || s.score[1] >= WIN_SCORE) { s.over = true; s.winner = s.score[0] >= WIN_SCORE ? "player" : "ai"; }
  return s.serving ? { scored: b.x < 0 ? "ai" : "player" } : null;
}
export const PADDLE = { h: PH, w: PW, margin: MARGIN };
