/* KI-Chat – Oberfläche.
 * Chats und Nachrichten liegen in den Tabellen chats und chat_messages (nur für die eigene Person lesbar, js/db.js).
 * Geschrieben werden sie von der Appwrite-Function „ki-chat“ (functions/ki-chat): Sie hält den Gemini-Schlüssel,
 * prüft das Team „ki-tester“ und speichert Frage und Antwort. Dieses Modul liest nur und löscht über die Function. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { esc, toast, confirmDialog } from "/js/shell.js";
import { Teams, Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { tableIds, Query, listAllRows } from "/js/db.js";
import { fitSize, MAX_BASE64, QUALITIES } from "/tools/abschreiben/core.js";
import { loaderHtml } from "/js/loader.js";
import { formatMessage, sortMessages, MAX_TEXT, MAX_TITLE, cleanTitle, LOADING_TEXTS, DEFAULT_GRADE, cleanGrade, waveHtml, formatBytes, checkAttachment, stepsHtml, cleanSteps } from "./core.js";

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), denied: $("denied"), app: $("app"),
  list: $("chatList"), listEmpty: $("listEmpty"), newBtn: $("newBtn"),
  title: $("chatTitle"), top: $("top"), side: $("side"), sideToggle: $("sideToggle"), deleteBtn: $("deleteBtn"), log: $("log"), error: $("error"),
  form: $("form"), input: $("input"), sendBtn: $("sendBtn"),
  attach: $("attach"), attachImg: $("attachImg"), attachName: $("attachName"), attachState: $("attachState"), attachRemove: $("attachRemove"),
  fileInput: $("fileInput"), grade: $("grade"),
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

async function loadChats() {
  const rows = await listAllRows(tableIds.chats, [Query.equal("userId", state.userId), Query.orderDesc("$updatedAt")]);
  state.chats = rows.map(toChat);
}

async function loadMessages(chatId) {
  const rows = await listAllRows(tableIds.chatMessages, [Query.equal("chatId", chatId), Query.orderAsc("$createdAt")]);
  return sortMessages(rows).map((r) => ({ id: r.$id, role: r.role, text: r.text }));
}

/* ---------- Anzeige ---------- */

const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

function renderList() {
  closeMenu();
  els.listEmpty.hidden = state.chats.length > 0;
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

/** Warteanzeige: Wörter wechseln, Buchstaben leuchten als Welle auf, daneben die Sekunden. */
function waitHtml(word, seconds) {
  return `<div class="kc-msg kc-model kc-wait" role="status"><span class="sr-only">Die KI antwortet</span><span aria-hidden="true"><span class="kc-wait-word" data-word="${esc(word)}">${waveHtml(word)}</span><span class="kc-wait-time">${seconds}s</span></span></div>`;
}

function startWaiting() {
  stopWaiting();
  const words = LOADING_TEXTS;
  const t0 = Date.now();
  state.waitTimer = setInterval(() => {
    const el = els.log.querySelector(".kc-wait");
    if (!el) return;
    const ms = Date.now() - t0;
    const word = words[Math.min(Math.floor(ms / 1800), words.length - 1)];
    const cur = el.querySelector(".kc-wait-word");
    if (cur.dataset.word !== word) { cur.dataset.word = word; cur.innerHTML = waveHtml(word); }
    el.querySelector(".kc-wait-time").textContent = Math.floor(ms / 1000) + "s";
  }, 400);
}
function stopWaiting() { clearInterval(state.waitTimer); state.waitTimer = 0; }

function renderLog({ waiting = false } = {}) {
  const chat = state.chats.find((c) => c.id === state.chatId);
  els.title.textContent = chat ? chat.title : "";
  els.deleteBtn.hidden = !chat;
  els.top.classList.toggle("is-empty", !chat); // ohne offenen Chat braucht nur das schmale Fenster die Leiste (für die Chatliste)
  if (!state.messages.length && !waiting) {
    els.log.innerHTML = '<p class="kc-hint">Wie kann ich helfen?</p>';
    return;
  }
  els.log.innerHTML = state.messages.map((m) => `<div class="kc-msg ${m.role === "user" ? "kc-user" : "kc-model"}" data-mid="${esc(m.id)}">${m.steps ? stepsHtml(m.steps, { id: m.id, open: !!m.stepsOpen }) : ""}${m.imageUrl ? `<img class="kc-msg-img" src="${esc(m.imageUrl)}" alt="Angehängtes Bild">` : ""}${formatMessage(m.text)}</div>`).join("")
    + (waiting ? waitHtml(LOADING_TEXTS[0], 0) : "");
  els.log.scrollTop = els.log.scrollHeight;
}

function setBusy(busy) {
  state.busy = busy;
  els.sendBtn.disabled = busy;
  els.newBtn.disabled = busy;
  els.deleteBtn.disabled = busy;
  els.sendBtn.disabled = busy || state.preparing;
  els.attach.classList.toggle("is-reading", busy && !!state.attachment);
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

function clearAttachment() {
  if (state.attachment) URL.revokeObjectURL(state.attachment.url);
  state.attachment = null;
  els.attach.hidden = true;
  els.attach.classList.remove("is-reading");
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
  els.attachName.textContent = file.name;
  els.attachState.textContent = "Wird vorbereitet …";
  try {
    const p = await prepareImage(file);
    const url = URL.createObjectURL(p.blob);
    state.attachment = { base64: p.base64, url, name: file.name, size: p.blob.size };
    els.attachImg.src = url;
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
    els.log.innerHTML = "";
    showError("Der Chat konnte nicht geladen werden. Versuch es noch einmal.");
  }
}

async function send() {
  const text = els.input.value.trim();
  if ((!text && !state.attachment) || state.busy || state.preparing) return;
  if (text.length > MAX_TEXT) { showError(`Die Nachricht ist zu lang (höchstens ${MAX_TEXT} Zeichen).`); return; }
  showError("");
  setBusy(true);
  const token = state.loadToken;
  const attachment = state.attachment;
  state.messages.push({ id: "pending", role: "user", text, imageUrl: attachment ? attachment.url : "" });
  els.input.value = "";
  growInput();
  renderLog({ waiting: true });
  startWaiting();
  try {
    const r = await callFunction({ action: "send", chatId: state.chatId, text, grade: state.grade, image: attachment ? attachment.base64 : undefined });
    if (token !== state.loadToken) return;
    const sent = state.messages[state.messages.length - 1];
    sent.id = "u-" + r.reply.id;
    if (attachment) { sent.text = (text || "Beschreibe das Bild.") + "\n\n📎 Bild angehängt"; sent.imageUrl = ""; clearAttachment(); }
    state.messages.push({ id: r.reply.id, role: "model", text: r.reply.text, steps: cleanSteps(r.steps) });
    state.chatId = r.chat.id;
    state.chats = [r.chat, ...state.chats.filter((c) => c.id !== r.chat.id)];
    renderList();
    renderLog();
  } catch (e) {
    if (token === state.loadToken) {
      state.messages.pop();   // die Frage wurde nicht gespeichert: zurück ins Eingabefeld
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
  } catch (e) {
    showError(e.message);
  } finally {
    setBusy(false);
  }
}

/* ---------- Start ---------- */

els.newBtn.addEventListener("click", () => { toggleSide(false); newChat(); });
els.deleteBtn.addEventListener("click", () => removeChat());
/** Chatliste im schmalen Fenster ein- und ausklappen (im breiten ist sie immer da). */
function toggleSide(open) {
  els.side.classList.toggle("is-open", open);
  els.sideToggle.setAttribute("aria-expanded", String(open));
}
els.sideToggle.addEventListener("click", () => toggleSide(!els.side.classList.contains("is-open")));
els.list.addEventListener("click", (e) => {
  const more = e.target.closest("[data-more]");
  if (more) { openMenu(more, e.detail === 0); return; }
  const b = e.target.closest("[data-id]");
  if (b) { toggleSide(false); openChat(b.dataset.id); }
});
els.list.addEventListener("keydown", (e) => {
  if (!e.target.matches(".kc-rename")) return;
  if (e.key === "Enter") { e.preventDefault(); finishRename(true); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishRename(false); }
});
els.list.addEventListener("focusout", (e) => { if (e.target.matches(".kc-rename")) finishRename(true); });
/* Schrittliste unter einer Antwort auf- und zuklappen; der Zustand bleibt, wenn der Chat neu gezeichnet wird */
els.log.addEventListener("click", (e) => {
  const head = e.target.closest(".kc-tools-head");
  if (!head) return;
  const box = head.closest(".kc-tools");
  const open = !box.classList.contains("is-open");
  box.classList.toggle("is-open", open);
  head.setAttribute("aria-expanded", String(open));
  box.querySelector(".kc-tools-list").hidden = !open;
  const msg = state.messages.find((m) => String(m.id) === head.closest("[data-mid]").dataset.mid);
  if (msg) msg.stepsOpen = open;
});
els.fileInput.addEventListener("change", () => setAttachment(els.fileInput.files[0]));
els.attachRemove.addEventListener("click", () => { if (!state.busy) { clearAttachment(); showError(""); } });
/* Klassenwahl: gemerkt im Browser (localStorage, nur diese Einstellung) */
const GRADE_KEY = "pensum.kichat.grade";
try { state.grade = cleanGrade(localStorage.getItem(GRADE_KEY)) || DEFAULT_GRADE; } catch (_) { /* privater Modus: Standard */ }
els.grade.value = String(state.grade);
els.grade.addEventListener("change", () => {
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
  renderLog();
  try {
    await loadChats();
  } catch (_) {
    showError("Deine Chats konnten nicht geladen werden. Lade die Seite neu.");
  }
  if (startedFor !== user.$id) return;
  renderList();
  els.input.focus();
}

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
