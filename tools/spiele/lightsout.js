/* Lights Out (5 × 5): Ein Klick dreht das Feld und seine vier Nachbarn um. Ziel: alle Lichter aus. */
export const N = 5;
export const isSolved = (b) => b.every((v) => !v);

export function toggle(b, x, y) {
  const nb = b.slice();
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = x + dx, cy = y + dy;
    if (cx >= 0 && cx < N && cy >= 0 && cy < N) nb[cy * N + cx] = nb[cy * N + cx] ? 0 : 1;
  }
  return nb;
}

/** Zufallsbrett aus lauter Klicks auf ein dunkles Brett – damit immer lösbar. */
export function randomBoard(rng = Math.random, clicks = 10) {
  let b = Array(N * N).fill(0);
  for (let i = 0; i < clicks; i++) b = toggle(b, Math.floor(rng() * N), Math.floor(rng() * N));
  return isSolved(b) ? randomBoard(rng, clicks + 1) : b;
}
