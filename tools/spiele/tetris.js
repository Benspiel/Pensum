/* Tetris – Spiellogik. Brett: ROWS × COLS, Zellen sind 0 (leer) oder der Buchstabe des Steins. */
export const COLS = 10, ROWS = 20;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
export const PIECES = Object.keys(SHAPES);
export const shapeOf = (type) => SHAPES[type].map((r) => r.slice());
export const rotateCW = (m) => m[0].map((_, x) => m.map((row) => row[x]).reverse());
export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const LINE_POINTS = [0, 100, 300, 500, 800];

function shuffled(rng) {
  const a = PIECES.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Zieht den nächsten Stein aus dem 7er-Beutel (jeder Stein kommt in jeder Runde genau einmal). */
function draw(game) {
  if (!game.bag.length) game.bag = shuffled(game.rng);
  return game.bag.pop();
}

export function collides(board, matrix, px, py) {
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[y].length; x++) {
    if (!matrix[y][x]) continue;
    const bx = px + x, by = py + y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

function spawn(game) {
  const type = game.next;
  game.next = draw(game);
  const matrix = shapeOf(type);
  game.cur = { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: type === "I" ? -1 : 0 };
  if (collides(game.board, game.cur.matrix, game.cur.x, game.cur.y)) game.over = true;
}

export function createGame(rng = Math.random) {
  const game = { rng, bag: [], board: emptyBoard(), cur: null, next: null, score: 0, lines: 0, level: 1, over: false };
  game.next = draw(game);
  spawn(game);
  return game;
}

export function tryMove(game, dx, dy) {
  if (game.over || collides(game.board, game.cur.matrix, game.cur.x + dx, game.cur.y + dy)) return false;
  game.cur.x += dx; game.cur.y += dy;
  return true;
}

/** Drehen im Uhrzeigersinn; stößt der Stein an, wird er um ein, zwei Felder zur Seite geschoben (Wall Kick). */
export function tryRotate(game) {
  if (game.over || game.cur.type === "O") return false;
  const m = rotateCW(game.cur.matrix);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(game.board, m, game.cur.x + dx, game.cur.y)) { game.cur.matrix = m; game.cur.x += dx; return true; }
  }
  return false;
}

function lock(game) {
  const { matrix, x, y, type } = game.cur;
  matrix.forEach((row, ry) => row.forEach((v, rx) => { if (v && y + ry >= 0) game.board[y + ry][x + rx] = type; }));
  const keep = game.board.filter((r) => r.some((c) => !c));
  const cleared = ROWS - keep.length;
  while (keep.length < ROWS) keep.unshift(Array(COLS).fill(0));
  game.board = keep;
  if (cleared) {
    game.score += LINE_POINTS[cleared] * game.level;
    game.lines += cleared;
    game.level = 1 + Math.floor(game.lines / 10);
  }
  spawn(game);
  return cleared;
}

/** Ein Schritt nach unten (Schwerkraft oder weich fallen). Liefert { locked, cleared }. */
export function tick(game) {
  if (game.over) return { locked: false, cleared: 0 };
  if (tryMove(game, 0, 1)) return { locked: false, cleared: 0 };
  return { locked: true, cleared: lock(game) };
}

/** Sofort ganz nach unten. */
export function hardDrop(game) {
  if (game.over) return { distance: 0, cleared: 0 };
  let d = 0;
  while (tryMove(game, 0, 1)) d++;
  game.score += d * 2;
  return { distance: d, cleared: lock(game) };
}

/** Zeile, in der der Stein landen würde (für die Schattenanzeige). */
export function ghostY(game) {
  let y = game.cur.y;
  while (!collides(game.board, game.cur.matrix, game.cur.x, y + 1)) y++;
  return y;
}

/** Millisekunden pro Fall-Schritt. */
export const dropInterval = (level) => Math.max(90, 800 - (level - 1) * 65);
