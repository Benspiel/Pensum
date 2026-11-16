/* Minesweeper – Spiellogik. Zellen: { mine, n (Nachbarminen), open, flag }. */
export const LEVELS = {
  leicht: { w: 9, h: 9, mines: 10, label: "Leicht" },
  mittel: { w: 12, h: 12, mines: 25, label: "Mittel" },
  schwer: { w: 16, h: 16, mines: 40, label: "Schwer" },
};

const around = (b, x, y) => {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < b.w && y + dy < b.h) out.push([x + dx, y + dy]);
  }
  return out;
};

export function createBoard(w, h, mines) {
  const cells = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ mine: false, n: 0, open: false, flag: false })));
  return { w, h, mines, cells, placed: false, state: "ready", opened: 0 }; // state: ready | play | won | lost
}

/** Minen werden erst beim ersten Aufdecken gesetzt: Das erste Feld und seine Nachbarn bleiben frei. */
function place(b, sx, sy, rng) {
  const safe = new Set([sx + "," + sy, ...around(b, sx, sy).map(([x, y]) => x + "," + y)]);
  let candidates = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!safe.has(x + "," + y)) candidates.push([x, y]);
  if (candidates.length < b.mines) { // winziges Brett: nur das erste Feld freihalten
    candidates = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (x !== sx || y !== sy) candidates.push([x, y]);
  }
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  for (const [x, y] of candidates.slice(0, b.mines)) b.cells[y][x].mine = true;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) b.cells[y][x].n = around(b, x, y).filter(([ax, ay]) => b.cells[ay][ax].mine).length;
  b.placed = true;
}

const total = (b) => b.w * b.h - b.mines;

function lose(b) {
  b.state = "lost";
  for (const row of b.cells) for (const c of row) if (c.mine && !c.flag) c.open = true;
}

/** Deckt ein Feld auf (Nullfelder öffnen ihre Nachbarn). Gibt true zurück, wenn sich etwas geändert hat. */
export function reveal(b, x, y, rng = Math.random) {
  if (b.state === "won" || b.state === "lost") return false;
  const first = b.cells[y][x];
  if (first.flag || first.open) return false;
  if (!b.placed) { place(b, x, y, rng); b.state = "play"; }
  if (first.mine) { first.open = true; lose(b); return true; }
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const c = b.cells[cy][cx];
    if (c.open || c.flag) continue;
    c.open = true; b.opened++;
    if (c.n === 0) for (const [ax, ay] of around(b, cx, cy)) if (!b.cells[ay][ax].open) stack.push([ax, ay]);
  }
  if (b.opened >= total(b)) { b.state = "won"; for (const row of b.cells) for (const c of row) if (c.mine) c.flag = true; }
  return true;
}

export function toggleFlag(b, x, y) {
  const c = b.cells[y][x];
  if (c.open || b.state === "won" || b.state === "lost") return false;
  c.flag = !c.flag;
  return true;
}

/** Auf eine aufgedeckte Zahl tippen: Stimmt die Zahl der Fahnen, werden alle übrigen Nachbarn aufgedeckt. */
export function chord(b, x, y, rng = Math.random) {
  const c = b.cells[y][x];
  if (!c.open || !c.n || b.state !== "play") return false;
  const near = around(b, x, y);
  if (near.filter(([ax, ay]) => b.cells[ay][ax].flag).length !== c.n) return false;
  let changed = false;
  for (const [ax, ay] of near) if (!b.cells[ay][ax].flag && !b.cells[ay][ax].open) changed = reveal(b, ax, ay, rng) || changed;
  return changed;
}

export const flagsLeft = (b) => b.mines - b.cells.flat().filter((c) => c.flag).length;
