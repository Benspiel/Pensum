/* Kopfrechnen-Blitz: Aufgaben mit ganzzahligen, nie negativen Ergebnissen. Stufe 1 leicht, 3 schwer. */
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

export function makeQuestion(level = 1, rng = Math.random) {
  const ops = level === 1 ? ["+", "-"] : level === 2 ? ["+", "-", "×"] : ["+", "-", "×", "÷"];
  const op = ops[int(rng, 0, ops.length - 1)];
  const big = level === 1 ? 20 : level === 2 ? 100 : 200;
  let a, b;
  if (op === "+") { a = int(rng, 2, big); b = int(rng, 2, big); return { text: `${a} + ${b}`, answer: a + b }; }
  if (op === "-") { a = int(rng, 5, big); b = int(rng, 1, a); return { text: `${a} − ${b}`, answer: a - b }; }
  if (op === "×") { const max = level === 2 ? 10 : 12; a = int(rng, 2, max); b = int(rng, 2, max); return { text: `${a} × ${b}`, answer: a * b }; }
  b = int(rng, 2, 12); const q = int(rng, 2, 12);
  return { text: `${b * q} ÷ ${b}`, answer: q };
}

/** Punkte für eine richtige Antwort: etwas mehr bei höherer Stufe. */
export const points = (level) => 10 * level;
