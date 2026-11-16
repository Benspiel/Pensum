/* Vier gewinnt – Regeln und KI (Minimax mit Alpha-Beta). Brett: 6 Zeilen × 7 Spalten, 0 leer, 1 und 2 Spieler. */
export const COLS = 7, ROWS = 6;
export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

/** Wirft einen Stein in die Spalte. Liefert { board, row } oder null, wenn die Spalte voll ist. */
export function drop(b, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!b[r][col]) { const nb = b.map((x) => x.slice()); nb[r][col] = player; return { board: nb, row: r }; }
  }
  return null;
}

export const validCols = (b) => [...Array(COLS).keys()].filter((c) => !b[0][c]);
export const isFull = (b) => validCols(b).length === 0;

/** { player, cells } der Vierergruppe oder null. */
export function winner(b) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (!p) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[r, c]];
      for (let k = 1; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== p) break;
        cells.push([rr, cc]);
      }
      if (cells.length === 4) return { player: p, cells };
    }
  }
  return null;
}

function score(b, me) {
  const opp = me === 1 ? 2 : 1;
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (b[r][3] === me) s += 3; else if (b[r][3] === opp) s -= 3;
  const win = (cells) => {
    let m = 0, o = 0;
    for (const [r, c] of cells) { if (b[r][c] === me) m++; else if (b[r][c] === opp) o++; }
    if (m && o) return 0;
    if (m === 3) return 6; if (m === 2) return 2; if (o === 3) return -7; if (o === 2) return -2;
    return 0;
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [];
      for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) cells.push([rr, cc]); }
      if (cells.length === 4) s += win(cells);
    }
  }
  return s;
}

function search(b, depth, alpha, beta, turn, me) {
  const w = winner(b);
  if (w) return w.player === me ? 100000 + depth : -100000 - depth;
  const cols = validCols(b);
  if (!cols.length) return 0;
  if (depth === 0) return score(b, me);
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => cols.includes(c));
  if (turn === me) {
    let best = -Infinity;
    for (const c of order) { best = Math.max(best, search(drop(b, c, turn).board, depth - 1, alpha, beta, turn === 1 ? 2 : 1, me)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const c of order) { best = Math.min(best, search(drop(b, c, turn).board, depth - 1, alpha, beta, turn === 1 ? 2 : 1, me)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}

/** Bester Zug für player; bei gleich guten Zügen entscheidet der Zufall. */
export function aiMove(b, player, depth = 4, rng = Math.random) {
  const opp = player === 1 ? 2 : 1;
  let bestScore = -Infinity, best = [];
  for (const c of validCols(b)) {
    const next = drop(b, c, player).board;
    const sc = search(next, depth - 1, -Infinity, Infinity, opp, player);
    if (sc > bestScore) { bestScore = sc; best = [c]; } else if (sc === bestScore) best.push(c);
  }
  return best[Math.floor(rng() * best.length)];
}
