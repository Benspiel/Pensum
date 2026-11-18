/* Tests für den KI-Chat: Textformatierung im Browser und die Function-Logik (Team-Prüfung, Verlauf, Speichern). Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { formatMessage, dayLabel, sortMessages, formatMs, cleanSteps, stepsSummary, stepsHtml, cleanTitle, MAX_TITLE } from "../tools/kichat/core.js";
import { isLocked } from "../js/lock.js";

const require = createRequire(import.meta.url);
const lib = require("../functions/ki-chat/lib.js");

/* ---------- Browser-Logik ---------- */

test("formatMessage maskiert HTML und baut Absätze, Listen, Code und Fett", () => {
  assert.equal(formatMessage("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
  assert.equal(formatMessage("a\nb\n\nc"), "<p>a<br>b</p><p>c</p>");
  assert.equal(formatMessage("- eins\n- zwei"), "<ul><li>eins</li><li>zwei</li></ul>");
  assert.equal(formatMessage("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(formatMessage("**fett** und `code`"), "<p><strong>fett</strong> und <code>code</code></p>");
  assert.equal(formatMessage("```js\nif (a < b) {}\n```"), "<pre><code>if (a &lt; b) {}</code></pre>");
});

test("dayLabel: heute, gestern, sonst Datum", () => {
  const now = new Date(2026, 10, 17, 12);
  assert.equal(dayLabel(new Date(2026, 10, 17, 8).toISOString(), now), "Heute");
  assert.equal(dayLabel(new Date(2026, 10, 16, 23).toISOString(), now), "Gestern");
  assert.match(dayLabel(new Date(2026, 10, 1).toISOString(), now), /1/);
  assert.equal(dayLabel("kaputt", now), "");
});

test("sortMessages: älteste zuerst, bei Gleichstand die Frage vor der Antwort", () => {
  const t = "2026-11-17T10:00:00.000Z";
  const rows = [{ $createdAt: t, role: "model", text: "b" }, { $createdAt: t, role: "user", text: "a" }, { $createdAt: "2026-11-17T09:00:00.000Z", role: "user", text: "0" }];
  assert.deepEqual(sortMessages(rows).map((r) => r.text), ["0", "a", "b"]);
});

test("isLocked: Team-Tools nur für ihr Team, „soon“-Tools für Tester", () => {
  const chat = { team: "kiTester" };
  assert.equal(isLocked(chat, { tester: false, kiTester: false }), true);
  assert.equal(isLocked(chat, { tester: true, kiTester: false }), true, "Tester allein reicht nicht");
  assert.equal(isLocked(chat, { tester: false, kiTester: true }), false);
  assert.equal(isLocked({ soon: true }, true), false);
  assert.equal(isLocked({ soon: true }, false), true);
  assert.equal(isLocked({}, false), false);
});

/* ---------- Function-Logik ---------- */

function fake({ member = true, chats = [], messages = [], reply = "Hallo!" } = {}) {
  const calls = { gemini: [], added: [], created: [], deleted: [] };
  const rows = new Map(chats.map((c) => [c.$id, c]));
  return {
    calls,
    deps: {
      isMember: async () => member,
      gemini: async (system, turns) => { calls.gemini.push(turns); if (reply instanceof Error) throw reply; return reply; },
      error: () => {},
      db: {
        getChat: async (id) => rows.get(id) || null,
        countChats: async () => rows.size,
        createChat: async (userId, title) => { const c = { $id: "c1", userId, title, $updatedAt: "t" }; calls.created.push(title); rows.set("c1", c); return c; },
        touchChat: async () => {},
        addMessage: async (userId, chatId, role, text) => { calls.added.push([role, text]); return { $id: "m" + calls.added.length }; },
        recentMessages: async () => messages,
        deleteChat: async (id) => { calls.deleted.push(id); rows.delete(id); },
        renameChat: async (id, title) => { (calls.renamed = calls.renamed || []).push([id, title]); },
      },
    },
  };
}

test("send: nur Team-Mitglieder, sonst 403", async () => {
  const f = fake({ member: false });
  const r = await lib.handle({ body: { action: "send", text: "Hi" }, userId: "u1" }, f.deps);
  assert.equal(r.status, 403);
  assert.equal(f.calls.gemini.length, 0);
  assert.equal((await lib.handle({ body: { action: "send", text: "Hi" }, userId: "" }, f.deps)).status, 401);
});

test("send: neuer Chat bekommt Titel aus der Frage, beide Nachrichten werden gespeichert", async () => {
  const f = fake({ reply: "Antwort" });
  const r = await lib.handle({ body: { action: "send", text: "  Erkläre den Satz des Pythagoras  " }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.chat.title, "Erkläre den Satz des Pythagoras");
  assert.deepEqual(f.calls.added, [["user", "Erkläre den Satz des Pythagoras"], ["model", "Antwort"]]);
  assert.deepEqual(f.calls.gemini[0], [{ role: "user", text: "Erkläre den Satz des Pythagoras" }]);
  assert.equal(r.json.reply.text, "Antwort");
});

test("send: bestehender Chat schickt den Verlauf mit, fremde Chats sind unbekannt", async () => {
  const f = fake({ chats: [{ $id: "c9", userId: "u1", title: "t" }], messages: [{ role: "model", text: "alt" }, { role: "user", text: "q1" }, { role: "model", text: "a1" }] });
  const r = await lib.handle({ body: { action: "send", chatId: "c9", text: "weiter" }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls.gemini[0].map((t) => t.role), ["user", "model", "user"], "beginnt mit user");
  const other = await lib.handle({ body: { action: "send", chatId: "c9", text: "x" }, userId: "u2" }, f.deps);
  assert.equal(other.status, 404);
  assert.equal((await lib.handle({ body: { action: "send", chatId: "../x", text: "x" }, userId: "u1" }, f.deps)).status, 404);
});

test("send: Fehler der KI speichern nichts; leere Nachricht wird abgelehnt", async () => {
  const f = fake({ reply: new Error("kaputt") });
  const r = await lib.handle({ body: { action: "send", text: "Hi" }, userId: "u1" }, f.deps);
  assert.equal(r.status, 502);
  assert.equal(f.calls.added.length, 0);
  assert.equal(f.calls.created.length, 0);
  assert.equal((await lib.handle({ body: { action: "send", text: "   " }, userId: "u1" }, fake().deps)).status, 400);
});

test("delete: nur eigene Chats", async () => {
  const f = fake({ chats: [{ $id: "c9", userId: "u1", title: "t" }] });
  assert.equal((await lib.handle({ body: { action: "delete", chatId: "c9" }, userId: "u2" }, f.deps)).status, 404);
  assert.equal((await lib.handle({ body: { action: "delete", chatId: "c9" }, userId: "u1" }, f.deps)).status, 200);
  assert.deepEqual(f.calls.deleted, ["c9"]);
});

test("trimHistory und makeTitle begrenzen Länge und Anzahl", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "x" }));
  assert.ok(lib.trimHistory(many).length <= lib.LIMITS.historyMessages);
  assert.equal(lib.trimHistory(many)[0].role, "user");
  assert.ok(lib.makeTitle("wort ".repeat(50)).length <= lib.LIMITS.titleMax + 2);
  assert.equal(lib.makeTitle(""), "Neuer Chat");
});

/* ---------- Eingabe, Anhang, Websuche ---------- */

import { waveHtml, formatBytes, checkAttachment } from "../tools/kichat/core.js";

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]).toString("base64");

test("Links nur mit https, Wellen-Buchstaben und Dateigröße", () => {
  assert.equal(formatMessage("[Seite](https://a.de/x?y=1&z=2)"), '<p><a href="https://a.de/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">Seite</a></p>');
  assert.equal(formatMessage("[böse](javascript:alert(1))"), "<p>[böse](javascript:alert(1))</p>");
  assert.match(waveHtml("a <b"), /&lt;/);
  assert.equal((waveHtml("abc").match(/kc-wave-ch/g) || []).length, 3);
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1,5 MB");
  assert.equal(checkAttachment({ type: "image/png", size: 1000 }), null);
  assert.ok(checkAttachment({ type: "text/plain", size: 1000 }));
  assert.ok(checkAttachment({ type: "image/png", size: 30 * 1024 * 1024 }));
});

test("detectMime glaubt nur den ersten Bytes", () => {
  assert.equal(lib.detectMime(jpeg), "image/jpeg");
  assert.equal(lib.detectMime(Buffer.alloc(60, 65).toString("base64")), null);
  assert.equal(lib.detectMime("kein base64!"), null);
});

test("send mit Bild: gibt es an die KI, speichert nur den Hinweis darauf", async () => {
  const f = fake();
  f.deps.gemini = async (system, turns, opts) => { f.calls.gemini.push({ turns, opts }); return "Das ist eine Katze."; };
  const r = await lib.handle({ body: { action: "send", text: "", image: jpeg }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(f.calls.gemini[0].opts.image.mime, "image/jpeg");
  assert.equal(f.calls.gemini[0].turns[0].text, "Beschreibe das Bild.");
  assert.equal(f.calls.added[0][1], "Beschreibe das Bild.\n\n📎 Bild angehängt");
  assert.equal(r.json.reply.text, "Das ist eine Katze.");
  assert.ok(!JSON.stringify(f.calls.added).includes(jpeg), "Bild wird nicht gespeichert");
  const bad = await lib.handle({ body: { action: "send", text: "x", image: "AAAA" }, userId: "u1" }, fake().deps);
  assert.equal(bad.status, 422);
});

test("Klasse: nur 8 bis 12 zählen, die Systemanweisung passt sich der Klasse an", async () => {
  assert.equal(lib.cleanGrade("9"), 9);
  assert.equal(lib.cleanGrade(12), 12);
  for (const bad of [7, 13, "abc", "", null, undefined, 9.5, "10; drop"]) assert.equal(lib.cleanGrade(bad), null, String(bad));
  assert.equal(lib.systemPrompt(null), lib.SYSTEM_PROMPT, "ohne Klasse die allgemeine Anweisung");
  assert.match(lib.systemPrompt(8), /Klasse 8\./);
  assert.match(lib.systemPrompt("12"), /Klasse 12\./);
  assert.notEqual(lib.systemPrompt(8), lib.systemPrompt(12), "die Stufen unterscheiden sich");
  assert.equal(Object.keys(lib.GRADES).join(), "8,9,10,11,12");

  const systems = [];
  const f = fake();
  f.deps.gemini = async (system) => { systems.push(system); return "ok"; };
  await lib.handle({ body: { action: "send", text: "x", grade: 11 }, userId: "u1" }, f.deps);
  await lib.handle({ body: { action: "send", text: "y", grade: "quatsch" }, userId: "u1" }, f.deps);
  assert.match(systems[0], /Klasse 11\./);
  assert.equal(systems[1], lib.SYSTEM_PROMPT, "ungültige Klasse wird ignoriert");
});

test("Klassenwahl im Browser deckt sich mit dem Server", async () => {
  const { GRADES, DEFAULT_GRADE, cleanGrade } = await import("../tools/kichat/core.js");
  assert.deepEqual(GRADES.map(String), Object.keys(lib.GRADES), "dieselben Klassen wie im Server");
  assert.ok(GRADES.includes(DEFAULT_GRADE));
  assert.equal(cleanGrade("10"), 10);
  assert.equal(cleanGrade(null), null);
  assert.equal(cleanGrade("7"), null);
});

/* ---------- Schritte einer Antwort ---------- */

/** Uhr, die bei jedem Aufruf um 100 ms weiterläuft: Jeder Schritt dauert so genau 100 ms. */
const ticking = () => { let t = 1000; return () => (t += 100); };

test("send liefert die echten Schritte: neuer Chat ohne Verlauf, Antwort mit Klasse, Speichern", async () => {
  const f = fake();
  f.deps.now = ticking();
  const r = await lib.handle({ body: { action: "send", text: "Hi", grade: 10 }, userId: "u1" }, f.deps);
  assert.deepEqual(r.json.steps.map((s) => s.id), ["answer", "save"], "kein Verlauf bei einem neuen Chat");
  assert.equal(r.json.steps[0].label, "Antwort geschrieben");
  assert.equal(r.json.steps[0].detail, "Für Klasse 10");
  assert.equal(r.json.steps[0].ms, 100);
  assert.equal(r.json.steps[1].ms, 100);
});

test("send liefert Schritte mit Verlauf und Bild; ohne gültige Klasse keine Klassenangabe; Bild hat keine eigene Dauer", async () => {
  const f = fake({ chats: [{ $id: "c9", userId: "u1", title: "t" }], messages: [{ role: "user", text: "a" }, { role: "model", text: "b" }, { role: "user", text: "c" }] });
  f.deps.now = ticking();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]).toString("base64");
  const r = await lib.handle({ body: { action: "send", chatId: "c9", text: "x", image: jpeg, grade: "quatsch" }, userId: "u1" }, f.deps);
  assert.deepEqual(r.json.steps.map((s) => s.id), ["history", "image", "answer", "save"]);
  assert.equal(r.json.steps[0].detail, "3 Nachrichten");
  assert.equal(r.json.steps[1].ms, undefined, "das Bild liest die KI in der Antwort");
  assert.equal(r.json.steps[2].detail, "", "ungültige Klasse wird nicht angezeigt");
});

test("Schrittliste im Browser: Dauer, Zusammenfassung, Maskierung, unbekannte Schritte", () => {
  assert.equal(formatMs(2400), "2,4 s");
  assert.equal(formatMs(0), "0,0 s");
  assert.equal(formatMs(-5), "0,0 s");
  const steps = [{ id: "answer", label: "Antwort geschrieben", detail: "Für Klasse 8", ms: 2000 }, { id: "save", label: "Chat gespeichert", detail: "", ms: 400 }];
  assert.equal(stepsSummary(steps), "2 Schritte · 2,4 s");
  assert.equal(stepsSummary([steps[0]]), "1 Schritt · 2,0 s");
  assert.equal(stepsSummary([{ id: "image", label: "Bild gelesen" }]), "1 Schritt", "ohne Dauer keine Zeit");
  assert.equal(stepsSummary([]), "");
  assert.deepEqual(cleanSteps([{ id: "boese", label: "x" }, null, { id: "save", label: "ok", ms: "viel" }]).map((s) => s.id), ["save"]);
  assert.equal(cleanSteps([{ id: "save", label: "ok", ms: "viel" }])[0].ms, null);
  const html = stepsHtml([{ id: "answer", label: "<b>Hallo</b>", detail: "\"x\"", ms: 100 }], { id: "m<1", open: false });
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /hidden>/);
  assert.match(html, /&lt;b&gt;Hallo&lt;\/b&gt;/);
  assert.ok(!html.includes("<b>Hallo"), "Text wird maskiert");
  assert.match(html, /id="tools-m&lt;1"/);
  assert.match(stepsHtml(steps, { id: "a", open: true }), /aria-expanded="true"/);
  assert.equal(stepsHtml([], { id: "a" }), "");
});

/* ---------- Chat umbenennen ---------- */

test("rename: nur eigene Chats, Name wird bereinigt und gespeichert", async () => {
  const f = fake({ chats: [{ $id: "c9", userId: "u1", title: "alt" }] });
  const r = await lib.handle({ body: { action: "rename", chatId: "c9", title: "  Mathe   Klausur\nlernen  " }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.json.title, "Mathe Klausur lernen");
  assert.deepEqual(f.calls.renamed, [["c9", "Mathe Klausur lernen"]]);
  const fremd = await lib.handle({ body: { action: "rename", chatId: "c9", title: "x" }, userId: "u2" }, f.deps);
  assert.equal(fremd.status, 404, "fremde Chats sind unbekannt");
  assert.equal(f.calls.renamed.length, 1, "fremder Versuch ändert nichts");
  assert.equal((await lib.handle({ body: { action: "rename", chatId: "c9", title: "   " }, userId: "u1" }, f.deps)).status, 400, "leerer Name");
  assert.equal((await lib.handle({ body: { action: "rename", chatId: "../x", title: "x" }, userId: "u1" }, f.deps)).status, 404);
  const lang = await lib.handle({ body: { action: "rename", chatId: "c9", title: "a".repeat(200) }, userId: "u1" }, f.deps);
  assert.equal(lang.json.title.length, lib.LIMITS.titleMax, "Länge begrenzt");
  const kein = fake({ member: false, chats: [{ $id: "c9", userId: "u1", title: "alt" }] });
  assert.equal((await lib.handle({ body: { action: "rename", chatId: "c9", title: "x" }, userId: "u1" }, kein.deps)).status, 403, "ohne Team kein Umbenennen");
});

test("Name im Browser deckt sich mit dem Server", () => {
  assert.equal(cleanTitle("  Hallo \n  Welt  "), "Hallo Welt");
  assert.equal(cleanTitle("   "), "");
  assert.equal(cleanTitle(null), "");
  assert.equal(cleanTitle("b".repeat(100)).length, MAX_TITLE);
  assert.equal(MAX_TITLE, lib.LIMITS.titleMax);
  assert.equal(cleanTitle("x".repeat(59) + " yz"), lib.cleanTitle("x".repeat(59) + " yz"), "gleiches Ergebnis wie auf dem Server");
});

test("formatMessage baut aus einem lösung-Block ein Lösungsfenster mit Kopieren und Goodnotes", () => {
  const html = formatMessage("Kurz erklärt.\n\n```lösung\na) 2 + 3 = 5 <b>\n```\nFertig.");
  assert.match(html, /class="kc-solution"/);
  assert.match(html, /data-solution="copy"/);
  assert.match(html, /data-solution="goodnotes"/);
  assert.match(html, /a\) 2 \+ 3 = 5 &lt;b&gt;/);
  assert.doesNotMatch(html, /<pre><code>/);
});

test("PDF-Anhang: erkannt, an die KI gegeben, nur Hinweis gespeichert; zu große PDFs abgelehnt", async () => {
  const pdf = Buffer.from("%PDF-1.4\n" + "x".repeat(60)).toString("base64");
  assert.equal(lib.detectMime(pdf), "application/pdf");
  const f = fake();
  f.deps.gemini = async (system, turns, opts) => { f.calls.gemini.push({ turns, opts }); return "Lösung."; };
  const r = await lib.handle({ body: { action: "send", text: "", image: pdf }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(f.calls.gemini[0].opts.image.mime, "application/pdf");
  assert.equal(f.calls.gemini[0].turns[0].text, "Löse die Aufgaben in diesem PDF.");
  assert.equal(f.calls.added[0][1], "Löse die Aufgaben in diesem PDF.\n\n📎 PDF angehängt");
  assert.equal(checkAttachment({ type: "application/pdf", name: "a.pdf", size: 1000 }), null);
  assert.ok(checkAttachment({ type: "application/pdf", name: "a.pdf", size: 3 * 1024 * 1024 }));
});

test("cards: nur Team, Karten aus Foto/Thema, bereinigt ohne Doppelte, nichts gespeichert", async () => {
  const denied = fake({ member: false });
  assert.equal((await lib.handle({ body: { action: "cards", text: "Bio" }, userId: "u1" }, denied.deps)).status, 403);
  assert.equal(denied.calls.gemini.length, 0);

  const reply = JSON.stringify({ cards: [{ front: "casa", back: "Haus" }, { front: "Casa", back: "Heim" }, { front: "", back: "x" }, { front: "gato", back: "Katze" }] });
  const f = fake({ reply });
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]).toString("base64");
  f.deps.gemini = async (system, turns, opts) => { f.calls.gemini.push({ system, turns, opts }); return reply; };
  const r = await lib.handle({ body: { action: "cards", text: "", image: jpg, count: 10 }, userId: "u1" }, f.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.cards, [{ front: "casa", back: "Haus" }, { front: "gato", back: "Katze" }]);
  assert.equal(f.calls.gemini[0].opts.image.mime, "image/jpeg");
  assert.equal(f.calls.gemini[0].opts.json, true);
  assert.equal(f.calls.added.length, 0);
  assert.equal(f.calls.created.length, 0);

  assert.equal((await lib.handle({ body: { action: "cards" }, userId: "u1" }, f.deps)).status, 400);
  assert.equal((await lib.handle({ body: { action: "cards", text: "x", image: "AAAA" }, userId: "u1" }, f.deps)).status, 422);
  const empty = fake({ reply: "kein json" });
  assert.equal((await lib.handle({ body: { action: "cards", text: "Bio" }, userId: "u1" }, empty.deps)).status, 422);
});
