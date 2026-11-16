/* Mindmap-Generator – Oberfläche.
 * Erstellen und KI-Änderungen laufen über die Appwrite-Function „mindmap“ (functions/mindmap): Sie hält den
 * Gemini-Schlüssel und zählt die Tageslimits. Speichern und Bearbeiten von Hand geschieht direkt in der Tabelle
 * „mindmaps“ (nur für den eigenen Benutzer lesbar). Baum und Layout: tree.js. */
import { onAuthChange, onBeforeLogout, client, authMessage } from "/js/auth.js";
import { toast, confirmDialog, esc } from "/js/shell.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { tablesDB, databaseId, tableIds, listAllRows, Query } from "/js/db.js";
import { config } from "/js/config.js";
import * as T from "./tree.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), app: $("app"), usage: $("usage"),
  createCard: $("createCard"), createForm: $("createForm"), topic: $("topic"), notes: $("notes"), createBtn: $("createBtn"), createError: $("createError"),
  editor: $("editor"), select: $("mapSelect"), deleteMap: $("deleteMap"),
  canvas: $("canvas"), svg: $("svg"), nodeText: $("nodeText"), editError: $("editError"), saveState: $("saveState"),
  addChild: $("addChild"), addSibling: $("addSibling"), moveUp: $("moveUp"), moveDown: $("moveDown"), removeNode: $("removeNode"),
  undo: $("undoBtn"), redo: $("redoBtn"), zoomIn: $("zoomIn"), zoomOut: $("zoomOut"), zoomFit: $("zoomFit"),
  aiCard: $("aiCard"), aiInfo: $("aiInfo"), aiText: $("aiText"), aiBtn: $("aiBtn"), aiError: $("aiError"),
};

const PALETTE = [
  { fill: "#e5f0ff", stroke: "#0066ff" }, { fill: "#e6f5ec", stroke: "#1d8a4e" }, { fill: "#fff1da", stroke: "#c77d00" },
  { fill: "#fdeaf0", stroke: "#cc2f65" }, { fill: "#ede8fb", stroke: "#6a43dc" }, { fill: "#e2f5f5", stroke: "#0a7f7f" },
];

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
function measure(text) {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
    ctx.font = '500 14px "Inter Variable", -apple-system, "Helvetica Neue", Arial, sans-serif';
  }
  return ctx.measureText(text).width;
}

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
    if (e && e.code === 404) throw new Error("Der Mindmap-Dienst ist noch nicht eingerichtet.");
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Der Mindmap-Dienst antwortet gerade nicht. Versuch es später noch einmal.");
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
    : left <= 0 ? "Du hast heute alle KI-Änderungen verbraucht. Morgen sind es wieder 10. Von Hand kannst du weiter ändern."
    : `Beschreib in eigenen Worten, was geändert werden soll. Heute sind noch ${left} von ${state.usage.maxEdits} Änderungen frei.`;

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
  els.nodeText.disabled = !has;
  if (document.activeElement !== els.nodeText) els.nodeText.value = has ? sel.node.text : "";
}

function renderMap() {
  if (!state.current) { els.svg.replaceChildren(); return; }
  const lay = T.layout(state.current.root, measure);
  const W = lay.width, H = lay.height;
  els.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  els.svg.setAttribute("width", Math.round(W * state.zoom));
  els.svg.setAttribute("height", Math.round(H * state.zoom));

  const edges = lay.edges.map(({ from, to }) => {
    const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2, mx = (x1 + x2) / 2;
    return `<path class="mm-edge" stroke="${PALETTE[to.branch % PALETTE.length].stroke}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
  }).join("");

  const nodes = lay.nodes.map((n) => {
    const c = n.branch < 0 ? null : PALETTE[n.branch % PALETTE.length];
    const fill = !c ? "#141414" : n.depth === 1 ? c.fill : "#ffffff";
    const stroke = !c ? "#141414" : c.stroke;
    const color = !c ? "#ffffff" : "#141414";
    const text = n.lines.map((l, i) =>
      `<text class="mm-text" x="${n.x + n.w / 2}" y="${n.y + 9 + 18 * (i + 0.5)}" text-anchor="middle" dominant-baseline="central" fill="${color}">${esc(l)}</text>`).join("");
    return `<g class="mm-node${n.id === state.selectedId ? " is-selected" : ""}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.text || "leerer Punkt")}">` +
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${n.depth === 0 ? 0 : 1.5}"/>${text}` +
      `<rect class="mm-sel" x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="17"/></g>`;
  }).join("");

  els.svg.innerHTML = edges + nodes;
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
  if (select) state.selectedId = result.selectId || state.selectedId;
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

function select(id, { scroll = true } = {}) {
  state.selectedId = id;
  renderMap(); renderTools();
  if (scroll) els.svg.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function setZoom(z) {
  state.zoom = Math.min(2, Math.max(0.3, z));
  renderMap();
}

function fitZoom() {
  if (!state.current) return;
  const lay = T.layout(state.current.root, measure);
  const z = Math.min(1, (els.canvas.clientWidth - 4) / lay.width, (els.canvas.clientHeight - 4) / lay.height);
  setZoom(Math.max(0.3, Math.floor(z * 20) / 20));
  els.canvas.scrollTo(0, 0);
}

/* ---------- Laden und Wechseln ---------- */

async function openMap(id) {
  await flushSave();
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: tableIds.mindmaps, rowId: id });
    const root = T.parse(row.data);
    if (!root) throw new Error("Die Mindmap ist beschädigt.");
    state.current = { id: row.$id, day: row.day, topic: row.topic, root };
    state.selectedId = root.id;
    state.past = []; state.future = [];
    showMessage(els.editError, "");
    renderAll();
    fitZoom();
  } catch (e) {
    toast(errText(e), { error: true });
  }
}

async function start(user) {
  state.user = user;
  state.current = null; state.list = []; state.usage = null; state.serviceError = "";
  const [status, rows] = await Promise.allSettled([
    callFunction({ action: "status" }),
    listAllRows(tableIds.mindmaps, [Query.equal("userId", user.$id), Query.orderDesc("$createdAt"), Query.select(["$id", "day", "topic"])]),
  ]);
  if (status.status === "fulfilled") { state.day = status.value.day; state.usage = status.value.usage; }
  else state.serviceError = status.reason.message;
  if (rows.status === "fulfilled") {
    state.list = rows.value.map((r) => ({ id: r.$id, day: r.day, topic: r.topic }));
  } else {
    toast("Deine Mindmaps konnten nicht geladen werden. " + authMessage(rows.reason), { error: true });
  }
  renderAll();
  const first = state.list.find((m) => m.day === state.day) || state.list[0];
  if (first) await openMap(first.id);
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
    state.past = []; state.future = [];
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
  const go = (n) => { if (!n) return; e.preventDefault(); select(n.id); els.svg.querySelector(`[data-id="${CSS.escape(n.id)}"]`)?.focus(); };
  const sibs = hit.parent ? hit.parent.children : [];
  switch (e.key) {
    case "ArrowLeft": go(hit.parent); break;
    case "ArrowRight": go(hit.node.children[0]); break;
    case "ArrowUp": go(sibs[hit.index - 1]); break;
    case "ArrowDown": go(sibs[hit.index + 1]); break;
    case "Enter": case "F2": e.preventDefault(); select(g.dataset.id); focusText(); break;
    case " ": e.preventDefault(); select(g.dataset.id); break;
    case "Delete": case "Backspace":
      if (hit.parent) { e.preventDefault(); applyChange(T.remove(state.current.root, g.dataset.id)); els.svg.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`)?.focus(); }
      break;
    default:
  }
});

document.addEventListener("keydown", (e) => {
  if (!state.current || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  if (e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target !== els.nodeText)) return;
  e.preventDefault();
  if (e.shiftKey) stepHistory(state.future, state.past); else stepHistory(state.past, state.future);
});

document.addEventListener("visibilitychange", () => { if (document.hidden) flushSave(); });
window.addEventListener("pagehide", () => { flushSave(); });
onBeforeLogout(flushSave);

if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ctx = null; if (state.current) renderMap(); });

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
