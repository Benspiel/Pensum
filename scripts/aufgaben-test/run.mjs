/* Lässt die KI Test-Arbeitsblätter ausfüllen und misst, wie genau die Antworten in den Lücken sitzen.
 *
 *   GEMINI_API_KEY=… node scripts/aufgaben-test/run.mjs [blatt …] [--runs 2] [--tag name]
 *
 * Voraussetzung: python scripts/aufgaben-test/gen_sheets.py (erzeugt out/*.send.jpg und out/*.gt.json).
 * Die Anfrage kommt aus functions/aufgaben/lib.js (buildGeminiBody), ist also dieselbe wie auf dem Server.
 * Ergebnis je Blatt: out/<blatt>.result.json (rohe Antwort, bereinigte Felder, Zuordnung, Messwerte). Der Schlüssel wird nie ausgegeben. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { score, stats } from "./score-lib.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const lib = require("../../functions/aufgaben/lib.js");

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const RUNS = Number(flag("runs", 1));
const TAG = flag("tag", "");
const names = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const sheets = names.length ? names : fs.readdirSync(OUT).filter((f) => f.endsWith(".gt.json")).map((f) => f.replace(".gt.json", ""));

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error("GEMINI_API_KEY fehlt (nur in der Umgebung setzen, nie in eine Datei schreiben)."); process.exit(1); }
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(imageB64) {
  const body = lib.buildGeminiBody(process.env.SYSTEM_PROMPT_OVERRIDE || lib.SYSTEM_PROMPT, lib.USER_PROMPT, { mime: "image/jpeg", data: imageB64 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    const json = await r.json().catch(() => null);
    if (r.status === 503 || r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    if (r.status !== 200) throw new Error(`Gemini ${r.status}: ${json?.error?.message || "?"}`);
    const cand = json.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
    return { text, ms: Date.now() - t0, usage: json.usageMetadata };
  }
  throw new Error("Gemini überlastet");
}

const summary = [];
for (const name of sheets) {
  const gtPath = path.join(OUT, name + ".gt.json");
  const imgPath = path.join(OUT, name + ".send.jpg");
  if (!fs.existsSync(gtPath) || !fs.existsSync(imgPath)) { console.log("übersprungen (Datei fehlt):", name); continue; }
  const gt = JSON.parse(fs.readFileSync(gtPath, "utf8"));
  const b64 = fs.readFileSync(imgPath).toString("base64");
  const runs = [];
  for (let n = 1; n <= RUNS; n++) {
    let res;
    try { res = await ask(b64); } catch (e) { console.log(`${name} #${n}: FEHLER ${e.message}`); continue; }
    const parsed = lib.parseModelJson(res.text);
    const list = Array.isArray(parsed) ? parsed : parsed?.fields;
    const fields = lib.cleanFields(list);
    const sc = score(gt, fields);
    const r = {
      run: n, ms: res.ms, tokens: res.usage?.totalTokenCount, raw: res.text, skipped: parsed?.skipped || [], fields, ...sc,
      stats: stats(gt, sc),
    };
    runs.push(r);
    const s = r.stats;
    console.log(`${name.padEnd(14)} #${n}  gefunden ${s.found}/${s.gaps}  Box ok (IoU≥0,4) ${s.goodBox}/${s.gaps}  Ø-IoU ${s.meanIou}  Text richtig ${s.textOk}/${s.textTotal}  Zusatzfelder ${s.extras}  ${(res.ms / 1000).toFixed(1)}s`);
  }
  fs.writeFileSync(path.join(OUT, `${name}${TAG ? "." + TAG : ""}.result.json`), JSON.stringify({ model, name, runs }, null, 1));
  summary.push({ name, runs });
}

// Gesamtbilanz
let g = 0, f = 0, ok = 0, tOk = 0, tAll = 0, ex = 0, iouSum = 0, iouN = 0;
for (const s of summary) for (const r of s.runs) { g += r.stats.gaps; f += r.stats.found; ok += r.stats.goodBox; tOk += r.stats.textOk; tAll += r.stats.textTotal; ex += r.stats.extras; for (const x of r.rows) if (x.found) { iouSum += x.iou; iouN++; } }
if (g) console.log(`\nGESAMT (${model}): Lücken gefunden ${f}/${g}, Box passt ${ok}/${g} (${Math.round((ok / g) * 100)} %), Ø-IoU ${(iouSum / (iouN || 1)).toFixed(2)}, Text richtig ${tOk}/${tAll}, Zusatzfelder ${ex}`);
