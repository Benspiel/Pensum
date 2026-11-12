/* Goodnotes-Tool – Oberfläche.
 * Die gesamte Umwandlung (Layout, Skelettierung, .goodnotes-/PDF-Export) steckt in ink-engine.js
 * und läuft im Browser. Dieses Modul verdrahtet nur Eingaben, Vorschau und Download.
 *
 * Konto: Der Login kommt aus /js/auth.js (gemeinsam für alle Tools). Gespeichert wird höchstens
 * die selbst gezeichnete Handschrift – als Gast im localStorage, angemeldet im Konto. Der Text nie. */
import { onAuthChange } from "/js/auth.js";
import { toast, confirmDialog, esc } from "/js/shell.js";
import { tablesDB, databaseId, tableIds, ownerPermissions } from "/js/db.js";
import { createInkEngine } from "./ink-engine.js";

const engine = createInkEngine();
const { state, PAPERS, HAND_ID, HAND_W, HAND_CHARS } = engine;

const TEMPLATE_KEY = "pensum.goodnotes.template.v1";
const VARY_KEY = "pensum.goodnotes.handVary.v1";
const GUEST_HAND_KEY = "pensum.goodnotes.hand.guest.v1";
const HAND_DECLINED_KEY = "pensum.goodnotes.handImportDeclined.v1";

const $ = (id) => document.getElementById(id);
const els = {
  note: $("gnNote"),
  text: $("textInput"),
  preview: $("preview"),
  pageCount: $("pageCount"),
  size: $("sizeInput"),
  sizeVal: $("sizeVal"),
  jitter: $("jitterInput"),
  jitterVal: $("jitterVal"),
  width: $("widthInput"),
  widthVal: $("widthVal"),
  drop: $("dropzone"),
  tplInput: $("templateInput"),
  tplTitle: $("templateTitle"),
  tplInfo: $("templateInfo"),
  tplBadge: $("templateBadge"),
  tplActions: $("templateActions"),
  tplDetails: $("customTemplate"),
  forget: $("forgetTemplate"),
  status: $("statusText"),
  fileName: $("fileName"),
  exportGn: $("exportGn"),
  exportPdf: $("exportPdf"),
  fontGrid: $("fontGrid"),
  handTile: $("handTile"),
  handTileInfo: $("handTileInfo"),
  handActions: $("handActions"),
  handEdit: $("handEdit"),
  handVaryBox: $("handVaryBox"),
  handVary: $("handVary"),
  handVaryControls: $("handVaryControls"),
  handVaryInput: $("handVaryInput"),
  handVaryVal: $("handVaryVal"),
  handDialog: $("handDialog"),
  handClose: $("handClose"),
  handChar: $("handChar"),
  handProgress: $("handProgress"),
  handPad: $("handPad"),
  handPrev: $("handPrev"),
  handNext: $("handNext"),
  handUndo: $("handUndo"),
  handClear: $("handClear"),
  handStrip: $("handStrip"),
  handSave: $("handSave"),
  handSaveInfo: $("handSaveInfo"),
  handDelete: $("handDelete"),
};

let user = null;

/* ---------- Vorschau ---------- */

let renderTimer;
function scheduleRender(delay = 180) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(async () => {
    try {
      await document.fonts.load(`400 40px "${state.font === HAND_ID ? "Caveat" : state.font}"`);
      await document.fonts.load(engine.fontSpec(40, true));
    } catch (_) { /* Schrift nicht ladbar: Browser nimmt eine Ersatzschrift */ }
    const r = engine.render(els.text.value);
    state.pages = r.canvases;
    state.inkPages = r.inkPages;
    els.preview.replaceChildren(...state.pages);
    const n = state.pages.length;
    els.pageCount.textContent = `${n} Seite${n === 1 ? "" : "n"}`;
  }, delay);
}

/* ---------- Eigene Vorlage ---------- */

async function loadCustomTemplate(bytes, name, persist) {
  state.custom = await engine.inspectTemplate(bytes, name);
  if (persist) {
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify({ name, data: btoa(engine.latin1.decode(new Uint8Array(bytes))) }));
    } catch (_) { /* Speicher voll oder gesperrt – die Vorlage gilt dann nur für diese Sitzung */ }
  }
  updateTemplateUi();
  scheduleRender(0);
}

function updateTemplateUi(error) {
  const t = state.custom;
  els.drop.classList.toggle("loaded", !!t);
  els.drop.classList.toggle("error", !!error);
  els.tplActions.hidden = !t;
  let stored = false;
  try { stored = !!localStorage.getItem(TEMPLATE_KEY); } catch (_) {}
  els.tplBadge.hidden = !(t && stored);
  if (t || error) els.tplDetails.open = true;
  if (error) {
    els.tplTitle.textContent = "Vorlage nicht nutzbar";
    els.tplInfo.textContent = error;
  } else if (t) {
    const [w, h] = t.pageSize;
    els.tplTitle.textContent = t.name;
    els.tplInfo.textContent = `Seite ${Math.round(w)} × ${Math.round(h)} pt` +
      (t.hasInk ? " · enthält bereits Stiftstriche, sie bleiben erhalten." : " · leer, wird statt der eingebauten Vorlage verwendet.");
  } else {
    els.tplTitle.textContent = "Eigene Vorlage auswählen";
    els.tplInfo.textContent = "Nur nötig, wenn du ein anderes Format brauchst. Wähle eine einseitige .goodnotes-Datei oder zieh sie hierher.";
  }
  updateStatus();
}

function updateStatus() {
  const tpl = state.custom ? `Eigene Vorlage: ${state.custom.name}` : `Vorlage: ${PAPERS[state.paper].label}`;
  els.status.textContent = `${tpl} · ${state.mode === "ink" ? "echte Tinte" : "PDF-Seite"}`;
}

async function handleFile(file) {
  if (!file) return;
  try {
    await loadCustomTemplate(await file.arrayBuffer(), file.name, true);
    toast("Eigene Vorlage geladen.");
  } catch (e) {
    state.custom = null;
    updateTemplateUi(e.message || "Datei konnte nicht gelesen werden.");
  }
}

/* ---------- Export (Ablauf wie in Inkly; gebaut wird in der Engine) ---------- */

async function exportGoodnotes() {
  const pages = state.pages;
  if (!pages.length) return;
  const base = engine.safeName(els.fileName.value);
  const ink = state.mode === "ink";

  // Eine Vorlage beschreibt genau eine Seite: im Tinten-Modus immer eine Datei pro Seite.
  let groups = [[0, pages.length]];
  if (pages.length > 1) {
    const split = ink
      ? await confirmDialog({
          title: `${pages.length} Dateien erzeugen?`,
          text: `Dein Text hat ${pages.length} Seiten. Es werden ${pages.length} einzelne .goodnotes-Dateien erzeugt (eine pro Seite).`,
          confirm: `${pages.length} Dateien exportieren`,
        })
      : await confirmDialog({
          title: "Mehrere Seiten.",
          text: `Dein Text hat ${pages.length} Seiten, die Goodnotes-Vorlage beschreibt aber nur eine Seite. Empfohlen sind ${pages.length} einzelne .goodnotes-Dateien. Alternativ: eine Datei mit allen Seiten in der PDF-Anlage (Goodnotes zeigt eventuell nur Seite 1).`,
          confirm: `${pages.length} einzelne Dateien`,
          cancel: "Eine Datei mit allen Seiten",
        });
    if (ink && !split) return;
    if (split) groups = pages.map((_, i) => [i, i + 1]);
  }

  const label = els.exportGn.innerHTML;
  els.exportGn.disabled = true;
  els.exportGn.textContent = "Erzeuge …";
  try {
    const t = await engine.activeTemplate();
    for (let i = 0; i < groups.length; i++) {
      const [a, b] = groups[i];
      const blob = await engine.buildGoodnotes(t, pages.slice(a, b), ink ? state.inkPages[a] : null);
      const suffix = groups.length > 1 ? ` (${i + 1})` : "";
      engine.download(blob, `${base}${suffix}.goodnotes`);
      if (groups.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
    toast(groups.length > 1 ? `${groups.length} Dateien exportiert.` : "Export fertig. Jetzt in Goodnotes öffnen.");
  } catch (e) {
    console.error(e);
    toast("Export fehlgeschlagen: " + (e.message || e), { error: true });
  } finally {
    els.exportGn.disabled = false;
    els.exportGn.innerHTML = label;
  }
}

function exportPdf() {
  if (!state.pages.length) return;
  try {
    engine.download(new Blob([engine.buildPdf(state.pages)], { type: "application/pdf" }), `${engine.safeName(els.fileName.value)}.pdf`);
    toast("PDF exportiert.");
  } catch (e) {
    console.error(e);
    toast("PDF-Export fehlgeschlagen: " + (e.message || e), { error: true });
  }
}

/* ---------- Auswahl: Ausgabe, Schrift, Papier, Tinte ---------- */

function setPressed(group, value) {
  group.querySelectorAll("[data-value]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
}

function updateHandVaryUi() {
  els.handVaryBox.hidden = !engine.isHand();
  els.handVaryControls.hidden = !els.handVary.checked;
}
function applyHandVary() {
  const v = parseFloat(els.handVaryInput.value);
  state.handVary = els.handVary.checked ? v : 0;
  els.handVaryVal.textContent = v < 0.7 ? "leicht" : v <= 1.4 ? "mittel" : "stark";
  updateHandVaryUi();
  try { localStorage.setItem(VARY_KEY, JSON.stringify({ on: els.handVary.checked, v: els.handVaryInput.value })); } catch (_) {}
}

function selectFont(value) {
  setPressed(els.fontGrid, value);
  state.font = value;
  updateHandVaryUi();
  scheduleRender(0);
}

function applyMode() {
  document.querySelectorAll("[data-mode-only]").forEach((el) => { el.hidden = el.dataset.modeOnly !== state.mode; });
  updateStatus();
}

document.querySelectorAll("[data-group]").forEach((group) => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-value]");
    if (!btn) return;
    // Eigene Handschrift: erst zeichnen, dann auswählen
    if (btn.dataset.value === HAND_ID && !state.hand) { openHandFlow(); return; }
    setPressed(group, btn.dataset.value);
    state[group.dataset.group] = btn.dataset.value;
    if (group.dataset.group === "mode") applyMode();
    if (group.dataset.group === "font") updateHandVaryUi();
    updateStatus();
    scheduleRender(0);
  });
});

els.text.addEventListener("input", () => scheduleRender());
els.size.addEventListener("input", () => {
  state.size = parseFloat(els.size.value);
  els.sizeVal.textContent = state.size.toFixed(2).replace(/0$/, "") + "×";
  scheduleRender(60);
});
els.jitter.addEventListener("input", () => {
  state.jitter = parseFloat(els.jitter.value);
  els.jitterVal.textContent = state.jitter < 0.4 ? "gering" : state.jitter < 1.4 ? "mittel" : "stark";
  scheduleRender(60);
});
els.width.addEventListener("input", () => {
  state.weight = parseFloat(els.width.value);
  els.widthVal.textContent = state.weight < 0.85 ? "dünner" : state.weight <= 1.15 ? "wie die Schrift" : "kräftiger";
  scheduleRender(60);
});

els.tplInput.addEventListener("change", () => handleFile(els.tplInput.files[0]));
["dragenter", "dragover"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove("drag"); }));
els.drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
els.forget.addEventListener("click", () => {
  try { localStorage.removeItem(TEMPLATE_KEY); } catch (_) {}
  state.custom = null;
  els.tplInput.value = "";
  updateTemplateUi();
  scheduleRender(0);
});

els.handVary.addEventListener("change", () => { applyHandVary(); scheduleRender(0); });
els.handVaryInput.addEventListener("input", () => { applyHandVary(); scheduleRender(60); });
els.exportGn.addEventListener("click", exportGoodnotes);
els.exportPdf.addEventListener("click", exportPdf);

/* ---------- Eigene Handschrift: speichern und laden ----------
   Gast: localStorage. Angemeldet: Tabelle „handwriting“, eine Zeile je Benutzer (Zeilen-ID = Benutzer-ID),
   lesbar und änderbar nur für diesen Benutzer. */

const handRow = () => ({ databaseId, tableId: tableIds.handwriting, rowId: user.$id });

function readGuestHand() {
  try { return JSON.parse(localStorage.getItem(GUEST_HAND_KEY) || "null"); } catch (_) { return null; }
}

function setHand(packed) {
  const hand = packed ? engine.unpackHand(packed) : null;
  state.hand = hand && Object.keys(hand.glyphs).length ? hand : null;
}

async function loadHand() {
  if (!user) { setHand(readGuestHand()); return; }
  try {
    const row = await tablesDB.getRow(handRow());
    setHand(JSON.parse(row.glyphs || "null"));
  } catch (e) {
    setHand(null);
    if (e && e.code !== 404) toast("Deine Handschrift konnte nicht geladen werden.", { error: true });
  }
}

async function saveHand(packed) {
  if (user) {
    await tablesDB.upsertRow({ ...handRow(), data: { userId: user.$id, glyphs: JSON.stringify(packed) }, permissions: ownerPermissions(user.$id) });
  } else {
    localStorage.setItem(GUEST_HAND_KEY, JSON.stringify(packed));
  }
  setHand(packed);
}

async function deleteHand() {
  if (user) {
    try { await tablesDB.deleteRow(handRow()); } catch (e) { if (!e || e.code !== 404) throw e; }
  } else {
    localStorage.removeItem(GUEST_HAND_KEY);
  }
  setHand(null);
}

function updateHandUi() {
  const n = state.hand ? Object.keys(state.hand.glyphs).length : 0;
  els.handTileInfo.textContent = n
    ? `${n} von ${HAND_CHARS.length} Zeichen gezeichnet · ${user ? "im Konto gespeichert" : "in diesem Browser gespeichert"}`
    : "Jedes Zeichen einmal selbst schreiben.";
  els.handActions.hidden = !n;
  if (!engine.isHand() && state.font === HAND_ID) selectFont("Caveat");
  updateHandVaryUi();
}

function renderNote() {
  els.note.innerHTML = user
    ? `<span class="storage-dot" aria-hidden="true"></span>
       <span><strong>Angemeldet als ${esc(user.name || user.email || "Konto")}.</strong> Im Konto liegt nur deine eigene Handschrift. Dein Text wird nie hochgeladen.</span>`
    : `<span class="storage-dot is-hollow" aria-hidden="true"></span>
       <span><strong>Alles bleibt im Browser.</strong> Text und Export verlassen dein Gerät nicht.</span>
       <button class="text-link" type="button" data-auth-action="login">Anmelden, um deine Handschrift überall zu nutzen</button>`;
}

const handDeclined = () => { try { return JSON.parse(localStorage.getItem(HAND_DECLINED_KEY) || "[]"); } catch (_) { return []; } };

/** Erster Login mit lokaler Handschrift: Übernahme ins Konto anbieten. */
async function offerHandImport(token) {
  const local = readGuestHand();
  if (!user || state.hand || !local || !local.glyphs || !Object.keys(local.glyphs).length) return;
  if (handDeclined().includes(user.$id)) return;
  const ok = await confirmDialog({
    title: "Lokale Handschrift übernehmen?",
    text: "In diesem Browser liegt eine Handschrift aus dem Gast-Modus. Soll sie in dein Konto übernommen werden? Sonst bleibt sie getrennt auf diesem Gerät.",
    confirm: "Ins Konto übernehmen",
    cancel: "Nicht übernehmen",
  });
  if (token !== authToken || !user) return;
  if (!ok) {
    try { localStorage.setItem(HAND_DECLINED_KEY, JSON.stringify([...new Set([...handDeclined(), user.$id])])); } catch (_) {}
    return;
  }
  try {
    await saveHand(local);
    localStorage.removeItem(GUEST_HAND_KEY);
    updateHandUi();
    toast("Deine Handschrift ist jetzt im Konto gespeichert.");
  } catch (e) {
    console.error(e);
    toast("Die Handschrift konnte nicht ins Konto übernommen werden.", { error: true });
  }
}

/* ---------- Handschrift zeichnen ----------
   Ein Zeichen nach dem anderen wird ins Feld geschrieben. Koordinaten werden direkt in
   Geviert-Einheiten gespeichert (Ursprung: Grundlinie, links), wie die skelettierten
   Schriftzeichen – die Striche sind schon Mittellinien und brauchen keine Skelettierung. */

// Feldgeometrie relativ zur Feldhöhe: Grundlinie und Geviertgröße
const PAD_BASE = 0.7, PAD_EM = 0.5;
const pad = { draft: {}, idx: 0, drawing: null };

function openHandFlow() {
  // Entwurf aus der gespeicherten Handschrift (Rohdaten, ungeglättet) aufbauen
  pad.draft = {};
  if (state.hand) {
    for (const [ch, g] of Object.entries(state.hand.glyphs)) {
      pad.draft[ch] = g.raw.map((flat) => {
        const pts = [];
        for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i] / 1000, flat[i + 1] / 1000]);
        return pts;
      });
    }
  }
  pad.idx = Math.max(0, HAND_CHARS.findIndex((c) => !pad.draft[c]));
  els.handSaveInfo.textContent = user ? "Wird in deinem Konto gespeichert und ist auf allen Geräten verfügbar." : "Wird nur in diesem Browser gespeichert. Mit Konto ist sie überall verfügbar.";
  els.handDelete.hidden = !state.hand;
  els.handDialog.showModal();
  sizePad();
  updatePad();
}

function sizePad() {
  const c = els.handPad, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
}

// Zeichenfeld-Pixel <-> Geviert-Einheiten. Gezeichnet wird ab ~1/4 der Breite.
const padEm = () => els.handPad.height * PAD_EM;
const padOrigin = () => [els.handPad.width * 0.3, els.handPad.height * PAD_BASE];

function drawPad() {
  const c = els.handPad, ctx = c.getContext("2d"), em = padEm(), [ox, oy] = padOrigin();
  ctx.clearRect(0, 0, c.width, c.height);
  const line = (yEm, color, dash) => {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, em * 0.008); ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(0, oy + yEm * em); ctx.lineTo(c.width, oy + yEm * em); ctx.stroke(); ctx.restore();
  };
  line(-0.72, "#e0e0e0", [em * 0.04, em * 0.04]); // Oberlänge / Großbuchstaben
  line(-0.42, "#adadad", [em * 0.04, em * 0.04]); // x-Höhe
  line(0, "#707070");                              // Grundlinie
  line(0.28, "#e0e0e0", [em * 0.04, em * 0.04]);  // Unterlänge
  // Vorlage des Zeichens als blasse Hilfe
  const ch = HAND_CHARS[pad.idx];
  const strokes = pad.draft[ch] || [];
  if (!strokes.length) {
    ctx.save(); ctx.fillStyle = "#f0f0f0"; ctx.font = `400 ${em}px "Caveat", cursive`;
    ctx.fillText(ch, ox, oy); ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = state.ink; ctx.lineWidth = HAND_W * em; ctx.lineCap = ctx.lineJoin = "round";
  for (const st of strokes) {
    if (st.length === 1) { ctx.beginPath(); ctx.arc(ox + st[0][0] * em, oy + st[0][1] * em, HAND_W * em / 2, 0, 7); ctx.fill(); continue; }
    ctx.beginPath();
    st.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * em, oy + y * em) : ctx.moveTo(ox + x * em, oy + y * em)));
    ctx.stroke();
  }
  ctx.restore();
}

function updatePad() {
  const ch = HAND_CHARS[pad.idx];
  const done = HAND_CHARS.filter((c) => pad.draft[c] && pad.draft[c].length).length;
  els.handChar.textContent = ch;
  els.handProgress.textContent = `Zeichen ${pad.idx + 1} von ${HAND_CHARS.length} · ${done} gezeichnet`;
  els.handPrev.disabled = pad.idx === 0;
  els.handNext.textContent = pad.idx === HAND_CHARS.length - 1 ? "Fertig" : (pad.draft[ch] && pad.draft[ch].length ? "Weiter" : "Überspringen");
  els.handStrip.querySelectorAll("button").forEach((b, i) => {
    b.classList.toggle("done", !!(pad.draft[HAND_CHARS[i]] && pad.draft[HAND_CHARS[i]].length));
    b.classList.toggle("current", i === pad.idx);
    if (i === pad.idx) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
  });
  const cur = els.handStrip.children[pad.idx];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "nearest" });
  drawPad();
}

function padPoint(e) {
  const c = els.handPad, r = c.getBoundingClientRect(), em = padEm(), [ox, oy] = padOrigin();
  const x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
  return [(x - ox) / em, (y - oy) / em];
}

// Zum Speichern: Zeichen links ausrichten, Breite bestimmen, Punkte ausdünnen
function packHand() {
  const glyphs = {};
  for (const ch of HAND_CHARS) {
    const strokes = (pad.draft[ch] || []).filter((s) => s.length);
    if (!strokes.length) continue;
    let minX = Infinity, maxX = -Infinity;
    for (const s of strokes) for (const [x] of s) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const bearing = 0.05;
    const shift = bearing - minX;
    glyphs[ch] = {
      a: Math.round((maxX - minX + 2 * bearing + HAND_W) * 1000),
      s: strokes.map((s) => {
        const pts = s.length > 2 ? engine.rdp(s.map(([x, y]) => [(x + shift) * 1000, y * 1000]), 3) : s.map(([x, y]) => [(x + shift) * 1000, y * 1000]);
        return pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
      }),
    };
  }
  return { v: 1, glyphs };
}

async function saveHandFromPad() {
  const packed = packHand();
  if (!Object.keys(packed.glyphs).length) { els.handSaveInfo.textContent = "Zeichne mindestens ein Zeichen."; return; }
  els.handSave.disabled = true;
  els.handSaveInfo.textContent = "Wird gespeichert …";
  try {
    await saveHand(packed);
    els.handDialog.close();
    updateHandUi();
    selectFont(HAND_ID);
    toast(user ? "Deine Handschrift ist im Konto gespeichert." : "Deine Handschrift ist in diesem Browser gespeichert.");
  } catch (e) {
    console.error(e);
    els.handSaveInfo.textContent = "Speichern fehlgeschlagen. Prüfe deine Verbindung und versuch es noch einmal.";
  } finally {
    els.handSave.disabled = false;
  }
}

function wireHandPad() {
  HAND_CHARS.forEach((ch, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = ch;
    b.setAttribute("aria-label", `Zeichen ${ch}`);
    b.addEventListener("click", () => { pad.idx = i; updatePad(); });
    els.handStrip.append(b);
  });
  const c = els.handPad;
  c.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    const ch = HAND_CHARS[pad.idx];
    pad.drawing = [padPoint(e)];
    (pad.draft[ch] = pad.draft[ch] || []).push(pad.drawing);
    drawPad();
  });
  c.addEventListener("pointermove", (e) => {
    if (!pad.drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = padPoint(ev), last = pad.drawing[pad.drawing.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) pad.drawing.push(p);
    }
    drawPad();
  });
  const end = () => { if (pad.drawing) { pad.drawing = null; updatePad(); } };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
  els.handPrev.addEventListener("click", () => { if (pad.idx > 0) { pad.idx--; updatePad(); } });
  els.handNext.addEventListener("click", () => {
    if (pad.idx < HAND_CHARS.length - 1) { pad.idx++; updatePad(); } else saveHandFromPad();
  });
  els.handUndo.addEventListener("click", () => { const s = pad.draft[HAND_CHARS[pad.idx]]; if (s) s.pop(); updatePad(); });
  els.handClear.addEventListener("click", () => { delete pad.draft[HAND_CHARS[pad.idx]]; updatePad(); });
  els.handSave.addEventListener("click", saveHandFromPad);
  els.handClose.addEventListener("click", () => els.handDialog.close());
  els.handEdit.addEventListener("click", openHandFlow);
  els.handDelete.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Handschrift löschen?",
      text: `Deine gezeichnete Handschrift wird ${user ? "aus deinem Konto" : "aus diesem Browser"} gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirm: "Handschrift löschen",
    });
    if (!ok) return;
    try {
      await deleteHand();
      els.handDialog.close();
      updateHandUi();
      scheduleRender(0);
      toast("Deine Handschrift wurde gelöscht.");
    } catch (e) {
      console.error(e);
      toast("Löschen fehlgeschlagen. Versuch es noch einmal.", { error: true });
    }
  });
  window.addEventListener("resize", () => { if (els.handDialog.open) { sizePad(); drawPad(); } });
}

/* ---------- Start ---------- */

try {
  const saved = JSON.parse(localStorage.getItem(VARY_KEY) || "null");
  if (saved) { els.handVary.checked = !!saved.on; els.handVaryInput.value = saved.v; }
} catch (_) {}
applyHandVary();
applyMode();
wireHandPad();
renderNote();

// Gespeicherte Vorlage wiederherstellen, dann erste Vorschau
(async () => {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) {
      const { name, data } = JSON.parse(raw);
      await loadCustomTemplate(engine.latin1.encode(atob(data)).buffer, name, false);
      return;
    }
  } catch (_) { /* unlesbare Vorlage ignorieren */ }
  updateTemplateUi();
  scheduleRender(0);
})();

// Gemeinsamer Login: bei jeder Änderung die passende Handschrift laden (Gast ↔ Konto)
let authToken = 0;
onAuthChange(async ({ status, user: u }) => {
  if (status !== "ready") return;
  const token = ++authToken;
  user = u;
  renderNote();
  await loadHand();
  if (token !== authToken) return;
  updateHandUi();
  scheduleRender(0);
  offerHandImport(token);
});
