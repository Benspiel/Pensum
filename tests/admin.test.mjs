/* Test: Team (Admin) – Zugang, Zahlen der Function, Raster, Besuchszähler. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isLocked } from "../js/lock.js";
import { tools, toolById } from "../js/tools.js";
import { fmt, pct, weekday, barHeights, bentoHtml } from "../tools/admin/core.js";
import { toolFromPath, shouldCount, berlinDay } from "../js/track.js";

const require = createRequire(import.meta.url);
const { buildStats, lastDays, inBatches, TOOLS } = require("../functions/admin-stats/lib.js");

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
