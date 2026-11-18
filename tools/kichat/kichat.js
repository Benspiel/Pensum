/* KI-Chat – Oberfläche.
 * Chats und Nachrichten liegen in den Tabellen chats und chat_messages (nur für die eigene Person lesbar, js/db.js).
 * Geschrieben werden sie von der Appwrite-Function „ki-chat“ (functions/ki-chat): Sie hält den Gemini-Schlüssel,
 * prüft das Team „ki-tester“ und speichert Frage und Antwort. Dieses Modul liest nur und löscht über die Function. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { esc, toast, confirmDialog } from "/js/shell.js";
import { Teams, Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { tableIds, Query, listAllRows } from "/js/db.js";
import { fitSize, MAX_BASE64, QUALITIES, HANDOFF_KEY, makeHandoff, suggestName } from "/tools/abschreiben/core.js";
import { loaderHtml } from "/js/loader.js";
import { loadIslands } from "/js/islands.js";
import { haptic } from "/js/haptics.js";
import { formatMessage, sortMessages, MAX_TEXT, MAX_TITLE, cleanTitle, DEFAULT_GRADE, cleanGrade, formatBytes, checkAttachment, isPdfFile, stepsHtml, cleanSteps } from "./core.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), denied: $("denied"), app: $("app"),
  list: $("chatList"), listEmpty: $("listEmpty"), newBtn: $("newBtn"),
  title: $("chatTitle"), top: $("top"), side: $("side"), sideToggle: $("sideToggle"), log: $("log"), error: $("error"),
  form: $("form"), input: $("input"), sendBtn: $("sendBtn"),
  attach: $("attach"), attachImg: $("attachImg"), attachName: $("attachName"), attachState: $("attachState"), attachRemove: $("attachRemove"),
  fileInput: $("fileInput"), attachDoc: $("attachDoc"), grade: $("grade"),
  scrim: $("scrim"), sideClose: $("sideClose"), listState: $("listState"),
};

const state = {
  userId: null,
  chats: [],        // { id, title, updatedAt }
  chatId: null,     // null = neuer Chat
  messages: [],     // { id, role, text }
  busy: false,
  loadToken: 0,     // verwirft veraltete Ladevorgänge
  attachment: null, // { base64, url, name, size } oder null: Bild für die nächste Frage (wird nicht gespeichert)
  preparing: false,
  renamingId: null, // Chat, dessen Name gerade bearbeitet wird
  grade: DEFAULT_GRADE, // Klasse 8 bis 12: bestimmt, wie die KI antwortet (wird im Browser gemerkt)
  waitTimer: 0,
  wait: null,       // Warteanzeige: { defs, t0, pdf }
  waitHandle: null, pdfHandle: null, // React-Inseln der Warteanzeige und der PDF-Karte
  listLoading: false, // Chatliste wird gerade geladen
  listFailed: false,  // Laden der Chatliste ist fehlgeschlagen
};

const showError = (text) => { els.error.textContent = text || ""; els.error.hidden = !text; };

/* ---------- Function ---------- */

/** Aufruf der Function. Wirft Error mit einer Meldung, die man anzeigen darf. */
async function callFunction(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.kiChat,
      body: JSON.stringify(payload),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der KI-Chat-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.kiChat}“).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Der KI-Chat antwortet gerade nicht. Versuch es später noch einmal.");
  return data;
}

/* ---------- Daten lesen ---------- */

const toChat = (r) => ({ id: r.$id, title: r.title, updatedAt: r.$updatedAt });

/** Liest mit Sortierung; klappt die nicht (Index fehlt o. Ä.), ohne Sortierung lesen und im Browser sortieren. */
async function listSorted(tableId, filter, order) {
  try { return await listAllRows(tableId, [filter, order]); }
  catch (e) { console.warn("KI-Chat: Lesen mit Sortierung fehlgeschlagen, versuche ohne.", e); return listAllRows(tableId, [filter]); }
}

async function loadChats() {
  const rows = await listSorted(tableIds.chats, Query.equal("userId", state.userId), Query.orderDesc("$updatedAt"));
  state.chats = rows.map(toChat).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function loadMessages(chatId) {
  const rows = await listSorted(tableIds.chatMessages, Query.equal("chatId", chatId), Query.orderAsc("$createdAt"));
  return sortMessages(rows).map((r) => ({ id: r.$id, role: r.role, text: r.text }));
}

/* ---------- Anzeige ---------- */

const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

function renderList() {
  closeMenu();
  els.listEmpty.hidden = state.chats.length > 0 || state.listLoading || state.listFailed;
  els.list.innerHTML = state.chats.map((c) => (c.id === state.renamingId
    ? `<li class="kc-item is-renaming"><input class="kc-rename" value="${esc(c.title)}" maxlength="${MAX_TITLE}" autocomplete="off" aria-label="Neuer Name für den Chat"></li>`
    : `<li class="kc-item"><button class="kc-chat" type="button" data-id="${esc(c.id)}" title="${esc(c.title)}"${c.id === state.chatId ? ' aria-current="true"' : ""}>${esc(c.title)}</button>`
      + `<button class="kc-more" type="button" data-more="${esc(c.id)}" aria-label="Optionen für ${esc(c.title)}" aria-haspopup="menu" aria-expanded="false">${DOTS}</button></li>`)).join("");
}

/* ---------- „…“-Menü pro Chat: Umbenennen und Löschen ---------- */

let menuEl = null;

function closeMenu() {
  if (!menuEl) return;
  const id = menuEl.dataset.for;
  menuEl.remove();
  menuEl = null;
  const more = els.list.querySelector(`[data-more="${CSS.escape(id)}"]`);
  if (more) { more.setAttribute("aria-expanded", "false"); more.closest(".kc-item").classList.remove("is-menu"); }
}

function openMenu(btn, viaKeyboard) {
  const id = btn.dataset.more;
  if (menuEl && menuEl.dataset.for === id) { closeMenu(); return; } // zweiter Klick schließt
  closeMenu();
  haptic("tap");
  const menu = document.createElement("div");
  menu.className = "kc-menu";
  menu.setAttribute("role", "menu");
  menu.dataset.for = id;
  menu.innerHTML = '<button type="button" role="menuitem" data-act="rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>Umbenennen</button>'
    + '<button type="button" role="menuitem" class="is-danger" data-act="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>Löschen</button>';
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + "px";
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + "px";
  btn.setAttribute("aria-expanded", "true");
  btn.closest(".kc-item").classList.add("is-menu");
  menuEl = menu;
  menu.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    closeMenu();
    if (act.dataset.act === "rename") startRename(id); else removeChat(id);
  });
  if (viaKeyboard) menu.querySelector("button").focus();
}

document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest("[data-more]")) closeMenu(); });
document.addEventListener("keydown", (e) => {
  if (!menuEl) return;
  if (e.key === "Escape") { const id = menuEl.dataset.for; closeMenu(); const more = els.list.querySelector(`[data-more="${CSS.escape(id)}"]`); if (more) more.focus(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...menuEl.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  } else if (e.key === "Tab") closeMenu();
});
els.list.addEventListener("scroll", closeMenu);

/* Umbenennen: Die Zeile wird zum Eingabefeld. Enter oder Verlassen speichert, Escape bricht ab. */
function startRename(id) {
  state.renamingId = id;
  renderList();
  const input = els.list.querySelector(".kc-rename");
  if (input) { input.focus(); input.select(); }
}

async function finishRename(save) {
  const id = state.renamingId;
  if (!id) return; // schon erledigt (Enter und anschließendes Verlassen)
  state.renamingId = null;
  const chat = state.chats.find((c) => c.id === id);
  const input = els.list.querySelector(".kc-rename");
  const title = cleanTitle(input ? input.value : "");
  if (!save || !chat || !title || title === chat.title) { renderList(); return; }
  const old = chat.title;
  haptic("success");
  chat.title = title; // sofort zeigen, bei einem Fehler zurücksetzen
  renderList();
  if (id === state.chatId) renderLog();
  try {
    await callFunction({ action: "rename", chatId: id, title });
  } catch (e) {
    chat.title = old;
    renderList();
    if (id === state.chatId) renderLog();
    toast(e.message, { error: true });
  }
}

/* ---------- Schreibmaschine (Takt und Cursor wie bei KokonutUI „Typewriter“, ui/src/components/kokonutui/type-writer.tsx) ----------
 * Eine neue Antwort wird Zeichen für Zeichen aufgebaut, mit Cursor. Formatierung (Listen, fett, Lösungsfenster) bleibt, nur der Text erscheint nach und nach.
 * Alte Chats und „Bewegung reduzieren“ zeigen den Text sofort. Ein neues Rendern (z. B. nächste Frage) beendet das Schreiben. */

let typing = null;
function stopTyping() { if (typing) { typing.stop(); typing = null; } }

/** Verzögerung je Zeichen mit „menschlichem“ Takt: 10 % zögern, 10 % schnell, sonst ±40 % (wie getTypingDelay im Typewriter). */
function typingDelay(base) {
  const roll = Math.random();
  if (roll < 0.1) return base * 2;
  if (roll > 0.9) return base * 0.5;
  return base * (0.6 + Math.random() * 0.8);
}

function typeMessage(el) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue && !n.parentElement.closest("button, svg, .kc-tools, .kc-solution-title") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const parts = [];
  while (walker.nextNode()) parts.push({ node: walker.currentNode, full: walker.currentNode.nodeValue });
  const total = parts.reduce((n, p) => n + p.full.length, 0);
  if (!total) return;
  const caret = Object.assign(document.createElement("span"), { className: "kc-caret", ariaHidden: "true" });
  const base = Math.min(22, Math.max(5, 5000 / total)); // lange Antworten schreiben schneller, höchstens etwa 5 Sekunden
  const perTick = Math.max(1, Math.ceil(total / 1500));
  let shown = 0, timer = 0, done = false;
  const paint = () => {
    let left = shown, last = null;
    for (const p of parts) {
      const n = Math.max(0, Math.min(p.full.length, left));
      p.node.nodeValue = p.full.slice(0, n);
      if (n > 0) last = p.node;
      left -= p.full.length;
    }
    if (last) last.after(caret); else parts[0].node.before(caret);
  };
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const p of parts) p.node.nodeValue = p.full;
    caret.remove();
    el.classList.remove("is-typing");
  };
  const tick = () => {
    shown = Math.min(total, shown + perTick);
    paint();
    const nearEnd = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80;
    if (nearEnd) els.log.scrollTop = els.log.scrollHeight;
    if (shown >= total) { finish(); typing = null; return; }
    timer = setTimeout(tick, typingDelay(base));
  };
  el.classList.add("is-typing");
  shown = 0;
  paint();
  typing = { stop: finish };
  timer = setTimeout(tick, 200); // kurze Pause vor dem ersten Zeichen
}

/* ---------- Warteanzeige und PDF-Karte: KokonutUI „AI Loading“ und „AI Attachment“ (React-Inseln, vendor/ui) ---------- */

let ui = null;
loadIslands().then((m) => { ui = m; });
let islands = [];
const dropIslands = () => { for (const i of islands) { try { i.destroy(); } catch (_) { /* schon weg */ } } islands = []; state.waitHandle = null; state.pdfHandle = null; };

/** Ohne die Inseln (laden nicht): schlichter Text statt der Schrittliste. */
const waitHtml = () => '<div class="kc-msg kc-model kc-wait" role="status">Die KI antwortet …</div>';

const STEP_MS = 1200; // so lange zeigt die Schrittliste jeden Schritt vor dem letzten
/** Schritte der Warteanzeige zum Zeitpunkt ms. Sie folgen den echten Schritten der Function; der letzte (Antwort schreiben) läuft, bis die Antwort da ist. */
function waitSteps(ms) {
  const defs = state.wait.defs;
  const active = Math.min(Math.floor(ms / STEP_MS), defs.length - 1);
  return defs.map((d, i) => {
    const step = { id: d.id, label: d.label, status: i < active ? "done" : i === active ? "running" : "pending" };
    if (i === active && d.lines) step.detail = d.lines.slice(0, Math.min(d.lines.length, Math.floor(Math.max(0, ms - i * STEP_MS) / 1800) + 1));
    return step;
  });
}

function tickWaiting() {
  if (!state.wait) return;
  const ms = Date.now() - state.wait.t0;
  if (state.waitHandle) state.waitHandle.update({ steps: waitSteps(ms) });
  const pdf = state.wait.pdf;
  if (pdf && state.pdfHandle) {
    pdf.read = Math.min(pdf.pages, Math.floor(ms / 350));
    state.pdfHandle.update({ file: pdf.file, status: "reading", pagesRead: pdf.read });
  }
}

function startWaiting(defs, pdf) {
  stopWaiting();
  state.wait = { defs, t0: Date.now(), pdf: pdf || null };
  state.waitTimer = setInterval(tickWaiting, 400);
  tickWaiting();
}
function stopWaiting() { clearInterval(state.waitTimer); state.waitTimer = 0; state.wait = null; }

const pdfFile = (p) => ({ name: p.name, size: p.size, pages: p.pages });

function mountIslands() {
  if (!ui) return;
  for (const host of els.log.querySelectorAll("[data-pdf]")) {
    const m = state.messages.find((x) => String(x.id) === host.dataset.pdf);
    if (!m || !m.pdf) continue;
    const pending = m.id === "pending";
    const h = ui.mountAttachment(host, { file: pdfFile(m.pdf), status: pending ? "reading" : "done", pagesRead: pending ? 0 : m.pdf.pages, duration: m.pdf.duration });
    islands.push(h);
    if (pending) state.pdfHandle = h;
  }
  const wait = els.log.querySelector(".kc-wait");
  if (wait && state.wait) { state.waitHandle = ui.mountLoading(wait, { steps: waitSteps(Date.now() - state.wait.t0) }); islands.push(state.waitHandle); }
}

function renderLog({ waiting = false } = {}) {
  stopTyping();
  dropIslands();
  const chat = state.chats.find((c) => c.id === state.chatId);
  els.title.textContent = chat ? chat.title : "";
  els.top.classList.toggle("is-empty", !chat); // ohne offenen Chat braucht nur das schmale Fenster die Leiste (für die Chatliste)
  if (!state.messages.length && !waiting) {
    els.log.innerHTML = '<p class="kc-hint">Wie kann ich helfen?</p>';
    return;
  }
  els.log.innerHTML = state.messages.map((m) => {
    const text = m.pdf ? m.text.replace(/\n\n📎 PDF angehängt$/, "") : m.text;
    return `<div class="kc-msg ${m.role === "user" ? "kc-user" : "kc-model"}${m.pdf ? " has-pdf" : ""}" data-mid="${esc(m.id)}">${m.steps ? stepsHtml(m.steps, { id: m.id, open: !!m.stepsOpen }) : ""}${m.pdf ? `<div class="kc-pdf" data-pdf="${esc(m.id)}"></div>` : ""}${m.imageUrl ? `<img class="kc-msg-img" src="${esc(m.imageUrl)}" alt="Angehängtes Bild">` : ""}${m.pdf ? (text.trim() && !m.noText ? `<div class="kc-user-text">${formatMessage(text)}</div>` : "") : formatMessage(text)}</div>`;
  }).join("") + (waiting ? waitHtml() : "");
  mountIslands();
  els.log.scrollTop = els.log.scrollHeight;
}

function setBusy(busy) {
  state.busy = busy;
  els.sendBtn.disabled = busy;
  els.newBtn.disabled = busy;
  els.sendBtn.disabled = busy || state.preparing;
  if (state.attachment) els.attachState.textContent = busy ? "Wird gelesen …" : `Bereit · ${formatBytes(state.attachment.size)} · nur für diese Frage`;
}

/* ---------- Anhang ---------- */

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

/** Verkleinert das Bild (Drehung laut Kamera wird übernommen) und macht ein JPEG, das klein genug zum Senden ist. */
async function prepareImage(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (_) {
    try { source = await loadImage(file); } catch (__) { throw new Error("Dieses Bild kann der Browser nicht öffnen."); }
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
  throw new Error("Das Bild ist zu groß. Wähle ein kleineres Bild.");
}

/** Seiten eines PDFs (pdf.js liegt lokal in /vendor/pdfjs); klappt es nicht, wird aus dem Dateiinhalt geschätzt. */
async function countPages(file) {
  try {
    const pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = doc.numPages;
    doc.destroy();
    return Math.max(1, n);
  } catch (_) {
    try { return Math.max(1, (new TextDecoder("latin1").decode(await file.arrayBuffer()).match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length); } catch (__) { return 1; }
  }
}

function clearAttachment() {
  if (state.attachment) URL.revokeObjectURL(state.attachment.url);
  state.attachment = null;
  els.attach.hidden = true;
  els.fileInput.value = "";
}

async function setAttachment(file) {
  if (!file || state.busy) return;
  const problem = checkAttachment(file);
  if (problem) { showError(problem); els.fileInput.value = ""; return; }
  showError("");
  clearAttachment();
  state.preparing = true;
  els.sendBtn.disabled = true;
  els.attach.hidden = false;
  els.attachImg.removeAttribute("src");
  els.attachDoc.classList.remove("is-pdf");
  els.attachName.textContent = file.name;
  els.attachState.textContent = "Wird vorbereitet …";
  try {
    const pdf = isPdfFile(file);
    const p = pdf ? { base64: await blobToBase64(file), blob: file } : await prepareImage(file);
    const url = pdf ? "" : URL.createObjectURL(p.blob);
    state.attachment = { base64: p.base64, url, name: file.name, size: p.blob.size, pdf, pages: pdf ? await countPages(file) : 0 };
    els.attachDoc.classList.toggle("is-pdf", pdf);
    if (url) els.attachImg.src = url;
    els.attachState.textContent = `Bereit · ${formatBytes(p.blob.size)} · nur für diese Frage`;
  } catch (e) {
    clearAttachment();
    showError(e.message);
  } finally {
    state.preparing = false;
    els.sendBtn.disabled = state.busy;
  }
}

function growInput() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px";
}

/* ---------- Aktionen ---------- */

function newChat() {
  if (state.busy) return;
  haptic("tap");
  state.loadToken++;
  state.chatId = null;
  state.messages = [];
  showError("");
  renderList();
  renderLog();
  els.input.focus();
}

async function openChat(id) {
  if (state.busy || id === state.chatId) return;
  const token = ++state.loadToken;
  state.chatId = id;
  state.messages = [];
  showError("");
  renderList();
  els.log.innerHTML = `<div class="kc-hint">${loaderHtml({ title: "Chat wird geladen …", size: "sm" })}</div>`;
  try {
    const messages = await loadMessages(id);
    if (token !== state.loadToken) return;
    state.messages = messages;
    renderLog();
  } catch (e) {
    if (token !== state.loadToken) return;
    console.error("KI-Chat: Chat laden", e);
    state.chatId = null;
    renderList();
    els.log.innerHTML = `<div class="kc-hint"><p>Der Chat konnte nicht geladen werden.</p><button class="btn btn-outline btn-sm" type="button" data-retry-chat="${esc(id)}">Noch einmal versuchen</button></div>`;
    haptic("error");
  }
}

async function send() {
  const text = els.input.value.trim();
  if ((!text && !state.attachment) || state.busy || state.preparing) return;
  if (text.length > MAX_TEXT) { showError(`Die Nachricht ist zu lang (höchstens ${MAX_TEXT} Zeichen).`); return; }
  showError("");
  haptic("send");
  setBusy(true);
  const token = state.loadToken;
  const attachment = state.attachment;
  if (attachment) els.attach.hidden = true; // die Karte steht ab jetzt in der Nachricht; die Anhangszeile unten verschwindet sofort
  const t0 = Date.now();
  if (!ui) ui = await loadIslands();
  const pdf = attachment && attachment.pdf ? { name: attachment.name, size: attachment.size, pages: attachment.pages || 1 } : null;
  state.messages.push({ id: "pending", role: "user", text, imageUrl: attachment ? attachment.url : "", pdf: pdf || undefined });
  els.input.value = "";
  growInput();
  const defs = [];
  if (state.chatId) defs.push({ id: "history", label: "Verlauf lesen" });
  if (attachment) defs.push({ id: "file", label: pdf ? "PDF lesen" : "Bild lesen" });
  defs.push({ id: "answer", label: "Antwort schreiben", lines: attachment ? ["Aufgabe verstehen", "Lösungsweg rechnen", "Lösung formulieren"] : [state.grade ? `Für Klasse ${state.grade}` : "Frage verstehen", "Antwort formulieren"] });
  state.wait = { defs, t0: Date.now(), pdf: pdf ? { file: pdfFile(pdf), pages: pdf.pages, read: 0 } : null };
  renderLog({ waiting: true });
  startWaiting(defs, state.wait.pdf);
  try {
    const r = await callFunction({ action: "send", chatId: state.chatId, text, grade: state.grade, image: attachment ? attachment.base64 : undefined });
    if (token !== state.loadToken) return;
    const sent = state.messages[state.messages.length - 1];
    sent.id = "u-" + r.reply.id;
    if (sent.pdf) { sent.pdf.duration = (Date.now() - t0) / 1000; sent.noText = !text; } // nur ein PDF ohne eigenen Text: keine Sprechblase
    if (attachment) { sent.text = (text || (attachment.pdf ? "Löse die Aufgaben in diesem PDF." : "Beschreibe das Bild.")) + `\n\n📎 ${attachment.pdf ? "PDF" : "Bild"} angehängt`; sent.imageUrl = ""; clearAttachment(); }
    state.messages.push({ id: r.reply.id, role: "model", text: r.reply.text, steps: cleanSteps(r.steps) });
    state.chatId = r.chat.id;
    state.chats = [r.chat, ...state.chats.filter((c) => c.id !== r.chat.id)];
    renderList();
    renderLog();
    typeMessage(els.log.lastElementChild);
    haptic("success");
  } catch (e) {
    haptic("error");
    if (token === state.loadToken) {
      state.messages.pop();   // die Frage wurde nicht gespeichert: zurück ins Eingabefeld
      if (state.attachment === attachment && attachment) els.attach.hidden = false; // und der Anhang zurück
      els.input.value = text;
      growInput();
      showError(e.message);
      renderLog();
    }
  } finally {
    stopWaiting();
    setBusy(false);
    if (token === state.loadToken) els.input.focus();
  }
}

/** Löscht einen Chat (ohne Angabe den offenen). Ist es der offene, wird die Unterhaltung geleert. */
async function removeChat(id = state.chatId) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat || state.busy) return;
  const ok = await confirmDialog({ title: "Chat löschen?", text: `„${chat.title}“ wird mit allen Nachrichten gelöscht. Das lässt sich nicht rückgängig machen.`, confirm: "Löschen" });
  if (!ok) return;
  haptic("warn");
  setBusy(true);
  try {
    await callFunction({ action: "delete", chatId: chat.id });
    state.chats = state.chats.filter((c) => c.id !== chat.id);
    if (chat.id === state.chatId) {
      state.chatId = null;
      state.messages = [];
      state.loadToken++;
      renderLog();
    }
    renderList();
    toast("Chat gelöscht.");
    haptic("success");
  } catch (e) {
    haptic("error");
    showError(e.message);
  } finally {
    setBusy(false);
  }
}

/* ---------- Start ---------- */

els.newBtn.addEventListener("click", () => { toggleSide(false, { quiet: true }); newChat(); });
/** Chatliste im schmalen Fenster ein- und ausklappen (im breiten ist sie immer da). */
function toggleSide(open, { quiet = false } = {}) {
  const was = els.side.classList.contains("is-open");
  if (was === open) return;
  els.side.classList.toggle("is-open", open);
  els.scrim.classList.toggle("is-open", open);
  els.sideToggle.setAttribute("aria-expanded", String(open));
  if (!quiet) haptic(open ? "open" : "close");
  if (open) els.sideClose.focus({ preventScroll: true });
  else if (els.side.contains(document.activeElement)) els.sideToggle.focus({ preventScroll: true });
}
els.sideToggle.addEventListener("click", () => toggleSide(!els.side.classList.contains("is-open")));
els.sideClose.addEventListener("click", () => toggleSide(false));
els.scrim.addEventListener("click", () => toggleSide(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuEl && els.side.classList.contains("is-open")) toggleSide(false); });
/* Wischen nach links schließt die Liste */
{
  let x0 = null, y0 = 0;
  els.side.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  els.side.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) toggleSide(false);
  }, { passive: true });
}
/* Im breiten Fenster ist die Liste immer da: offenen Zustand zurücksetzen */
matchMedia("(min-width: 900px)").addEventListener("change", (m) => { if (m.matches) toggleSide(false, { quiet: true }); });
els.list.addEventListener("click", (e) => {
  const more = e.target.closest("[data-more]");
  if (more) { openMenu(more, e.detail === 0); return; }
  const b = e.target.closest("[data-id]");
  if (b) { haptic("tap"); toggleSide(false, { quiet: true }); openChat(b.dataset.id); }
});
els.list.addEventListener("keydown", (e) => {
  if (!e.target.matches(".kc-rename")) return;
  if (e.key === "Enter") { e.preventDefault(); finishRename(true); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishRename(false); }
});
els.list.addEventListener("focusout", (e) => { if (e.target.matches(".kc-rename")) finishRename(true); });
/* Schrittliste unter einer Antwort auf- und zuklappen; der Zustand bleibt, wenn der Chat neu gezeichnet wird */
els.log.addEventListener("click", async (e) => {
  const sol = e.target.closest("[data-solution]");
  if (sol) {
    const text = sol.closest(".kc-solution").querySelector(".kc-solution-body").textContent;
    haptic("tap");
    if (sol.dataset.solution === "goodnotes") {
      try { sessionStorage.setItem(HANDOFF_KEY, makeHandoff(text, suggestName(text))); } catch (_) { toast("Das Einfügen klappt in diesem Browser nicht. Kopiere den Text stattdessen.", { error: true }); return; }
      location.href = "/tools/goodnotes/";
      return;
    }
    try { await navigator.clipboard.writeText(text); } catch (_) {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (__) { /* nichts mehr zu tun */ }
      ta.remove();
    }
    const label = sol.querySelector("span");
    label.textContent = "Kopiert";
    setTimeout(() => { label.textContent = "Kopieren"; }, 1600);
    return;
  }
  const retry = e.target.closest("[data-retry-chat]");
  if (retry) { haptic("tap"); const id = retry.dataset.retryChat; state.chatId = null; openChat(id); return; }
  const head = e.target.closest(".kc-tools-head");
  if (!head) return;
  const box = head.closest(".kc-tools");
  const open = !box.classList.contains("is-open");
  haptic("select");
  box.classList.toggle("is-open", open);
  head.setAttribute("aria-expanded", String(open));
  box.querySelector(".kc-tools-list").hidden = !open;
  const msg = state.messages.find((m) => String(m.id) === head.closest("[data-mid]").dataset.mid);
  if (msg) msg.stepsOpen = open;
});
/* Datei hereinziehen: dunkler Hintergrund und Ablagefläche. Ablegen irgendwo im Fenster nimmt die Datei als Anhang. */
const dropScrim = $("dropScrim");
let dropHandle = null, dropKey = 0, dragDepth = 0;
const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
function showDrop(on) {
  dropScrim.classList.toggle("is-on", on);
  if (!on) setTimeout(() => { if (dropHandle && !dropScrim.classList.contains("is-on")) dropHandle.update({ onFile: takeDropped, resetKey: ++dropKey }); }, 300);
}
function takeDropped(file) { showDrop(false); setAttachment(file); }
async function setupDrop() {
  const m = ui || await loadIslands();
  if (m && !dropHandle) dropHandle = m.mountDropzone($("dropZone"), { onFile: takeDropped, resetKey: dropKey });
}
window.addEventListener("dragenter", (e) => { if (!hasFiles(e) || els.app.hidden || state.busy) return; dragDepth++; showDrop(true); });
window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) showDrop(false); });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  const inZone = e.target instanceof Element && e.target.closest(".kc-dropzone button"); // dort nimmt die Ablagefläche die Datei selbst
  showDrop(false);
  if (!inZone && !els.app.hidden && !state.busy && e.dataTransfer.files[0]) { haptic("tap"); setAttachment(e.dataTransfer.files[0]); }
});
window.addEventListener("dragend", () => { dragDepth = 0; showDrop(false); });

els.fileInput.addEventListener("change", () => { haptic("tap"); setAttachment(els.fileInput.files[0]); });
els.attachRemove.addEventListener("click", () => { if (!state.busy) { haptic("tap"); clearAttachment(); showError(""); } });
/* Klassenwahl: gemerkt im Browser (localStorage, nur diese Einstellung) */
const GRADE_KEY = "pensum.kichat.grade";
try { state.grade = cleanGrade(localStorage.getItem(GRADE_KEY)) || DEFAULT_GRADE; } catch (_) { /* privater Modus: Standard */ }
els.grade.value = String(state.grade);
els.grade.addEventListener("change", () => {
  haptic("select");
  state.grade = cleanGrade(els.grade.value) || DEFAULT_GRADE;
  try { localStorage.setItem(GRADE_KEY, String(state.grade)); } catch (_) { /* nicht schlimm */ }
});
els.form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
els.input.addEventListener("input", growInput);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});

let startedFor = null;

async function start(user) {
  startedFor = user.$id;
  let member = false;
  try {
    const r = await new Teams(client).list();
    member = (r.teams || []).some((t) => t.$id === config.kiTesterTeam);
  } catch (_) { /* ohne Antwort bleibt der Chat zu */ }
  if (startedFor !== user.$id) return;
  els.denied.hidden = member;
  els.app.hidden = !member;
  if (!member) return;
  state.userId = user.$id;
  setupDrop();
  renderLog();
  await reloadChats(user.$id);
  if (startedFor !== user.$id) return;
  if (matchMedia("(min-width: 900px)").matches) els.input.focus(); // am Handy sonst springt die Tastatur sofort auf
}

/** Chatliste laden: mit Ladeanzeige und bei Fehler mit „Noch einmal“-Knopf. */
async function reloadChats(uid) {
  state.listLoading = true; state.listFailed = false;
  els.listState.hidden = false;
  els.listState.innerHTML = loaderHtml({ title: "Chats werden geladen …", size: "sm" });
  renderList();
  try {
    await loadChats();
  } catch (e) {
    console.error("KI-Chat: Chats laden", e);
    state.listFailed = true;
  }
  if (startedFor !== uid) return;
  state.listLoading = false;
  if (state.listFailed) {
    els.listState.innerHTML = 'Chats konnten nicht geladen werden.<br><button class="btn btn-outline btn-sm kc-list-retry" type="button" id="listRetry">Noch einmal versuchen</button>';
  } else {
    els.listState.hidden = true;
    els.listState.textContent = "";
  }
  renderList();
}
els.listState.addEventListener("click", (e) => { if (e.target.closest("#listRetry")) { haptic("tap"); reloadChats(startedFor); } });

onAuthChange(({ status, user }) => {
  if (status !== "ready") return;
  els.gate.hidden = !!user;
  if (!user) {
    startedFor = null;
    els.denied.hidden = true;
    els.app.hidden = true;
    state.chats = []; state.chatId = null; state.messages = [];
    return;
  }
  if (startedFor !== user.$id) start(user);
});

/* Höhe der Navigationsleiste: Die Ecke oben links (Symbol + Name) füllt diese Höhe, damit sie nahtlos in die Chatliste übergeht */
{
  const nav = document.querySelector("pensum-nav");
  const setNavHeight = () => nav && document.body.style.setProperty("--kc-nav", Math.round(nav.getBoundingClientRect().height) + "px");
  if (nav && "ResizeObserver" in window) new ResizeObserver(setNavHeight).observe(nav);
  setNavHeight();
}
