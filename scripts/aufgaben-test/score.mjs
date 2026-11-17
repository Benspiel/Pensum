/* Wertet die Ergebnisse der echten Function aus, die browser-harness.js im Browser gesammelt hat.
 *   node scripts/aufgaben-test/score.mjs <name>      liest out/<name>.batch.json = { blatt: { status, ms, data } }
 * Schreibt out/<blatt>.<name>.result.json (für viz.py) und gibt eine Tabelle aus. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { score, stats } from "./score-lib.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const tag = process.argv[2] || "run";
const batch = JSON.parse(fs.readFileSync(path.join(OUT, `${tag}.batch.json`), "utf8"));
let g = 0, f = 0, ok = 0, tOk = 0, tAll = 0, ex = 0, iouSum = 0, iouN = 0, fails = 0;
for (const name of Object.keys(batch).sort()) {
  const gt = JSON.parse(fs.readFileSync(path.join(OUT, name.split("#")[0] + ".gt.json"), "utf8"));
  let srv = batch[name];
  if (srv.f) srv = { status: srv.s, ms: srv.ms, data: srv.e ? { ok: false, error: srv.e } : { ok: true, fields: srv.f.map((a, i) => ({ id: i + 1, box: a.slice(0, 4), text: a[4], label: a[5] || "" })), skipped: [] } }; // kompaktes Format von __aufgDump
  const data = srv.data;
  if (!data || !data.ok) { fails++; console.log(`${name.padEnd(14)} FEHLER Status ${srv.status}: ${data && data.error ? data.error.slice(0, 100) : "keine Antwort"}`); continue; }
  const sc = score(gt, data.fields || []);
  const s = stats(gt, sc);
  fs.writeFileSync(path.join(OUT, `${name}.${tag}.result.json`), JSON.stringify({ name, runs: [{ run: 1, ms: srv.ms, fields: data.fields, skipped: data.skipped, ...sc, stats: s }] }, null, 1));
  g += s.gaps; f += s.found; ok += s.goodBox; tOk += s.textOk; tAll += s.textTotal; ex += s.extras;
  for (const r of sc.rows) if (r.found) { iouSum += r.iou; iouN++; }
  console.log(`${name.padEnd(14)} gefunden ${s.found}/${s.gaps}  Box ok (IoU≥0,4) ${s.goodBox}/${s.gaps}  Ø-IoU ${s.meanIou}  Text richtig ${s.textOk}/${s.textTotal}  Zusatzfelder ${s.extras}  ${(srv.ms / 1000).toFixed(1)}s`);
}
if (g) console.log(`\nGESAMT: Lücken gefunden ${f}/${g}, Box passt ${ok}/${g} (${Math.round((ok / g) * 100)} %), Ø-IoU ${(iouSum / (iouN || 1)).toFixed(2)}, Text richtig ${tOk}/${tAll}, Zusatzfelder ${ex}${fails ? `, ${fails} Blatt ohne Ergebnis` : ""}`);
