/* Test: Reihenfolge der Tools auf Startseite und im Footer. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { tools, TOOL_ORDER, toolById } from "../js/tools.js";

test("Tools stehen in der festgelegten Reihenfolge, nichts geht verloren", () => {
  const ids = tools.map((t) => t.id);
  assert.deepEqual(ids.slice(0, TOOL_ORDER.length), TOOL_ORDER);
  assert.deepEqual(ids.slice(TOOL_ORDER.length), ["notenrechner"], "nicht gelistete Tools stehen am Ende");
  assert.equal(new Set(ids).size, ids.length, "keine Doppelten");
  for (const id of TOOL_ORDER) assert.ok(toolById(id), `${id} ist angemeldet`);
});
