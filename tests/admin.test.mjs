/* Test: Team (Admin) – Zugang, Zahlen der Function, Raster, Besuchszähler. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isLocked } from "../js/lock.js";
import { tools, toolById } from "../js/tools.js";
import { fmt, pct, weekday, barHeights, bentoHtml, peopleHtml, dayAgo } from "../tools/admin/core.js";
import { toolFromPath, shouldCount, berlinDay } from "../js/track.js";

const require = createRequire(import.meta.url);
const { buildStats, lastDays, inBatches, aggregatePeople, TOOLS } = require("../functions/admin-stats/lib.js");

test("Das Admin-Tool ist nur für das Team admin offen, Tester und Ki-Tester reichen nicht", () => {
  const t = toolById("admin");
  assert.ok(t && t.team === "admin");
  assert.equal(isLocked(t, { tester: true, kiTester: true, admin: false }), true);
  assert.equal(isLocked(t, { tester: false, kiTester: false, admin: true }), false);
  assert.equal(isLocked(t, false), true);
  assert.equal(isLocked(toolById("kichat"), { tester: false, kiTester: false, admin: true }), true, "Admin allein öffnet den KI-Chat nicht");
});

test("Zahlen formatieren", () => {
  assert.equal(fmt(1234), "1.234");
  assert.equal(fmt(null), "–");
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(9, 3), 100);
  assert.equal(weekday("2026-11-19"), "Do");
  assert.deepEqual(barHeights([0, 5, 10]), [0, 50, 100]);
  assert.deepEqual(barHeights([0, 0]), [0, 0]);
  assert.deepEqual(barHeights([1, 100]), [4, 100], "kleine Werte bleiben sichtbar");
  assert.deepEqual(barHeights([null, 4]), [0, 100]);
});

test("Function: 7 Tage, heute zuletzt; fehlende Zahlen bleiben null; Tools nach Aufrufen sortiert", () => {
  const now = new Date("2026-11-19T10:00:00Z");
  assert.deepEqual(lastDays(3, now), ["2026-11-17", "2026-11-18", "2026-11-19"]);
  const raw = {
    users: { total: 12, verified: 9, new7: 2, active7: 5 }, teams: { tester: 1, kiTester: 2, admin: 1 },
    visitsTotal: 100, visits7: 40, perDay: { "2026-11-19": 7, "2026-11-18": 3 },
    byTool: { planer: { total: 30, last7: 20 }, mindmap: { total: 10, last7: 25 }, goodnotes: { total: 5, last7: 20 } },
    content: { decks: 4, cards: 80 },
  };
  const s = buildStats(raw, now);
  assert.equal(s.visits.series.length, 7);
  assert.equal(s.visits.today, 7);
  assert.equal(s.visits.series[0].count, null);
  assert.equal(s.visits.byTool.length, TOOLS.length);
  assert.deepEqual(s.visits.byTool.slice(0, 3).map((t) => t.tool), ["mindmap", "planer", "goodnotes"], "erst nach 7 Tagen, dann nach gesamt");
  assert.equal(s.content.decks, 4);
  assert.equal(s.content.mindmaps, null);
  assert.equal(s.users.total, 12);
  assert.equal(buildStats({}, now).users.total, null);
});

test("Function: Abfragen laufen in Päckchen, ein Fehler wird zu null", async () => {
  let running = 0, peak = 0;
  const task = (n) => async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; if (n === 3) throw new Error("x"); return n; };
  const out = await inBatches([0, 1, 2, 3, 4, 5, 6].map(task), 3);
  assert.deepEqual(out, [0, 1, 2, null, 4, 5, 6]);
  assert.ok(peak <= 3);
});

test("Raster: feste Module ohne Griffe zum Verschieben, alle Tools aus dem Verzeichnis", () => {
  const stats = buildStats({ users: { total: 3, verified: 2 }, byTool: { planer: { total: 4, last7: 2 } } }, new Date("2026-11-19T10:00:00Z"));
  const html = bentoHtml(stats, tools.map((t) => ({ id: t.id, name: t.name, icon: t.icon })));
  for (const id of ["users", "visits", "ranking", "active", "new", "teams", "content"]) assert.ok(html.includes(`data-widget="${id}"`), id);
  assert.ok(!/draggable|grip|resize/i.test(html), "nichts zum Verschieben oder Größe ändern");
  assert.ok(html.includes("Planer"));
  assert.ok(html.includes("67 %"), "Anteil bestätigter Konten");
  assert.ok(html.includes("–"), "fehlende Zahlen als Strich");
});

test("Besuchszähler: Tool aus dem Pfad, Admin zählt nicht, höchstens einmal je halbe Stunde", () => {
  assert.equal(toolFromPath("/tools/notenrechner/"), "notenrechner");
  assert.equal(toolFromPath("/tools/spiele/index.html"), "spiele");
  assert.equal(toolFromPath("/tools/admin/"), null);
  assert.equal(toolFromPath("/"), null);
  assert.equal(toolFromPath("/konto/"), null);
  const now = 1_000_000_000;
  assert.equal(shouldCount(null, now), true);
  assert.equal(shouldCount(now - 60_000, now), false);
  assert.equal(shouldCount(now - 31 * 60_000, now), true);
  assert.match(berlinDay(new Date("2026-11-19T23:30:00Z")), /^2026-11-20$/);
});

test("Wer nutzt was: Aufrufe je Person und Tool, unbekannte Konten und Tools werden übergangen", () => {
  const people = aggregatePeople(
    [{ id: "a", name: "Anna", email: "a@x.de" }, { id: "b", name: "", email: "b@x.de" }, { id: "c", name: "Leer" }],
    [{ userId: "a", tool: "planer", day: "2026-11-18" }, { userId: "a", tool: "planer", day: "2026-11-19" }, { userId: "a", tool: "mindmap", day: "2026-11-17" },
      { userId: "b", tool: "planer", day: "2026-11-10" }, { userId: "gelöscht", tool: "planer", day: "2026-11-19" }, { userId: "b", tool: "gibtsnicht", day: "2026-11-19" }],
  );
  assert.deepEqual(people.map((p) => p.id), ["a", "b"], "Person ohne Aufrufe fehlt, meiste Aufrufe zuerst");
  assert.deepEqual(people[0].tools, { planer: 2, mindmap: 1 });
  assert.equal(people[0].total, 3);
  assert.equal(people[0].lastDay, "2026-11-19");
});

test("Wer nutzt was: Oberfläche filtert nach Tool, maskiert Namen und zeigt, wann zuletzt", () => {
  const list = tools.map((t) => ({ id: t.id, name: t.name, icon: t.icon }));
  const data = { days: 30, truncated: false, list: [
    { id: "a", name: "<b>Anna</b>", email: "a@x.de", total: 3, lastDay: "2026-11-19", tools: { planer: 2, mindmap: 1 } },
    { id: "b", name: "", email: "b@x.de", total: 5, lastDay: "2026-11-17", tools: { planer: 5 } },
  ] };
  const all = peopleHtml(data, list, "", "2026-11-19");
  assert.ok(all.includes("&lt;b&gt;Anna"), "Name maskiert");
  assert.ok(!all.includes("<b>Anna"));
  assert.ok(all.includes("b@x.de") && all.includes("heute") && all.includes("vor 2 Tagen"));
  const onlyMind = peopleHtml(data, list, "mindmap", "2026-11-19");
  assert.ok(onlyMind.includes("Anna") && !onlyMind.includes("b@x.de"));
  assert.ok(peopleHtml({ days: 30, list: [] }, list, "", "2026-11-19").includes("Noch keine Aufrufe"));
  assert.equal(dayAgo("2026-11-18", "2026-11-19"), "gestern");
});
