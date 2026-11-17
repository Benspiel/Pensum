/* Tests für die weiteren Spiele: reine Logik ohne Oberfläche. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { seeded, shuffle, clock } from "../tools/spiele/util.js";
import * as C4 from "../tools/spiele/connect4.js";

test("util: Zufall mit Startwert ist reproduzierbar, Mischen verliert nichts, Uhr", () => {
  assert.equal(seeded(5)(), seeded(5)());
  assert.notEqual(seeded(5)(), seeded(6)());
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded(2)).sort(), [1, 2, 3, 4, 5]);
  assert.equal(clock(75), "1:15");
  assert.equal(clock(9), "0:09");
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
