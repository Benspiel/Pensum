import test from "node:test";
import assert from "node:assert/strict";
import { normalize, isCorrect, buildQueue, answerCard, levelCounts, dueCount, resetLevels } from "../tools/karteikarten/core.js";

const mk = (mode, levels) => ({ mode, cards: levels.map((l, i) => ({ id: "c" + i, front: "f" + i, back: "b" + i, level: l })) });
const noShuffle = () => 0.999999; // Fisher-Yates mit festem Wert lässt die Reihenfolge unverändert

test("normalize und isCorrect", () => {
  assert.equal(normalize("  Hund. "), "hund");
  assert.ok(isCorrect("hund", "Hund"));
  assert.ok(isCorrect("cat", "Katze / cat"));
  assert.ok(!isCorrect("", "x"));
  assert.ok(!isCorrect("über", "uber"));
});

test("Level-Modus: Level 5 wird nicht abgefragt", () => {
  const d = mk("level", [1, 5, 3]);
  assert.equal(dueCount(d), 2);
  assert.deepEqual(buildQueue(d, noShuffle), ["c0", "c2"]);
  assert.deepEqual(levelCounts(d), [1, 0, 1, 0, 1]);
});

test("Level-Modus: richtig steigt, falsch fällt und kommt nochmal", () => {
  const d = mk("level", [2, 2]);
  let q = ["c0", "c1"];
  ({ queue: q } = answerCard(d, q, true));
  assert.equal(d.cards[0].level, 3);
  assert.deepEqual(q, ["c1"]);
  ({ queue: q } = answerCard(d, q, false));
  assert.equal(d.cards[1].level, 1);
  assert.deepEqual(q, ["c1"]);
  ({ queue: q } = answerCard(d, q, false));
  assert.equal(d.cards[1].level, 1, "Level 1 bleibt Level 1");
  ({ queue: q } = answerCard(d, q, true));
  assert.deepEqual(q, []);
  assert.equal(d.cards[1].level, 2);
});

test("Alle-Modus: jede Karte einmal, keine Level", () => {
  const d = mk("all", [1, 1]);
  assert.equal(buildQueue(d).length, 2);
  const { queue } = answerCard(d, ["c0", "c1"], false);
  assert.deepEqual(queue, ["c1"]);
  assert.equal(d.cards[0].level, 1);
});

test("resetLevels", () => {
  const d = mk("level", [4, 5]);
  resetLevels(d);
  assert.deepEqual(levelCounts(d), [2, 0, 0, 0, 0]);
});
