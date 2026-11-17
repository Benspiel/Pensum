/* Tests für Stack Panel (Rechenlogik) und Loader (HTML). Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { offsets, shouldPop } from "../js/stack-panel.js";
import { loaderHtml } from "../js/loader.js";

test("offsets: die obere Seite kommt von rechts, die untere wandert ein Drittel so weit", () => {
  assert.deepEqual(offsets(1, 300), { top: [300, 0], under: [0, -90] });
  assert.deepEqual(offsets(-1, 300, 0), { top: [0, 300], under: [-90, 0] });
  // Wischen: Die Seite liegt bei 100 px, die untere entsprechend bei -0,3 × 200
  const o = offsets(-1, 300, 100);
  assert.deepEqual(o.top, [100, 300]);
  assert.equal(Math.round(o.under[0]), -60);
});

test("shouldPop: weit genug oder schnell genug wischen", () => {
  assert.equal(shouldPop(50, 300, 0), false);
  assert.equal(shouldPop(120, 300, 0), true, "über 35 % der Breite");
  assert.equal(shouldPop(20, 300, 0.8), true, "schneller Wisch");
  assert.equal(shouldPop(0, 300, 0), false);
});

test("loaderHtml: Größe, vier Ringe, Texte maskiert", () => {
  const html = loaderHtml({ title: "A <b>", subtitle: "Unter", size: "lg" });
  assert.match(html, /loader-lg/);
  assert.equal((html.match(/class="loader-ring /g) || []).length, 4);
  assert.match(html, /A &lt;b&gt;/);
  assert.match(html, /loader-sub">Unter/);
  assert.ok(!loaderHtml({ title: "x" }).includes("loader-sub"), "ohne Untertitel keine Zeile");
  assert.match(loaderHtml({ size: "riesig" }), /loader-md/, "unbekannte Größe fällt auf md");
  assert.match(loaderHtml(), /role="status"/);
});
