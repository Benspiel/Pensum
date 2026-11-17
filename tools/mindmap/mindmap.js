/* Mindmap-Generator – Oberfläche.
 * Erstellen und KI-Änderungen laufen über die Appwrite-Function „mindmap“ (functions/mindmap): Sie hält den
 * Gemini-Schlüssel und zählt die Tageslimits. Speichern und Bearbeiten von Hand geschieht direkt in der Tabelle
 * „mindmaps“ (nur für den eigenen Benutzer lesbar). Baum und Layout: tree.js. */
import { onAuthChange, onBeforeLogout, client, authMessage, getPrefs, savePrefs } from "/js/auth.js";
import { toast, confirmDialog, esc } from "/js/shell.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { tablesDB, databaseId, tableIds, listAllRows, Query } from "/js/db.js";
import { config } from "/js/config.js";
import * as T from "./tree.js";
import * as H from "./hand.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), app: $("app"), usage: $("usage"),
  createCard: $("createCard"), createForm: $("createForm"), topic: $("topic"), notes: $("notes"), createBtn: $("createBtn"), createError: $("createError"),
  editor: $("editor"), select: $("mapSelect"), deleteMap: $("deleteMap"),
  canvas: $("canvas"), svg: $("svg"), nodeText: $("nodeText"), editError: $("editError"), saveState: $("saveState"),
  addChild: $("addChild"), addSibling: $("addSibling"), moveUp: $("moveUp"), moveDown: $("moveDown"), removeNode: $("removeNode"),
  undo: $("undoBtn"), redo: $("redoBtn"), zoomIn: $("zoomIn"), zoomOut: $("zoomOut"), zoomFit: $("zoomFit"),
  exportPng: $("exportPng"), exportPdf: $("exportPdf"), inkSwitch: $("inkSwitch"),
  foldNode: $("foldNode"), foldAll: $("foldAll"), unfoldAll: $("unfoldAll"), fontSwitch: $("fontSwitch"), fontHint: $("fontHint"),
  aiCard: $("aiCard"), aiInfo: $("aiInfo"), aiText: $("aiText"), aiBtn: $("aiBtn"), aiError: $("aiError"),
};

// Wie auf einer handgezeichneten Mindmap: eine Tintenfarbe für alles
const INKS = [{ id: "#0b5fc7", name: "Blau" }, { id: "#262626", name: "Schwarz" }, { id: "#0f6b4f", name: "Grün" }, { id: "#9b1c31", name: "Rot" }];
const STD_FONT = '"Inter Variable", -apple-system, "Helvetica Neue", Arial, sans-serif';
const weightOf = (depth) => (depth === 0 ? 650 : depth === 1 ? 600 : 450);

const state = {
  user: null,
  day: null,                 // heutiger Tag laut Server (deutsche Zeit)
  usage: null,               // { created, maxCreated, edits, maxEdits } oder null, wenn der Dienst nicht antwortet
  serviceError: "",
  list: [],                  // { id, day, topic } – neueste zuerst
  current: null,             // { id, day, topic, root }
  selectedId: null,
  past: [], future: [],      // Rückgängig-Schritte als JSON
  zoom: 1,
  font: "standard",          // "standard" | "hand"
  ink: INKS[0].id,           // Tintenfarbe
  hand: null,                // eigene Handschrift (aus dem Goodnotes-Tool) oder null
  collapsed: new Set(),      // eingeklappte Knoten (nur Ansicht, wird nicht gespeichert)
  busy: false,
  save: { timer: null, running: false, dirty: false, failed: false },
};

/* ---------- Hilfen ---------- */

const isToday = () => !!state.current && state.current.day === state.day;
const aiLeft = () => (state.usage ? state.usage.maxEdits - state.usage.edits : 0);
const errText = (e) => (e && e.code ? authMessage(e) : (e && e.message) || "Das hat nicht geklappt. Probier es noch einmal.");
const showMessage = (el, text) => { el.textContent = text || ""; el.hidden = !text; };
const dayLabel = (day) => {
  const [y, m, d] = String(day).split("-");
  return y ? `${d}.${m}.${y}` : String(day);
};

let ctx = null;
function measureStd(text, size, depth) {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${weightOf(depth)} ${size}px ${STD_FONT}`;
  return ctx.measureText(text).width;
}
const measureHand = (text, size) => H.width(state.hand, text, size);
const useHand = () => state.font === "hand" && !!state.hand;
const currentMeasure = () => (useHand() ? measureHand : measureStd);
const currentStyle = () => (useHand() ? T.HAND_STYLE : T.STYLE);
const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** Aufruf der Function. Wirft Error mit einer Meldung, die man anzeigen darf. */
async function callFunction(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.mindmap,
      body: JSON.stringify(payload),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der Mindmap-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.mindmap}“, Appwrite meldet: ${e.message || e.type}).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) {
    const base = (data && data.error) || "Der Mindmap-Dienst antwortet gerade nicht. Versuch es später noch einmal.";
    throw new Error(data && data.detail ? `${base} (Technisch: ${data.detail})` : `${base} (Technisch: Status ${ex.responseStatusCode}${ex.errors ? ", " + String(ex.errors).slice(0, 200) : ""})`);
  }
  return data;
}

/* ---------- Anzeige ---------- */

function renderUsage() {
  if (!state.usage) {
    els.usage.innerHTML = state.serviceError ? `<span class="badge badge-soft">${esc(state.serviceError)}</span>` : "";
    return;
  }
  const u = state.usage;
  els.usage.innerHTML =
    `<span class="badge badge-soft">Mindmap heute: ${u.created} von ${u.maxCreated}</span>` +
    `<span class="badge badge-soft">KI-Änderungen heute: ${u.edits} von ${u.maxEdits}</span>`;
}

function renderPicker() {
  els.select.innerHTML = state.list
    .map((m) => `<option value="${esc(m.id)}"${state.current && state.current.id === m.id ? " selected" : ""}>${m.day === state.day ? "Heute" : dayLabel(m.day)} · ${esc(m.topic || "Mindmap")}</option>`)
    .join("");
  els.deleteMap.hidden = !state.current || isToday();
}

function renderPanels() {
  const hasMap = !!state.current;
  els.editor.hidden = !hasMap;
  const canCreate = !!state.usage && state.usage.created < state.usage.maxCreated;
  els.createCard.hidden = !canCreate;
  els.aiCard.hidden = !hasMap;

  const today = isToday();
  const left = aiLeft();
  els.aiText.disabled = els.aiBtn.disabled = !today || left <= 0 || state.busy;
  els.aiBtn.textContent = state.busy ? "KI arbeitet …" : today ? `Mit KI ändern (${Math.max(left, 0)} übrig)` : "Mit KI ändern";
  els.aiInfo.textContent = !hasMap ? ""
    : !today ? "KI-Änderungen gibt es nur für die Mindmap von heute. Diese hier kannst du von Hand bearbeiten."
    : left <= 0 ? "Du hast heute alle KI-Änderungen verbraucht. Morgen sind es wieder 3. Von Hand kannst du weiter ändern."
    : `Beschreib in eigenen Worten, was geändert werden soll. Heute sind noch ${left} von ${state.usage.maxEdits} Änderungen frei.`;

  els.exportPng.disabled = els.exportPdf.disabled = !hasMap;
  els.createBtn.disabled = state.busy;
  els.createBtn.textContent = state.busy ? "KI arbeitet …" : "Mindmap erstellen";
  els.topic.disabled = els.notes.disabled = state.busy;
}

function renderSaveState() {
  const s = state.save;
  els.saveState.textContent = s.failed ? "Speichern fehlgeschlagen. Wird erneut versucht." : s.dirty || s.running ? "Speichert …" : state.current ? "Gespeichert" : "";
}

function renderTools() {
  const sel = state.current && T.find(state.current.root, state.selectedId);
  const has = !!sel;
  els.addChild.disabled = !has;
  els.addSibling.disabled = !has || !sel.parent;
  els.removeNode.disabled = !has || !sel.parent;
  els.moveUp.disabled = !has || !sel.parent || sel.index === 0;
  els.moveDown.disabled = !has || !sel.parent || sel.index === sel.parent.children.length - 1;
  els.undo.disabled = !state.past.length;
  els.redo.disabled = !state.future.length;
  const folded = has && state.collapsed.has(state.selectedId);
  els.foldNode.disabled = !has || !sel.node.children.length || !sel.parent;
  els.foldNode.textContent = folded ? "Ast ausklappen" : "Ast einklappen";
  els.foldAll.disabled = !state.current || !T.branchIds(state.current.root).length;
  els.unfoldAll.disabled = !state.collapsed.size;
  els.nodeText.disabled = !has;
  if (document.activeElement !== els.nodeText) els.nodeText.value = has ? sel.node.text : "";
}

/* ---------- Zeichnen: Elemente bleiben erhalten und gleiten an ihren neuen Platz ---------- */

const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (name, attrs = {}, parent = null) => {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
};
const scene = { nodes: new Map(), edges: new Map(), pos: new Map(), size: new Map(), links: [], lay: null, raf: 0, edgeLayer: null, nodeLayer: null };

function sceneReset() {
  cancelAnimationFrame(scene.raf);
  scene.nodes.clear(); scene.edges.clear(); scene.pos.clear(); scene.size.clear(); scene.links = []; scene.lay = null;
  els.svg.replaceChildren();
  scene.edgeLayer = svgEl("g", {}, els.svg);
  scene.nodeLayer = svgEl("g", {}, els.svg);
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
const edgeWidth = (depth) => (depth <= 1 ? 3.2 : depth === 2 ? 2.2 : 1.6);
/** Vertikaler Textanfang und Grundlinie der Handschrift in einer Beschriftung. */
const textTop = (n) => (n.h - n.lines.length * n.lineH) / 2;
const handBaseline = (n, i) => textTop(n) + n.lineH * i + n.fontSize * 0.88;
const handStroke = (n) => Math.max(1.3, H.strokeWidth(n.fontSize) * (n.depth <= 1 ? 1.2 : 1.05));

function createNodeView(n) {
  const g = svgEl("g", { class: "mm-node", tabindex: "0", role: "button", "data-id": n.id }, scene.nodeLayer);
  const v = { g, id: n.id, root: n.depth === 0, textKey: "" };
  v.shape = svgEl(v.root ? "ellipse" : "rect", { class: "mm-shape" + (v.root ? " is-root" : "") }, g);
  v.textG = svgEl("g", {}, g);
  v.sel = svgEl(v.root ? "ellipse" : "rect", { class: "mm-sel" }, g);
  return v;
}

function updateNodeView(v, n, hand) {
  const ink = state.ink;
  const { w, h } = n;
  if (v.root) {
    for (const [e, pad] of [[v.shape, 0], [v.sel, 6]]) { e.setAttribute("cx", w / 2); e.setAttribute("cy", h / 2); e.setAttribute("rx", w / 2 + pad); e.setAttribute("ry", h / 2 + pad); }
    v.shape.setAttribute("stroke", ink); v.shape.setAttribute("stroke-width", 2.5);
  } else {
    v.shape.setAttribute("width", w); v.shape.setAttribute("height", h); v.shape.setAttribute("rx", 12);
    v.sel.setAttribute("x", -3); v.sel.setAttribute("y", -3); v.sel.setAttribute("width", w + 6); v.sel.setAttribute("height", h + 6); v.sel.setAttribute("rx", 14);
  }
  v.shape.setAttribute("fill", ink);

  // Text nur neu bauen, wenn er sich geändert hat
  const key = [hand ? "h" : "s", n.lines.join("\n"), ink, w, h, n.fontSize].join("|");
  if (key !== v.textKey) {
    v.textKey = key;
    v.textG.replaceChildren();
    n.lines.forEach((line, i) => {
      if (hand) {
        const lw = H.width(state.hand, line, n.fontSize);
        svgEl("path", { class: "mm-ink", d: H.pathData(state.hand, line, n.fontSize, (w - lw) / 2, handBaseline(n, i)), stroke: ink, "stroke-width": handStroke(n) }, v.textG);
      } else {
        const t = svgEl("text", { class: "mm-text", x: w / 2, y: textTop(n) + n.lineH * (i + 0.5), "text-anchor": "middle", "dominant-baseline": "central", fill: ink, "font-size": n.fontSize, "font-weight": weightOf(n.depth) }, v.textG);
        t.textContent = line;
      }
    });
  }

  v.g.classList.toggle("is-selected", n.id === state.selectedId);
  v.g.classList.toggle("is-folded", n.folded);
  v.g.setAttribute("aria-label", (n.text || "leerer Punkt") + (n.hasKids ? (n.folded ? ", eingeklappt" : ", ausgeklappt") : ""));
}

function edgePath(link, pos, size) {
  const a = pos.get(link.from), b = pos.get(link.to), sa = size.get(link.from), sb = size.get(link.to);
  if (!a || !b || !sa || !sb) return "";
  const l = T.edgeLine({ x: a.x, y: a.y, w: sa.w, h: sa.h, depth: sa.depth }, { x: b.x, y: b.y, w: sb.w, h: sb.h, depth: sb.depth });
  return l ? `M${l.x1.toFixed(1)} ${l.y1.toFixed(1)}L${l.x2.toFixed(1)} ${l.y2.toFixed(1)}` : "";
}

function paintFrame(fresh, alpha) {
  for (const [id, p] of scene.pos) {
    const v = scene.nodes.get(id);
    if (!v) continue;
    v.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    if (fresh.has(id)) v.g.style.opacity = String(alpha);
  }
  for (const link of scene.links) {
    const e = scene.edges.get(link.to);
    if (e) { e.setAttribute("d", edgePath(link, scene.pos, scene.size)); if (fresh.has(link.to)) e.style.opacity = String(alpha); }
  }
}

/** Mindmap zeichnen. Bestehende Beschriftungen gleiten an den neuen Platz, neue wachsen aus ihrem Elternknoten heraus. */
function renderMap({ animate = true } = {}) {
  if (!state.current) { sceneReset(); return; }
  if (!scene.nodeLayer || !scene.nodeLayer.isConnected) sceneReset();
  const hand = useHand();
  const lay = T.layout(state.current.root, currentMeasure(), currentStyle(), state.collapsed);
  scene.lay = lay;
  els.svg.setAttribute("viewBox", `0 0 ${lay.width} ${lay.height}`);
  els.svg.style.width = Math.round(lay.width * state.zoom) + "px";
  els.svg.style.height = Math.round(lay.height * state.zoom) + "px";
  els.svg.style.setProperty("--mm-ink", state.ink);
  els.canvas.classList.toggle("is-paper", state.ink === "#262626");

  const parentOf = new Map(lay.edges.map((e) => [e.to.id, e.from.id]));
  const fresh = new Set();
  const target = new Map();
  for (const n of lay.nodes) {
    target.set(n.id, n);
    let v = scene.nodes.get(n.id);
    if (v && v.root !== (n.depth === 0)) { v.g.remove(); scene.nodes.delete(n.id); scene.pos.delete(n.id); v = null; }
    if (!v) {
      v = createNodeView(n);
      scene.nodes.set(n.id, v);
      const pp = scene.pos.get(parentOf.get(n.id)), ps = scene.size.get(parentOf.get(n.id));
      scene.pos.set(n.id, pp && ps ? { x: pp.x + ps.w / 2 - n.w / 2, y: pp.y + ps.h / 2 - n.h / 2 } : { x: n.x, y: n.y });
      fresh.add(n.id);
    }
    updateNodeView(v, n, hand);
    scene.size.set(n.id, { w: n.w, h: n.h, depth: n.depth });
  }
  for (const [id, v] of [...scene.nodes]) {
    if (target.has(id)) continue;
    v.g.remove(); scene.nodes.delete(id); scene.pos.delete(id); scene.size.delete(id);
  }

  scene.links = lay.edges.map((e) => ({ from: e.from.id, to: e.to.id }));
  const wantEdges = new Set(scene.links.map((l) => l.to));
  for (const [id, e] of [...scene.edges]) if (!wantEdges.has(id)) { e.remove(); scene.edges.delete(id); }
  for (const e of lay.edges) {
    let path = scene.edges.get(e.to.id);
    if (!path) { path = svgEl("path", { class: "mm-edge" }, scene.edgeLayer); scene.edges.set(e.to.id, path); fresh.add(e.to.id); }
    path.setAttribute("stroke", state.ink);
    path.setAttribute("stroke-width", edgeWidth(e.to.depth));
  }

  // Bewegung
  cancelAnimationFrame(scene.raf);
  const start = new Map([...scene.pos].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  const moves = [...target].some(([id, n]) => { const s0 = start.get(id); return !s0 || Math.abs(s0.x - n.x) > 0.5 || Math.abs(s0.y - n.y) > 0.5; });
  const settle = () => {
    for (const [id, n] of target) scene.pos.set(id, { x: n.x, y: n.y });
    paintFrame(fresh, 1);
    for (const id of fresh) { const v = scene.nodes.get(id); if (v) v.g.style.opacity = ""; const e = scene.edges.get(id); if (e) e.style.opacity = ""; }
  };
  if (!animate || reduceMotion() || (!moves && !fresh.size)) { settle(); return; }
  const t0 = performance.now(), dur = 380;
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / dur), k = ease(t);
    for (const [id, n] of target) {
      const s0 = start.get(id) || n;
      scene.pos.set(id, { x: s0.x + (n.x - s0.x) * k, y: s0.y + (n.y - s0.y) * k });
    }
    paintFrame(fresh, k);
    if (t < 1) scene.raf = requestAnimationFrame(tick); else settle();
  };
  scene.raf = requestAnimationFrame(tick);
}

/** Nur die Auswahl hervorheben, ohne neu zu zeichnen. */
function markSelection() {
  for (const [id, v] of scene.nodes) v.g.classList.toggle("is-selected", id === state.selectedId);
}

function renderAll() {
  renderUsage(); renderPicker(); renderPanels(); renderMap(); renderTools(); renderSaveState();
}

/* ---------- Speichern ---------- */

function saveSoon() {
  const s = state.save;
  s.dirty = true;
  clearTimeout(s.timer);
  s.timer = setTimeout(flushSave, 700);
  renderSaveState();
}

async function flushSave() {
  const s = state.save;
  clearTimeout(s.timer);
  if (s.running || !s.dirty || !state.current) return;
  const { id, root } = state.current;
  s.running = true; s.dirty = false;
  renderSaveState();
  try {
    await tablesDB.updateRow({ databaseId, tableId: tableIds.mindmaps, rowId: id, data: { data: JSON.stringify(root), topic: root.text.trim().slice(0, 120) || "Mindmap" } });
    s.failed = false;
    const item = state.list.find((m) => m.id === id);
    if (item) item.topic = root.text.trim().slice(0, 120) || "Mindmap";
  } catch (e) {
    console.warn("Mindmap nicht gespeichert", e);
    s.failed = true; s.dirty = true;
    s.timer = setTimeout(flushSave, 5000);
  } finally {
    s.running = false;
    renderSaveState();
    if (s.dirty && !s.failed) flushSave();
  }
}

/* ---------- Bearbeiten (mit Rückgängig) ---------- */

let lastCoalesce = { key: null, at: 0 };

/** Wendet das Ergebnis einer Baum-Änderung an. coalesce: gleiche Schlüssel kurz nacheinander ergeben nur einen Rückgängig-Schritt. */
function applyChange(result, { coalesce = null, select = true } = {}) {
  if (!result || result.error === undefined && !result.root) return false;
  if (result.error !== undefined) { showMessage(els.editError, result.error); return false; }
  showMessage(els.editError, "");
  const now = Date.now();
  const merge = coalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 1500;
  if (!merge) { state.past.push(JSON.stringify(state.current.root)); if (state.past.length > 60) state.past.shift(); }
  lastCoalesce = { key: coalesce, at: now };
  state.future = [];
  state.current.root = result.root;
  state.current.topic = result.root.text;
  if (select) { state.selectedId = result.selectId || state.selectedId; reveal(state.selectedId); }
  saveSoon();
  renderMap(); renderTools(); renderPicker();
  return true;
}

function stepHistory(from, to) {
  if (!from.length || !state.current) return;
  to.push(JSON.stringify(state.current.root));
  state.current.root = T.parse(from.pop()) || state.current.root;
  if (!T.find(state.current.root, state.selectedId)) state.selectedId = state.current.root.id;
  lastCoalesce = { key: null, at: 0 };
  showMessage(els.editError, "");
  saveSoon();
  renderMap(); renderTools(); renderPicker();
}

const selected = () => state.current && state.selectedId;
const viewOf = (id) => scene.nodes.get(id);

/** Klappt alle Vorfahren eines Knotens auf, damit er sichtbar ist. */
function reveal(id) {
  for (const a of T.ancestors(state.current.root, id)) state.collapsed.delete(a);
}

function select(id, { scroll = true } = {}) {
  state.selectedId = id;
  if (state.collapsed.size) reveal(id);
  renderMap(); markSelection(); renderTools();
  if (scroll) viewOf(id)?.g.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
}

function setZoom(z, { keep = true } = {}) {
  const old = state.zoom;
  state.zoom = Math.min(2.5, Math.max(0.25, z));
  // Zoom um die Mitte des sichtbaren Bereichs, damit man nicht den Faden verliert
  if (keep && old !== state.zoom) {
    const c = els.canvas, f = state.zoom / old;
    const cx = (c.scrollLeft + c.clientWidth / 2) * f - c.clientWidth / 2, cy = (c.scrollTop + c.clientHeight / 2) * f - c.clientHeight / 2;
    renderMap({ animate: false });
    requestAnimationFrame(() => { c.scrollLeft = Math.max(0, cx); c.scrollTop = Math.max(0, cy); });
  } else renderMap({ animate: false });
}

function fitZoom() {
  if (!state.current) return;
  renderMap({ animate: false });
  const lay = scene.lay;
  // Passt in die Breite; in der Höhe wird nicht unter 55 % verkleinert (lieber senkrecht scrollen als unleserlich klein)
  const fitW = (els.canvas.clientWidth - 4) / lay.width, fitH = (els.canvas.clientHeight - 4) / lay.height;
  const z = Math.min(1, fitW, Math.max(fitH, 0.55));
  setZoom(Math.max(0.25, Math.floor(z * 20) / 20), { keep: false });
  els.canvas.scrollTo(0, 0);
}

/* ---------- Laden und Wechseln ---------- */

async function openMap(id, prefetched) {
  await flushSave();
  try {
    const row = prefetched || await tablesDB.getRow({ databaseId, tableId: tableIds.mindmaps, rowId: id });
    const root = T.parse(row.data);
    if (!root) throw new Error("Die Mindmap ist beschädigt.");
    state.current = { id: row.$id, day: row.day, topic: row.topic, root };
    state.selectedId = root.id;
    state.collapsed = T.autoCollapse(root);
    state.past = []; state.future = [];
    showMessage(els.editError, "");
    sceneReset();
    renderAll();
    fitZoom();
  } catch (e) {
    toast(errText(e), { error: true });
  }
}

async function start(user) {
  state.user = user;
  state.current = null; state.list = []; state.usage = null; state.serviceError = "";
  state.font = getPrefs().mmFont === "hand" ? "hand" : "standard";
  state.ink = INKS.some((i) => i.id === getPrefs().mmInk) ? getPrefs().mmInk : INKS[0].id;
  renderInk();
  state.hand = null;
  renderFont();
  H.loadHand(user.$id).then((hand) => {
    if (state.user !== user) return;
    state.hand = hand;
    if (!hand && state.font === "hand") state.font = "standard";
    renderFont();
    if (state.current) { sceneReset(); renderMap({ animate: false }); markSelection(); }
  }).catch((e) => console.warn("Handschrift nicht geladen", e));
  // Alles gleichzeitig starten: Liste, neueste Mindmap (mit Inhalt) und Tagesstatus. Der Status (Appwrite-Function,
  // kann kalt starten) darf das Anzeigen der Mindmap nicht aufhalten – er ergänzt Zähler und „Heute“ erst, wenn er da ist.
  const mine = [Query.equal("userId", user.$id), Query.orderDesc("$createdAt")];
  const statusP = callFunction({ action: "status" });
  const newestP = tablesDB.listRows({ databaseId, tableId: tableIds.mindmaps, queries: [...mine, Query.limit(1)] });
  const rowsP = listAllRows(tableIds.mindmaps, [...mine, Query.select(["$id", "day", "topic"])]);
  [statusP, newestP, rowsP].forEach((p) => p.catch(() => {})); // Fehler werden unten ausgewertet

  statusP.then((st) => {
    if (state.user !== user) return;
    state.day = st.day; state.usage = st.usage;
    renderUsage(); renderPicker(); renderPanels();
  }, (e) => {
    if (state.user !== user) return;
    state.serviceError = e.message;
    renderUsage(); renderPanels();
  });

  const [rows, newest] = await Promise.allSettled([rowsP, newestP]);
  if (state.user !== user) return;
  if (rows.status === "fulfilled") {
    state.list = rows.value.map((r) => ({ id: r.$id, day: r.day, topic: r.topic }));
  } else {
    toast("Deine Mindmaps konnten nicht geladen werden. " + authMessage(rows.reason), { error: true });
  }
  renderAll();
  // Pro Tag gibt es eine Mindmap, die neueste ist also die von heute (falls vorhanden)
  const first = state.list[0];
  if (first) await openMap(first.id, newest.status === "fulfilled" && newest.value.rows[0] && newest.value.rows[0].$id === first.id ? newest.value.rows[0] : undefined);
}

/* ---------- Aktionen ---------- */

async function runAi(fn, errorEl) {
  if (state.busy) return;
  state.busy = true;
  showMessage(errorEl, "");
  renderPanels();
  try {
    await fn();
  } catch (e) {
    showMessage(errorEl, e.message);
    try { // Zähler neu lesen, falls das Limit erreicht wurde
      const s = await callFunction({ action: "status" });
      state.usage = s.usage;
    } catch (_) { /* egal */ }
  } finally {
    state.busy = false;
    renderUsage(); renderPanels();
  }
}

els.createForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const topic = els.topic.value.trim();
  if (!topic) { showMessage(els.createError, "Gib ein Thema ein."); els.topic.focus(); return; }
  runAi(async () => {
    const r = await callFunction({ action: "create", topic, notes: els.notes.value.trim() });
    state.usage = r.usage; state.day = r.day;
    state.list.unshift({ id: r.id, day: r.day, topic: r.topic });
    els.topic.value = ""; els.notes.value = "";
    await flushSave();
    state.current = { id: r.id, day: r.day, topic: r.topic, root: T.sanitize(r.map) };
    state.selectedId = state.current.root.id;
    state.collapsed = T.autoCollapse(state.current.root);
    state.past = []; state.future = [];
    sceneReset();
    renderAll();
    fitZoom();
    toast("Mindmap erstellt.");
  }, els.createError);
});

els.aiBtn.addEventListener("click", () => {
  const instruction = els.aiText.value.trim();
  if (!instruction) { showMessage(els.aiError, "Schreib, was die KI ändern soll."); els.aiText.focus(); return; }
  if (!isToday() || aiLeft() <= 0) return;
  const id = state.current.id;
  runAi(async () => {
    await flushSave();
    const r = await callFunction({ action: "refine", instruction, map: state.current.root });
    state.usage = r.usage;
    if (!state.current || state.current.id !== id) return; // in der Zwischenzeit gewechselt
    const root = T.sanitize(r.map);
    root.text = state.current.root.text || root.text; // das Thema bleibt, wie du es genannt hast
    applyChange({ root, selectId: root.id });
    els.aiText.value = "";
    toast("Die KI hat die Mindmap geändert.");
  }, els.aiError);
});

els.select.addEventListener("change", () => openMap(els.select.value));

els.deleteMap.addEventListener("click", async () => {
  if (!state.current || isToday()) return;
  const ok = await confirmDialog({ title: "Mindmap löschen?", text: `„${state.current.topic}“ wird endgültig gelöscht.`, confirm: "Löschen" });
  if (!ok) return;
  const id = state.current.id;
  try {
    await tablesDB.deleteRow({ databaseId, tableId: tableIds.mindmaps, rowId: id });
  } catch (e) {
    if (!e || e.code !== 404) { toast(authMessage(e), { error: true }); return; }
  }
  state.save.dirty = false; clearTimeout(state.save.timer);
  state.list = state.list.filter((m) => m.id !== id);
  state.current = null;
  const next = state.list.find((m) => m.day === state.day) || state.list[0];
  if (next) await openMap(next.id); else renderAll();
});

els.addChild.addEventListener("click", () => { if (selected()) applyChange(T.addChild(state.current.root, state.selectedId)); focusText(); });
els.addSibling.addEventListener("click", () => { if (selected()) applyChange(T.addSibling(state.current.root, state.selectedId)); focusText(); });
els.removeNode.addEventListener("click", () => { if (selected()) applyChange(T.remove(state.current.root, state.selectedId)); });
els.moveUp.addEventListener("click", () => { if (selected()) applyChange(T.move(state.current.root, state.selectedId, -1)); });
els.moveDown.addEventListener("click", () => { if (selected()) applyChange(T.move(state.current.root, state.selectedId, 1)); });
els.undo.addEventListener("click", () => stepHistory(state.past, state.future));
els.redo.addEventListener("click", () => stepHistory(state.future, state.past));
els.zoomIn.addEventListener("click", () => setZoom(state.zoom + 0.15));
els.zoomOut.addEventListener("click", () => setZoom(state.zoom - 0.15));
els.zoomFit.addEventListener("click", fitZoom);
els.foldNode.addEventListener("click", () => { if (selected()) toggleFold(state.selectedId); });
els.foldAll.addEventListener("click", () => {
  if (!state.current) return;
  state.collapsed = new Set(T.branchIds(state.current.root));
  state.selectedId = state.current.root.id;
  renderMap(); renderTools();
});
els.unfoldAll.addEventListener("click", () => { state.collapsed.clear(); renderMap(); renderTools(); });

function focusText() { els.nodeText.focus(); els.nodeText.select(); }

els.nodeText.addEventListener("input", () => {
  if (!selected()) return;
  const r = T.rename(state.current.root, state.selectedId, els.nodeText.value);
  if (r.error) { showMessage(els.editError, r.error); return; }
  applyChange(r, { coalesce: "text:" + state.selectedId, select: false });
});
els.nodeText.addEventListener("blur", () => {
  if (!selected()) return;
  const hit = T.find(state.current.root, state.selectedId);
  if (hit && !hit.node.text.trim()) applyChange(T.rename(state.current.root, state.selectedId, "Punkt"), { select: false });
  renderTools();
});
els.nodeText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); els.nodeText.blur(); els.svg.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`)?.focus(); }
});

function toggleFold(id) {
  if (!state.current) return;
  const hit = T.find(state.current.root, id);
  if (!hit || !hit.parent || !hit.node.children.length) return;
  if (state.collapsed.has(id)) state.collapsed.delete(id);
  else {
    state.collapsed.add(id);
    // liegt die Auswahl im eingeklappten Ast, wandert sie auf den Ast selbst
    if (state.selectedId !== id && T.find(hit.node, state.selectedId)) state.selectedId = id;
  }
  renderMap(); renderTools();
}

els.svg.addEventListener("click", (e) => {
  const g = e.target.closest(".mm-node");
  if (g) select(g.dataset.id, { scroll: false });
});
els.svg.addEventListener("dblclick", (e) => { if (e.target.closest(".mm-node")) focusText(); });
els.svg.addEventListener("keydown", (e) => {
  const g = e.target.closest(".mm-node");
  if (!g || !state.current) return;
  const hit = T.find(state.current.root, g.dataset.id);
  if (!hit) return;
  const go = (n) => { if (!n) return false; e.preventDefault(); select(n.id); viewOf(n.id)?.g.focus(); return true; };
  const sibs = hit.parent ? hit.parent.children : [];
  const sideOf = (id) => (scene.lay && scene.lay.nodes.find((n) => n.id === id) || { side: 1 }).side;
  const outward = (n) => {          // Richtung nach außen: Äste auf der linken Seite wachsen nach links
    const side = hit.parent ? sideOf(n.id) : 0;
    return side;
  };
  const sd = outward(hit.node);
  const first = (side) => hit.node.children.find((c) => sideOf(c.id) === side) || hit.node.children[0];
  const goOut = () => {
    if (hit.parent && state.collapsed.has(hit.node.id)) { toggleFold(hit.node.id); return true; }
    return go(hit.parent ? hit.node.children[0] : first(e.key === "ArrowLeft" ? -1 : 1));
  };
  switch (e.key) {
    case "ArrowLeft": if (!hit.parent ? goOut() : sd < 0 ? goOut() : go(hit.parent)) break; break;
    case "ArrowRight": if (!hit.parent ? goOut() : sd < 0 ? go(hit.parent) : goOut()) break; break;
    case "ArrowUp": go(sibs[hit.index - 1]); break;
    case "ArrowDown": go(sibs[hit.index + 1]); break;
    case "Enter": case "F2": e.preventDefault(); select(g.dataset.id); focusText(); break;
    case " ": e.preventDefault(); select(g.dataset.id); break;
    case "Delete": case "Backspace":
      if (hit.parent) { e.preventDefault(); applyChange(T.remove(state.current.root, g.dataset.id)); viewOf(state.selectedId)?.g.focus(); }
      break;
    default:
  }
});

/* Fläche verschieben (Maus) und mit Strg/⌘ + Mausrad zoomen; auf Touchgeräten scrollt und zoomt der Browser selbst */
let pan = null;
els.svg.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(".mm-node")) return;
  pan = { x: e.clientX, y: e.clientY, left: els.canvas.scrollLeft, top: els.canvas.scrollTop };
  els.canvas.classList.add("is-panning");
  els.svg.setPointerCapture(e.pointerId);
});
els.svg.addEventListener("pointermove", (e) => {
  if (!pan) return;
  els.canvas.scrollLeft = pan.left - (e.clientX - pan.x);
  els.canvas.scrollTop = pan.top - (e.clientY - pan.y);
});
const endPan = () => { pan = null; els.canvas.classList.remove("is-panning"); };
els.svg.addEventListener("pointerup", endPan);
els.svg.addEventListener("pointercancel", endPan);
els.canvas.addEventListener("wheel", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (!state.current || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  if (e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target !== els.nodeText)) return;
  e.preventDefault();
  if (e.shiftKey) stepHistory(state.future, state.past); else stepHistory(state.past, state.future);
});

document.addEventListener("visibilitychange", () => { if (document.hidden) flushSave(); });
window.addEventListener("pagehide", () => { flushSave(); });
onBeforeLogout(flushSave);

if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ctx = null; if (state.current && !useHand()) { sceneReset(); renderMap({ animate: false }); markSelection(); } });

/* ---------- Schrift: Standard oder eigene Handschrift ---------- */

function renderFont() {
  const handBtn = els.fontSwitch.querySelector('[data-font="hand"]');
  handBtn.disabled = !state.hand;
  els.fontSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.font === state.font)));
  els.fontHint.innerHTML = state.hand ? "" : 'Noch keine Handschrift hinterlegt. <a href="/tools/goodnotes/">Im Goodnotes-Tool anlegen</a>, dann kannst du sie hier nutzen.';
}

els.fontSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("[data-font]");
  if (!b || b.disabled || b.dataset.font === state.font) return;
  state.font = b.dataset.font;
  savePrefs({ mmFont: state.font });
  renderFont();
  sceneReset();           // Text neu setzen, die andere Schrift braucht andere Größen
  fitZoom();
  markSelection();
});

/* ---------- Farbe ---------- */

function renderInk() {
  els.inkSwitch.querySelectorAll("[data-ink]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ink === state.ink)));
}
els.inkSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ink]");
  if (!b || b.dataset.ink === state.ink) return;
  state.ink = b.dataset.ink;
  savePrefs({ mmInk: state.ink });
  renderInk();
  renderMap({ animate: false });
});

/* ---------- Exportieren: PNG und PDF, gezeichnet wie auf dem Bildschirm (aktuelle Schrift, Farbe und eingeklappte Äste) ---------- */

/** Zeichnet die Mindmap auf eine Leinwand (scale = Pixel je Einheit). */
function drawToCanvas(scale = 2) {
  const hand = useHand();
  const lay = T.layout(state.current.root, currentMeasure(), currentStyle(), state.collapsed);
  const limit = Math.min(scale, 8000 / Math.max(lay.width, lay.height)); // Leinwände haben Größengrenzen
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(lay.width * limit);
  canvas.height = Math.ceil(lay.height * limit);
  const c = canvas.getContext("2d");
  c.scale(limit, limit);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, lay.width, lay.height);
  const ink = state.ink;

  c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = ink;
  for (const e of lay.edges) {
    const l = T.edgeLine(e.from, e.to);
    if (!l) continue;
    c.lineWidth = edgeWidth(e.to.depth);
    c.beginPath(); c.moveTo(l.x1, l.y1); c.lineTo(l.x2, l.y2); c.stroke();
  }
  for (const n of lay.nodes) {
    if (n.depth === 0) {
      c.beginPath(); c.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2);
      c.globalAlpha = 0.1; c.fillStyle = ink; c.fill(); c.globalAlpha = 1;
      c.lineWidth = 2.5; c.strokeStyle = ink; c.stroke();
    }
    n.lines.forEach((line, i) => {
      if (hand) {
        const lw = H.width(state.hand, line, n.fontSize);
        c.lineWidth = handStroke(n); c.strokeStyle = ink;
        c.stroke(new Path2D(H.pathData(state.hand, line, n.fontSize, n.x + (n.w - lw) / 2, n.y + handBaseline(n, i))));
      } else {
        c.font = `${weightOf(n.depth)} ${n.fontSize}px ${STD_FONT}`;
        c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = ink;
        c.fillText(line, n.x + n.w / 2, n.y + textTop(n) + n.lineH * (i + 0.5));
      }
    });
  }
  return { canvas, width: lay.width, height: lay.height };
}

const fileBase = () => (((state.current && state.current.root.text) || "Mindmap").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "Mindmap");
const stamp = () => (state.current && state.current.day) || new Date().toISOString().slice(0, 10);

function saveBlob(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement("script"), { src: "/vendor/jspdf.umd.min.js" });
    el.onload = () => (window.jspdf ? resolve(window.jspdf) : reject(new Error("PDF-Bibliothek fehlt.")));
    el.onerror = () => reject(new Error("Die PDF-Bibliothek konnte nicht geladen werden."));
    document.head.append(el);
  });
}

els.exportPng.addEventListener("click", () => {
  if (!state.current) return;
  try {
    drawToCanvas(2).canvas.toBlob((blob) => {
      if (!blob) { toast("Das Bild konnte nicht erstellt werden.", { error: true }); return; }
      saveBlob(blob, `${fileBase()} ${stamp()}.png`);
      toast("Bild gespeichert.");
    }, "image/png");
  } catch (e) { console.error(e); toast("Das Bild konnte nicht erstellt werden.", { error: true }); }
});

els.exportPdf.addEventListener("click", async () => {
  if (!state.current) return;
  els.exportPdf.disabled = true;
  try {
    const { jsPDF } = await loadJsPdf();
    const { canvas, width, height } = drawToCanvas(2);
    const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28;
    const k = Math.min((pw - 2 * m) / width, (ph - 2 * m) / height);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pw - width * k) / 2, (ph - height * k) / 2, width * k, height * k); // weißer Grund: JPEG hält das PDF klein
    pdf.save(`${fileBase()} ${stamp()}.pdf`);
    toast("PDF gespeichert.");
  } catch (e) {
    console.error(e);
    toast(e && e.message ? e.message : "Das PDF konnte nicht erstellt werden.", { error: true });
  } finally {
    els.exportPdf.disabled = false;
  }
});

/* ---------- Start ---------- */

let started = null;
onAuthChange(({ status, user }) => {
  if (status !== "ready") return;
  els.gate.hidden = !!user;
  els.app.hidden = !user;
  if (!user) { started = null; state.current = null; state.user = null; return; }
  if (started === user.$id) return;
  started = user.$id;
  start(user);
});
