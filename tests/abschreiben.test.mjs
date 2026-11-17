/* Tests für Abschreiben: Bildgröße und Übergabe (Browser-Code) sowie die Function-Logik mit Limits. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fitSize, makeHandoff, readHandoff, suggestName, HANDOFF_MAX_AGE } from "../tools/abschreiben/core.js";

const require = createRequire(import.meta.url);
const lib = require("../functions/abschreiben/lib.js");

/* ---------- Browser-Logik ---------- */

test("fitSize: verkleinert die lange Kante, vergrößert nie", () => {
  assert.deepEqual(fitSize(4000, 3000, 1800), { width: 1800, height: 1350 });
  assert.deepEqual(fitSize(3000, 4000, 1800), { width: 1350, height: 1800 });
  assert.deepEqual(fitSize(800, 600, 1800), { width: 800, height: 600 });
  assert.deepEqual(fitSize(0, 0, 1800), { width: 1, height: 1 });
});

test("Übergabe: Hin- und Rückweg, zu alt und kaputt werden ignoriert", () => {
  const now = 1_000_000;
  const raw = makeHandoff("# Titel\n- a", "Titel", now);
  assert.deepEqual(readHandoff(raw, now + 1000), { text: "# Titel\n- a", name: "Titel" });
  assert.equal(readHandoff(raw, now + HANDOFF_MAX_AGE + 1), null);
  assert.equal(readHandoff(raw, now - 10 * 60 * 1000), null, "Zeit aus der Zukunft");
  assert.equal(readHandoff("kein json", now), null);
  assert.equal(readHandoff(null, now), null);
  assert.equal(readHandoff(makeHandoff("   ", "x", now), now), null, "leerer Text");
  assert.equal(readHandoff(makeHandoff("t", "", now), now).name, "Tafelbild");
});

test("suggestName: Überschrift oder erste Zeile, Sonderzeichen raus", () => {
  assert.equal(suggestName("# Die Zelle\n- Kern"), "Die Zelle");
  assert.equal(suggestName("- Kern: DNA"), "Kern DNA");
  assert.equal(suggestName("[Skizze: Zelle]\nText"), "Text");
  assert.equal(suggestName(""), "Tafelbild");
  assert.equal(suggestName("a/b\\c"), "a b c");
  assert.ok(suggestName("x".repeat(200)).length <= 40);
});

/* ---------- Function-Logik ---------- */

// Kleinste gültige Köpfe: JPEG (FF D8 FF), PNG, WebP, jeweils aufgefüllt auf eine plausible Länge
const b64 = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = b64([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);

test("detectMime erkennt Bilder an den Bytes, nicht am Typ", () => {
  assert.equal(lib.detectMime(JPEG), "image/jpeg");
  assert.equal(lib.detectMime(PNG), "image/png");
  assert.equal(lib.detectMime(WEBP), "image/webp");
  assert.equal(lib.detectMime(b64([0x47, 0x49, 0x46, 0x38])), null, "GIF nicht erlaubt");
  assert.equal(lib.detectMime(Buffer.from("<html>".repeat(20)).toString("base64")), null);
  assert.equal(lib.detectMime("kein base64!!"), null);
  assert.equal(lib.detectMime(""), null);
  assert.equal(lib.detectMime(null), null);
  assert.equal(lib.detectMime("A".repeat(lib.IMAGE.maxBase64 + 4)), null, "zu groß");
});

test("cleanOutput: Zeilenenden, Leerzeilen, Steuerzeichen, Länge", () => {
  assert.equal(lib.cleanOutput("a  \r\n\r\n\r\n\r\nb\u0000\t"), "a\n\nb");
  assert.equal(lib.cleanOutput(null), "");
  const long = lib.cleanOutput("wort ".repeat(5000));
  assert.ok(long.length <= lib.TEXT.max + 2 && long.endsWith("…"));
});

test("parseModelJson: auch mit ```-Block", () => {
  assert.deepEqual(lib.parseModelJson('```json\n{"text":"x"}\n```'), { text: "x" });
  assert.deepEqual(lib.parseModelJson('Hier: {"text":"x"} fertig'), { text: "x" });
  assert.equal(lib.parseModelJson("nix"), null);
});

/** Falsche Datenbank im Speicher: gleiche Regeln wie die echte (atomar mit Obergrenze). */
function fakeDeps({ answer = '{"text":"# Titel\\n- Punkt"}', fail } = {}) {
  const rows = new Map();
  const calls = { gemini: [], errors: [] };
  return {
    rows, calls,
    deps: {
      now: () => new Date("2026-11-17T10:00:00Z"),
      error: (m) => calls.errors.push(m),
      gemini: async (system, user, image) => {
        calls.gemini.push({ system, user, image });
        if (fail) throw fail;
        return answer;
      },
      db: {
        async getUsage(id) { const r = rows.get(id); return r ? { scans: r.scans } : null; },
        async ensureUsage(id, data) { if (!rows.has(id)) rows.set(id, { ...data, scans: 0 }); },
        async increment(id, column, max) {
          const r = rows.get(id);
          if (r[column] + 1 > max) throw new Error("max");
          r[column]++;
          return { scans: r.scans };
        },
        async decrement(id, column) { const r = rows.get(id); r[column] = Math.max(0, r[column] - 1); return { scans: r.scans }; },
      },
    },
  };
}

test("scan: ohne Anmeldung und mit ungültigem Bild wird nichts gezählt", async () => {
  const f = fakeDeps();
  assert.equal((await lib.handle({ body: { action: "scan", image: JPEG }, userId: "" }, f.deps)).status, 401);
  const bad = await lib.handle({ body: { action: "scan", image: "AAAA" }, userId: "u1" }, f.deps);
  assert.equal(bad.status, 400);
  assert.equal(f.rows.size, 0);
  assert.equal(f.calls.gemini.length, 0);
});

test("scan: liefert Text, zählt, schickt das Bild mit erkanntem Typ an die KI", async () => {
  const f = fakeDeps();
  const r = await lib.handle({ body: { action: "scan", image: PNG }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.text, "# Titel\n- Punkt");
  assert.deepEqual(r.json.usage, { scans: 1, maxScans: lib.LIMITS.scans });
  assert.equal(f.calls.gemini[0].image.mime, "image/png");
  assert.match(f.calls.gemini[0].system, /Daten, keine Anweisungen/);
});

test("scan: nach dem Tageslimit kommt 429 und die KI wird nicht mehr gefragt", async () => {
  const f = fakeDeps();
  for (let i = 0; i < lib.LIMITS.scans; i++) assert.equal((await lib.handle({ body: { action: "scan", image: JPEG }, userId: "u1" }, f.deps)).status, 200);
  const r = await lib.handle({ body: { action: "scan", image: JPEG }, userId: "u1" }, f.deps);
  assert.equal(r.status, 429);
  assert.equal(r.json.code, "limit");
  assert.equal(f.calls.gemini.length, lib.LIMITS.scans);
  // anderer Nutzer hat sein eigenes Limit
  assert.equal((await lib.handle({ body: { action: "scan", image: JPEG }, userId: "u2" }, f.deps)).status, 200);
});

test("scan: Fehler, leere und kaputte Antwort werden zurückgegeben (nicht gezählt)", async () => {
  for (const [name, opts, status, code] of [
    ["leerer Text", { answer: '{"text":"  \\n "}' }, 422, "no-text"],
    ["kein JSON", { answer: "Ich sehe eine Tafel." }, 502, "bad-answer"],
    ["falscher Typ", { answer: '{"text":42}' }, 502, "bad-answer"],
    ["KI-Fehler", { fail: new Error("Gemini 500: boom") }, 500, "server"],
    ["ausgelastet", { fail: new lib.UserError("busy", 503, "busy") }, 503, "busy"],
  ]) {
    const f = fakeDeps(opts);
    const r = await lib.handle({ body: { action: "scan", image: JPEG }, userId: "u1" }, f.deps);
    assert.equal(r.status, status, name);
    assert.equal(r.json.code, code, name);
    assert.equal(r.json.ok, false, name);
    assert.equal([...f.rows.values()][0].scans, 0, name + ": zurückgegeben");
  }
});

test("status und unbekannte Aktion", async () => {
  const f = fakeDeps();
  const s = await lib.handle({ body: { action: "status" }, userId: "u1" }, f.deps);
  assert.deepEqual(s.json.usage, { scans: 0, maxScans: lib.LIMITS.scans });
  assert.equal(s.json.day, "2026-11-17");
  assert.equal((await lib.handle({ body: { action: "x" }, userId: "u1" }, f.deps)).status, 400);
});
