/* Tests für Promise Toast, Empty State und Export-Menü (reine Logik und HTML). Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { errorText } from "../js/export-core.js";
import { emptyStateHtml } from "../js/empty-state.js";
import { exportToastOptions, CANCELLED } from "../js/export-core.js";

test("Promise Toast: Fehlertext", () => {
  assert.equal(errorText(new Error("kaputt")), "kaputt");
  assert.equal(errorText("text"), "text");
  assert.equal(errorText(null), "");
});

test("Export-Menü: Toast-Texte aus der Zeile, Standardtexte, Fehler", () => {
  const o = exportToastOptions({ label: "Als PDF", success: "PDF gespeichert", errorTitle: "PDF ging nicht" });
  assert.equal(o.loading, "Als PDF wird erstellt …");
  assert.deepEqual(o.success("a.pdf"), ["PDF gespeichert", "a.pdf"]);
  assert.deepEqual(o.success(undefined), ["PDF gespeichert", ""]);
  assert.deepEqual(o.error(new Error("x")), ["PDF ging nicht", "x"]);
  const d = exportToastOptions({ label: "Bild", loading: "Bild wird erstellt …" });
  assert.equal(d.loading, "Bild wird erstellt …");
  assert.deepEqual(d.success("n"), ["Export fertig", "n"]);
  assert.deepEqual(d.error("fehler"), ["Export fehlgeschlagen", "fehler"]);
  assert.equal(typeof CANCELLED, "symbol");
});

test("Empty State: Texte maskiert, Knöpfe mit data-act, kompakt", () => {
  const html = emptyStateHtml({
    title: "Noch <b>leer</b>", description: "Text", primary: { label: "Los", act: "new-deck" },
    secondary: { label: "Hilfe", act: "help" },
  });
  assert.match(html, /Noch &lt;b&gt;leer&lt;\/b&gt;/);
  assert.match(html, /es-primary" type="button" data-act="new-deck"/);
  assert.match(html, /es-secondary" type="button" data-act="help"/);
  assert.ok(!html.includes("es-compact"));
  assert.match(emptyStateHtml({ title: "x", compact: true }), /es es-compact/);
  const attr = emptyStateHtml({ title: "x", primary: { label: "A", act: "tab", attrs: { "data-tab": "add\"" } } });
  assert.match(attr, /data-tab="add&quot;"/, "Attributwerte werden maskiert");
  assert.ok(!emptyStateHtml({ title: "x" }).includes("es-actions"), "ohne Knöpfe keine Knopfzeile");
});
