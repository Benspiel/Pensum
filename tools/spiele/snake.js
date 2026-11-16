/* Snake – Spiellogik. Der Zustand wird direkt verändert (step/turn). */
export const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export function placeFood(state, rng = Math.random) {
  const taken = new Set(state.snake.map((s) => s.x + "," + s.y));
  const free = [];
  for (let y = 0; y < state.h; y++) for (let x = 0; x < state.w; x++) if (!taken.has(x + "," + y)) free.push({ x, y });
  return free.length ? free[Math.floor(rng() * free.length)] : null;
}

export function createSnake(w = 18, h = 18, rng = Math.random) {
  const y = Math.floor(h / 2);
  const state = { w, h, snake: [{ x: 4, y }, { x: 3, y }, { x: 2, y }], dir: "right", queue: [], food: null, score: 0, alive: true, won: false };
  state.food = placeFood(state, rng);
  return state;
}

/** Richtungswunsch vormerken (höchstens zwei, keine Kehrtwende auf der Stelle). */
export function turn(state, dir) {
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (dir === last || (DIRS[dir].x === -DIRS[last].x && DIRS[dir].y === -DIRS[last].y)) return false;
  if (state.queue.length >= 2) return false;
  state.queue.push(dir);
  return true;
}

/** Ein Schritt. Liefert { ate } oder null, wenn das Spiel schon vorbei ist. */
export function step(state, rng = Math.random) {
  if (!state.alive) return null;
  if (state.queue.length) state.dir = state.queue.shift();
  const d = DIRS[state.dir], head = { x: state.snake[0].x + d.x, y: state.snake[0].y + d.y };
  if (head.x < 0 || head.y < 0 || head.x >= state.w || head.y >= state.h) { state.alive = false; return { ate: false }; }
  const ate = !!state.food && head.x === state.food.x && head.y === state.food.y;
  const body = ate ? state.snake : state.snake.slice(0, -1); // das Schwanzende rückt nach, wenn nichts gefressen wird
  if (body.some((s) => s.x === head.x && s.y === head.y)) { state.alive = false; return { ate: false }; }
  state.snake.unshift(head);
  if (ate) {
    state.score += 10;
    state.food = placeFood(state, rng);
    if (!state.food) { state.alive = false; state.won = true; }
  } else state.snake.pop();
  return { ate };
}

/** Millisekunden pro Schritt: wird mit der Länge schneller, nie schneller als 60 ms. */
export const interval = (state) => Math.max(60, 140 - Math.floor((state.snake.length - 3) / 3) * 6);
