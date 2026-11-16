/* Schiebepuzzle (n × n): Die Leerstelle (0) wandert, bis alle Zahlen der Reihe nach stehen. */
export const solvedBoard = (n) => [...Array(n * n - 1).keys()].map((i) => i + 1).concat(0);
export const isSolved = (b, n) => solvedBoard(n).every((v, i) => b[i] === v);

const neighbors = (i, n) => {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n); if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
  return out;
};
export const canMove = (b, n, i) => neighbors(i, n).includes(b.indexOf(0));

/** Schiebt das Plättchen an Position i in die Lücke. null, wenn es nicht daneben liegt. */
export function move(b, n, i) {
  const z = b.indexOf(0);
  if (!neighbors(i, n).includes(z)) return null;
  const nb = b.slice(); nb[z] = nb[i]; nb[i] = 0;
  return nb;
}

/** Mischt mit lauter gültigen Zügen vom gelösten Zustand aus – das Ergebnis ist deshalb immer lösbar. */
export function shuffled(n, rng = Math.random, steps = n * n * 40) {
  let b = solvedBoard(n), last = -1;
  for (let s = 0; s < steps; s++) {
    const z = b.indexOf(0), opts = neighbors(z, n).filter((i) => i !== last);
    const pick = opts[Math.floor(rng() * opts.length)];
    last = z; b = move(b, n, pick);
  }
  return isSolved(b, n) ? shuffled(n, rng, steps + 1) : b;
}
