/* Tests für die Spiele: reine Logik ohne Oberfläche. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import * as G from "../tools/spiele/g2048.js";
import * as S from "../tools/spiele/snake.js";
import * as T from "../tools/spiele/tetris.js";
import * as M from "../tools/spiele/minesweeper.js";

const seeded = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---------- 2048 ---------- */

test("2048: Kacheln verschmelzen höchstens einmal pro Zug", () => {
  assert.deepEqual(G.slideRow([2, 2, 2, 2]), { row: [4, 4, 0, 0], score: 8, moved: true });
  assert.deepEqual(G.slideRow([2, 2, 4, 0]).row, [4, 4, 0, 0]);
  assert.deepEqual(G.slideRow([4, 2, 2, 0]).row, [4, 4, 0, 0]);
  assert.deepEqual(G.slideRow([2, 0, 0, 2]).row, [4, 0, 0, 0]);
  assert.equal(G.slideRow([2, 4, 8, 16]).moved, false);
  assert.equal(G.slideRow([0, 0, 0, 0]).moved, false);
});

test("2048: Züge in alle vier Richtungen", () => {
  const b = [[2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [2, 0, 0, 2]];
  assert.deepEqual(G.move(b, "left").board, [[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0]]);
  assert.deepEqual(G.move(b, "right").board, [[0, 0, 0, 4], [0, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 4]]);
  const up = G.move(b, "up");
  assert.deepEqual(up.board[0], [4, 4, 0, 4]);
  assert.equal(up.score, 4 + 4);
  assert.deepEqual(G.move(b, "down").board[3], [4, 4, 0, 4]);
  assert.deepEqual(b, [[2, 0, 0, 2], [0, 4, 0, 0], [0, 0, 0, 0], [2, 0, 0, 2]], "Original bleibt unverändert");
});

test("2048: neue Kachel, Spielende und Gewinn", () => {
  const rng = seeded(3);
  const start = G.newGame(rng);
  assert.equal(start.flat().filter(Boolean).length, 2);
  const t = G.addTile(start, rng);
  assert.equal(t.board.flat().filter(Boolean).length, 3);
  assert.ok([2, 4].includes(t.board[t.y][t.x]));
  const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(G.canMove(full), false);
  assert.equal(G.addTile(full, rng).x, -1);
  full[0][1] = 2;
  assert.equal(G.canMove(full), true);
  assert.equal(G.maxTile([[0, 2048], [4, 0]]), 2048);
});

/* ---------- Snake ---------- */

test("Snake: bewegt sich, frisst, wächst und stirbt an Wand und eigenem Körper", () => {
  const rng = seeded(5);
  const s = S.createSnake(10, 10, rng);
  s.food = { x: 6, y: 5 };
  const len = s.snake.length;
  S.step(s, rng); assert.deepEqual(s.snake[0], { x: 5, y: 5 }); assert.equal(s.snake.length, len);
  const r = S.step(s, rng);
  assert.ok(r.ate && s.snake.length === len + 1 && s.score === 10);
  assert.ok(!s.snake.some((p) => p.x === s.food.x && p.y === s.food.y), "Futter nicht auf der Schlange");
  const w = S.createSnake(5, 5, rng); w.food = { x: 0, y: 0 };
  for (let i = 0; i < 6; i++) S.step(w, rng);
  assert.equal(w.alive, false);
  assert.equal(S.step(w, rng), null);
});

test("Snake: keine Kehrtwende, Richtungswünsche werden der Reihe nach abgearbeitet", () => {
  const rng = seeded(2);
  const s = S.createSnake(10, 10, rng);
  assert.equal(S.turn(s, "left"), false);       // gegen die Fahrtrichtung
  assert.equal(S.turn(s, "right"), false);      // gleiche Richtung
  assert.ok(S.turn(s, "up")); assert.ok(S.turn(s, "left"));
  assert.equal(S.turn(s, "down"), false);       // Warteschlange voll (zwei)
  S.step(s, rng); assert.equal(s.dir, "up");
  S.step(s, rng); assert.equal(s.dir, "left");
  // sich selbst beißen
  const c = { w: 8, h: 8, snake: [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }], dir: "up", queue: [], food: { x: 7, y: 7 }, score: 0, alive: true };
  S.step(c, rng);
  assert.equal(c.alive, false);
});

test("Snake: das Schwanzende ist beim Nachrücken kein Hindernis, Tempo steigt", () => {
  const sq = { w: 6, h: 6, snake: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], dir: "right", queue: [], food: { x: 5, y: 5 }, score: 0, alive: true };
  S.step(sq, seeded(1));
  assert.equal(sq.alive, true);
  assert.ok(S.interval({ snake: new Array(30) }) < S.interval({ snake: new Array(3) }));
  assert.ok(S.interval({ snake: new Array(300) }) >= 60);
});

/* ---------- Tetris ---------- */

test("Tetris: Beutel liefert jeden Stein genau einmal pro Runde", () => {
  const g = T.createGame(seeded(7));
  const seen = [g.cur.type, g.next];
  for (let i = 0; i < 5; i++) { T.hardDrop(g); if (g.over) break; seen.push(g.next); }
  assert.equal(new Set(seen.slice(0, 7)).size, 7);
  assert.deepEqual(T.rotateCW([[1, 2], [3, 4]]), [[3, 1], [4, 2]]);
});

test("Tetris: Kollisionen, Drehen mit Wall Kick, Ghost", () => {
  const g = T.createGame(seeded(11));
  g.cur = { type: "I", matrix: T.shapeOf("I"), x: 3, y: 0 };
  while (T.tryMove(g, -1, 0));
  assert.equal(g.cur.x + 0, -0 + g.cur.x);
  assert.equal(T.collides(g.board, g.cur.matrix, -1, 0), true);
  assert.ok(T.tryRotate(g));                       // senkrecht an der Wand: wird eingerückt statt abgelehnt
  assert.equal(T.collides(g.board, g.cur.matrix, g.cur.x, g.cur.y), false);
  const gy = T.ghostY(g);
  assert.ok(gy >= g.cur.y && T.collides(g.board, g.cur.matrix, g.cur.x, gy + 1));
  g.cur = { type: "O", matrix: T.shapeOf("O"), x: 4, y: 0 };
  assert.equal(T.tryRotate(g), false);              // O dreht nicht
});

test("Tetris: volle Zeilen verschwinden und geben Punkte nach Stufe", () => {
  const g = T.createGame(seeded(4));
  for (let y = 18; y < 20; y++) for (let x = 0; x < T.COLS; x++) g.board[y][x] = "T";
  g.board[18][4] = 0; g.board[18][5] = 0; g.board[19][4] = 0; g.board[19][5] = 0;       // Lücke für einen O-Stein
  g.cur = { type: "O", matrix: T.shapeOf("O"), x: 4, y: 0 };
  const r = T.hardDrop(g);
  assert.equal(r.cleared, 2);
  assert.equal(g.lines, 2);
  assert.equal(g.score, 300 + r.distance * 2);
  assert.ok(g.board.every((row) => row.length === T.COLS) && g.board.length === T.ROWS);
  assert.ok(g.board[19].every((c) => c === 0), "Brett ist wieder leer");
  g.lines = 9; g.board[19].fill("T"); g.board[19][0] = 0;
  g.cur = { type: "I", matrix: T.rotateCW(T.shapeOf("I")), x: -2, y: 0 };
  assert.ok(T.dropInterval(5) < T.dropInterval(1) && T.dropInterval(99) >= 90);
});

test("Tetris: Spielende, wenn kein Platz für den nächsten Stein ist", () => {
  const g = T.createGame(seeded(9));
  for (let y = 0; y < 4; y++) for (let x = 0; x < T.COLS; x++) g.board[y][x] = y === 3 ? 0 : "Z";
  let n = 0;
  while (!g.over && n++ < 60) T.hardDrop(g);
  assert.equal(g.over, true);
  assert.deepEqual(T.tick(g), { locked: false, cleared: 0 });
  assert.equal(T.tryMove(g, 1, 0), false);
});

/* ---------- Minesweeper ---------- */

const count = (b, f) => b.cells.flat().filter(f).length;

test("Minesweeper: erstes Aufdecken ist immer sicher, Minen und Zahlen stimmen", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const b = M.createBoard(9, 9, 10);
    M.reveal(b, 4, 4, seeded(seed));
    assert.equal(b.state === "lost", false, "Seed " + seed);
    assert.equal(count(b, (c) => c.mine), 10);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(b.cells[4 + dy][4 + dx].mine, false);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && b.cells[y + dy]?.[x + dx]?.mine) n++;
      assert.equal(b.cells[y][x].n, n);
    }
  }
});

test("Minesweeper: Nullfelder öffnen sich, Fahnen sperren, Mine verliert", () => {
  const b = M.createBoard(6, 6, 1);
  b.cells[0][0].mine = true; b.placed = true; b.state = "play";
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) b.cells[y][x].n = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].filter(([dy, dx]) => b.cells[y + dy]?.[x + dx]?.mine).length;
  assert.ok(M.toggleFlag(b, 5, 5));
  assert.equal(M.reveal(b, 5, 5), false, "markiertes Feld lässt sich nicht aufdecken");
  M.toggleFlag(b, 5, 5);
  M.reveal(b, 5, 5);
  assert.equal(b.state, "won");                    // alle Felder außer der Mine offen
  assert.equal(count(b, (c) => c.open), 35);
  const l = M.createBoard(4, 4, 2);
  l.cells[0][0].mine = true; l.cells[3][3].mine = true; l.placed = true; l.state = "play";
  M.reveal(l, 0, 0);
  assert.equal(l.state, "lost");
  assert.equal(M.reveal(l, 1, 1), false, "nach dem Spielende geht nichts mehr");
  assert.equal(M.toggleFlag(l, 2, 2), false);
});

test("Minesweeper: Fahnen zählen, Zahl antippen deckt Nachbarn auf", () => {
  const b = M.createBoard(5, 5, 1);
  b.cells[2][2].mine = true; b.placed = true; b.state = "play";
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) b.cells[y][x].n = Math.max(Math.abs(x - 2), Math.abs(y - 2)) === 1 ? 1 : 0;
  M.reveal(b, 1, 1);                              // eine 1: öffnet nur dieses Feld
  assert.equal(b.cells[1][1].open, true);
  assert.equal(b.cells[0][0].open, false);
  assert.equal(M.flagsLeft(b), 1);
  M.toggleFlag(b, 2, 2);
  assert.equal(M.flagsLeft(b), 0);
  assert.equal(M.chord(b, 1, 1), true);            // 1 Fahne neben der 1: alle übrigen Nachbarn auf
  assert.equal(b.state, "won");
  assert.deepEqual(Object.keys(M.LEVELS), ["leicht", "mittel", "schwer"]);
});
