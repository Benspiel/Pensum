/* Tests für Promise Toast, Empty State und Export-Menü (reine Logik und HTML). Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { splitLines, linesFor, countLabel, progressOf, errorText } from "../js/promise-toast.js";
import { emptyStateHtml } from "../js/empty-state.js";
import { exportToastOptions, CANCELLED } from "../js/export-core.js";

test("Promise Toast: Zeilen auflösen, zählen, Fortschritt, Fehlertext", () => {
  assert.deepEqual(splitLines("Fertig"), ["Fertig", ""]);
  assert.deepEqual(splitLines(["Fertig", "datei.pdf"]), ["Fertig", "datei.pdf"]);
  assert.deepEqual(splitLines(undefined), ["", ""]);
  assert.deepEqual(linesFor((n) => ["Gespeichert", n], "a.pdf"), ["Gespeichert", "a.pdf"]);
  assert.deepEqual(linesFor("Text", 1), ["Text", ""]);
  const count = { total: 24, unit: "Seiten", verb: "Erstelle" };
  assert.equal(countLabel(count, 12), "Erstelle 12 von 24 Seiten");
  assert.equal(countLabel(count, 99), "Erstelle 24 von 24 Seiten", "nicht über die Summe");
  assert.equal(countLabel(count, -3), "Erstelle 0 von 24 Seiten");
  assert.equal(progressOf(count, 6), 0.25);
  assert.equal(progressOf(count, 99), 1);
  assert.equal(progressOf(null, 5), 0);
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
