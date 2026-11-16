/* Sudoku – Regeln, Erzeugen und Lösen. Ein Rätsel ist eine Liste aus 81 Zahlen (0 = leer), zeilenweise. */
import { shuffle } from "./util.js";

const row = (i) => Math.floor(i / 9), col = (i) => i % 9;

function candidates(g, i) {
  const r = row(i), c = col(i), used = new Set();
  for (let k = 0; k < 9; k++) { used.add(g[r * 9 + k]); used.add(g[k * 9 + c]); }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) used.add(g[(br + dr) * 9 + bc + dc]);
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

/** Zählt Lösungen bis limit (zwei reichen, um „eindeutig“ zu prüfen). */
export function countSolutions(g, limit = 2) {
  if (conflicts(g).size) return 0;                 // widersprüchliche Vorgaben haben keine Lösung
  const grid = g.slice();
  let count = 0;
  const rec = () => {
    if (count >= limit) return;
    let at = -1, cands = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const c = candidates(grid, i);
      if (!c.length) return;
      if (!cands || c.length < cands.length) { at = i; cands = c; if (c.length === 1) break; }
    }
    if (at < 0) { count++; return; }
    for (const v of cands) { grid[at] = v; rec(); if (count >= limit) break; }
    grid[at] = 0;
  };
  rec();
  return count;
}

/** Eine Lösung (oder null). Mit rng werden die Ziffern zufällig probiert (für vollständige Zufallsgitter). */
export function solve(g, rng = null) {
  if (conflicts(g).size) return null;
  const grid = g.slice();
  const rec = () => {
    let at = -1, cands = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const c = candidates(grid, i);
      if (!c.length) return false;
      if (!cands || c.length < cands.length) { at = i; cands = c; }
    }
    if (at < 0) return true;
    for (const v of rng ? shuffle(cands, rng) : cands) { grid[at] = v; if (rec()) return true; }
    grid[at] = 0;
    return false;
  };
  return rec() ? grid : null;
}

/** Neues Rätsel mit genau einer Lösung. clues = Zahl der vorgegebenen Felder. */
export function generate(clues = 36, rng = Math.random) {
  const solution = solve(Array(81).fill(0), rng);
  const puzzle = solution.slice();
  let given = 81;
  for (const i of shuffle([...Array(81).keys()], rng)) {
    if (given <= clues) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = v; else given--;
  }
  return { puzzle, solution };
}

/** Indizes aller Felder, die eine Zahl doppelt in Zeile, Spalte oder Block haben. */
export function conflicts(g) {
  const bad = new Set();
  const groups = [];
  for (let k = 0; k < 9; k++) {
    groups.push([...Array(9).keys()].map((c) => k * 9 + c), [...Array(9).keys()].map((r) => r * 9 + k));
    const br = Math.floor(k / 3) * 3, bc = (k % 3) * 3;
    groups.push([...Array(9).keys()].map((n) => (br + Math.floor(n / 3)) * 9 + bc + (n % 3)));
  }
  for (const grp of groups) {
    const seen = new Map();
    for (const i of grp) {
      if (!g[i]) continue;
      if (seen.has(g[i])) { bad.add(i); bad.add(seen.get(g[i])); } else seen.set(g[i], i);
    }
  }
  return bad;
}

export const isComplete = (g) => g.every(Boolean) && conflicts(g).size === 0;
