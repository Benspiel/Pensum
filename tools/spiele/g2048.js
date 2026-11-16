/* 2048 – Spiellogik (ohne Oberfläche). Ein Brett ist ein 4×4-Feld aus Zahlen, 0 = leer. */
export const SIZE = 4;
export const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
export const cloneBoard = (b) => b.map((r) => r.slice());

/** Eine Zeile nach links schieben und gleiche Nachbarn zusammenfügen (jede Kachel höchstens einmal). */
export function slideRow(row) {
  const vals = row.filter(Boolean);
  const out = [];
  let score = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) { out.push(vals[i] * 2); score += vals[i] * 2; i++; } else out.push(vals[i]);
  }
  while (out.length < row.length) out.push(0);
  return { row: out, score, moved: out.some((v, i) => v !== row[i]) };
}

const transpose = (b) => b[0].map((_, x) => b.map((r) => r[x]));

/** dir: "left" | "right" | "up" | "down". Liefert { board, score, moved }. */
export function move(board, dir) {
  let b = cloneBoard(board);
  if (dir === "up" || dir === "down") b = transpose(b);
  if (dir === "right" || dir === "down") b = b.map((r) => r.slice().reverse());
  let score = 0, moved = false;
  b = b.map((r) => { const s = slideRow(r); score += s.score; moved = moved || s.moved; return s.row; });
  if (dir === "right" || dir === "down") b = b.map((r) => r.slice().reverse());
  if (dir === "up" || dir === "down") b = transpose(b);
  return { board: b, score, moved };
}

/** Setzt eine neue Kachel (90 % eine 2, 10 % eine 4) auf ein freies Feld. */
export function addTile(board, rng = Math.random) {
  const free = [];
  board.forEach((r, y) => r.forEach((v, x) => { if (!v) free.push([x, y]); }));
  if (!free.length) return { board, x: -1, y: -1 };
  const [x, y] = free[Math.floor(rng() * free.length)];
  const b = cloneBoard(board);
  b[y][x] = rng() < 0.9 ? 2 : 4;
  return { board: b, x, y };
}

export const newGame = (rng = Math.random) => addTile(addTile(emptyBoard(), rng).board, rng).board;
export const canMove = (board) => ["left", "right", "up", "down"].some((d) => move(board, d).moved);
export const maxTile = (board) => Math.max(...board.flat());
