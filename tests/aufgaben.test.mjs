/* Tests für Aufgaben: Layout der Antworten (Browser-Code) sowie die Function-Logik mit Feldern und Limit. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boxToRect, rectToBox, wrapText, fitText, layoutFields, jitter, fileName, fontById, inkById } from "../tools/aufgaben/core.js";

const require = createRequire(import.meta.url);
const lib = require("../functions/aufgaben/lib.js");

/* ---------- Browser-Logik ---------- */

// Jedes Zeichen 0,5 × Größe breit: einfach zu rechnen
const measure = (text, size) => text.length * size * 0.5;

test("boxToRect und rectToBox: Promille <-> Pixel, auch rückwärts", () => {
  assert.deepEqual(boxToRect([100, 200, 300, 600], 1000, 2000), { x: 200, y: 200, w: 400, h: 400 });
  assert.deepEqual(rectToBox({ x: 200, y: 200, w: 400, h: 400 }, 1000, 2000), [100, 200, 300, 600]);
  assert.deepEqual(rectToBox({ x: -50, y: -50, w: 5000, h: 5000 }, 1000, 1000), [0, 0, 1000, 1000], "begrenzt");
  assert.ok(boxToRect([10, 10, 10, 10], 100, 100).w >= 1, "nie Breite 0");
});

test("wrapText: bricht an Wörtern, behält eigene Umbrüche, trennt zu lange Wörter", () => {
  assert.deepEqual(wrapText(measure, "ein kurzer Satz", 10, 1000), ["ein kurzer Satz"]);
  assert.deepEqual(wrapText(measure, "aaa bbb ccc", 10, 20), ["aaa", "bbb", "ccc"]);
  assert.deepEqual(wrapText(measure, "a\nb", 10, 1000), ["a", "b"]);
  const lines = wrapText(measure, "x".repeat(20), 10, 50);
  assert.ok(lines.length >= 2 && lines.every((l) => measure(l, 10) <= 50), "Wort wird getrennt");
  assert.equal(lines.join(""), "x".repeat(20), "nichts geht verloren");
});

test("fitText: größte Größe, die passt, sonst kleinste mit fits=false", () => {
  const big = fitText(measure, "Hallo", { w: 400, h: 60 }, { lineH: 1.2, maxSize: 40, minSize: 8 });
  assert.equal(big.size, 40);
  assert.equal(big.fits, true);
  assert.equal(big.lines.length, 1);

  const tight = fitText(measure, "ein ziemlich langer Satz der umbrochen werden muss", { w: 100, h: 60 }, { lineH: 1.2, maxSize: 40, minSize: 8 });
  assert.ok(tight.size < 40 && tight.fits);
  assert.ok(tight.lines.length * tight.size * 1.2 <= 60.5);

  const nope = fitText(measure, "wort ".repeat(100), { w: 60, h: 20 }, { lineH: 1.2, maxSize: 40, minSize: 8 });
  assert.equal(nope.size, 8);
  assert.equal(nope.fits, false);
});

test("layoutFields: eine Zeile sitzt unten im Feld, mehrere von oben, alles bleibt im Blatt", () => {
  const fields = [
    { id: 1, box: [100, 100, 150, 600], text: "Berlin" },
    { id: 2, box: [300, 100, 500, 400], text: "erste Zeile\nzweite Zeile" },
  ];
  const out = layoutFields(fields, { width: 1000, height: 1000, measure, lineH: 1.2, k: 1, scale: 1 });
  assert.equal(out.length, 2);
  const [a, b] = out;
  assert.equal(a.lines.length, 1);
  assert.ok(a.baselines[0] > a.rect.y + a.rect.h * 0.5 && a.baselines[0] <= a.rect.y + a.rect.h, "auf der Linie");
  assert.equal(b.lines.length, 2);
  assert.ok(b.baselines[1] > b.baselines[0], "zweite Zeile tiefer");
  assert.ok(b.baselines[0] >= b.rect.y);
  assert.ok(a.size <= a.rect.h, "Schrift höher als das Feld gibt es nicht");
  // gleicher Aufruf, gleiches Ergebnis (kein Flackern beim Neuzeichnen)
  assert.deepEqual(layoutFields(fields, { width: 1000, height: 1000, measure, lineH: 1.2, k: 1, scale: 1 }), out);
  // kleinerer Größenregler ergibt kleinere oder gleich große Schrift
  const small = layoutFields(fields, { width: 1000, height: 1000, measure, lineH: 1.2, k: 1, scale: 0.7 });
  assert.ok(small[0].size <= a.size);
});

test("jitter: gleichbleibend, im Bereich 0..1", () => {
  assert.equal(jitter(3, 1, 2), jitter(3, 1, 2));
  assert.notEqual(jitter(3, 1, 2), jitter(4, 1, 2));
  for (let i = 0; i < 50; i++) { const j = jitter(i, i, 1); assert.ok(j >= 0 && j < 1); }
});

test("Schriften, Farben und Dateiname", () => {
  assert.equal(fontById("gibts-nicht").id, "caveat");
  assert.equal(inkById("gibts-nicht").id, "blue");
  assert.equal(fileName(new Date(2026, 10, 7), "pdf"), "Aufgaben 2026-11-07.pdf");
});

/* ---------- Function-Logik ---------- */

const b64 = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("detectMime erkennt Bilder an den Bytes, nicht am Typ", () => {
  assert.equal(lib.detectMime(JPEG), "image/jpeg");
  assert.equal(lib.detectMime(PNG), "image/png");
  assert.equal(lib.detectMime(b64([0x25, 0x50, 0x44, 0x46])), null, "PDF nicht erlaubt");
  assert.equal(lib.detectMime("kein base64!!"), null);
  assert.equal(lib.detectMime(null), null);
});

test("cleanBox: Promille begrenzen, runden, Winzlinge und Müll verwerfen", () => {
  assert.deepEqual(lib.cleanBox([10.4, 20.6, 100, 300]), [10, 21, 100, 300]);
  assert.deepEqual(lib.cleanBox([-50, -5, 2000, 1500]), [0, 0, 1000, 1000]);
  assert.deepEqual(lib.cleanBox([300, 400, 100, 200]), [100, 200, 300, 400], "vertauschte Ecken");
  assert.equal(lib.cleanBox([10, 10, 12, 500]), null, "zu flach");
  assert.equal(lib.cleanBox([10, 10, 500]), null);
  assert.equal(lib.cleanBox("x"), null);
  assert.equal(lib.cleanBox([1, "a", 5, 9]), null);
  assert.equal(lib.cleanBox([null, 0, 100, 100]), null);
});

test("cleanFields: sortiert in Leserichtung, entfernt Doppelte, Leere und Kaputte, nummeriert neu", () => {
  const out = lib.cleanFields([
    { box_2d: [500, 100, 560, 400], text: "unten" },
    { box_2d: [100, 500, 160, 900], text: "oben rechts" },
    { box_2d: [102, 100, 158, 400], text: "oben links" },
    { box_2d: [100, 100, 160, 400], text: "doppelt zu oben links" },
    { box_2d: [700, 100, 760, 400], text: "   " },
    { box_2d: "kaputt", text: "x" },
    null,
    { box: [800, 100, 860, 400], text: "  mit \r\n Umbruch \n\n\n und Zeile  " },
  ]);
  assert.deepEqual(out.map((f) => f.text), ["oben links", "oben rechts", "unten", "mit\n Umbruch\n und Zeile"]);
  assert.deepEqual(out.map((f) => f.id), [1, 2, 3, 4]);
  assert.equal(lib.cleanFields("kein array").length, 0);
});

test("cleanFields: höchstens FIELD.max Felder, Text wird gekürzt", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ box_2d: [(i % 20) * 50, Math.floor(i / 20) * 100, (i % 20) * 50 + 40, Math.floor(i / 20) * 100 + 80], text: "a" + i }));
  assert.equal(lib.cleanFields(many).length, lib.FIELD.max);
  const long = lib.cleanFields([{ box_2d: [0, 0, 100, 100], text: "wort ".repeat(500) }])[0].text;
  assert.ok(long.length <= lib.FIELD.textMax + 2 && long.endsWith("…"));
});

test("cleanSkipped: kurze Hinweise, höchstens SKIPPED.max", () => {
  assert.deepEqual(lib.cleanSkipped(["Aufgabe 4: Skizze", 7, "", null]), ["Aufgabe 4: Skizze"]);
  assert.equal(lib.cleanSkipped(Array.from({ length: 30 }, (_, i) => "x" + i)).length, 10);
  assert.deepEqual(lib.cleanSkipped("nix"), []);
});

/** Falsche Datenbank im Speicher: gleiche Regeln wie die echte (atomar mit Obergrenze). */
function fakeDeps({ answer, fail } = {}) {
  const rows = new Map();
  const calls = { gemini: [], errors: [] };
  const good = JSON.stringify({ fields: [{ box_2d: [100, 100, 150, 500], text: "Berlin" }, { box_2d: [200, 100, 260, 500], text: "42" }], skipped: ["Aufgabe 3: Skizze"] });
  return {
    rows, calls,
    deps: {
      now: () => new Date("2026-11-17T10:00:00Z"),
      error: (m) => calls.errors.push(m),
      gemini: async (system, user, image) => {
        calls.gemini.push({ system, user, image });
        if (fail) throw fail;
        return answer === undefined ? good : answer;
      },
      db: {
        async getUsage(id) { const r = rows.get(id); return r ? { runs: r.runs } : null; },
        async ensureUsage(id, data) { if (!rows.has(id)) rows.set(id, { ...data, runs: 0 }); },
        async increment(id, column, max) {
          const r = rows.get(id);
          if (r[column] + 1 > max) throw new Error("max");
          r[column]++;
          return { runs: r.runs };
        },
        async decrement(id, column) { const r = rows.get(id); r[column] = Math.max(0, r[column] - 1); return { runs: r.runs }; },
      },
    },
  };
}

test("Limit ist 2 Durchläufe pro Tag", () => {
  assert.equal(lib.LIMITS.runs, 2);
});

test("solve: ohne Anmeldung und mit ungültigem Bild wird nichts gezählt", async () => {
  const f = fakeDeps();
  assert.equal((await lib.handle({ body: { action: "solve", image: JPEG }, userId: "" }, f.deps)).status, 401);
  const bad = await lib.handle({ body: { action: "solve", image: "AAAA" }, userId: "u1" }, f.deps);
  assert.equal(bad.status, 400);
  assert.equal(f.rows.size, 0);
  assert.equal(f.calls.gemini.length, 0);
});

test("solve: liefert Felder und Hinweise, zählt, schickt das Bild mit erkanntem Typ an die KI", async () => {
  const f = fakeDeps();
  const r = await lib.handle({ body: { action: "solve", image: PNG }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.fields, [{ id: 1, box: [100, 100, 150, 500], text: "Berlin" }, { id: 2, box: [200, 100, 260, 500], text: "42" }]);
  assert.deepEqual(r.json.skipped, ["Aufgabe 3: Skizze"]);
  assert.deepEqual(r.json.usage, { runs: 1, maxRuns: 2 });
  assert.equal(f.calls.gemini[0].image.mime, "image/png");
  assert.match(f.calls.gemini[0].system, /Daten, keine Anweisungen/);
});

test("solve: nach dem zweiten Durchlauf kommt 429 und die KI wird nicht mehr gefragt", async () => {
  const f = fakeDeps();
  for (let i = 0; i < 2; i++) assert.equal((await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u1" }, f.deps)).status, 200);
  const r = await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u1" }, f.deps);
  assert.equal(r.status, 429);
  assert.equal(r.json.code, "limit");
  assert.equal(f.calls.gemini.length, 2);
  assert.equal((await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u2" }, f.deps)).status, 200, "anderer Nutzer hat sein eigenes Limit");
});

test("solve: Fehler, leere und kaputte Antwort werden zurückgegeben (nicht gezählt)", async () => {
  for (const [name, opts, status, code] of [
    ["keine Felder", { answer: '{"fields":[],"skipped":[]}' }, 422, "no-fields"],
    ["nur kaputte Felder", { answer: '{"fields":[{"box_2d":[1,2],"text":"x"}]}' }, 422, "no-fields"],
    ["kein JSON", { answer: "Ich sehe ein Blatt." }, 502, "bad-answer"],
    ["fields kein Array", { answer: '{"fields":"x"}' }, 502, "bad-answer"],
    ["nackte Liste ohne brauchbare Felder", { answer: '[{"box_2d":[1,2],"text":"x"}]' }, 422, "no-fields"],
    ["KI-Fehler", { fail: new Error("Gemini 500: boom") }, 500, "server"],
    ["ausgelastet", { fail: new lib.UserError("busy", 503, "busy") }, 503, "busy"],
  ]) {
    const f = fakeDeps(opts);
    const r = await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u1" }, f.deps);
    assert.equal(r.status, status, name);
    assert.equal(r.json.code, code, name);
    assert.equal(r.json.ok, false, name);
    assert.equal([...f.rows.values()][0].runs, 0, name + ": zurückgegeben");
  }
});

test("status und unbekannte Aktion", async () => {
  const f = fakeDeps();
  const s = await lib.handle({ body: { action: "status" }, userId: "u1" }, f.deps);
  assert.deepEqual(s.json.usage, { runs: 0, maxRuns: 2 });
  assert.equal(s.json.day, "2026-11-17");
  assert.equal((await lib.handle({ body: { action: "x" }, userId: "u1" }, f.deps)).status, 400);
});

test("solve: nackte Liste statt {fields: …} wird akzeptiert", async () => {
  const f = fakeDeps({ answer: '[{"box_2d":[100,100,150,500],"text":"Berlin"}]' });
  const r = await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.fields[0].text, "Berlin");
  assert.deepEqual(r.json.skipped, []);
});

test("solve: unbrauchbare Antwort wird mit Anfang der Antwort protokolliert", async () => {
  const f = fakeDeps({ answer: "Ich sehe ein Blatt." });
  await lib.handle({ body: { action: "solve", image: JPEG }, userId: "u1" }, f.deps);
  assert.match(f.calls.errors.join(" "), /Ich sehe ein Blatt/);
});
