/* Planer – Oberfläche. Logik: core.js · Speicher: store.js (Gast = localStorage, Konto = Appwrite) · Login: /js/auth.js
 * Zwei Bereiche: Hausaufgaben (nach Dringlichkeit gruppiert) und Klausuren (Countdown, Link zu Karteikarten-Stapeln). */
import { onAuthChange, onBeforeLogout } from "/js/auth.js";
import { esc, toast, confirmDialog, closeIcon } from "/js/shell.js";
import { MAX_ITEMS, todayISO, dueLabel, daysUntil, formatDate, examCountdown, groupTasks, splitExams, stats, usedSubjects } from "./core.js";
import { createGuestStore, createCloudStore, newId } from "./store.js";
import { createGuestStore as createDeckGuest, createCloudStore as createDeckCloud } from "/tools/karteikarten/store.js";

const app = document.getElementById("app");
const guest = createGuestStore();
let store = guest;
let user = null;
let data = { items: [] };
let decks = [];            // Karteikarten-Stapel { id, name } zum Verknüpfen
let tab = "task";          // "task" | "exam"
let booting = true;
let saveStatus = "saved";
let loadToken = 0;
let warned = false;
let today = todayISO();

const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* egal */ } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const byId = (id) => data.items.find((i) => i.id === id);
const items = (kind) => data.items.filter((i) => i.kind === kind);

function persist() {
  if (store.save(data) === false && !warned) {
    warned = true;
    toast("Der Browser verweigert das Speichern. Deine Einträge gehen beim Schließen verloren.", { error: true });
  }
}

/* ---------- Speicher-Hinweis ---------- */

function noteHtml() {
  if (booting) return "";
  if (!user) return '<span class="dot-s is-hollow"></span><span>Nur auf diesem Gerät gespeichert. <button type="button" class="text-link" data-auth-action="login">Anmelden</button>, um alles in deinem Konto zu sichern.</span>';
  if (saveStatus === "saving") return '<span class="dot-s is-hollow"></span><span>Speichert …</span>';
  if (saveStatus === "error") return '<span class="dot-s is-hollow"></span><span>Speichern fehlgeschlagen. Es wird erneut versucht, sobald du wieder online bist.</span>';
  return '<span class="dot-s"></span><span>In deinem Konto gespeichert, auf allen deinen Geräten.</span>';
}
const updateNote = () => { const el = document.getElementById("plNote"); if (el) el.innerHTML = noteHtml(); };

function onSaveStatus(status, error) {
  const was = saveStatus;
  saveStatus = status;
  updateNote();
  if (status === "error" && was !== "error") {
    console.error(error);
    toast("Speichern fehlgeschlagen. Prüfe deine Verbindung, die Änderung ist noch nicht im Konto.", { error: true });
  }
}

/* ---------- Anzeige ---------- */

function taskRow(t, { done = false } = {}) {
  const diff = daysUntil(t.date, today);
  const cls = diff != null && diff < 0 ? "is-late" : diff === 0 ? "is-today" : "";
  return `
    <li class="pl-row ${done ? "is-done" : ""}" data-id="${esc(t.id)}">
      <button class="pl-check" type="button" data-act="toggle" aria-label="${done ? "Wieder öffnen" : "Als erledigt markieren"}: ${esc(t.title)}" aria-pressed="${done}"><i>${done ? "✓" : ""}</i></button>
      <div class="pl-body">
        <span class="pl-title">${esc(t.title)}</span>
        <div class="pl-meta">
          ${t.subject ? `<span class="badge badge-soft">${esc(t.subject)}</span>` : ""}
          ${done ? "" : `<span class="pl-due ${cls}">${esc(dueLabel(t.date, today))}</span>`}
        </div>
        ${t.note ? `<p class="pl-text">${esc(t.note)}</p>` : ""}
      </div>
      <div class="pl-actions">
        <button class="icon-btn" type="button" data-act="edit" aria-label="Bearbeiten">${ICON.edit}</button>
        <button class="icon-btn" type="button" data-act="delete" aria-label="Löschen">${ICON.trash}</button>
      </div>
    </li>`;
}

function renderTasks() {
  const tasks = items("task");
  const groups = groupTasks(tasks, today);
  const done = tasks.filter((t) => t.done);
  return `
    <form class="pl-quick" id="quickForm" novalidate>
      <label class="sr-only" for="quickTitle">Neue Hausaufgabe</label>
      <input class="input" id="quickTitle" maxlength="120" autocomplete="off" placeholder="Neue Hausaufgabe eintippen und Enter …">
      <button class="btn btn-primary" type="submit">Hinzufügen</button>
    </form>
    ${groups.length ? groups.map((g) => `
      <section class="pl-group is-${g.key}" aria-label="${esc(g.label)}">
        <h2>${esc(g.label)} · ${g.items.length}</h2>
        <ul class="pl-list">${g.items.map((t) => taskRow(t)).join("")}</ul>
      </section>`).join("") : `
      <div class="pl-empty">
        <h2 class="h4">${tasks.length ? "Alles erledigt." : "Noch keine Hausaufgaben."}</h2>
        <p>${tasks.length ? "Keine offenen Aufgaben. Genieß die freie Zeit." : "Tipp oben eine Aufgabe ein, mit „Neue Hausaufgabe“ trägst du auch Fach, Fälligkeit und Notiz ein."}</p>
      </div>`}
    ${done.length ? `
      <details class="pl-details">
        <summary>Erledigt (${done.length})</summary>
        <ul class="pl-list">${done.map((t) => taskRow(t, { done: true })).join("")}</ul>
        <div class="row" style="padding:0 var(--s-sm) var(--s-sm)"><button class="btn btn-soft btn-sm" type="button" data-act="clear-done">Erledigte löschen</button></div>
      </details>` : ""}`;
}

function examCard(e) {
  const c = examCountdown(e.date, today);
  const deck = e.deckId ? decks.find((d) => d.id === e.deckId) : null;
  return `
    <li class="pl-exam" data-id="${esc(e.id)}">
      <div class="pl-count is-${c.state} ${c.big.length > 3 ? "is-big" : ""}"><b>${esc(c.big)}</b><span>${esc(c.small)}</span></div>
      <div class="pl-exam-main">
        <span class="pl-title">${esc(e.title)}</span>
        <div class="pl-meta">
          ${e.subject ? `<span class="badge badge-soft">${esc(e.subject)}</span>` : ""}
          <span>${esc(e.date ? formatDate(e.date, today) : "Ohne Datum")}</span>
        </div>
        ${e.note ? `<p class="pl-text">${esc(e.note)}</p>` : ""}
        <div class="pl-exam-actions">
          ${deck ? `<a class="btn btn-primary btn-sm" href="/tools/karteikarten/#deck=${encodeURIComponent(deck.id)}">Karteikarten lernen</a>` : ""}
          <button class="icon-btn" type="button" data-act="edit" aria-label="Bearbeiten">${ICON.edit}</button>
          <button class="icon-btn" type="button" data-act="delete" aria-label="Löschen">${ICON.trash}</button>
        </div>
      </div>
    </li>`;
}

function renderExams() {
  const { upcoming, past } = splitExams(items("exam"), today);
  return `
    ${upcoming.length ? `<ul class="pl-exams">${upcoming.map(examCard).join("")}</ul>` : `
      <div class="pl-empty">
        <h2 class="h4">Keine Klausuren geplant.</h2>
        <p>Trag deine nächsten Klausuren ein. Du siehst, wie viele Tage noch bleiben, und kannst einen Karteikarten-Stapel zum Lernen verknüpfen.</p>
        <button class="btn btn-primary" type="button" data-act="new">Klausur eintragen</button>
      </div>`}
    ${past.length ? `<details class="pl-details"><summary>Vergangene Klausuren (${past.length})</summary><ul class="pl-exams" style="padding:0 var(--s-sm) var(--s-sm)">${past.map(examCard).join("")}</ul></details>` : ""}`;
}

function render() {
  if (booting) {
    app.innerHTML = '<section class="pl-empty" role="status"><h2 class="h4">Dein Planer wird geladen …</h2></section>';
    return;
  }
  today = todayISO();
  const s = stats(data.items, today);
  const nextTxt = s.nextExam ? (s.nextExamDays === 0 ? "Heute" : s.nextExamDays === 1 ? "Morgen" : `${s.nextExamDays} Tage`) : "–";
  const openTasks = items("task").filter((t) => !t.done).length;
  const exams = splitExams(items("exam"), today).upcoming.length;
  app.innerHTML = `
    <section class="pl-hero" aria-labelledby="plTitle">
      <div class="pl-hero-top">
        <h1 id="plTitle">Planer.</h1>
        <button class="btn btn-primary" type="button" data-act="new">${tab === "task" ? "+ Neue Hausaufgabe" : "+ Neue Klausur"}</button>
      </div>
      <div class="pl-stats">
        <div class="pl-stat"><b>${s.open}</b><span>offen</span></div>
        <div class="pl-stat ${s.overdue || s.dueToday ? "is-alert" : ""}"><b>${s.overdue + s.dueToday}</b><span>${s.overdue ? "überfällig/heute" : "heute fällig"}</span></div>
        <div class="pl-stat ${s.nextExamDays != null && s.nextExamDays <= 3 ? "is-alert" : ""}"><b>${esc(nextTxt)}</b><span>${s.nextExam ? "bis " + esc(s.nextExam.subject || "Klausur") : "nächste Klausur"}</span></div>
      </div>
      <p class="pl-note" id="plNote">${noteHtml()}</p>
    </section>
    <div class="segmented pl-tabs" role="tablist" aria-label="Bereiche">
      <button type="button" role="tab" data-act="tab" data-tab="task" aria-selected="${tab === "task"}">Hausaufgaben (${openTasks})</button>
      <button type="button" role="tab" data-act="tab" data-tab="exam" aria-selected="${tab === "exam"}">Klausuren (${exams})</button>
    </div>
    <div class="pl-panel" role="tabpanel">${tab === "task" ? renderTasks() : renderExams()}</div>`;
}

/* ---------- Dialog: Eintrag anlegen/bearbeiten ---------- */

function itemDialog(kind, item) {
  const creating = !item;
  const isExam = kind === "exam";
  const d = document.createElement("dialog");
  d.className = "modal";
  const subjects = usedSubjects(data.items);
  d.innerHTML = `
    <form class="modal-body pl-form" method="dialog" novalidate>
      <div class="modal-head"><h2 class="h3">${isExam ? (creating ? "Neue Klausur." : "Klausur bearbeiten.") : (creating ? "Neue Hausaufgabe." : "Hausaufgabe bearbeiten.")}</h2><button type="button" class="icon-btn" data-close aria-label="Schließen">${closeIcon}</button></div>
      <label class="field"><span class="field-label">${isExam ? "Bezeichnung" : "Aufgabe"}</span><input class="input" name="title" maxlength="120" autocomplete="off" placeholder="${isExam ? "z. B. Klassenarbeit 2" : "z. B. Seite 42, Aufgabe 3 bis 5"}" value="${esc(item ? item.title : "")}" required></label>
      <div class="row2">
        <label class="field"><span class="field-label">Fach</span><input class="input" name="subject" list="subjectList" maxlength="60" autocomplete="off" placeholder="z. B. Mathe" value="${esc(item ? item.subject : "")}"><datalist id="subjectList">${subjects.map((s) => `<option value="${esc(s)}">`).join("")}</datalist></label>
        <label class="field"><span class="field-label">${isExam ? "Datum" : "Fällig am"}</span><input class="input" type="date" name="date" value="${esc(item ? item.date : "")}"></label>
      </div>
      <label class="field"><span class="field-label">${isExam ? "Themen" : "Notiz"} (optional)</span><textarea class="textarea" name="note" maxlength="500" style="min-height:96px" placeholder="${isExam ? "z. B. Bruchrechnen, Gleichungen" : ""}">${esc(item ? item.note : "")}</textarea></label>
      ${isExam ? `<label class="field"><span class="field-label">Karteikarten-Stapel zum Lernen</span>
        <select class="select" name="deckId"><option value="">Keiner</option>${decks.map((k) => `<option value="${esc(k.id)}" ${item && item.deckId === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        ${decks.length ? "" : '<span class="field-hint">Du hast noch keine Karteikarten-Stapel. Lege im Karteikarten-Modul einen an.</span>'}</label>` : ""}
      <p class="form-message" role="alert" hidden></p>
      <button class="btn btn-primary btn-wide" type="submit">${creating ? "Eintragen" : "Speichern"}</button>
    </form>`;
  document.body.append(d);
  const form = d.querySelector("form");
  const msg = d.querySelector(".form-message");
  d.querySelector("[data-close]").addEventListener("click", () => d.close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    if (!title) { msg.textContent = "Gib einen Titel ein."; msg.hidden = false; return; }
    if (creating && data.items.length >= MAX_ITEMS) { msg.textContent = "Du hast die maximale Anzahl an Einträgen erreicht. Lösche alte Einträge."; msg.hidden = false; return; }
    const fields = {
      title,
      subject: String(fd.get("subject") || "").trim(),
      date: String(fd.get("date") || ""),
      note: String(fd.get("note") || "").trim(),
      deckId: isExam ? String(fd.get("deckId") || "") : "",
    };
    if (creating) data.items.push({ id: newId(), kind, done: false, ...fields });
    else Object.assign(item, fields);
    persist();
    d.close();
    render();
    if (creating) toast(isExam ? "Klausur eingetragen." : "Hausaufgabe eingetragen.");
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  form.elements.title.focus();
}

/* ---------- Ereignisse ---------- */

app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const row = el.closest("[data-id]");
  const item = row ? byId(row.dataset.id) : null;

  if (act === "tab") { tab = el.dataset.tab; render(); }
  else if (act === "new") itemDialog(tab);
  else if (act === "edit" && item) itemDialog(item.kind, item);
  else if (act === "toggle" && item) {
    buzz(item.done ? 8 : 16);
    item.done = !item.done;
    persist();
    row.classList.add("leaving");
    setTimeout(render, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280);
  } else if (act === "delete" && item) {
    if (item.kind === "exam" && !(await confirmDialog({ title: "Klausur löschen?", text: `„${item.title}“ wird gelöscht.`, confirm: "Löschen" }))) return;
    data.items = data.items.filter((i) => i.id !== item.id);
    persist();
    render();
    toast("Gelöscht.");
  } else if (act === "clear-done") {
    if (await confirmDialog({ title: "Erledigte löschen?", text: "Alle erledigten Hausaufgaben werden gelöscht.", confirm: "Löschen" })) {
      data.items = data.items.filter((i) => !(i.kind === "task" && i.done));
      persist();
      render();
    }
  }
});

app.addEventListener("submit", (e) => {
  if (e.target.id !== "quickForm") return;
  e.preventDefault();
  const input = document.getElementById("quickTitle");
  const title = input.value.trim();
  if (!title) { input.focus(); return; }
  if (data.items.length >= MAX_ITEMS) { toast("Du hast die maximale Anzahl an Einträgen erreicht.", { error: true }); return; }
  data.items.push({ id: newId(), kind: "task", title, subject: "", date: "", note: "", done: false, deckId: "" });
  persist();
  buzz(10);
  render();
  document.getElementById("quickTitle").focus({ preventScroll: true });
});

// Neuer Tag während die Seite offen ist: Fälligkeiten neu berechnen
document.addEventListener("visibilitychange", () => { if (!document.hidden && !booting && todayISO() !== today) render(); });

/* ---------- Konto: laden, Gast-Daten übernehmen ---------- */

async function loadDecks(u, token) {
  try {
    const list = u ? (await createDeckCloud(u).load()).decks : createDeckGuest().peek().decks;
    if (token === loadToken) { decks = list.map((d) => ({ id: d.id, name: d.name })); }
  } catch (_) { /* ohne Stapel-Liste geht es auch */ }
}

const DECLINED_KEY = "pensum.planer.declined.v1";
const declined = () => { try { return JSON.parse(localStorage.getItem(DECLINED_KEY) || "[]"); } catch (_) { return []; } };

async function offerImport(token) {
  const local = guest.peek();
  if (!local.items.length || declined().includes(user.$id)) return;
  const ok = await confirmDialog({
    title: "Lokale Einträge übernehmen?",
    text: `Auf diesem Gerät ${local.items.length === 1 ? "liegt 1 Eintrag" : `liegen ${local.items.length} Einträge`} aus dem Gast-Modus. Sollen sie in dein Konto übernommen werden? Sonst bleiben sie getrennt auf diesem Gerät.`,
    confirm: "Ins Konto übernehmen",
    cancel: "Nicht übernehmen",
  });
  if (token !== loadToken || !user) return;
  if (!ok) {
    try { localStorage.setItem(DECLINED_KEY, JSON.stringify([...new Set([...declined(), user.$id])])); } catch (_) { /* egal */ }
    return;
  }
  const room = MAX_ITEMS - data.items.length;
  const take = local.items.slice(0, Math.max(0, room)).map((i) => ({ ...i, id: newId(), deckId: "" })); // Stapel-IDs gelten nur im Gast-Modus
  data.items.push(...take);
  persist();
  guest.clear();
  render();
  toast(`${plural(take.length, "Eintrag", "Einträge")} in dein Konto übernommen.`);
}

render();

onAuthChange(async ({ status, user: u }) => {
  if (status !== "ready") return;
  const token = ++loadToken;
  user = u;
  store = u ? createCloudStore(u, onSaveStatus) : guest;
  saveStatus = "saved";
  booting = true;
  render();
  try {
    const [loaded] = await Promise.all([store.load(), loadDecks(u, token)]);
    if (token !== loadToken) return;
    data = loaded;
  } catch (err) {
    if (token !== loadToken) return;
    console.error(err);
    data = { items: [] };
    store = guest; // nichts Falsches ins Konto schreiben
    toast("Dein Planer konnte nicht geladen werden. Lade die Seite neu, wenn du wieder online bist.", { error: true });
  }
  booting = false;
  render();
  if (u) offerImport(token);
});

onBeforeLogout(() => store.flush());
addEventListener("pagehide", () => { store.flush(); });
