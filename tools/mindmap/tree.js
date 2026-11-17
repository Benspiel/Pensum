/* Mindmap – Baum und Layout (ohne Oberfläche, damit es sich testen lässt).
 * Knoten: { id, text, children: [] }. Die Grenzen entsprechen denen der Function (functions/mindmap/lib.js). */
export const MAP = { nodes: 80, depth: 5, children: 10, text: 80 };

let counter = 0;
export const newId = () => "m" + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

const cleanText = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, MAP.text);

/** Gespeicherte oder empfangene Daten in einen gültigen Baum verwandeln (oder null). */
export function sanitize(raw) {
  const seen = new Set();
  let count = 0;
  const walk = (n, depth) => {
    if (!n || typeof n !== "object" || Array.isArray(n) || count >= MAP.nodes) return null;
    const text = cleanText(n.text);
    if (!text) return null;
    count++;
    let id = typeof n.id === "string" && n.id && n.id.length <= 40 && !seen.has(n.id) ? n.id : newId();
    seen.add(id);
    const node = { id, text, children: [] };
    if (depth < MAP.depth && Array.isArray(n.children)) {
      for (const c of n.children.slice(0, MAP.children)) {
        const k = walk(c, depth + 1);
        if (k) node.children.push(k);
      }
    }
    return node;
  };
  return walk(raw, 0);
}

export const parse = (json) => { try { return sanitize(JSON.parse(json)); } catch (_) { return null; } };
export const clone = (root) => structuredClone(root);
export const countNodes = (n) => 1 + n.children.reduce((s, c) => s + countNodes(c), 0);

/** { node, parent, index, depth } oder null. */
export function find(root, id, parent = null, index = 0, depth = 0) {
  if (root.id === id) return { node: root, parent, index, depth };
  for (let i = 0; i < root.children.length; i++) {
    const r = find(root.children[i], id, root, i, depth + 1);
    if (r) return r;
  }
  return null;
}

/* Alle Änderungen arbeiten auf einer Kopie und liefern { root, selectId } oder { error }. */

export function addChild(root, id, text = "Neuer Punkt") {
  const next = clone(root);
  const hit = find(next, id);
  if (!hit) return { error: "Knoten nicht gefunden." };
  if (countNodes(next) >= MAP.nodes) return { error: `Mehr als ${MAP.nodes} Knoten sind nicht möglich.` };
  if (hit.depth >= MAP.depth) return { error: `Tiefer als ${MAP.depth} Ebenen geht es nicht.` };
  if (hit.node.children.length >= MAP.children) return { error: `Ein Knoten kann höchstens ${MAP.children} Unterpunkte haben.` };
  const node = { id: newId(), text, children: [] };
  hit.node.children.push(node);
  return { root: next, selectId: node.id };
}

export function addSibling(root, id, text = "Neuer Punkt") {
  const next = clone(root);
  const hit = find(next, id);
  if (!hit) return { error: "Knoten nicht gefunden." };
  if (!hit.parent) return { error: "Neben dem Thema in der Mitte gibt es keinen weiteren Knoten. Füge einen Unterpunkt hinzu." };
  if (countNodes(next) >= MAP.nodes) return { error: `Mehr als ${MAP.nodes} Knoten sind nicht möglich.` };
  if (hit.parent.children.length >= MAP.children) return { error: `Ein Knoten kann höchstens ${MAP.children} Unterpunkte haben.` };
  const node = { id: newId(), text, children: [] };
  hit.parent.children.splice(hit.index + 1, 0, node);
  return { root: next, selectId: node.id };
}

export function rename(root, id, text) {
  const next = clone(root);
  const hit = find(next, id);
  if (!hit) return { error: "Knoten nicht gefunden." };
  const clean = cleanText(text);
  if (!clean && !hit.parent) return { error: "Das Thema darf nicht leer sein." };
  hit.node.text = String(text == null ? "" : text).slice(0, MAP.text); // beim Tippen Leerzeichen am Ende erlauben
  return { root: next, selectId: id };
}

export function remove(root, id) {
  const next = clone(root);
  const hit = find(next, id);
  if (!hit) return { error: "Knoten nicht gefunden." };
  if (!hit.parent) return { error: "Das Thema in der Mitte kann man nicht löschen." };
  hit.parent.children.splice(hit.index, 1);
  const near = hit.parent.children[hit.index] || hit.parent.children[hit.index - 1] || hit.parent;
  return { root: next, selectId: near.id };
}

/** dir = -1 (nach oben) oder 1 (nach unten) unter den Geschwistern. */
export function move(root, id, dir) {
  const next = clone(root);
  const hit = find(next, id);
  if (!hit || !hit.parent) return { error: "Das Thema in der Mitte lässt sich nicht verschieben." };
  const to = hit.index + dir;
  if (to < 0 || to >= hit.parent.children.length) return { error: null };
  const list = hit.parent.children;
  [list[hit.index], list[to]] = [list[to], list[hit.index]];
  return { root: next, selectId: id };
}

/* ---------- Darstellung: Maße und Hilfen ---------- */

/* Maße der Darstellung. sizes/maxW gelten je Ebene (Thema, Hauptast, tiefere Ebenen). */
export const STYLE = {
  sizes: [24, 17, 14.5], lh: 1.3, padX: 9, padY: 5, minW: 24, maxW: [280, 190, 160],
  rootPadX: 36, rootPadY: 18, margin: 40, gap: 32, pad: 14, fan: 2.8, fanBase: 0.4, fanPer: 0.35, spanK: 1, clearRounds: 10, clearStep: 8,
};
/** Eigene Handschrift: größer und luftiger, weil Handschrift bei gleicher Größe kleiner wirkt. */
export const HAND_STYLE = {
  ...STYLE, sizes: [46, 29, 22], lh: 1.25, padX: 10, padY: 6, maxW: [340, 230, 190], rootPadX: 44, rootPadY: 22, gap: 36, pad: 16,
};

/** Alle Vorfahren eines Knotens (ohne ihn selbst), vom Thema abwärts. */
export function ancestors(root, id) {
  const path = [];
  const walk = (n) => {
    if (n.id === id) return true;
    for (const c of n.children) if (walk(c)) { path.unshift(n.id); return true; }
    return false;
  };
  return walk(root) ? path : [];
}

/** Bei großen Mindmaps starten die Äste ab der dritten Ebene eingeklappt, damit man den Überblick behält. */
export function autoCollapse(root, limit = 45) {
  const set = new Set();
  if (countNodes(root) <= limit) return set;
  const walk = (n, depth) => {
    if (depth === 2 && n.children.length) set.add(n.id);
    else n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return set;
}

/** Alle Knoten mit Unterpunkten ab Ebene 1 (für „Alles einklappen“). */
export function branchIds(root, fromDepth = 1) {
  const out = [];
  const walk = (n, depth) => { if (depth >= fromDepth && n.children.length) out.push(n.id); n.children.forEach((c) => walk(c, depth + 1)); };
  walk(root, 0);
  return out;
}

/* ---------- Layout wie auf einer handgezeichneten Mindmap ---------- */

/** Bricht Text in Zeilen von höchstens maxWidth Pixeln (an Leerzeichen und nach Bindestrichen; zu lange Wörter werden getrennt). */
export function wrap(text, measure, maxWidth) {
  const lines = [];
  let line = "";
  const push = () => { if (line) lines.push(line); line = ""; };
  for (const word of String(text).split(" ")) {
    if (!word) continue;
    // „Rock-'n'-Roll-Einflüsse“ darf nach jedem Bindestrich umbrechen
    const parts = word.match(/[^-–]+[-–]*|[-–]+/g) || [word];
    parts.forEach((part, pi) => {
      const joiner = pi === 0 && line ? " " : "";
      if (measure(part) > maxWidth) {
        push();
        let piece = "";
        for (const ch of part) {
          if (piece && measure(piece + ch) > maxWidth) { lines.push(piece); piece = ""; }
          piece += ch;
        }
        line = piece;
        return;
      }
      const tryLine = line + joiner + part;
      if (line && measure(tryLine) > maxWidth) { push(); line = part; } else line = tryLine;
    });
  }
  push();
  return lines.length ? lines : [""];
}

/**
 * Das Thema ist eine Ellipse in der Mitte. Die Hauptäste verteilen sich im Uhrzeigersinn rundherum, ihre Unterpunkte
 * fächern sich nach außen um sie herum auf. Beschriftungen haben keinen Rahmen, verbunden wird mit geraden Linien.
 * Danach schiebt ein Entzerr-Schritt überlappende Beschriftungen auseinander.
 * measure(text, fontSize, depth) liefert die Textbreite in Pixeln.
 * @returns {{ nodes: object[], edges: {from: object, to: object}[], width: number, height: number }}
 */
export function layout(root, measure, style = STYLE, collapsed = new Set()) {
  const S = { ...STYLE, ...style };
  const at = (list, d) => list[Math.min(d, list.length - 1)];

  // 1. Größe jeder Beschriftung und Zahl der Blätter (bestimmt den Winkelanteil)
  const size = (n, depth) => {
    const fontSize = at(S.sizes, depth), lineH = Math.round(fontSize * S.lh);
    const m = (t) => measure(t, fontSize, depth);
    const lines = wrap(n.text || " ", m, at(S.maxW, depth) - 2 * S.padX);
    let w = Math.max(S.minW, Math.ceil(Math.max(...lines.map(m))) + 2 * S.padX);
    let h = lines.length * lineH + 2 * S.padY;
    if (depth === 0) { w += 2 * S.rootPadX; h += 2 * S.rootPadY; }
    const folded = depth > 0 && collapsed.has(n.id) && n.children.length > 0;
    const kids = folded ? [] : n.children.map((c) => size(c, depth + 1));
    return {
      id: n.id, text: n.text, lines, w, h, fontSize, lineH, depth, kids,
      leaves: kids.length ? kids.reduce((t, k) => t + k.leaves, 0) : 1,
      hasKids: n.children.length > 0, folded, hidden: folded ? countNodes(n) - 1 : 0,
      x: 0, y: 0, cx: 0, cy: 0, side: 1, branch: -1, angle: 0, span: 0,
    };
  };
  const top = size(root, 0);

  // 2. Platzieren: Kinder verteilen sich in einem Fächer um die Richtung ihres Elternknotens
  const reach = (it, u) => Math.abs(u[0]) * it.w / 2 + Math.abs(u[1]) * it.h / 2; // halbe Ausdehnung in Richtung u
  const place = (parent, kids, centre, width) => {
    if (!kids.length) return;
    const total = kids.reduce((t, k) => t + k.leaves, 0);
    let a = centre - width / 2;
    kids.forEach((k) => { const part = width * k.leaves / total; k.angle = a + part / 2; k.span = part; a += part; });
    // Mindestabstand vom Elternknoten, damit nebeneinanderliegende Geschwister im Fächer gar nicht erst überlappen
    // (sonst müsste der Entzerr-Schritt sie später seitlich verschieben, und die Linien gerieten durcheinander)
    let ring = 0;
    for (let i = 1; i < kids.length; i++) {
      const p = kids[i - 1], q = kids[i], mid = (p.angle + q.angle) / 2, t = [-Math.sin(mid), Math.cos(mid)];
      const need = reach(p, t) + reach(q, t) + S.pad;
      const half = Math.sin(Math.min(Math.PI / 2, (q.angle - p.angle) / 2));
      if (half > 0.01) ring = Math.max(ring, need / (2 * half));
    }
    kids.forEach((k, i) => {
      const u = [Math.cos(k.angle), Math.sin(k.angle)];
      const start = parent.depth === 0
        ? 1 / Math.sqrt((u[0] / (parent.w / 2)) ** 2 + (u[1] / (parent.h / 2)) ** 2) // Rand der Ellipse
        : reach(parent, u);
      const dist = Math.max(start + reach(k, u) + S.gap, ring);
      k.cx = parent.cx + u[0] * dist; k.cy = parent.cy + u[1] * dist;
      k.branch = parent.depth === 0 ? i : parent.branch;
      // Unterpunkte fächern sich um ihren Ast auf, auch breiter als dessen Winkelanteil (Nachbarn weichen im Entzerr-Schritt aus)
      place(k, k.kids, k.angle, Math.min(S.fan, Math.max(k.span * S.spanK, S.fanBase + S.fanPer * k.kids.length)));
    });
  };
  if (top.kids.length === 1) place(top, top.kids, 0, 0.0001);
  else place(top, top.kids, Math.PI / 2, 2 * Math.PI); // erster Ast oben, dann im Uhrzeigersinn

  // 3. Entzerren: Überlappende Beschriftungen wandern entlang ihrer Richtung nach außen (samt ihren Unterpunkten).
  //    So bleiben die Linien kurz und strahlenförmig, statt sich zu kreuzen.
  const all = [];
  const parentOf = new Map();
  const collect = (it, parent) => { all.push(it); parentOf.set(it, parent); it.kids.forEach((k) => collect(k, it)); };
  collect(top, null);
  const shift = (it, dx, dy) => { it.cx += dx; it.cy += dy; it.kids.forEach((k) => shift(k, dx, dy)); };
  const STEP = 5, MAX_OUT = 110; // höchstens so weit darf ein Knoten nach außen wandern
  let pushed = new Map(all.map((n) => [n, 0]));
  const overlaps = (a, b) => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + S.pad && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + S.pad;
  const relax = () => {
    pushed = new Map(all.map((n) => [n, 0]));
    for (let iter = 0; iter < 400; iter++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (!overlaps(a, b)) continue;
        // wer weicht? der tiefere; bei gleicher Tiefe beide
        const movers = a.depth === b.depth ? [a, b] : [a.depth > b.depth ? a : b];
        for (const m of movers) {
          if (m.depth === 0 || pushed.get(m) >= MAX_OUT) continue;
          const par = parentOf.get(m);
          let ux = m.cx - par.cx, uy = m.cy - par.cy;
          const len = Math.hypot(ux, uy) || 1;
          shift(m, (ux / len) * STEP, (uy / len) * STEP);
          pushed.set(m, pushed.get(m) + STEP);
          moved = true;
        }
      }
      if (!moved) break;
    }
    // Was dann noch überlappt, wird seitlich auseinandergeschoben (das Thema bleibt stehen, äußere Knoten geben eher nach)
    const weight = (it) => (it.depth === 0 ? 0 : 1 / it.depth);
    for (let iter = 0; iter < 200; iter++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (!overlaps(a, b)) continue;
        const ox = (a.w + b.w) / 2 + S.pad - Math.abs(a.cx - b.cx), oy = (a.h + b.h) / 2 + S.pad - Math.abs(a.cy - b.cy);
        const wa = weight(a), wb = weight(b);
        if (wa + wb === 0) continue;
        const fa = wa / (wa + wb), fb = wb / (wa + wb);
        if (ox < oy) { const dir = a.cx <= b.cx ? -1 : 1; a.cx += dir * ox * fa; b.cx -= dir * ox * fb; }
        else { const dir = a.cy <= b.cy ? -1 : 1; a.cy += dir * oy * fa; b.cy -= dir * oy * fb; }
        moved = true;
      }
      if (!moved) break;
    }
  };

  // Keine Linie soll durch eine fremde Beschriftung laufen: solche Beschriftungen werden seitlich von der Linie weggeschoben
  const hitsRect = (l, n, pad) => {
    const x0 = n.cx - n.w / 2 - pad, x1 = n.cx + n.w / 2 + pad, y0 = n.cy - n.h / 2 - pad, y1 = n.cy + n.h / 2 + pad;
    let t0 = 0, t1 = 1;
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    for (const [p, q] of [[-dx, l.x1 - x0], [dx, x1 - l.x1], [-dy, l.y1 - y0], [dy, y1 - l.y1]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 <= t1;
  };
  const box = (n) => ({ x: n.cx - n.w / 2, y: n.cy - n.h / 2, w: n.w, h: n.h, depth: n.depth });
  const clearLines = () => {
    let moved = false;
    for (const p of all) for (const k of p.kids) {
      const l = edgeLine(box(p), box(k));
      if (!l) continue;
      for (const n of all) {
        if (n === p || n === k || n.depth === 0 || !hitsRect(l, n, 4)) continue;
        // Normale der Linie, zum Knoten hin
        const lx = l.x2 - l.x1, ly = l.y2 - l.y1, len = Math.hypot(lx, ly) || 1;
        let nx = -ly / len, ny = lx / len;
        if ((n.cx - l.x1) * nx + (n.cy - l.y1) * ny < 0) { nx = -nx; ny = -ny; }
        shift(n, nx * S.clearStep, ny * S.clearStep);
        moved = true;
      }
    }
    // Zwei Linien dürfen sich nicht kreuzen: der Unterpunkt der einen wandert (samt seinen Unterpunkten) von der anderen Linie weg
    const side = (l, x, y) => (l.x2 - l.x1) * (y - l.y1) - (l.y2 - l.y1) * (x - l.x1);
    const lines = [];
    for (const p of all) for (const k of p.kids) { const l = edgeLine(box(p), box(k)); if (l) lines.push({ p, k, l }); }
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i], B = lines[j];
      if (A.p === B.p) continue;
      if (side(A.l, B.l.x1, B.l.y1) * side(A.l, B.l.x2, B.l.y2) >= 0 || side(B.l, A.l.x1, A.l.y1) * side(B.l, A.l.x2, A.l.y2) >= 0) continue;
      const lx = A.l.x2 - A.l.x1, ly = A.l.y2 - A.l.y1, len = Math.hypot(lx, ly) || 1;
      let nx = -ly / len, ny = lx / len;
      if ((B.p.cx - A.l.x1) * nx + (B.p.cy - A.l.y1) * ny < 0) { nx = -nx; ny = -ny; } // zur Seite des eigenen Elternknotens
      shift(B.k, nx * S.clearStep * 2, ny * S.clearStep * 2);
      moved = true;
    }
    return moved;
  };
  relax();
  for (let round = 0; round < S.clearRounds; round++) { if (!clearLines()) break; relax(); }

  // 4. In den positiven Bereich schieben
  const minX = Math.min(...all.map((n) => n.cx - n.w / 2)), maxX = Math.max(...all.map((n) => n.cx + n.w / 2));
  const minY = Math.min(...all.map((n) => n.cy - n.h / 2)), maxY = Math.max(...all.map((n) => n.cy + n.h / 2));
  for (const n of all) {
    n.x = n.cx - n.w / 2 + S.margin - minX;
    n.y = n.cy - n.h / 2 + S.margin - minY;
    n.side = n.depth === 0 ? 0 : (n.cx >= top.cx ? 1 : -1);
  }
  const edges = [];
  for (const p of all) for (const k of p.kids) edges.push({ from: p, to: k });
  all.sort((a, b) => a.depth - b.depth);
  return { nodes: all, edges, width: maxX - minX + 2 * S.margin, height: maxY - minY + 2 * S.margin };
}

/**
 * Gerade Verbindungslinie zwischen zwei Beschriftungen (Kästen { x, y, w, h, depth }), jeweils mit etwas Abstand zum
 * Rand; das Thema (depth 0) ist eine Ellipse. Liegen beide zu dicht, gibt es keine Linie (leer).
 */
export function edgeLine(a, b, gap = 7) {
  const ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
  if (!dx && !dy) return null;
  const reachTo = (box, ux, uy) => {          // Anteil der Mittelpunktsstrecke, bis der Rand (plus Abstand) erreicht ist
    const hw = box.w / 2 + gap, hh = box.h / 2 + gap;
    if (box.depth === 0) return 1 / Math.sqrt((ux / hw) ** 2 + (uy / hh) ** 2);
    return Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity);
  };
  const ta = reachTo(a, dx, dy), tb = reachTo(b, -dx, -dy);
  if (ta + tb >= 1) return null;
  return { x1: ca[0] + dx * ta, y1: ca[1] + dy * ta, x2: cb[0] - dx * tb, y2: cb[1] - dy * tb };
}
