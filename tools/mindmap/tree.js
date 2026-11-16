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

/* ---------- Layout: Thema links, Äste nach rechts ---------- */

export const STYLE = { maxW: 200, minW: 56, lineH: 18, padX: 14, padY: 9, gapX: 56, gapY: 12, margin: 20 };

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

/** @returns {{ nodes: object[], edges: {from: object, to: object}[], width: number, height: number }} */
export function layout(root, measure, style = STYLE) {
  const S = { ...STYLE, ...style };
  const nodes = [];
  const colW = [];

  const build = (n, depth, branch) => {
    const lines = wrap(n.text || " ", measure, S.maxW - 2 * S.padX);
    const w = Math.max(S.minW, Math.ceil(Math.max(...lines.map(measure))) + 2 * S.padX);
    const h = lines.length * S.lineH + 2 * S.padY;
    colW[depth] = Math.max(colW[depth] || 0, w);
    const item = { id: n.id, text: n.text, lines, w, h, depth, branch, x: 0, y: 0, kids: [] };
    item.kids = n.children.map((c, i) => build(c, depth + 1, depth === 0 ? i : branch));
    const kidsH = item.kids.reduce((s, k) => s + k.block, 0) + S.gapY * Math.max(0, item.kids.length - 1);
    item.block = Math.max(h, kidsH);
    item.kidsH = kidsH;
    nodes.push(item);
    return item;
  };
  const top = build(root, 0, -1);

  const xs = [];
  colW.reduce((x, w, d) => { xs[d] = x; return x + w + S.gapX; }, S.margin);

  const place = (item, blockTop) => {
    item.x = xs[item.depth];
    item.y = blockTop + item.block / 2 - item.h / 2;
    let y = blockTop + (item.block - item.kidsH) / 2;
    for (const k of item.kids) { place(k, y); y += k.block + S.gapY; }
  };
  place(top, S.margin);

  const edges = [];
  for (const item of nodes) for (const k of item.kids) edges.push({ from: item, to: k });
  nodes.sort((a, b) => a.depth - b.depth);
  const width = xs[colW.length - 1] + colW[colW.length - 1] + S.margin;
  return { nodes, edges, width, height: top.block + 2 * S.margin };
}
