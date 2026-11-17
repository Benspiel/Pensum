/* Tests für js/haptics.js: vibriert, wo möglich, und wirft nie. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";

const calls = [];
Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: { vibrate: (p) => { calls.push(p); return true; }, userAgent: "x", maxTouchPoints: 0 } });
globalThis.matchMedia = () => ({ matches: false });
const { haptic, PATTERNS } = await import("../js/haptics.js");

test("haptic nutzt navigator.vibrate mit dem Muster der Art", () => {
  haptic("send");
  haptic("success");
  assert.deepEqual(calls, [PATTERNS.send, PATTERNS.success]);
});

test("haptic: unbekannte Art und eigenes Muster", () => {
  calls.length = 0;
  haptic("gibts-nicht");
  haptic([5, 5, 5]);
  assert.deepEqual(calls, [PATTERNS.tap, [5, 5, 5]]);
});

test("haptic: bei „Bewegung reduzieren“ still, und ein Fehler im Browser wirft nicht", () => {
  calls.length = 0;
  globalThis.matchMedia = () => ({ matches: true });
  haptic("tap");
  assert.equal(calls.length, 0);
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.navigator.vibrate = () => { throw new Error("gesperrt"); };
  assert.doesNotThrow(() => haptic("tap"));
});
