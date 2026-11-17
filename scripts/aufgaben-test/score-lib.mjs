/* Auswertung: Wie genau sitzen die Felder der KI in den bekannten Lücken? (Wahrheit aus gen_sheets.py)
 * Boxen sind [ymin, xmin, ymax, xmax] in Promille. */

const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
export function inter(a, b) { const h = Math.min(a[2], b[2]) - Math.max(a[0], b[0]); const w = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return h > 0 && w > 0 ? h * w : 0; }
export const iou = (a, b) => { const i = inter(a, b); return i / (area(a) + area(b) - i || 1); };
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
export const norm = (s) => String(s).toLowerCase().replace(/[\s.,:;€]/g, "").replace(/·/g, "*").replace(/−/g, "-").replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");

/** gt: { gaps: [{ id, box, expect, kind }] }, fields: [{ id, box, text }] → { rows, extras } */
export function score(gt, fields) {
  // Jede Lücke bekommt das Feld mit der größten Überschneidung (jedes Feld höchstens einmal), beste Paare zuerst
  const pairs = [];
  for (const g of gt.gaps) for (const f of fields) { const o = inter(g.box, f.box); if (o > 0) pairs.push({ g, f, iou: iou(g.box, f.box) }); }
  pairs.sort((a, b) => b.iou - a.iou);
  const usedG = new Set(), usedF = new Set(), match = new Map();
  for (const p of pairs) { if (usedG.has(p.g.id) || usedF.has(p.f.id)) continue; usedG.add(p.g.id); usedF.add(p.f.id); match.set(p.g.id, p); }
  const rows = gt.gaps.map((g) => {
    const p = match.get(g.id);
    if (!p) return { id: g.id, kind: g.kind, expect: g.expect, found: false };
    const [cy, cx] = center(g.box), [py, px] = center(p.f.box);
    const inside = inter(g.box, p.f.box) / (area(p.f.box) || 1);   // Anteil des KI-Felds, der in der Lücke liegt
    const covers = inter(g.box, p.f.box) / (area(g.box) || 1);     // Anteil der Lücke, den das KI-Feld abdeckt
    const textOk = g.kind === "area" ? null : norm(p.f.text) === norm(g.expect) || (g.kind === "checkbox" && /^x$/i.test(p.f.text.trim()));
    return { id: g.id, kind: g.kind, expect: g.expect, found: true, fieldId: p.f.id, text: p.f.text, textOk, iou: +p.iou.toFixed(2), inside: +inside.toFixed(2), covers: +covers.toFixed(2), dy: +(py - cy).toFixed(1), dx: +(px - cx).toFixed(1), heightRatio: +((p.f.box[2] - p.f.box[0]) / (g.box[2] - g.box[0])).toFixed(2) };
  });
  const extras = fields.filter((f) => !usedF.has(f.id)).map((f) => ({ id: f.id, text: f.text, box: f.box }));
  return { rows, extras };
}

/** Kennzahlen eines Durchlaufs. */
export function stats(gt, sc) {
  const found = sc.rows.filter((r) => r.found);
  const texts = sc.rows.filter((r) => r.textOk !== null && r.textOk !== undefined);
  return {
    // Eine mehrzeilige Antwortfläche ("area") darf auch nur eine Zeile davon nutzen: Dann zählt, dass das Feld ganz in der Fläche liegt
    gaps: gt.gaps.length, found: found.length, goodBox: found.filter((r) => r.iou >= 0.4 || (r.kind === "area" && r.inside >= 0.8)).length,
    meanIou: +(found.reduce((s, x) => s + x.iou, 0) / (found.length || 1)).toFixed(2),
    textOk: texts.filter((x) => x.textOk).length, textTotal: texts.length, extras: sc.extras.length,
  };
}
