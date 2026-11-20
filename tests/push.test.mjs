/* Test: Push-Erinnerungen über Appwrite Messaging – Stunde, Gruppen je Thema, Pakete. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { berlinHour, groupsFor, chunk, isTargetId } = require("../functions/push-daily/lib.js");

test("berlinHour rechnet UTC in Berliner Zeit um (Winter +1, Sommer +2)", () => {
  assert.equal(berlinHour(new Date("2026-01-15T16:30:00Z")), 17);
  assert.equal(berlinHour(new Date("2026-07-15T15:30:00Z")), 17);
  assert.equal(berlinHour(new Date("2026-01-15T23:30:00Z")), 0);
});

test("groupsFor sammelt je Thema die Push-Ziele der gewählten Stunde", () => {
  const rows = [
    { targetId: "da1", cards: true, cardsHour: 17, mindmap: false, mindmapHour: 8 },
    { targetId: "da2", cards: false, cardsHour: 17, mindmap: true, mindmapHour: 17 },
    { targetId: "da3", cards: true, cardsHour: 9, mindmap: false, mindmapHour: 8 },
    { targetId: "da1", cards: true, cardsHour: 17, mindmap: false, mindmapHour: 8 },
    { targetId: "$kaputt", cards: true, cardsHour: 17, mindmap: false, mindmapHour: 8 },
    { cards: true, cardsHour: 17, mindmap: false, mindmapHour: 8 },
  ];
  assert.deepEqual(groupsFor(rows, 17, { ai: true }).map((g) => [g.topic, g.targets]), [["cards", ["da1"]], ["mindmap", ["da2"]]]);
  assert.deepEqual(groupsFor(rows, 17).map((g) => [g.topic, g.targets]), [["cards", ["da1"]]], "ohne KI-Schalter keine Mindmap-Erinnerung");
  assert.deepEqual(groupsFor(rows, 9).map((g) => [g.topic, g.targets]), [["cards", ["da3"]]]);
  assert.equal(groupsFor(rows, 3).length, 0);
});

test("Ein Gerät mit beiden Themen zur selben Stunde bekommt zwei Nachrichten (KI an), sonst eine", () => {
  const rows = [{ targetId: "d", cards: true, cardsHour: 8, mindmap: true, mindmapHour: 8 }];
  assert.equal(groupsFor(rows, 8, { ai: true }).length, 2);
  assert.equal(groupsFor(rows, 8).length, 1);
});

test("chunk teilt in Pakete, isTargetId prüft das Format", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.ok(isTargetId("d" + "a".repeat(35)));
  assert.ok(!isTargetId("d" + "a".repeat(36)));
  assert.ok(!isTargetId("_x"));
  assert.ok(!isTargetId(null));
});
