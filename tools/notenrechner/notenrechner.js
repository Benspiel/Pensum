/* Notenrechner – Oberfläche. Pro Fach wird eine Zeugnisnote eingetragen, daraus entsteht der Zeugnisdurchschnitt.
 * Rechnen: core.js · Speichern: store.js (Gast = localStorage, Konto = Appwrite) · Login: /js/auth.js */
import { onAuthChange, onBeforeLogout, getPrefs, savePrefs } from "/js/auth.js";
import { toast, confirmDialog, esc, closeIcon } from "/js/shell.js";
import {
  SYSTEMS, DEFAULT_SUBJECTS, MORE_SUBJECTS, convert, parseGrade, overallAverage, subjectAverage,
  formatNumber, formatInput, formatOther, schoolYearOf, halfOf, schoolYearOptions, pointsToNote, noteToPoints,
} from "./core.js";
import { createGuestStore, createCloudStore, importGuestData } from "./store.js";

const VIEW_KEY = "pensum.notenrechner.view.v1";
const DECLINED_KEY = "pensum.notenrechner.importDeclined.v1";

const $ = (id) => document.getElementById(id);
const els = {
  year: $("yearSelect"),
  half: $("halfSwitch"),
  system: $("systemSwitch"),
  note: $("storageNote"),
  overall: $("overallValue"),
  zeugnis: $("zeugnisValue"),
  zeugnisInfo: $("zeugnisInfo"),
  suggest: $("suggestions"),
  chips: $("suggestionChips"),
  subjects: $("subjects"),
  addForm: $("addSubjectForm"),
  addName: $("newSubjectName"),
  addError: $("addSubjectError"),
  convNote: $("convNote"),
  convPoints: $("convPoints"),
};

const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const HALF_LABEL = { 1: "1. Halbjahr", 2: "2. Halbjahr" };

const guest = createGuestStore();

const state = {
  user: null,
  store: guest,
  loading: true,
  subjects: [],          // { id, name, schoolYear }
  grades: [],            // { id, subjectId, label, value, system, weight, half } + saved – je Fach und Halbjahr genau eine
  view: defaultView(),   // { system, schoolYear, half }
  errors: new Map(),     // Fach-ID → Fehlertext der Eingabe (nur für die Sitzung)
  saveStatus: "saved",
};

/* ---------- Ansicht (Schuljahr, Halbjahr, Notensystem) ---------- */

function defaultView() {
  return { system: "note", schoolYear: schoolYearOf(), half: halfOf() };
}

function sanitizeView(v) {
  const d = defaultView();
  if (!v || typeof v !== "object") return d;
  return {
    system: SYSTEMS[v.system] ? v.system : d.system,
    schoolYear: /^\d{4}\/\d{2}$/.test(v.schoolYear) ? v.schoolYear : d.schoolYear,
    half: [1, 2].includes(Number(v.half)) ? Number(v.half) : d.half, // frühere Ansicht „ganzes Schuljahr“ (0) fällt auf das aktuelle Halbjahr zurück
  };
}

function loadView() {
  if (state.user) {
    const p = getPrefs();
    if (p.nrSystem) return sanitizeView({ system: p.nrSystem, schoolYear: p.nrYear, half: p.nrHalf });
  }
  try { return sanitizeView(JSON.parse(localStorage.getItem(VIEW_KEY) || "null")); } catch (_) { return defaultView(); }
}

function saveView() {
  const { system, schoolYear, half } = state.view;
  if (state.user) savePrefs({ nrSystem: system, nrYear: schoolYear, nrHalf: String(half) });
  else try { localStorage.setItem(VIEW_KEY, JSON.stringify(state.view)); } catch (_) { /* privater Modus */ }
}

/* ---------- Modell ---------- */

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const visibleSubjects = () => state.subjects.filter((s) => s.schoolYear === state.view.schoolYear);
const gradesOf = (subjectId) => state.grades.filter((g) => g.subjectId === subjectId && g.half === state.view.half && isNum(g.value));

/** Zeugnisnote des Fachs im gewählten System (null = keine). Mehrere Noten aus früheren Versionen werden gewichtet gemittelt. */
function gradeValue(subjectId) {
  const list = gradesOf(subjectId);
  if (list.length === 1) return convert(list[0].value, list[0].system, state.view.system);
  return subjectAverage(list.filter((g) => isNum(g.weight)), state.view.system);
}
const displayValue = (subjectId) => formatInput(gradeValue(subjectId));

function applyData(data) {
  state.subjects = data.subjects;
  state.grades = data.grades.map((g) => ({ ...g, saved: true }));
}

function dropGrade(g) {
  state.grades = state.grades.filter((x) => x !== g);
  if (g.saved) state.store.removeGrade(g.id).catch(() => {});
}

/** Setzt die Zeugnisnote eines Fachs im gewählten Halbjahr (null = Note entfernen). Es bleibt immer höchstens eine Note je Fach. */
function setSubjectGrade(subjectId, value) {
  const [keep, ...extra] = gradesOf(subjectId);
  extra.forEach(dropGrade);
  if (value === null) { if (keep) dropGrade(keep); return; }
  const data = { label: "", value, system: state.view.system, weight: 1, half: state.view.half };
  if (keep) {
    Object.assign(keep, data);
    if (keep.saved) state.store.updateGrade(keep.id, data).catch(() => {});
  } else {
    const g = { id: state.store.newId(), subjectId, ...data, saved: true };
    state.grades.push(g);
    state.store.addGrade({ id: g.id, subjectId, ...data }).catch(() => { g.saved = false; });
  }
}

/* ---------- Darstellung ---------- */

function subjectCard(s) {
  const sys = SYSTEMS[state.view.system];
  return `
    <div class="nr-subject" data-subject="${esc(s.id)}">
      <input class="nr-subject-name" data-field="name" value="${esc(s.name)}" maxlength="120" aria-label="Fachname" autocomplete="off">
      <input class="input tabular nr-grade-input" data-field="value" inputmode="decimal" value="${esc(displayValue(s.id))}" placeholder="${sys.unit}" aria-label="Zeugnisnote ${esc(s.name)} (${sys.unit})" autocomplete="off">
      <button class="icon-btn" type="button" data-action="remove-subject" aria-label="Fach ${esc(s.name)} löschen">${TRASH}</button>
      <p class="nr-row-error" data-out="error" role="alert"></p>
    </div>`;
}

function renderControls() {
  const years = schoolYearOptions([...state.subjects.map((s) => s.schoolYear), state.view.schoolYear]);
  els.year.innerHTML = years.map((y) => `<option value="${y}"${y === state.view.schoolYear ? " selected" : ""}>Schuljahr ${y}</option>`).join("");
  els.half.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.half) === state.view.half)));
  els.system.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.system === state.view.system)));
}

function renderStorageNote() {
  if (state.loading) { els.note.innerHTML = '<span class="muted-tint">Lade deine Noten …</span>'; return; }
  if (!state.user) {
    els.note.innerHTML = `
      <span class="storage-dot is-hollow" aria-hidden="true"></span>
      <span><strong>Gast-Modus.</strong> Deine Noten liegen nur in diesem Browser.</span>
      <button class="text-link" type="button" data-auth-action="login">Anmelden und synchronisieren</button>`;
    return;
  }
  const local = guest.peek();
  els.note.innerHTML = `
    <span class="storage-dot" aria-hidden="true"></span>
    <span><strong>Mit deinem Konto synchronisiert.</strong> Angemeldet als ${esc(state.user.name || state.user.email || "Konto")}.</span>
    ${local.subjects.length ? `<button class="text-link" type="button" data-action="import-guest">Lokale Daten übernehmen (${local.subjects.length})</button>` : ""}
    <span class="nr-save-state caption" id="saveState"></span>`;
  renderSaveState();
}

function renderSaveState() {
  const el = $("saveState");
  if (!el) return;
  el.textContent = { saving: "Speichert …", saved: "Gespeichert", error: "Nicht gespeichert" }[state.saveStatus];
}

function renderSubjects() {
  if (state.loading) {
    els.subjects.innerHTML = '<div class="card-soft nr-empty"><p class="body muted-tint">Lade deine Noten …</p></div>';
  } else {
    const list = visibleSubjects();
    els.subjects.innerHTML = list.length
      ? list.map(subjectCard).join("")
      : `<div class="card-soft nr-empty"><h3 class="h4">Noch keine Fächer.</h3><p class="body-sm muted-tint">Für das Schuljahr ${esc(state.view.schoolYear)} gibt es noch kein Fach. Nimm die üblichen Schulfächer oder leg unten eigene an.</p><button class="btn btn-primary btn-sm" type="button" data-action="seed-defaults">Standardfächer einfügen</button></div>`;
  }
  updateComputed();
  renderSuggestions();
}

function renderAll() {
  ensureDefaults();
  renderControls();
  renderStorageNote();
  renderSubjects();
}

/** Alle berechneten Werte neu schreiben, ohne Eingabefelder anzufassen (läuft bei jedem Tastendruck). */
function updateComputed() {
  const sys = state.view.system;
  const subjects = visibleSubjects();
  const values = [];
  for (const s of subjects) {
    const v = gradeValue(s.id);
    if (isNum(v)) values.push(v);
    const card = els.subjects.querySelector(`[data-subject="${CSS.escape(s.id)}"]`);
    if (card) card.querySelector('[data-out="error"]').textContent = state.errors.get(s.id) || "";
  }
  const avg = overallAverage(values);
  els.zeugnis.textContent = formatNumber(avg, 2);
  els.zeugnisInfo.textContent = avg === null
    ? "Trag bei deinen Fächern die Zeugnisnote ein."
    : `${formatOther(avg, sys)} · Mittel aus ${values.length} von ${subjects.length} ${subjects.length === 1 ? "Fach" : "Fächern"} · ${HALF_LABEL[state.view.half]}`;
}

/* ---------- Standardfächer ---------- */

const SEEDED_KEY = "pensum.notenrechner.seeded.v1";
const seededList = () => { try { return JSON.parse(localStorage.getItem(SEEDED_KEY) || "[]"); } catch (_) { return []; } };
const seedKey = () => `${state.user ? state.user.$id : "guest"}|${state.view.schoolYear}`;
const markSeeded = () => { try { localStorage.setItem(SEEDED_KEY, JSON.stringify([...new Set([...seededList(), seedKey()])])); } catch (_) {} };

function addSubjectNamed(name) {
  const s = { id: state.store.newId(), name, schoolYear: state.view.schoolYear };
  state.subjects.push(s);
  state.store.addSubject(s).catch(() => {});
  return s;
}

function seedDefaults() {
  const have = new Set(visibleSubjects().map((s) => s.name.toLowerCase()));
  for (const name of DEFAULT_SUBJECTS) if (!have.has(name.toLowerCase())) addSubjectNamed(name);
  markSeeded();
}

/** Ein neues Schuljahr ohne Fächer bekommt einmal die Standardfächer. Wer sie löscht, dem werden sie nicht wieder aufgedrängt. */
function ensureDefaults() {
  if (state.loading || visibleSubjects().length || seededList().includes(seedKey())) return;
  if (state.user && guest.peek().subjects.length && !declined().includes(state.user.$id)) return; // erst die Übernahme klären
  seedDefaults();
}

function renderSuggestions() {
  const have = new Set(visibleSubjects().map((s) => s.name.toLowerCase()));
  const missing = [...DEFAULT_SUBJECTS, ...MORE_SUBJECTS].filter((n) => !have.has(n.toLowerCase()));
  els.suggest.hidden = state.loading || !missing.length;
  els.chips.innerHTML = missing.map((n) => `<button type="button" class="chip" data-suggest="${esc(n)}">+ ${esc(n)}</button>`).join("");
}

/* ---------- Eingaben ---------- */

els.subjects.addEventListener("input", (e) => {
  const field = e.target.dataset.field;
  const card = e.target.closest("[data-subject]");
  if (!field || !card) return;
  const subjectId = card.dataset.subject;
  if (field === "name") {
    const s = state.subjects.find((x) => x.id === subjectId);
    const name = e.target.value.trim();
    if (s && name) { s.name = name; state.store.updateSubject(s.id, { name }).catch(() => {}); }
  } else if (field === "value") {
    const r = parseGrade(e.target.value, state.view.system);
    if (r.ok) { state.errors.delete(subjectId); setSubjectGrade(subjectId, r.value); }
    else if (r.empty) { state.errors.delete(subjectId); setSubjectGrade(subjectId, null); }
    else state.errors.set(subjectId, r.error);
    e.target.setAttribute("aria-invalid", String(!r.ok && !r.empty));
  }
  updateComputed();
});

// Leerer Fachname: beim Verlassen den letzten gültigen Namen zurückholen
els.subjects.addEventListener("focusout", (e) => {
  if (e.target.dataset.field !== "name" || e.target.value.trim()) return;
  const s = state.subjects.find((x) => x.id === e.target.closest("[data-subject]").dataset.subject);
  if (s) e.target.value = s.name;
});

els.subjects.addEventListener("click", (e) => {
  if (!e.target.closest('[data-action="seed-defaults"]') || state.loading) return;
  seedDefaults();
  renderSubjects();
  renderControls();
});

els.chips.addEventListener("click", (e) => {
  const b = e.target.closest("[data-suggest]");
  if (!b || state.loading) return;
  const name = b.dataset.suggest;
  if (visibleSubjects().some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
  const first = visibleSubjects().length === 0;
  const s = addSubjectNamed(name);
  if (first) renderSubjects();
  else { els.subjects.insertAdjacentHTML("beforeend", subjectCard(s)); updateComputed(); renderSuggestions(); }
  renderControls();
});

els.subjects.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = e.target.closest("[data-subject]");
  if (!btn || !card) return;
  const subjectId = card.dataset.subject;

  if (btn.dataset.action === "remove-subject") {
    const s = state.subjects.find((x) => x.id === subjectId);
    const grades = state.grades.filter((g) => g.subjectId === subjectId);
    if (grades.length) {
      const ok = await confirmDialog({
        title: `„${s.name}“ löschen?`,
        text: `${grades.length === 1 ? "Die Note" : `Alle ${grades.length} Noten`} dieses Fachs ${grades.length === 1 ? "wird" : "werden"} mit gelöscht. Das lässt sich nicht rückgängig machen.`,
        confirm: "Fach löschen",
      });
      if (!ok) return;
    }
    state.subjects = state.subjects.filter((x) => x.id !== subjectId);
    state.grades = state.grades.filter((g) => g.subjectId !== subjectId);
    state.errors.delete(subjectId);
    state.store.removeSubject(subjectId, grades.filter((g) => g.saved).map((g) => g.id)).catch(() => {});
    renderSubjects();
    renderControls();
  }
});

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.addName.value.trim();
  const fail = (text) => { els.addError.textContent = text; els.addError.hidden = false; els.addName.setAttribute("aria-invalid", "true"); els.addName.focus(); };
  if (state.loading) return;
  if (!name) return fail("Gib dem Fach einen Namen.");
  if (visibleSubjects().some((s) => s.name.toLowerCase() === name.toLowerCase())) return fail(`„${name}“ gibt es im Schuljahr ${state.view.schoolYear} schon.`);
  els.addError.hidden = true;
  els.addName.removeAttribute("aria-invalid");
  const first = visibleSubjects().length === 0;
  const s = addSubjectNamed(name);
  if (first) renderSubjects();
  else { els.subjects.insertAdjacentHTML("beforeend", subjectCard(s)); updateComputed(); renderSuggestions(); }
  els.addName.value = "";
  els.addName.focus();
});
els.addName.addEventListener("input", () => { els.addError.hidden = true; els.addName.removeAttribute("aria-invalid"); });

els.year.addEventListener("change", () => { state.errors.clear(); state.view.schoolYear = els.year.value; saveView(); renderAll(); });
els.half.addEventListener("click", (e) => {
  const b = e.target.closest("[data-half]");
  if (!b) return;
  state.errors.clear();
  state.view.half = Number(b.dataset.half);
  saveView();
  renderAll();
});
els.system.addEventListener("click", (e) => {
  const b = e.target.closest("[data-system]");
  if (!b || b.dataset.system === state.view.system) return;
  state.errors.clear();
  state.view.system = b.dataset.system;
  saveView();
  renderAll();
});

/* ---------- Umrechnung ---------- */

function wireConverter(from, to, system, fn) {
  from.addEventListener("input", () => {
    const r = parseGrade(from.value, system);
    from.setAttribute("aria-invalid", String(!r.ok && !r.empty));
    to.removeAttribute("aria-invalid");
    to.value = r.ok ? formatInput(fn(r.value)) : "";
  });
}
wireConverter(els.convNote, els.convPoints, "note", noteToPoints);
wireConverter(els.convPoints, els.convNote, "punkte", pointsToNote);

/* ---------- Konto: laden, synchronisieren, Gast-Daten übernehmen ---------- */

function onSaveStatus(status, error) {
  const was = state.saveStatus;
  state.saveStatus = status;
  renderSaveState();
  if (status === "error" && was !== "error") {
    console.error(error);
    toast("Speichern fehlgeschlagen. Prüfe deine Verbindung, die Änderung ist noch nicht im Konto.", { error: true });
  }
}

const declined = () => { try { return JSON.parse(localStorage.getItem(DECLINED_KEY) || "[]"); } catch (_) { return []; } };

async function runImport(local) {
  try {
    const n = await importGuestData(state.store, local);
    guest.clear();
    applyData(await state.store.load());
    renderAll();
    toast(`${n.subjects} ${n.subjects === 1 ? "Fach" : "Fächer"} und ${n.grades} ${n.grades === 1 ? "Note" : "Noten"} in dein Konto übernommen.`);
  } catch (e) {
    console.error(e);
    toast("Die Übernahme ist nicht vollständig durchgelaufen. Prüfe deine Fächer und versuch es noch einmal.", { error: true });
  }
}

/** Beim ersten Login mit lokalen Daten: Übernahme anbieten (einmal je Konto und Gerät). */
async function offerImport(token) {
  const local = guest.peek();
  if (!local.subjects.length || declined().includes(state.user.$id)) return;
  const s = local.subjects.length, g = local.grades.length;
  const ok = await confirmDialog({
    title: "Lokale Daten übernehmen?",
    text: `Auf diesem Gerät ${s === 1 ? "liegt 1 Fach" : `liegen ${s} Fächer`} mit ${g} ${g === 1 ? "Note" : "Noten"} aus dem Gast-Modus. Sollen sie in dein Konto übernommen werden? Sonst bleiben sie getrennt auf diesem Gerät.`,
    confirm: "Ins Konto übernehmen",
    cancel: "Nicht übernehmen",
  });
  if (token !== loadToken || !state.user) return;
  if (!ok) {
    try { localStorage.setItem(DECLINED_KEY, JSON.stringify([...new Set([...declined(), state.user.$id])])); } catch (_) {}
    renderStorageNote();
    return;
  }
  await runImport(local);
}

els.note.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="import-guest"]') && state.user) runImport(guest.peek());
});

let loadToken = 0;
onAuthChange(async ({ status, user }) => {
  if (status !== "ready") return;
  const token = ++loadToken;
  state.user = user;
  state.store = user ? createCloudStore(user, onSaveStatus) : guest;
  state.saveStatus = "saved";
  state.loading = true;
  state.subjects = [];
  state.grades = [];
  state.errors.clear();
  state.view = loadView();
  renderAll();
  try {
    const data = await state.store.load();
    if (token !== loadToken) return;
    applyData(data);
  } catch (e) {
    if (token !== loadToken) return;
    console.error(e);
    toast("Deine Noten konnten nicht geladen werden. Lade die Seite neu, wenn du wieder online bist.", { error: true });
  }
  state.loading = false;
  renderAll();
  if (user) offerImport(token);
});

// Vor dem Abmelden und beim Verlassen der Seite alles Ausstehende speichern
onBeforeLogout(() => state.store.flush());
addEventListener("pagehide", () => { state.store.flush(); });

// Zurück im Tab: Stand vom Server holen (z. B. nach Änderungen auf dem Handy) – aber nie mitten im Tippen
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { state.store.flush(); return; }
  if (!state.user || state.loading || !state.store.isIdle() || els.subjects.contains(document.activeElement)) return;
  if (state.grades.some((g) => !g.saved)) return;
  const token = loadToken, store = state.store;
  try {
    const data = await store.load();
    if (token !== loadToken || !store.isIdle() || els.subjects.contains(document.activeElement)) return;
    applyData(data);
    renderAll();
  } catch (_) { /* offline: beim nächsten Mal */ }
});
