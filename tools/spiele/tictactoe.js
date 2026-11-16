/* Tic-Tac-Toe – Regeln und unschlagbare KI. Brett: 9 Felder, 0 leer, 1 = X, 2 = O. */
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

/** { player, line } oder null. */
export function winner(b) {
  for (const line of LINES) if (b[line[0]] && b[line[0]] === b[line[1]] && b[line[1]] === b[line[2]]) return { player: b[line[0]], line };
  return null;
}
export const isFull = (b) => b.every(Boolean);
export const freeCells = (b) => b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

function minimax(b, turn, me) {
  const w = winner(b);
  if (w) return w.player === me ? 10 : -10;
  if (isFull(b)) return 0;
  const scores = freeCells(b).map((i) => { const nb = b.slice(); nb[i] = turn; return minimax(nb, turn === 1 ? 2 : 1, me); });
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/** Bester Zug (nie verlierbar). Bei Gleichstand wählt rng. */
export function bestMove(b, player, rng = Math.random) {
  const opp = player === 1 ? 2 : 1;
  let top = -Infinity, picks = [];
  for (const i of freeCells(b)) {
    const nb = b.slice(); nb[i] = player;
    const sc = minimax(nb, opp, player);
    if (sc > top) { top = sc; picks = [i]; } else if (sc === top) picks.push(i);
  }
  return picks[Math.floor(rng() * picks.length)];
}
export const randomMove = (b, rng = Math.random) => { const f = freeCells(b); return f[Math.floor(rng() * f.length)]; };
