import test from "node:test";
import assert from "node:assert/strict";
import { parseDay, todayISO, daysUntil, dueLabel, formatDate, examCountdown, groupTasks, splitExams, stats, usedSubjects } from "../tools/planer/core.js";

const TODAY = "2026-11-18"; // ein Mittwoch

test("parseDay prüft echte Kalendertage", () => {
  assert.notEqual(parseDay("2026-11-18"), null);
  assert.equal(parseDay("2026-02-31"), null);
  assert.equal(parseDay("18.11.2026"), null);
  assert.equal(parseDay(""), null);
});

test("todayISO und daysUntil", () => {
  assert.equal(todayISO(new Date(2026, 10, 5)), "2026-11-05");
  assert.equal(daysUntil("2026-11-20", TODAY), 2);
  assert.equal(daysUntil("2026-11-17", TODAY), -1);
  assert.equal(daysUntil("", TODAY), null);
  assert.equal(daysUntil("2026-12-01", "2026-11-30"), 1); // Monatswechsel
});

test("dueLabel", () => {
  assert.equal(dueLabel("", TODAY), "Ohne Datum");
  assert.equal(dueLabel("2026-11-10", TODAY), "8 Tage überfällig");
  assert.equal(dueLabel("2026-11-17", TODAY), "Gestern fällig");
  assert.equal(dueLabel("2026-11-18", TODAY), "Heute");
  assert.equal(dueLabel("2026-11-19", TODAY), "Morgen");
  assert.equal(dueLabel("2026-11-20", TODAY), "Übermorgen");
  assert.equal(dueLabel("2026-11-23", TODAY), "Montag");
  assert.equal(dueLabel("2026-11-30", TODAY), "Mo. 30.11.");
  assert.equal(dueLabel("2027-01-04", TODAY), "Mo. 04.01.2027");
});

test("formatDate Wochentag stimmt", () => {
  assert.equal(formatDate("2026-11-18", TODAY), "Mi. 18.11.");
});

test("examCountdown", () => {
  assert.deepEqual(examCountdown("2026-11-18", TODAY), { big: "Heute", small: "schreibst du", state: "today" });
  assert.equal(examCountdown("2026-11-25", TODAY).big, "7");
  assert.equal(examCountdown("2026-11-25", TODAY).state, "soon");
  assert.equal(examCountdown("2026-12-25", TODAY).state, "later");
  assert.equal(examCountdown("2026-11-01", TODAY).state, "past");
});

const T = (id, date, done = false, subject = "") => ({ id, kind: "task", title: id, subject, date, note: "", done, deckId: "" });

test("groupTasks sortiert nach Dringlichkeit und blendet Erledigtes aus", () => {
  const g = groupTasks([T("a", "2026-12-24"), T("b", ""), T("c", "2026-11-10"), T("d", "2026-11-18"), T("e", "2026-11-20"), T("f", "2026-11-19"), T("x", "2026-11-18", true)], TODAY);
  assert.deepEqual(g.map((x) => x.key), ["overdue", "today", "week", "later", "none"]);
  assert.deepEqual(g.find((x) => x.key === "week").items.map((i) => i.id), ["f", "e"]);
  assert.equal(g.find((x) => x.key === "today").items.length, 1);
});

test("splitExams und stats", () => {
  const E = (id, date) => ({ id, kind: "exam", title: id, subject: "", date, note: "", done: false, deckId: "" });
  const { upcoming, past } = splitExams([E("späte", "2026-12-01"), E("alt", "2026-10-01"), E("frühe", "2026-11-20")], TODAY);
  assert.deepEqual(upcoming.map((e) => e.id), ["frühe", "späte"]);
  assert.deepEqual(past.map((e) => e.id), ["alt"]);
  const s = stats([T("a", "2026-11-10"), T("b", "2026-11-18"), T("c", "", true), E("frühe", "2026-11-20")], TODAY);
  assert.equal(s.open, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.dueToday, 1);
  assert.equal(s.nextExamDays, 2);
});

test("usedSubjects", () => {
  assert.deepEqual(usedSubjects([T("a", "", false, "Mathe"), T("b", "", false, "Deutsch"), T("c", "", false, "Mathe"), T("d", "", false, "")]), ["Deutsch", "Mathe"]);
});
