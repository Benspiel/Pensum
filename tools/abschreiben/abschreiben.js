/* Abschreiben – Oberfläche.
 * Das Foto wird im Browser verkleinert und an die Appwrite-Function „abschreiben“ (functions/abschreiben) geschickt.
 * Sie hält den Gemini-Schlüssel und zählt das Tageslimit. Das Bild wird nirgends gespeichert.
 * Den Text kopiert man oder gibt ihn per sessionStorage ans Goodnotes-Tool weiter (Handschrift und Export dort). */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { toast, esc } from "/js/shell.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { fitSize, MAX_BASE64, QUALITIES, HANDOFF_KEY, makeHandoff, suggestName } from "./core.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), app: $("app"), usage: $("usage"),
  drop: $("drop"), preview: $("preview"), empty: $("empty"),
  camInput: $("camInput"), fileInput: $("fileInput"), camLabel: $("camLabel"), fileLabel: $("fileLabel"),
  photoError: $("photoError"), scanBtn: $("scanBtn"),
  resultEmpty: $("resultEmpty"), resultBody: $("resultBody"), text: $("text"), copyBtn: $("copyBtn"), handBtn: $("handBtn"),
};

const state = { image: null /* { base64, url } */, usage: null, serviceError: "", busy: false };

const showMessage = (el, text) => { el.textContent = text || ""; el.hidden = !text; };
const errText = (e) => (e && e.code ? authMessage(e) : (e && e.message) || "Das hat nicht geklappt. Probier es noch einmal.");
const left = () => (state.usage ? state.usage.maxScans - state.usage.scans : 0);

/* ---------- Function ---------- */

/** Aufruf der Function. Wirft Error mit einer Meldung, die man anzeigen darf. */
async function callFunction(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.abschreiben,
      body: JSON.stringify(payload),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der Abschreiben-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.abschreiben}“, Appwrite meldet: ${e.message || e.type}).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) {
    const base = (data && data.error) || "Der Abschreiben-Dienst antwortet gerade nicht. Versuch es später noch einmal.";
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

/** Verkleinert das Foto (Drehung laut Kamera wird übernommen) und macht ein JPEG, das klein genug zum Senden ist. */
async function prepareImage(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (_) {
    try { source = await loadImage(file); } catch (__) {
      throw new Error("Dieses Bild kann der Browser nicht öffnen. Nimm ein Foto direkt mit der Kamera auf oder wähle ein JPEG oder PNG.");
    }
  }
  const { width, height } = fitSize(source.width || source.naturalWidth, source.height || source.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // PNG mit Transparenz sonst schwarz
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();

  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, q);
    if (!blob) break;
    const base64 = await blobToBase64(blob);
    if (base64.length <= MAX_BASE64) return { base64, blob };
  }
  throw new Error("Das Foto ist zu groß. Geh etwas näher an die Tafel oder wähle ein kleineres Bild.");
}

async function setFile(file) {
  if (!file || state.busy) return;
  showMessage(els.photoError, "");
  if (!/^image\//.test(file.type || "image/")) { showMessage(els.photoError, "Das ist kein Bild. Wähle ein Foto der Tafel."); return; }
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = "Foto wird vorbereitet …";
  try {
    const prepared = await prepareImage(file);
    if (state.image) URL.revokeObjectURL(state.image.url);
    state.image = { base64: prepared.base64, url: URL.createObjectURL(prepared.blob) };
    els.preview.src = state.image.url;
  } catch (e) {
    showMessage(els.photoError, e.message);
  }
  renderPhoto();
}

/* ---------- Anzeige ---------- */

function renderUsage() {
  if (!state.usage) {
    els.usage.innerHTML = state.serviceError ? `<span class="badge badge-soft">${esc(state.serviceError)}</span>` : "";
    return;
  }
  const n = left();
  els.usage.innerHTML = `<span class="badge ${n > 0 ? "badge-accent" : "badge-soft"}">${n > 0 ? `Heute noch ${n} von ${state.usage.maxScans} Scans frei` : "Heute keine Scans mehr frei"}</span>`;
}

function renderPhoto() {
  const has = !!state.image;
  els.preview.hidden = !has;
  els.empty.hidden = has;
  els.drop.classList.toggle("has-image", has);
  const canScan = has && !state.busy && !!state.usage && left() > 0;
  els.scanBtn.disabled = !canScan;
  els.scanBtn.classList.toggle("is-busy", state.busy);
  els.scanBtn.textContent = state.busy ? "Die KI liest die Tafel …" : has ? "Text erkennen" : "Erst ein Foto wählen";
  for (const l of [els.camLabel, els.fileLabel]) l.classList.toggle("is-disabled", state.busy);
  els.camInput.disabled = els.fileInput.disabled = state.busy;
  if (has && state.usage && left() <= 0 && !state.busy) showMessage(els.photoError, "Du hast heute alle Scans verbraucht. Morgen sind es wieder " + state.usage.maxScans + ".");
}

function showResult(text) {
  els.text.value = text;
  els.resultBody.hidden = false;
  els.resultEmpty.hidden = true;
}

/* ---------- Aktionen ---------- */

async function scan() {
  if (!state.image || state.busy) return;
  state.busy = true;
  showMessage(els.photoError, "");
  renderPhoto();
  try {
    const r = await callFunction({ action: "scan", image: state.image.base64 });
    state.usage = r.usage;
    showResult(r.text);
    els.text.focus({ preventScroll: true });
    els.resultBody.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch (e) {
    showMessage(els.photoError, errText(e));
    // Zähler neu holen: bei „Limit erreicht“ oder nach einem Fehler stimmt er sonst nicht mehr
    callFunction({ action: "status" }).then((s) => { state.usage = s.usage; renderUsage(); renderPhoto(); }).catch(() => {});
  } finally {
    state.busy = false;
    renderUsage();
    renderPhoto();
  }
}

async function copyText() {
  const text = els.text.value;
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    els.text.select(); // Ältere Browser oder fehlende Berechtigung: Auswahl und Kopierbefehl
    if (!document.execCommand || !document.execCommand("copy")) { toast("Kopieren ging nicht. Markier den Text und kopier ihn selbst.", { error: true }); return; }
  }
  toast("Text kopiert.");
}

function toHandwriting() {
  const text = els.text.value;
  if (!text.trim()) return;
  try {
    sessionStorage.setItem(HANDOFF_KEY, makeHandoff(text, suggestName(text)));
  } catch (_) {
    toast("Der Text konnte nicht übergeben werden. Kopier ihn und füg ihn im Goodnotes-Tool ein.", { error: true });
    return;
  }
  location.href = "/tools/goodnotes/";
}

els.camInput.addEventListener("change", () => { setFile(els.camInput.files[0]); els.camInput.value = ""; });
els.fileInput.addEventListener("change", () => { setFile(els.fileInput.files[0]); els.fileInput.value = ""; });
els.scanBtn.addEventListener("click", scan);
els.copyBtn.addEventListener("click", copyText);
els.handBtn.addEventListener("click", toHandwriting);

["dragenter", "dragover"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add("is-drag"); }));
["dragleave", "drop"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove("is-drag"); }));
els.drop.addEventListener("drop", (e) => setFile(e.dataTransfer && e.dataTransfer.files[0]));

/* ---------- Start ---------- */

let started = null;
onAuthChange(async ({ status, user }) => {
  if (status !== "ready") return;
  els.gate.hidden = !!user;
  els.app.hidden = !user;
  if (!user) { started = null; state.usage = null; state.serviceError = ""; return; }
  if (started === user.$id) return;
  started = user.$id;
  renderPhoto();
  try {
    state.usage = (await callFunction({ action: "status" })).usage;
    state.serviceError = "";
  } catch (e) {
    state.usage = null;
    state.serviceError = errText(e);
  }
  renderUsage();
  renderPhoto();
});
renderPhoto();
