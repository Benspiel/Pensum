/* Beispielrechnungen für den Notenrechner. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import {
  pointsToNote, noteToPoints, convert, parseGrade, parseWeight, weightedAverage, subjectAverage,
  overallAverage, requiredGrade, formatNumber, formatInput, schoolYearOf, halfOf, schoolYearOptions,
} from "../tools/notenrechner/core.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("gewichteter Durchschnitt: Klausur 2× und mündlich 1×", () => {
  // (2·2 + 3·1) / 3 = 2,33
  near(weightedAverage([{ value: 2, weight: 2 }, { value: 3, weight: 1 }]), 7 / 3);
  // Punkte: (12·2 + 9·1) / 3 = 11
  near(weightedAverage([{ value: 12, weight: 2 }, { value: 9, weight: 1 }]), 11);
  // Gewichtung 50 % / 30 % / 20 %
  near(weightedAverage([{ value: 1, weight: 50 }, { value: 3, weight: 30 }, { value: 4, weight: 20 }]), 2.2);
});

test("leere Fächer und Division durch 0 ergeben keinen Durchschnitt", () => {
  assert.equal(weightedAverage([]), null);
  assert.equal(weightedAverage(null), null);
  assert.equal(weightedAverage([{ value: 2, weight: 0 }]), null);
  assert.equal(subjectAverage([], "note"), null);
  assert.equal(overallAverage([]), null);
  assert.equal(overallAverage([null, null]), null);
});

test("ungültige Einträge werden übersprungen statt mitgerechnet", () => {
  near(weightedAverage([{ value: 2, weight: 1 }, { value: NaN, weight: 1 }, { value: 4, weight: -1 }, { value: 3, weight: Infinity }]), 2);
  near(weightedAverage([{ value: 2, weight: 1 }, { value: 1, weight: 0 }]), 2); // Gewicht 0 zählt nicht
});

test("Umrechnung Punkte → Note", () => {
  near(pointsToNote(15), 2 / 3);
  near(pointsToNote(14), 1);
  near(pointsToNote(11), 2);
  near(pointsToNote(8), 3);
  near(pointsToNote(5), 4);
  near(pointsToNote(2), 5);
  near(pointsToNote(1), 16 / 3);
  near(pointsToNote(0), 6);
});

test("Umrechnung Note → Punkte und zurück", () => {
  near(noteToPoints(1), 14);
  near(noteToPoints(2.5), 9.5);
  near(noteToPoints(4), 5);
  near(noteToPoints(6), 0);
  for (let p = 0; p <= 15; p += 0.5) near(noteToPoints(pointsToNote(p)), p, 1e-9);
  for (let n = 1; n <= 6; n += 0.1) near(pointsToNote(noteToPoints(n)), n, 1e-9);
  assert.equal(convert(3, "note", "note"), 3);
  assert.equal(convert(NaN, "note", "punkte"), null);
});

test("Eingaben prüfen: Noten 1–6", () => {
  assert.deepEqual(parseGrade("2", "note"), { ok: true, value: 2 });
  assert.deepEqual(parseGrade(" 2,5 ", "note"), { ok: true, value: 2.5 });
  assert.deepEqual(parseGrade("3.25", "note"), { ok: true, value: 3.25 });
  near(parseGrade("2+", "note").value, 5 / 3);
  near(parseGrade("2-", "note").value, 7 / 3);
  near(parseGrade("1+", "note").value, 2 / 3);
  assert.equal(parseGrade("", "note").empty, true);
  for (const bad of ["0", "7", "6-", "abc", "-2", "2,,5", "1e3", "2 3"]) assert.equal(parseGrade(bad, "note").ok, false, bad);
});

test("Eingaben prüfen: Punkte 0–15 und Gewichtung", () => {
  assert.deepEqual(parseGrade("0", "punkte"), { ok: true, value: 0 });
  assert.deepEqual(parseGrade("15", "punkte"), { ok: true, value: 15 });
  for (const bad of ["16", "-1", "2+", "x"]) assert.equal(parseGrade(bad, "punkte").ok, false, bad);
  assert.deepEqual(parseWeight("2"), { ok: true, value: 2 });
  assert.deepEqual(parseWeight("2x"), { ok: true, value: 2 });
  assert.deepEqual(parseWeight("0,5"), { ok: true, value: 0.5 });
  assert.deepEqual(parseWeight("0"), { ok: true, value: 0 });
  for (const bad of ["-1", "101", "viel"]) assert.equal(parseWeight(bad).ok, false, bad);
  assert.equal(parseWeight("").empty, true);
});

test("Fachdurchschnitt rechnet gemischte Systeme um", () => {
  // 11 Punkte = Note 2; zusammen mit einer 3 (gleich gewichtet) → 2,5
  near(subjectAverage([{ value: 11, system: "punkte", weight: 1 }, { value: 3, system: "note", weight: 1 }], "note"), 2.5);
  // dieselben Noten in Punkten: 11 und 8 → 9,5
  near(subjectAverage([{ value: 11, system: "punkte", weight: 1 }, { value: 3, system: "note", weight: 1 }], "punkte"), 9.5);
});

test("Gesamtdurchschnitt ist das Mittel der Fächer, leere Fächer zählen nicht", () => {
  near(overallAverage([2, 3, null, 1]), 2);
  near(overallAverage([11.5]), 11.5);
});

test("Zielnote in Noten: erreichbar", () => {
  // Bisher 3 (2×) und 2 (1×) → Schnitt 2,67. Ziel 2,5 mit einer Arbeit, die 2× zählt:
  // (2,5·5 − 8) / 2 = 2,25 → eintragbar ist höchstens eine 2,2
  const r = requiredGrade({ grades: [{ value: 3, weight: 2 }, { value: 2, weight: 1 }], target: 2.5, nextWeight: 2, system: "note" });
  assert.equal(r.status, "reachable");
  near(r.needed, 2.25);
  near(r.practical, 2.2);
  assert.ok((8 + r.practical * 2) / 5 <= 2.5);
});

test("Zielnote in Noten: unerreichbar und schon sicher", () => {
  const no = requiredGrade({ grades: [{ value: 5, weight: 1 }, { value: 5, weight: 1 }], target: 2, nextWeight: 1, system: "note" });
  assert.equal(no.status, "unreachable");
  near(no.bestCase, 11 / 3); // selbst mit einer 1: 3,67
  const yes = requiredGrade({ grades: [{ value: 1, weight: 3 }], target: 3, nextWeight: 1, system: "note" });
  assert.equal(yes.status, "guaranteed");
});

test("Zielnote in Punkten", () => {
  // Bisher 8 und 10 Punkte, Ziel 10 im Schnitt, nächste Arbeit zählt doppelt: (10·4 − 18) / 2 = 11
  const r = requiredGrade({ grades: [{ value: 8, weight: 1 }, { value: 10, weight: 1 }], target: 10, nextWeight: 2, system: "punkte" });
  assert.equal(r.status, "reachable");
  near(r.practical, 11);
  // krumme Werte werden auf ganze Punkte aufgerundet: (9·3 − 17) / 1 = 10 → 10; (9,5·3 − 17) = 11,5 → 12
  near(requiredGrade({ grades: [{ value: 8, weight: 1 }, { value: 9, weight: 1 }], target: 9.5, nextWeight: 1, system: "punkte" }).practical, 12);
  assert.equal(requiredGrade({ grades: [{ value: 2, weight: 4 }], target: 13, nextWeight: 1, system: "punkte" }).status, "unreachable");
  assert.equal(requiredGrade({ grades: [{ value: 15, weight: 4 }], target: 5, nextWeight: 1, system: "punkte" }).status, "guaranteed");
});

test("Zielnote ohne bisherige Noten und mit ungültigen Angaben", () => {
  const first = requiredGrade({ grades: [], target: 2, nextWeight: 1, system: "note" });
  assert.equal(first.status, "reachable");
  near(first.practical, 2);
  assert.equal(requiredGrade({ grades: [], target: 2, nextWeight: 0, system: "note" }).status, "invalid");
  assert.equal(requiredGrade({ grades: [], target: 7, nextWeight: 1, system: "note" }).status, "invalid");
  assert.equal(requiredGrade({ grades: [], target: NaN, nextWeight: 1, system: "punkte" }).status, "invalid");
  assert.equal(requiredGrade({ grades: [], target: 16, nextWeight: 1, system: "punkte" }).status, "invalid");
});

test("Formatierung", () => {
  assert.equal(formatNumber(7 / 3), "2,33");
  assert.equal(formatNumber(11, 1), "11,0");
  assert.equal(formatNumber(null), "–");
  assert.equal(formatInput(5 / 3), "1,67");
  assert.equal(formatInput(2), "2");
  assert.equal(formatInput(NaN), "");
});

test("Schuljahr und Halbjahr", () => {
  assert.equal(schoolYearOf(new Date(2026, 10, 11)), "2026/27");
  assert.equal(schoolYearOf(new Date(2027, 1, 1)), "2026/27");
  assert.equal(schoolYearOf(new Date(2027, 7, 1)), "2027/28");
  assert.equal(schoolYearOf(new Date(1999, 8, 1)), "1999/00");
  assert.equal(halfOf(new Date(2026, 10, 11)), 1);
  assert.equal(halfOf(new Date(2027, 0, 20)), 1);
  assert.equal(halfOf(new Date(2027, 1, 1)), 2);
  assert.deepEqual(schoolYearOptions(["2023/24", "kaputt"], new Date(2026, 10, 11)), ["2027/28", "2026/27", "2025/26", "2023/24"]);
});
