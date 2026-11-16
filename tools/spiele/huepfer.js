/* Hüpfer (Tippen zum Flattern, Lücken in Röhren treffen) – Physik und Regeln. */
export const W = 288, H = 420, GROUND = 36, BIRD_X = 76, BIRD_R = 12, PIPE_W = 52;
const GRAVITY = 1250, FLAP = -360, SPEED = 125, GAP = 128, EVERY = 1.55;

export const create = () => ({ y: H / 2 - 40, vy: 0, pipes: [], t: 0, next: 0.6, score: 0, over: false, started: false });

export function flap(s) { if (s.over) return; s.started = true; s.vy = FLAP; }

export function step(s, dt, rng = Math.random) {
  if (s.over || !s.started) return;
  s.t += dt; s.next -= dt;
  s.vy += GRAVITY * dt; s.y += s.vy * dt;
  if (s.next <= 0) { s.pipes.push({ x: W + 10, gapY: 90 + rng() * (H - GROUND - 180), scored: false }); s.next = EVERY; }
  for (const p of s.pipes) {
    p.x -= SPEED * dt;
    if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) { p.scored = true; s.score++; }
    const overlapX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
    if (overlapX && (s.y - BIRD_R < p.gapY - GAP / 2 || s.y + BIRD_R > p.gapY + GAP / 2)) s.over = true;
  }
  s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);
  if (s.y + BIRD_R >= H - GROUND) { s.y = H - GROUND - BIRD_R; s.over = true; }
  if (s.y - BIRD_R < 0) { s.y = BIRD_R; s.vy = 0; }
}
export const GAP_SIZE = GAP;
