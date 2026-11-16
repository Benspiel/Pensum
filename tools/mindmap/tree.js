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

/* ---------- Layout: Thema in der Mitte, Äste links und rechts rundherum ---------- */

export const STYLE = { maxW: 200, minW: 56, lineH: 18, padX: 14, padY: 9, gapX: 56, gapY: 12, margin: 28, rootPadX: 20, rootPadY: 10 };
/** Etwas größer und luftiger für die eigene Handschrift. */
export const HAND_STYLE = { maxW: 230, minW: 64, lineH: 26, padX: 16, padY: 11, gapX: 60, gapY: 14 };

/** Alle Vorfahren eines Knotens (ohne ihn selbst), vom Thema abwärts. */
export function ancestors(root, id) {
  const path = [];
  const walk = (n) => {
    if (n.id === id) return true;
    for (const c of n.children) if (walk(c)) { path.unshift(n.id); return true; }
    return false;
  };
  const found = walk(root);
  if (!found) return [];
  // path wurde von unten nach oben aufgebaut: Reihenfolge Thema → Elternknoten
  return path;
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

/** Bricht Text in Zeilen von höchstens maxWidth Pixeln (zu lange Wörter werden getrennt). */
export function wrap(text, measure, maxWidth) {
  const lines = [];
  let line = "";
  const push = () => { if (line) lines.push(line); line = ""; };
  for (const word of String(text).split(" ")) {
    if (!word) continue;
    if (measure(word) > maxWidth) {
      push();
      let piece = "";
      for (const ch of word) {
        if (piece && measure(piece + ch) > maxWidth) { lines.push(piece); piece = ""; }
        piece += ch;
      }
      line = piece;
      continue;
    }
    const tryLine = line ? line + " " + word : word;
    if (line && measure(tryLine) > maxWidth) { push(); line = word; } else line = tryLine;
  }
  push();
  return lines.length ? lines : [""];
}

/**
 * Das Thema steht in der Mitte. Die ersten Äste (im Uhrzeigersinn) gehen nach rechts, der Rest nach links,
 * so verteilt, dass beide Seiten etwa gleich hoch werden. Unterpunkte wachsen immer weiter nach außen.
 * @returns {{ nodes: object[], edges: object[], width: number, height: number }}
 */
export function layout(root, measure, style = STYLE, collapsed = new Set()) {
  const S = { ...STYLE, ...style };

  // 1. Größen und Teilbaum-Höhen (noch ohne Seite)
  const size = (n, depth) => {
    const lines = wrap(n.text || " ", measure, S.maxW - 2 * S.padX);
    let w = Math.max(S.minW, Math.ceil(Math.max(...lines.map(measure))) + 2 * S.padX);
    let h = lines.length * S.lineH + 2 * S.padY;
    if (depth === 0) { w = Math.max(132, w + 2 * S.rootPadX); h += 2 * S.rootPadY; } // das Thema ist eine Ellipse
    const folded = depth > 0 && collapsed.has(n.id) && n.children.length > 0;
    const kids = folded ? [] : n.children.map((c) => size(c, depth + 1));
    const kidsH = kids.reduce((t, k) => t + k.block, 0) + S.gapY * Math.max(0, kids.length - 1);
    return {
      id: n.id, text: n.text, lines, w, h, kids, kidsH, block: Math.max(h, kidsH), depth, x: 0, y: 0, side: 0, branch: -1,
      hasKids: n.children.length > 0, folded, hidden: folded ? countNodes(n) - 1 : 0,
    };
  };
  const top = size(root, 0);

  // 2. Äste auf die Seiten verteilen
  const stackH = (list) => list.reduce((t, k) => t + k.block, 0) + S.gapY * Math.max(0, list.length - 1);
  const half = stackH(top.kids) / 2;
  const right = [];
  let acc = 0;
  for (const k of top.kids) {
    if (right.length && acc >= half) break;
    right.push(k);
    acc += k.block + S.gapY;
  }
  const left = top.kids.slice(right.length).reverse(); // im Uhrzeigersinn: links läuft von unten nach oben
  top.kids.forEach((k, i) => tag(k, i));
  function tag(item, branch) { item.branch = branch; item.kids.forEach((k) => tag(k, branch)); }
  right.forEach((k) => mark(k, 1));
  left.forEach((k) => mark(k, -1));
  function mark(item, side) { item.side = side; item.kids.forEach((k) => mark(k, side)); }

  // 3. Spaltenbreiten je Seite und Ebene
  const colW = { 1: [], "-1": [] };
  const widen = (item) => { colW[item.side][item.depth] = Math.max(colW[item.side][item.depth] || 0, item.w); item.kids.forEach(widen); };
  top.kids.forEach(widen);

  const rw = top.w;
  const off = { 1: [], "-1": [] };
  for (const side of [1, -1]) {
    let x = rw / 2 + S.gapX;
    for (let d = 1; d < colW[side].length; d++) { off[side][d] = x; x += (colW[side][d] || 0) + S.gapX; }
  }

  // 4. Plätze vergeben (Thema bei x = 0, y = 0)
  const place = (item, blockTop) => {
    item.x = item.side > 0 ? off[1][item.depth] : -off[-1][item.depth] - item.w;
    item.y = blockTop + item.block / 2 - item.h / 2;
    let y = blockTop + (item.block - item.kidsH) / 2;
    for (const k of item.kids) { place(k, y); y += k.block + S.gapY; }
  };
  for (const list of [right, left]) {
    let y = -stackH(list) / 2;
    for (const k of list) { place(k, y); y += k.block + S.gapY; }
  }
  top.x = -top.w / 2;
  top.y = -top.h / 2;

  // 5. Alle Knoten einsammeln, in den positiven Bereich schieben, Linien berechnen
  const nodes = [];
  const collect = (item) => { nodes.push(item); item.kids.forEach(collect); };
  collect(top);
  const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
  for (const n of nodes) { n.x += S.margin - minX; n.y += S.margin - minY; }

  const edges = [];
  for (const parent of nodes) {
    for (const kid of parent.kids) {
      const out = kid.side > 0;
      edges.push({
        from: parent, to: kid,
        x1: out ? parent.x + parent.w : parent.x, y1: parent.y + parent.h / 2,
        x2: out ? kid.x : kid.x + kid.w, y2: kid.y + kid.h / 2,
      });
    }
  }
  nodes.sort((a, b) => a.depth - b.depth);
  return { nodes, edges, width: maxX - minX + 2 * S.margin, height: maxY - minY + 2 * S.margin };
}
