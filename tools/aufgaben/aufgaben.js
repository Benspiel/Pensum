/* Aufgaben – Oberfläche.
 * Das Blatt (Foto, Bild oder eine PDF-Seite, gerendert mit pdf.js aus /vendor/pdfjs) wird im Browser verkleinert und an die Appwrite-Function „aufgaben“ (functions/aufgaben) geschickt.
 * Sie hält den Gemini-Schlüssel und zählt das Tageslimit (2 Durchläufe pro Tag). Das Bild wird nirgends gespeichert.
 * Die Antworten schreibt dieses Modul selbst auf das Blatt (Schrift oder eigene Handschrift) und exportiert PDF oder PNG. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { toast, esc, confirmDialog, closeIcon } from "/js/shell.js";
import { openExportMenu } from "/js/export-menu.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { loadHand, width as handWidth, pathData, strokeWidth } from "/tools/mindmap/hand.js";
import {
  fitSize, MAX_BASE64, QUALITIES, SEND_SIDE, OUT_SIDE, FONTS, fontById, INKS, inkById,
  boxToRect, rectToBox, layoutFields, fileName,
} from "./core.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), app: $("app"), usage: $("usage"),
  drop: $("drop"), preview: $("preview"), empty: $("empty"),
  camInput: $("camInput"), fileInput: $("fileInput"), camLabel: $("camLabel"), fileLabel: $("fileLabel"),
  pageField: $("pageField"), pageSel: $("pageSel"),
  sheetError: $("sheetError"), solveBtn: $("solveBtn"),
  resultEmpty: $("resultEmpty"), resultBody: $("resultBody"),
  fontSel: $("fontSel"), inkSel: $("inkSel"), size: $("sizeInput"), sizeVal: $("sizeVal"), handHint: $("handHint"),
  canvas: $("sheet"), dragHint: $("dragHint"), exportBtn: $("exportBtn"),
  list: $("list"), skipped: $("skipped"), skippedList: $("skippedList"),
};

const state = {
  sheet: null,      // Canvas mit dem Blatt in voller Ausgabegröße
  sendBase64: "",   // verkleinertes JPEG für die KI
  pdf: null,        // { doc, pages, page }, wenn das Blatt ein PDF ist
  previewUrl: "",
  fields: [],       // { id, box, text }
  skipped: [],
  usage: null,
  serviceError: "",
  hand: null,       // eigene Handschrift (Goodnotes-Tool) oder null
  fontId: "caveat",
  inkId: "blue",
  scale: 1,
  active: 0,        // Feld-ID, das gerade bearbeitet wird (Rahmen in der Vorschau)
  busy: false,
};

const showMessage = (el, text) => { el.textContent = text || ""; el.hidden = !text; };
const errText = (e) => (e && e.code ? authMessage(e) : (e && e.message) || "Das hat nicht geklappt. Probier es noch einmal.");
const left = () => (state.usage ? state.usage.maxRuns - state.usage.runs : 0);

/* ---------- Function ---------- */

/** Aufruf der Function. Wirft Error mit einer Meldung, die man anzeigen darf. */
async function callFunction(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.aufgaben,
      body: JSON.stringify(payload),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der Aufgaben-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.aufgaben}“, Appwrite meldet: ${e.message || e.type}).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) {
    const base = (data && data.error) || "Der Aufgaben-Dienst antwortet gerade nicht. Versuch es später noch einmal.";
    throw new Error(data && data.detail ? `${base} (Technisch: ${data.detail})` : `${base} (Technisch: Status ${ex.responseStatusCode}${ex.errors ? ", " + String(ex.errors).slice(0, 200) : ""})`);
  }
  return data;
}

/* ---------- Bild vorbereiten ---------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function drawScaled(source, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // PNG mit Transparenz sonst schwarz
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Macht aus einer Bildquelle (Bild oder Canvas) das Blatt in Ausgabegröße und ein kleines JPEG für die KI. */
async function sheetFromSource(source) {
  const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
  const out = fitSize(sw, sh, OUT_SIDE);
  const sheet = drawScaled(source, out.width, out.height);
  if (source.close) source.close();

  const send = fitSize(out.width, out.height, SEND_SIDE);
  const small = send.width === out.width ? sheet : drawScaled(sheet, send.width, send.height);
  for (const q of QUALITIES) {
    const blob = await toBlob(small, q);
    if (!blob) break;
    const base64 = await blobToBase64(blob);
    if (base64.length <= MAX_BASE64) return { sheet, base64, blob };
  }
  throw new Error("Das Bild ist zu groß. Geh etwas weiter weg oder wähle ein kleineres Bild.");
}

/** Foto oder Bilddatei: Drehung laut Kamera wird übernommen. */
async function sheetFromImage(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (_) {
    try { source = await loadImage(file); } catch (__) {
      throw new Error("Dieses Bild kann der Browser nicht öffnen. Nimm ein Foto direkt mit der Kamera auf oder wähle ein JPEG oder PNG.");
    }
  }
  return sheetFromSource(source);
}

/* ---------- PDF ---------- */

const PDF_MAX_BYTES = 25 * 1024 * 1024;
let pdfjs = null;

/** pdf.js erst laden, wenn jemand ein PDF wählt (liegt lokal in /vendor/pdfjs, nichts kommt von außen). */
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  }
  return pdfjs;
}

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

async function openPdf(file) {
  if (file.size > PDF_MAX_BYTES) throw new Error("Das PDF ist größer als 25 MB. Wähle ein kleineres oder mach einen Screenshot.");
  let doc;
  try {
    const lib = await loadPdfjs();
    doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw new Error("Das PDF ist passwortgeschützt. Hebe den Schutz auf oder mach einen Screenshot.");
    throw new Error("Dieses PDF kann der Browser nicht öffnen. Mach einen Screenshot vom Blatt oder wähle ein anderes PDF.");
  }
  if (state.pdf) state.pdf.doc.destroy();
  state.pdf = { doc, pages: doc.numPages, page: 1 };
  return renderPdfPage(1);
}

/** Zeichnet eine PDF-Seite so groß, dass die lange Kante der Ausgabegröße entspricht, und macht daraus das Blatt. */
async function renderPdfPage(n) {
  const page = await state.pdf.doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = OUT_SIDE / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(vp.width)); canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // PDF-Seiten sind oft transparent
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return sheetFromSource(canvas);
}

function renderPageField() {
  const many = !!state.pdf && state.pdf.pages > 1;
  els.pageField.hidden = !many;
  if (!many) return;
  els.pageSel.innerHTML = Array.from({ length: state.pdf.pages }, (_, i) => `<option value="${i + 1}">Seite ${i + 1} von ${state.pdf.pages}</option>`).join("");
  els.pageSel.value = String(state.pdf.page);
}

function applySheet(p) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.sheet = p.sheet;
  state.sendBase64 = p.base64;
  state.previewUrl = URL.createObjectURL(p.blob);
  els.preview.src = state.previewUrl;
  clearResult(); // altes Ergebnis passt nicht mehr zum neuen Blatt
}

async function setFile(file) {
  if (!file || state.busy) return;
  showMessage(els.sheetError, "");
  const pdf = isPdf(file);
  if (!pdf && !/^image\//.test(file.type || "image/")) { showMessage(els.sheetError, "Das ist weder Bild noch PDF. Mach ein Foto oder einen Screenshot vom Blatt oder wähle ein PDF."); return; }
  els.solveBtn.disabled = true;
  els.solveBtn.textContent = "Blatt wird vorbereitet …";
  try {
    if (!pdf && state.pdf) { state.pdf.doc.destroy(); state.pdf = null; }
    applySheet(pdf ? await openPdf(file) : await sheetFromImage(file));
  } catch (e) {
    showMessage(els.sheetError, e.message);
  }
  renderPageField();
  renderSheetPanel();
}

/** Andere Seite des PDFs wählen. Jede Seite ist ein eigener Durchlauf. */
async function changePage() {
  if (!state.pdf || state.busy) return;
  const n = Number(els.pageSel.value);
  showMessage(els.sheetError, "");
  els.solveBtn.disabled = true;
  els.solveBtn.textContent = "Seite wird vorbereitet …";
  try {
    const p = await renderPdfPage(n);
    state.pdf.page = n;
    applySheet(p);
  } catch (e) {
    showMessage(els.sheetError, "Diese Seite konnte nicht geladen werden.");
    els.pageSel.value = String(state.pdf.page);
  }
  renderSheetPanel();
}

/* ---------- Schrift ---------- */

const loadedFonts = new Set();
async function ensureFont(f) {
  if (!f.load || loadedFonts.has(f.id) || !document.fonts) return;
  try {
    await document.fonts.load(f.load, "AaÄäÖöÜüß0123456789 ,.:-=+ XxÀé");
    loadedFonts.add(f.id);
  } catch (_) { /* Ersatzschrift */ }
}

/** Zeichnet das Blatt samt Antworten auf canvas. highlight: Feld-ID, das umrahmt wird (nur Vorschau, nie beim Export). */
function drawSheet(canvas, { highlight = 0 } = {}) {
  const sheet = state.sheet;
  if (!sheet) return [];
  if (canvas.width !== sheet.width || canvas.height !== sheet.height) { canvas.width = sheet.width; canvas.height = sheet.height; }
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sheet, 0, 0);

  const font = fontById(state.fontId);
  const own = font.own && state.hand;
  const ink = inkById(state.inkId).color;
  const css = own ? "" : font.css;
  const weight = font.id === "normal" ? 600 : 400;
  const measure = own
    ? (t, s) => handWidth(state.hand, t, s)
    : (t, s) => { ctx.font = `${weight} ${s}px ${css}`; return ctx.measureText(t).width; };

  const layout = layoutFields(state.fields, { width: sheet.width, height: sheet.height, measure, lineH: font.lineH, k: font.k, scale: state.scale });
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

  for (const L of layout) {
    L.lines.forEach((line, i) => {
      if (!line) return;
      const x = L.rect.x + 2 + (font.hand ? L.dx[i] : 0);
      const rot = font.hand ? L.rot[i] : 0;
      ctx.save();
      ctx.translate(x, L.baselines[i]);
      ctx.rotate(rot);
      if (own) {
        ctx.lineWidth = Math.max(1.2, strokeWidth(L.size) * 1.15);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke(new Path2D(pathData(state.hand, line, L.size, 0, 0)));
      } else {
        ctx.font = `${weight} ${L.size}px ${css}`;
        ctx.fillText(line, 0, 0);
      }
      ctx.restore();
    });
    if (L.id === highlight) {
      ctx.save();
      ctx.strokeStyle = "#0a7cff"; ctx.lineWidth = Math.max(2, sheet.width / 600); ctx.setLineDash([8, 6]);
      ctx.strokeRect(L.rect.x, L.rect.y, L.rect.w, L.rect.h);
      ctx.restore();
    }
  }
  return layout;
}

let layoutNow = [];
let raf = 0;
function redraw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    layoutNow = drawSheet(els.canvas, { highlight: state.active });
    updateWarnings();
  });
}

/* ---------- Anzeige ---------- */

function renderUsage() {
  if (!state.usage) {
    els.usage.innerHTML = state.serviceError ? `<span class="badge badge-soft">${esc(state.serviceError)}</span>` : "";
    return;
  }
  const n = left();
  els.usage.innerHTML = `<span class="badge ${n > 0 ? "badge-accent" : "badge-soft"}">${n > 0 ? `Heute noch ${n} von ${state.usage.maxRuns} Durchläufen frei` : "Heute keine Durchläufe mehr frei"}</span>`;
}

function renderSheetPanel() {
  const has = !!state.sheet;
  els.preview.hidden = !has;
  els.empty.hidden = has;
  els.drop.classList.toggle("has-image", has);
  const can = has && !state.busy && !!state.usage && left() > 0;
  els.solveBtn.disabled = !can;
  els.solveBtn.classList.toggle("is-busy", state.busy);
  els.solveBtn.textContent = state.busy ? "Die KI bearbeitet das Blatt …" : has ? "Aufgaben ausfüllen" : "Erst ein Blatt wählen";
  for (const l of [els.camLabel, els.fileLabel]) l.classList.toggle("is-disabled", state.busy);
  els.camInput.disabled = els.fileInput.disabled = els.pageSel.disabled = state.busy;
  if (has && state.usage && left() <= 0 && !state.busy) showMessage(els.sheetError, `Du hast heute beide Durchläufe verbraucht. Morgen sind es wieder ${state.usage.maxRuns}.`);
}

function fillSelects() {
  els.fontSel.innerHTML = FONTS.map((f) => `<option value="${f.id}"${f.own && !state.hand ? " disabled" : ""}>${esc(f.label)}${f.own && !state.hand ? " (noch nicht gezeichnet)" : ""}</option>`).join("");
  els.fontSel.value = state.fontId;
  els.inkSel.innerHTML = INKS.map((i) => `<option value="${i.id}">${esc(i.label)}</option>`).join("");
  els.inkSel.value = state.inkId;
  els.handHint.hidden = !!state.hand;
}

function renderList() {
  els.list.innerHTML = state.fields.map((f) => `
    <li class="au-item${f.id === state.active ? " is-active" : ""}" data-id="${f.id}">
      <span class="au-num" aria-hidden="true">${f.id}</span>
      <label class="field">
        <span class="sr-only">Antwort ${f.id}</span>
        <textarea class="textarea" rows="${Math.min(4, Math.max(1, f.text.split("\n").length))}" maxlength="800" data-id="${f.id}">${esc(f.text)}</textarea>
      </label>
      <button type="button" class="icon-btn" data-remove="${f.id}" aria-label="Antwort ${f.id} entfernen">${closeIcon}</button>
      <p class="au-warn" data-warn="${f.id}" hidden>Das passt nicht ganz ins Feld. Kürze die Antwort oder verkleinere die Schrift.</p>
    </li>`).join("");
  els.skipped.hidden = !state.skipped.length;
  els.skippedList.innerHTML = state.skipped.map((s) => `<li>${esc(s)}</li>`).join("");
}

function updateWarnings() {
  for (const L of layoutNow) {
    const w = els.list.querySelector(`[data-warn="${L.id}"]`);
    if (w) w.hidden = L.fits;
  }
}

function setActive(id) {
  if (state.active === id) return;
  state.active = id;
  for (const li of els.list.children) li.classList.toggle("is-active", Number(li.dataset.id) === id);
  redraw();
}

function showResult() {
  els.resultBody.hidden = false;
  els.resultEmpty.hidden = true;
  fillSelects();
  renderList();
  redraw();
}

function clearResult() {
  state.fields = []; state.skipped = []; state.active = 0; layoutNow = [];
  els.resultBody.hidden = true;
  els.resultEmpty.hidden = false;
}

/* ---------- Aktionen ---------- */

async function solve() {
  if (!state.sheet || state.busy) return;
  const ok = await confirmDialog({
    title: "Aufgaben jetzt ausfüllen?",
    text: `Das zählt als einer deiner ${state.usage ? state.usage.maxRuns : 2} Durchläufe heute. Wenn die KI nichts liefert, bekommst du ihn zurück.`,
    confirm: "Ausfüllen",
  });
  if (!ok) return;
  state.busy = true;
  showMessage(els.sheetError, "");
  renderSheetPanel();
  try {
    const font = fontById(state.fontId);
    await ensureFont(font);
    const r = await callFunction({ action: "solve", image: state.sendBase64 });
    state.usage = r.usage;
    state.fields = r.fields.map((f) => ({ id: f.id, box: f.box, text: f.text }));
    state.skipped = r.skipped || [];
    state.active = 0;
    showResult();
    els.resultBody.scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (e) {
    showMessage(els.sheetError, errText(e));
    // Zähler neu holen: bei „Limit erreicht“ oder nach einem Fehler stimmt er sonst nicht mehr
    callFunction({ action: "status" }).then((s) => { state.usage = s.usage; renderUsage(); renderSheetPanel(); }).catch(() => {});
  } finally {
    state.busy = false;
    renderUsage();
    renderSheetPanel();
  }
}

async function changeFont() {
  const f = fontById(els.fontSel.value);
  if (f.own && !state.hand) return;
  state.fontId = f.id;
  await ensureFont(f);
  redraw();
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Blatt ohne Rahmen in eigenem Canvas zeichnen (für den Export). */
function exportCanvas() {
  const c = document.createElement("canvas");
  drawSheet(c);
  return c;
}

/** Bild speichern. Gibt den Dateinamen zurück, Fehler werfen (das Export-Menü zeigt sie als Toast). */
async function savePng() {
  const blob = await new Promise((res) => exportCanvas().toBlob(res, "image/png"));
  if (!blob) throw new Error("Das Bild konnte nicht erstellt werden.");
  const name = fileName(new Date(), "png");
  download(blob, name);
  return name;
}

/** PDF speichern. Gibt den Dateinamen zurück, Fehler werfen. */
function savePdf() {
  const lib = window.jspdf && window.jspdf.jsPDF;
  if (!lib) throw new Error("Die PDF-Bibliothek ist noch nicht geladen. Versuch es gleich noch einmal.");
  const c = exportCanvas();
  const A4 = [210, 297];
  // Blatt hoch oder quer auf A4, ganze Seite ausgefüllt; andere Seitenverhältnisse behalten ihre Form
  const ratio = c.width / c.height;
  const portrait = ratio < 1;
  const isA4 = Math.abs((portrait ? ratio : 1 / ratio) - A4[0] / A4[1]) < 0.06;
  const pw = isA4 ? (portrait ? A4[0] : A4[1]) : (portrait ? 210 : 297);
  const ph = isA4 ? (portrait ? A4[1] : A4[0]) : pw / ratio;
  const pdf = new lib({ orientation: portrait ? "p" : "l", unit: "mm", format: [pw, ph] });
  pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph, undefined, "FAST");
  const name = fileName(new Date(), "pdf");
  pdf.save(name);
  return name;
}

/* ---------- Verschieben mit der Maus ---------- */

const drag = { id: 0, start: null, box: null, moved: false };

function pointToSheet(e) {
  const r = els.canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * state.sheet.width, y: ((e.clientY - r.top) / r.height) * state.sheet.height };
}

function fieldAt(p) {
  for (let i = layoutNow.length - 1; i >= 0; i--) {
    const r = layoutNow[i].rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return layoutNow[i].id;
  }
  return 0;
}

els.canvas.addEventListener("pointerdown", (e) => {
  if (!state.sheet || !state.fields.length) return;
  const p = pointToSheet(e);
  const id = fieldAt(p);
  setActive(id);
  if (id) {
    const li = els.list.querySelector(`.au-item[data-id="${id}"]`);
    if (li) li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  if (!id || e.pointerType === "touch") return; // Am Handy würde Ziehen das Scrollen blockieren: dort nur auswählen
  drag.id = id; drag.start = p; drag.box = state.fields.find((f) => f.id === id).box.slice(); drag.moved = false;
  try { els.canvas.setPointerCapture(e.pointerId); } catch (_) { /* Ziehen klappt auch ohne */ }
  els.canvas.classList.add("is-dragging");
});

els.canvas.addEventListener("pointermove", (e) => {
  if (!state.sheet) return;
  if (!drag.id) {
    els.canvas.classList.toggle("can-drag", !!fieldAt(pointToSheet(e)) && e.pointerType !== "touch");
    return;
  }
  const p = pointToSheet(e);
  const dx = ((p.x - drag.start.x) / state.sheet.width) * 1000, dy = ((p.y - drag.start.y) / state.sheet.height) * 1000;
  const [y0, x0, y1, x1] = drag.box;
  const ddx = Math.min(1000 - x1, Math.max(-x0, dx)), ddy = Math.min(1000 - y1, Math.max(-y0, dy));
  const f = state.fields.find((q) => q.id === drag.id);
  f.box = [y0 + ddy, x0 + ddx, y1 + ddy, x1 + ddx].map((n) => Math.round(n));
  drag.moved = true;
  redraw();
});

function endDrag() {
  if (!drag.id) return;
  drag.id = 0;
  els.canvas.classList.remove("is-dragging");
}
els.canvas.addEventListener("pointerup", endDrag);
els.canvas.addEventListener("pointercancel", endDrag);

/* ---------- Ereignisse ---------- */

els.camInput.addEventListener("change", () => { setFile(els.camInput.files[0]); els.camInput.value = ""; });
els.fileInput.addEventListener("change", () => { setFile(els.fileInput.files[0]); els.fileInput.value = ""; });
els.solveBtn.addEventListener("click", solve);
els.pageSel.addEventListener("change", changePage);
els.fontSel.addEventListener("change", changeFont);
els.inkSel.addEventListener("change", () => { state.inkId = els.inkSel.value; redraw(); });
els.size.addEventListener("input", () => { state.scale = Number(els.size.value) / 100; els.sizeVal.textContent = `${els.size.value} %`; redraw(); });
// Ein Knopf „Exportieren“ öffnet das Export-Menü (js/export-menu.js) mit Bild und PDF
els.exportBtn.addEventListener("click", () => openExportMenu({
  title: "Blatt exportieren",
  options: [
    { id: "pdf", icon: "pdf", label: "Als PDF", hint: "Zum Drucken und Abgeben", loading: "PDF wird erstellt …", success: "PDF gespeichert", errorTitle: "PDF-Export fehlgeschlagen", run: savePdf },
    { id: "png", icon: "image", label: "Als Bild", hint: "PNG, z. B. zum Weiterschicken", loading: "Bild wird erstellt …", success: "Bild gespeichert", errorTitle: "Bild-Export fehlgeschlagen", run: savePng },
  ],
}));

els.list.addEventListener("input", (e) => {
  const ta = e.target.closest("textarea[data-id]");
  if (!ta) return;
  const f = state.fields.find((q) => q.id === Number(ta.dataset.id));
  if (!f) return;
  f.text = ta.value;
  state.active = f.id;
  redraw();
});
els.list.addEventListener("focusin", (e) => {
  const ta = e.target.closest("textarea[data-id]");
  if (ta) setActive(Number(ta.dataset.id));
});
els.list.addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  const id = Number(b.dataset.remove);
  state.fields = state.fields.filter((f) => f.id !== id);
  if (state.active === id) state.active = 0;
  renderList();
  redraw();
});

["dragenter", "dragover"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add("is-drag"); }));
["dragleave", "drop"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove("is-drag"); }));
els.drop.addEventListener("drop", (e) => setFile(e.dataTransfer && e.dataTransfer.files[0]));

/* ---------- Start ---------- */

let started = null;
onAuthChange(async ({ status, user }) => {
  if (status !== "ready") return;
  els.gate.hidden = !!user;
  els.app.hidden = !user;
  if (!user) { started = null; state.usage = null; state.serviceError = ""; state.hand = null; return; }
  if (started === user.$id) return;
  started = user.$id;
  renderSheetPanel();
  loadHand(user.$id).then((h) => { state.hand = h; fillSelects(); redraw(); }).catch(() => {}); // ohne eigene Handschrift gibt es die Auswahl nur ausgegraut
  try {
    state.usage = (await callFunction({ action: "status" })).usage;
    state.serviceError = "";
  } catch (e) {
    state.usage = null;
    state.serviceError = errText(e);
  }
  renderUsage();
  renderSheetPanel();
});
fillSelects();
renderSheetPanel();
