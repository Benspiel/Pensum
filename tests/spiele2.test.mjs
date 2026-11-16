/* Tests für die weiteren Spiele: reine Logik ohne Oberfläche. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { seeded, shuffle, clock } from "../tools/spiele/util.js";
import * as SU from "../tools/spiele/sudoku.js";
import * as C4 from "../tools/spiele/connect4.js";
import * as TT from "../tools/spiele/tictactoe.js";
import * as SL from "../tools/spiele/slide.js";
import * as LO from "../tools/spiele/lightsout.js";
import * as MM from "../tools/spiele/mastermind.js";
import * as HM from "../tools/spiele/hangman.js";
import * as MS from "../tools/spiele/mathsprint.js";
import * as SI from "../tools/spiele/simon.js";
import * as ME from "../tools/spiele/memory.js";
import * as BO from "../tools/spiele/breakout.js";
import * as PO from "../tools/spiele/pong.js";
import * as HU from "../tools/spiele/huepfer.js";

test("util: Zufall mit Startwert ist reproduzierbar, Mischen verliert nichts, Uhr", () => {
  assert.equal(seeded(5)(), seeded(5)());
  assert.notEqual(seeded(5)(), seeded(6)());
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded(2)).sort(), [1, 2, 3, 4, 5]);
  assert.equal(clock(75), "1:15");
  assert.equal(clock(9), "0:09");
});

/* ---------- Sudoku ---------- */

test("Sudoku: erzeugte Rätsel haben genau eine Lösung und passen zur Lösung", () => {
  for (const seed of [1, 2, 3]) {
    const { puzzle, solution } = SU.generate(40, seeded(seed));
    assert.equal(puzzle.filter(Boolean).length, 40);
    assert.equal(SU.countSolutions(puzzle, 2), 1);
    assert.ok(SU.isComplete(solution));
    puzzle.forEach((v, i) => { if (v) assert.equal(v, solution[i]); });
    assert.deepEqual(SU.solve(puzzle), solution);
  }
});

test("Sudoku: Konflikte in Zeile, Spalte und Block, schwere Rätsel mit wenigen Zahlen", () => {
  const g = Array(81).fill(0);
  g[0] = 5; g[8] = 5;                // gleiche Zeile
  g[9] = 7; g[63] = 7;               // gleiche Spalte
  g[30] = 3; g[40] = 3;              // gleicher Block (Zeilen 3 und 4, Spalten 3 und 4)
  assert.deepEqual([...SU.conflicts(g)].sort((a, b) => a - b), [0, 8, 9, 30, 40, 63]);
  assert.equal(SU.conflicts(Array(81).fill(0)).size, 0);
  const hard = SU.generate(26, seeded(9));
  assert.ok(hard.puzzle.filter(Boolean).length <= 30 && SU.countSolutions(hard.puzzle, 2) === 1);
  assert.equal(SU.solve(Array(81).fill(0).map((_, i) => (i === 0 ? 1 : i === 1 ? 1 : 0))), null);
});

/* ---------- Vier gewinnt ---------- */

test("Vier gewinnt: Steine fallen, Gewinn in allen Richtungen, volles Brett", () => {
  let b = C4.emptyBoard();
  b = C4.drop(b, 3, 1).board; assert.equal(b[5][3], 1);
  const r = C4.drop(b, 3, 2); assert.equal(r.row, 4);
  for (let i = 0; i < 6; i++) b = C4.drop(b, 0, i % 2 ? 2 : 1).board;
  assert.equal(C4.drop(b, 0, 1), null);
  assert.ok(!C4.validCols(b).includes(0));
  const horizontal = C4.emptyBoard(); for (let c = 1; c <= 4; c++) horizontal[5][c] = 1;
  assert.equal(C4.winner(horizontal).player, 1);
  const vertical = C4.emptyBoard(); for (let r2 = 2; r2 <= 5; r2++) vertical[r2][6] = 2;
  assert.equal(C4.winner(vertical).player, 2);
  const diag = C4.emptyBoard(); for (let k = 0; k < 4; k++) diag[5 - k][k] = 1;
  assert.equal(C4.winner(diag).cells.length, 4);
  const diag2 = C4.emptyBoard(); for (let k = 0; k < 4; k++) diag2[2 + k][k] = 2;
  assert.equal(C4.winner(diag2).player, 2);
  assert.equal(C4.winner(C4.emptyBoard()), null);
  assert.equal(C4.isFull(C4.emptyBoard()), false);
});

test("Vier gewinnt: die KI gewinnt sofort, blockt und spielt nur gültige Züge", () => {
  const win = C4.emptyBoard(); for (let c = 0; c < 3; c++) win[5][c] = 2;       // 2 hat drei in der Reihe
  assert.equal(C4.aiMove(win, 2, 4, seeded(1)), 3);
  const block = C4.emptyBoard(); for (let c = 0; c < 3; c++) block[5][c] = 1;    // 1 droht, 2 muss blocken
  assert.equal(C4.aiMove(block, 2, 4, seeded(1)), 3);
  const full = C4.emptyBoard(); for (let r = 0; r < 6; r++) full[r][0] = r % 2 ? 1 : 2;
  for (let s = 1; s <= 5; s++) assert.ok(C4.validCols(full).includes(C4.aiMove(full, 1, 3, seeded(s))));
});

/* ---------- Tic-Tac-Toe ---------- */

test("Tic-Tac-Toe: unschlagbar und nutzt Gewinnchancen", () => {
  assert.equal(TT.winner([1, 1, 1, 0, 0, 0, 0, 0, 0]).player, 1);
  assert.equal(TT.winner([1, 2, 0, 2, 1, 0, 0, 0, 1]).player, 1);
  assert.equal(TT.winner(Array(9).fill(0)), null);
  assert.equal(TT.bestMove([1, 1, 0, 2, 2, 0, 0, 0, 0], 1), 2);   // gewinnen
  assert.equal(TT.bestMove([1, 1, 0, 0, 2, 0, 0, 0, 0], 2), 2);   // blocken
  // Die KI spielt als O gegen viele zufällige Gegner und verliert nie.
  for (let seed = 1; seed <= 40; seed++) {
    const rng = seeded(seed); let b = Array(9).fill(0), turn = 1;
    while (!TT.winner(b) && !TT.isFull(b)) { b[turn === 1 ? TT.randomMove(b, rng) : TT.bestMove(b, 2, rng)] = turn; turn = turn === 1 ? 2 : 1; }
    assert.notEqual(TT.winner(b)?.player, 1, "Seed " + seed);
  }
});

/* ---------- Schiebepuzzle und Lights Out ---------- */

test("Schiebepuzzle: gemischt ist lösbar, nur Nachbarn der Lücke bewegen sich", () => {
  for (const n of [3, 4]) {
    const b = SL.shuffled(n, seeded(n));
    assert.equal(SL.isSolved(b, n), false);
    assert.deepEqual([...b].sort((a, c) => a - c), [...Array(n * n).keys()]);
    // Lösbarkeit: Zahl der Inversionen plus Zeilenabstand der Lücke hat die richtige Parität
    const inv = b.filter(Boolean).reduce((t, v, i, a) => t + a.slice(i + 1).filter((w) => w < v).length, 0);
    const rowFromBottom = n - Math.floor(b.indexOf(0) / n);
    assert.ok(n % 2 ? inv % 2 === 0 : (inv + rowFromBottom) % 2 === 1);
  }
  const solved = SL.solvedBoard(3);
  assert.equal(SL.move(solved, 3, 0), null);
  const moved = SL.move(solved, 3, 5);
  assert.equal(moved[8], 6); assert.equal(moved[5], 0);
  assert.equal(SL.canMove(solved, 3, 7), true);
  assert.equal(SL.isSolved(SL.move(moved, 3, 8), 3), true);
});

test("Lights Out: Klick dreht Kreuz, Rand wird beachtet, Zufallsbrett ist lösbar", () => {
  let b = LO.toggle(Array(25).fill(0), 2, 2);
  assert.deepEqual(b.flatMap((v, i) => (v ? [i] : [])), [7, 11, 12, 13, 17]);
  assert.deepEqual(LO.toggle(Array(25).fill(0), 0, 0).flatMap((v, i) => (v ? [i] : [])), [0, 1, 5]);
  assert.equal(LO.isSolved(LO.toggle(LO.toggle(b, 2, 2), 2, 2)), false); // zweimal = zurück zu b
  assert.equal(LO.isSolved(LO.toggle(b, 2, 2)), true);
  const r = LO.randomBoard(seeded(3));
  assert.equal(LO.isSolved(r), false);
});

/* ---------- Mastermind, Galgenmännchen, Kopfrechnen, Simon, Memory ---------- */

test("Mastermind: richtige und verschobene Farben, auch bei Doppelten", () => {
  assert.deepEqual(MM.score([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, partial: 0 });
  assert.deepEqual(MM.score([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, partial: 4 });
  assert.deepEqual(MM.score([0, 0, 1, 1], [0, 1, 0, 1]), { exact: 2, partial: 2 });
  assert.deepEqual(MM.score([0, 0, 0, 1], [0, 0, 1, 1]), { exact: 3, partial: 0 });
  assert.deepEqual(MM.score([1, 2, 3, 4], [5, 5, 5, 5]), { exact: 0, partial: 0 });
  assert.deepEqual(MM.score([2, 2, 3, 3], [2, 3, 3, 0]), { exact: 2, partial: 1 });
  const s = MM.randomSecret(seeded(4)); assert.ok(s.length === 4 && s.every((c) => c >= 0 && c < 6));
});

test("Galgenmännchen: Treffer, Fehler, Gewinn und Niederlage", () => {
  const s = HM.create("HAUS");
  assert.deepEqual(HM.mask(s), ["_", "_", "_", "_"]);
  assert.equal(HM.guess(s, "A"), true);
  assert.equal(HM.guess(s, "A"), null);              // doppelt zählt nicht
  assert.equal(HM.guess(s, "Z"), false); assert.equal(s.wrong, 1);
  assert.deepEqual(HM.mask(s), ["_", "A", "_", "_"]);
  for (const l of "HUS") HM.guess(s, l);
  assert.ok(HM.isWon(s) && !HM.isLost(s));
  const l = HM.create("HAUS");
  for (const ch of "BCDEFGJK") HM.guess(l, ch);
  assert.ok(HM.isLost(l)); assert.equal(HM.guess(l, "H"), null);
  assert.ok(HM.WORDS.length > 60 && HM.WORDS.every((w) => w === w.toUpperCase() && /^[A-ZÄÖÜ]+$/.test(w)));
  assert.ok(HM.WORDS.includes(HM.pick(seeded(2))));
});

test("Kopfrechnen: Antworten stimmen, nie negativ, Division geht auf", () => {
  for (const level of [1, 2, 3]) for (let seed = 1; seed <= 200; seed++) {
    const q = MS.makeQuestion(level, seeded(seed * level));
    const [a, op, b] = q.text.split(" ");
    const x = Number(a), y = Number(b);
    const expected = { "+": x + y, "−": x - y, "×": x * y, "÷": x / y }[op];
    assert.equal(q.answer, expected, q.text);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0, q.text);
    if (level === 1) assert.ok(op === "+" || op === "−");
  }
  assert.ok(MS.points(3) > MS.points(1));
});

test("Simon und Memory", () => {
  const seq = SI.extend(SI.extend([], seeded(1)), seeded(2));
  assert.equal(seq.length, 2);
  assert.equal(SI.check(seq, [seq[0]]), "partial");
  assert.equal(SI.check(seq, seq), "done");
  assert.equal(SI.check([0, 1], [0, 2]), "wrong");
  const d = ME.deck(10, seeded(3));
  assert.equal(d.length, 20);
  for (let id = 0; id < 10; id++) assert.equal(d.filter((c) => c.id === id).length, 2);
  assert.equal(new Set(d.map((c) => c.symbol)).size, 10);
  assert.equal(ME.isDone(d), false);
  d.forEach((c) => { c.matched = true; });
  assert.equal(ME.isDone(d), true);
  assert.ok(Object.values(ME.SIZES).every((s) => (s.cols * s.rows) % 2 === 0));
});

/* ---------- Breakout, Pong, Hüpfer ---------- */

test("Breakout: Ball prallt von Wand und Schläger ab, Steine verschwinden, Leben und Sieg", () => {
  const s = BO.create(1);
  assert.equal(s.bricks.length, 5 * 8);
  BO.movePaddle(s, 1000); assert.equal(s.paddle.x, BO.W - s.paddle.w / 2);
  BO.movePaddle(s, 160);
  BO.launch(s, () => 0.5);
  assert.equal(s.stuck, false); assert.ok(s.ball.vy < 0);
  s.ball.x = 3; s.ball.y = 300; s.ball.vx = -200; s.ball.vy = 0.001;      // linke Wand
  BO.step(s, 0.05); assert.ok(s.ball.vx > 0);
  s.ball.x = 160; s.ball.y = s.paddle.y - 4; s.ball.vx = 0; s.ball.vy = 220; // Schläger
  BO.step(s, 0.02); assert.ok(s.ball.vy < 0);
  const brick = s.bricks[4 * 8 + 3];                                          // unterste Reihe, von unten getroffen
  s.ball.x = brick.x + brick.w / 2; s.ball.y = brick.y + brick.h + 8; s.ball.vx = 0; s.ball.vy = -240;
  BO.step(s, 0.05); assert.equal(brick.alive, false); assert.equal(s.bricks.filter((b) => !b.alive).length, 1);
  assert.ok(s.score > 0 && s.ball.vy > 0, "prallt nach unten ab");
  const side = BO.create(1), sb = side.bricks[3];                              // von der Seite getroffen
  side.bricks[2].alive = false; side.stuck = false; side.ball.x = sb.x - 12; side.ball.y = sb.y + sb.h / 2; side.ball.vx = 250; side.ball.vy = 0;
  BO.step(side, 0.05); assert.equal(sb.alive, false); assert.ok(side.ball.vx < 0, "prallt zurück");
  s.ball.x = 160; s.ball.y = BO.H + 20; s.ball.vy = 100; s.stuck = false;
  const lives = s.lives; BO.step(s, 0.1);
  assert.equal(s.lives, lives - 1); assert.equal(s.stuck, true);
  s.lives = 1; s.stuck = false; s.ball.y = BO.H + 20; BO.step(s, 0.1); assert.equal(s.over, true);
  const w = BO.create(1); w.bricks.forEach((b) => { b.alive = false; }); const last = w.bricks[0]; last.alive = true;
  w.stuck = false; w.ball.x = last.x + 5; w.ball.y = last.y + 5; w.ball.vx = 0; w.ball.vy = -100;
  BO.step(w, 0.02); assert.equal(w.won, true);
});

test("Pong: Punkte, Abprallen, Spielende und begrenzter Computer", () => {
  const s = PO.create();
  assert.equal(PO.step(s, 0.016), null);                       // wartet auf den Anstoß
  PO.serve(s, 1, () => 0.5);
  assert.ok(s.ball.vx > 0);
  s.ball.x = PO.W + 20; s.ball.y = 10; PO.step(s, 0.016);      // am Schläger vorbei
  assert.deepEqual(s.score, [1, 0]); assert.equal(s.serving, true);
  PO.serve(s, -1, () => 0.5);
  PO.movePlayer(s, 150);
  s.ball.x = 30; s.ball.y = 150; s.ball.vx = -300; s.ball.vy = 0;
  PO.step(s, 0.02); assert.ok(s.ball.vx > 0, "Schläger links schlägt zurück");
  s.ball.y = 5; s.ball.vy = -200; s.ball.x = 200; s.ball.vx = 10; PO.step(s, 0.05); assert.ok(s.ball.vy > 0, "Decke");
  const ai = PO.create(); ai.ball.vx = 100; ai.ball.y = 0; ai.serving = false;
  const y0 = ai.right.y; PO.step(ai, 0.1, 100); assert.ok(Math.abs(ai.right.y - y0) <= 10.01, "Computer ist auf 100 px/s begrenzt");
  const w = PO.create(); w.score = [6, 0]; PO.serve(w, 1, () => 0.5); w.ball.x = PO.W + 20; w.ball.y = 10; PO.step(w, 0.016);
  assert.equal(w.over, true); assert.equal(w.winner, "player");
});

test("Hüpfer: fällt, flattert, zählt Röhren und stirbt an Röhre und Boden", () => {
  const s = HU.create();
  HU.step(s, 0.5); assert.equal(s.y, HU.create().y, "vor dem ersten Tippen passiert nichts");
  HU.flap(s); assert.ok(s.vy < 0);
  const y0 = s.y; HU.step(s, 0.05); assert.ok(s.y < y0, "steigt nach dem Flattern");
  const p = HU.create(); p.started = true; p.y = 200; p.vy = 0;
  p.pipes.push({ x: 60, gapY: 300, scored: false });            // Lücke weit unter dem Vogel: Zusammenstoß mit der oberen Röhre
  HU.step(p, 0.01); assert.equal(p.over, true);
  const q = HU.create(); q.started = true; q.y = 200; q.pipes.push({ x: 20, gapY: 200, scored: false });  // Vogel genau in der Lücke, Röhre ist schon vorbei
  q.pipes[0].x = 76 - 12 - 52 - 1; HU.step(q, 0.001); assert.equal(q.score, 1); assert.equal(q.over, false);
  const g = HU.create(); g.started = true; g.y = HU.H; HU.step(g, 0.01); assert.equal(g.over, true);
  const long = HU.create(); long.started = true; for (let i = 0; i < 400 && !long.over; i++) HU.step(long, 0.016, seeded(1));
  assert.equal(long.over, true);                                // ohne Flattern fällt der Vogel
});
