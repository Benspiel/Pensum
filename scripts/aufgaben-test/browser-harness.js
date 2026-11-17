/* Schickt die Test-Blätter über das angemeldete Konto an die echte Function „aufgaben“ und sammelt die Antworten.
 * Einsetzen in der Konsole einer geöffneten, angemeldeten Seite des Dev-Servers (z. B. /tools/aufgaben/). Die Function läuft im Hintergrund,
 * der Fortschritt steht in window.__aufg. Der Tageszähler muss währenddessen zurückgesetzt werden (quota.mjs loop …).
 *
 *   window.__aufgStart(["luecken", "rechnen", …])     startet
 *   window.__aufg.done / .results / .log               Fortschritt und Ergebnis (results: { blatt: { status, ms, data } })
 * Danach results als out/<name>.batch.json speichern und mit score.mjs auswerten. */
/** Ergebnis kompakt als Text (für score.mjs): { blatt: { s: Status, ms, f: [[ymin, xmin, ymax, xmax, text, label], …], e: Fehlertext } } */
window.__aufgDump = () => JSON.stringify(Object.fromEntries(Object.entries(window.__aufg.results).map(([k, v]) => [k, {
  s: v.status, ms: v.ms, e: v.data && !v.data.ok ? v.data.error : undefined,
  f: ((v.data && v.data.fields) || []).map((f) => [...f.box, f.text, f.label || ""]),
}])));

/** Misst alle gesammelten Ergebnisse direkt im Browser (mit score-lib.mjs, wie score.mjs) und gibt eine Tabelle als Text zurück. */
window.__aufgScore = async () => {
  const { score, stats } = await import("/scripts/aufgaben-test/score-lib.mjs");
  const lines = [], T = { g: 0, found: 0, ok: 0, tOk: 0, tAll: 0, ex: 0, iou: 0, n: 0, runs: 0, fails: 0 };
  const bad = [];
  for (const [key, v] of Object.entries(window.__aufg.results).sort()) {
    if (!v.data || !v.data.ok) { T.fails++; lines.push(`${key.padEnd(16)} FEHLER ${v.status} ${(v.data && v.data.error || "").slice(0, 70)}`); continue; }
    const gt = await (await fetch(`/scripts/aufgaben-test/out/${key.split("#")[0]}.gt.json`, { cache: "no-store" })).json();
    const sc = score(gt, v.data.fields || []), s = stats(gt, sc);
    T.runs++; T.g += s.gaps; T.found += s.found; T.ok += s.goodBox; T.tOk += s.textOk; T.tAll += s.textTotal; T.ex += s.extras;
    for (const r of sc.rows) { if (r.found) { T.iou += r.iou; T.n++; } if (r.found && r.textOk === false) bad.push(`${key}: erwartet „${r.expect}“, KI „${r.text}“`); if (!r.found) bad.push(`${key}: Lücke „${r.expect}“ nicht gefunden`); }
    lines.push(`${key.padEnd(16)} gefunden ${s.found}/${s.gaps}  Box ok ${s.goodBox}/${s.gaps}  Ø-IoU ${s.meanIou}  Text ${s.textOk}/${s.textTotal}  Zusatz ${s.extras}`);
  }
  lines.push(`GESAMT ${T.runs} Läufe: gefunden ${T.found}/${T.g}, Box passt ${T.ok}/${T.g} (${Math.round(T.ok / T.g * 100)} %), Ø-IoU ${(T.iou / (T.n || 1)).toFixed(2)}, Text richtig ${T.tOk}/${T.tAll} (${Math.round(T.tOk / (T.tAll || 1) * 100)} %), Zusatzfelder ${T.ex}${T.fails ? `, ${T.fails} Fehler` : ""}`);
  return { table: lines, problems: bad };
};

window.__aufgStart = (names) => {
  const st = (window.__aufg = { done: false, results: {}, log: [] });
  (async () => {
    const { client } = await import("/js/auth.js");
    const { Functions, ExecutionMethod } = await import("/vendor/appwrite.js");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const seen = {};
    for (const sheet of names) {
      seen[sheet] = (seen[sheet] || 0) + 1;
      const name = seen[sheet] > 1 ? `${sheet}#${seen[sheet]}` : sheet; // dasselbe Blatt mehrfach: rechnen, rechnen#2, …
      const blob = await (await fetch(`/scripts/aufgaben-test/out/${sheet}.send.jpg`, { cache: "no-store" })).blob();
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
      for (let attempt = 0; attempt < 6; attempt++) {
        const t0 = Date.now();
        let ex;
        try {
          ex = await new Functions(client).createExecution({ functionId: "aufgaben", body: JSON.stringify({ action: "solve", image: b64 }), async: false, method: ExecutionMethod.POST });
        } catch (e) { st.log.push(`${name}: Aufruf fehlgeschlagen ${e.message}`); await sleep(4000); continue; }
        let data = null; try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
        if (data && data.code === "limit") { st.log.push(`${name}: Limit, warte auf Zähler-Reset`); await sleep(5000); continue; }
        st.results[name] = { status: ex.responseStatusCode, ms: Date.now() - t0, data };
        st.log.push(`${name}: ${ex.responseStatusCode} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        break;
      }
      await sleep(1500);
    }
    st.done = true;
  })().catch((e) => { st.log.push("Abbruch: " + e.message); st.done = true; });
  return "gestartet";
};
