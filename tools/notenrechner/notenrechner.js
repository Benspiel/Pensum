/* Notenrechner – Oberfläche.
 * Rechnen: core.js · Speichern: store.js (Gast = localStorage, Konto = Appwrite) · Login: /js/auth.js */
import { onAuthChange, onBeforeLogout, getPrefs, savePrefs } from "/js/auth.js";
import { toast, confirmDialog, esc, closeIcon } from "/js/shell.js";
import {
  SYSTEMS, convert, parseGrade, parseWeight, subjectAverage, toSystem, overallAverage, requiredGrade,
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
  overallInfo: $("overallInfo"),
  subjects: $("subjects"),
  addForm: $("addSubjectForm"),
  addName: $("newSubjectName"),
  addError: $("addSubjectError"),
  convNote: $("convNote"),
  convPoints: $("convPoints"),
};

const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const HALF_LABEL = { 1: "1. Halbjahr", 2: "2. Halbjahr", 0: "ganzes Schuljahr" };

const guest = createGuestStore();

const state = {
  user: null,
  store: guest,
  loading: true,
  subjects: [],          // { id, name, schoolYear }
  grades: [],            // { id, subjectId, label, value, system, weight, half } + saved, valueOk, weightOk, valueError, weightError
  view: defaultView(),   // { system, schoolYear, half } – half 0 = ganzes Schuljahr
  targets: new Map(),    // Fach-ID → { target, weight, open } (nur für die Sitzung)
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
    half: [0, 1, 2].includes(Number(v.half)) ? Number(v.half) : d.half,
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
const hydrateGrade = (g) => ({ ...g, saved: true, valueOk: isNum(g.value), weightOk: isNum(g.weight), valueError: "", weightError: "" });
const visibleSubjects = () => state.subjects.filter((s) => s.schoolYear === state.view.schoolYear);
const gradesOf = (subjectId) => state.grades.filter((g) => g.subjectId === subjectId && (state.view.half === 0 || g.half === state.view.half));
const countable = (grades) => grades.filter((g) => g.valueOk && g.weightOk);
const targetOf = (subjectId) => {
  if (!state.targets.has(subjectId)) state.targets.set(subjectId, { target: "", weight: "1", open: false });
  return state.targets.get(subjectId);
};
const displayValue = (g) => (isNum(g.value) ? formatInput(convert(g.value, g.system, state.view.system)) : "");

function applyData(data) {
  state.subjects = data.subjects;
  state.grades = data.grades.map(hydrateGrade);
}

function persistGrade(g) {
  if (!g.valueOk || !g.weightOk) return; // unfertige Zeilen bleiben nur auf dem Bildschirm
  const data = { label: g.label.trim(), value: g.value, system: g.system, weight: g.weight, half: g.half };
  if (!g.saved) {
    g.saved = true;
    state.store.addGrade({ id: g.id, subjectId: g.subjectId, ...data }).catch(() => { g.saved = false; });
  } else {
    state.store.updateGrade(g.id, data).catch(() => {});
  }
}

/* ---------- Darstellung ---------- */

function gradeRow(g) {
  const sys = SYSTEMS[state.view.system];
  const yearView = state.view.half === 0;
  return `
    <li class="nr-grade" data-grade="${esc(g.id)}">
      <input class="input" data-cell="label" data-field="label" value="${esc(g.label)}" maxlength="120" placeholder="z. B. Klausur" aria-label="Bezeichnung" autocomplete="off">
      <input class="input tabular" data-cell="value" data-field="value" inputmode="decimal" value="${esc(displayValue(g))}" placeholder="${sys.unit}" aria-label="${sys.unit}" autocomplete="off">
      <span class="nr-weight" data-cell="weight"><input class="input tabular" data-field="weight" inputmode="decimal" value="${esc(formatInput(g.weight))}" aria-label="Gewichtung" autocomplete="off"></span>
      ${yearView ? `<select class="select" data-cell="half" data-field="half" aria-label="Halbjahr"><option value="1"${g.half === 1 ? " selected" : ""}>1. Hj.</option><option value="2"${g.half === 2 ? " selected" : ""}>2. Hj.</option></select>` : ""}
      <button class="icon-btn" type="button" data-cell="remove" data-action="remove-grade" aria-label="Note löschen">${closeIcon}</button>
    </li>`;
}

function subjectCard(s) {
  const sys = SYSTEMS[state.view.system];
  const t = targetOf(s.id);
  const yearView = state.view.half === 0;
  return `
    <article class="card nr-subject" data-subject="${esc(s.id)}">
      <div class="nr-subject-head">
        <input class="nr-subject-name" data-field="name" value="${esc(s.name)}" maxlength="120" aria-label="Fachname" autocomplete="off">
        <button class="icon-btn" type="button" data-action="remove-subject" aria-label="Fach ${esc(s.name)} löschen">${TRASH}</button>
      </div>
      <div class="nr-avg">
        <span class="nr-avg-value tabular" data-out="avg">–</span>
        <span class="body-sm muted" data-out="avg-info"></span>
      </div>
      <div class="nr-grade-head caption" aria-hidden="true"><span>Bezeichnung</span><span>${sys.unit}</span><span>Gewicht</span>${yearView ? "<span>Halbjahr</span>" : ""}<span></span></div>
      <ul class="nr-grades">${gradesOf(s.id).map(gradeRow).join("")}</ul>
      <p class="nr-row-error" data-out="error" role="alert"></p>
      <div class="nr-subject-actions">
        <button class="btn btn-soft btn-sm" type="button" data-action="add-grade">Note hinzufügen</button>
      </div>
      <details class="nr-target on-tint"${t.open ? " open" : ""}>
        <summary>Zielnote berechnen</summary>
        <div class="nr-target-body">
          <div class="nr-target-fields">
            <label class="field">
              <span class="field-label">Wunsch-Durchschnitt</span>
              <input class="input tabular" data-field="target" inputmode="decimal" value="${esc(t.target)}" placeholder="${sys.id === "note" ? "2,0" : "11"}" autocomplete="off">
            </label>
            <label class="field">
              <span class="field-label">Gewicht nächste Arbeit</span>
              <span class="nr-weight"><input class="input tabular" data-field="target-weight" inputmode="decimal" value="${esc(t.weight)}" autocomplete="off"></span>
            </label>
          </div>
          <p class="nr-target-result body-sm" data-out="target" aria-live="polite"></p>
        </div>
      </details>
    </article>`;
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
  els.subjects.classList.toggle("nr-year-view", state.view.half === 0);
  if (state.loading) {
    els.subjects.innerHTML = '<div class="card-soft nr-empty"><p class="body muted-tint">Lade deine Noten …</p></div>';
  } else {
    const list = visibleSubjects();
    els.subjects.innerHTML = list.length
      ? list.map(subjectCard).join("")
      : `<div class="card-soft nr-empty"><h3 class="h4">Noch keine Fächer.</h3><p class="body-sm muted-tint">Leg unten dein erstes Fach für das Schuljahr ${esc(state.view.schoolYear)} an.</p></div>`;
  }
  updateComputed();
}

function renderAll() {
  renderControls();
  renderStorageNote();
  renderSubjects();
}

function targetResult(subject, ok) {
  const sys = state.view.system;
  const t = targetOf(subject.id);
  if (!t.target.trim()) return "";
  const target = parseGrade(t.target, sys);
  if (!target.ok) return esc(target.error);
  const weight = parseWeight(t.weight);
  if (!weight.ok) return "Gewichtung der nächsten Arbeit eingeben.";
  const r = requiredGrade({ grades: toSystem(ok, sys), target: target.value, nextWeight: weight.value, system: sys });
  if (r.status === "invalid") return esc(r.error);
  if (r.status === "guaranteed") return "Schon sicher.<span>Egal, wie die nächste Arbeit ausfällt: Du hältst deinen Wunsch-Durchschnitt.</span>";
  if (r.status === "unreachable") {
    return `Mit einer Arbeit nicht zu schaffen.<span>Selbst mit ${sys === "note" ? "einer 1" : "15 Punkten"} kommst du auf ${formatNumber(r.bestCase, 2)}.</span>`;
  }
  return sys === "note"
    ? `Du brauchst eine ${formatInput(r.practical)} oder besser.<span>${formatOther(r.practical, sys)} · rechnerisch ${formatNumber(r.needed, 2)}</span>`
    : `Du brauchst mindestens ${formatInput(r.practical)} Punkte.<span>${formatOther(r.practical, sys)} · rechnerisch ${formatNumber(r.needed, 2)}</span>`;
}

/** Alle berechneten Werte neu schreiben, ohne Eingabefelder anzufassen (läuft bei jedem Tastendruck). */
function updateComputed() {
  const sys = state.view.system;
  const averages = [];
  for (const s of visibleSubjects()) {
    const card = els.subjects.querySelector(`[data-subject="${CSS.escape(s.id)}"]`);
    if (!card) continue;
    const all = gradesOf(s.id), ok = countable(all);
    const avg = subjectAverage(ok, sys);
    averages.push(avg);
    card.querySelector('[data-out="avg"]').textContent = formatNumber(avg, 2);
    card.querySelector('[data-out="avg-info"]').textContent =
      avg !== null ? `${formatOther(avg, sys)} · ${ok.length} ${ok.length === 1 ? "Note" : "Noten"}`
      : ok.length ? "Gewichtung ergibt 0. Es gibt nichts zu berechnen."
      : all.length ? "Trag eine Note ein."
      : `Noch keine Noten (${HALF_LABEL[state.view.half]}).`;
    const bad = all.find((g) => g.valueError || g.weightError);
    card.querySelector('[data-out="error"]').textContent = bad ? bad.valueError || bad.weightError : "";
    card.querySelector('[data-out="target"]').innerHTML = targetResult(s, ok);
  }
  const overall = overallAverage(averages);
  const n = averages.filter((a) => a !== null).length;
  els.overall.textContent = formatNumber(overall, 2);
  els.overallInfo.textContent = overall === null
    ? "Noch keine Noten eingetragen."
    : `${formatOther(overall, sys)} · Mittel aus ${n} ${n === 1 ? "Fach" : "Fächern"} · ${HALF_LABEL[state.view.half]}`;
}

/* ---------- Eingaben ---------- */

function onGradeInput(id, field, el) {
  const g = state.grades.find((x) => x.id === id);
  if (!g) return;
  if (field === "label") g.label = el.value;
  if (field === "half") g.half = Number(el.value) === 2 ? 2 : 1;
  if (field === "value") {
    const r = parseGrade(el.value, state.view.system);
    g.valueOk = r.ok;
    g.valueError = r.ok || r.empty ? "" : r.error;
    if (r.ok) { g.value = r.value; g.system = state.view.system; }
    el.setAttribute("aria-invalid", String(!!g.valueError));
  }
  if (field === "weight") {
    const r = parseWeight(el.value);
    g.weightOk = r.ok;
    g.weightError = r.ok || r.empty ? "" : r.error;
    if (r.ok) g.weight = r.value;
    el.setAttribute("aria-invalid", String(!!g.weightError));
  }
  persistGrade(g);
}

els.subjects.addEventListener("input", (e) => {
  const field = e.target.dataset.field;
  const card = e.target.closest("[data-subject]");
  if (!field || !card) return;
  const subjectId = card.dataset.subject;
  const row = e.target.closest("[data-grade]");
  if (row) onGradeInput(row.dataset.grade, field, e.target);
  else if (field === "name") {
    const s = state.subjects.find((x) => x.id === subjectId);
    const name = e.target.value.trim();
    if (s && name) { s.name = name; state.store.updateSubject(s.id, { name }).catch(() => {}); }
  } else if (field === "target") targetOf(subjectId).target = e.target.value;
  else if (field === "target-weight") targetOf(subjectId).weight = e.target.value;
  updateComputed();
});

// Leerer Fachname: beim Verlassen den letzten gültigen Namen zurückholen
els.subjects.addEventListener("focusout", (e) => {
  if (e.target.dataset.field !== "name" || e.target.value.trim()) return;
  const s = state.subjects.find((x) => x.id === e.target.closest("[data-subject]").dataset.subject);
  if (s) e.target.value = s.name;
});

els.subjects.addEventListener("toggle", (e) => {
  const card = e.target.closest && e.target.closest("[data-subject]");
  if (card && e.target.matches(".nr-target")) targetOf(card.dataset.subject).open = e.target.open;
}, true);

els.subjects.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = e.target.closest("[data-subject]");
  if (!btn || !card) return;
  const subjectId = card.dataset.subject;

  if (btn.dataset.action === "add-grade") {
    const g = {
      id: state.store.newId(), subjectId, label: "", value: NaN, system: state.view.system, weight: 1,
      half: state.view.half || halfOf(), saved: false, valueOk: false, weightOk: true, valueError: "", weightError: "",
    };
    state.grades.push(g);
    card.querySelector(".nr-grades").insertAdjacentHTML("beforeend", gradeRow(g));
    card.querySelector(`[data-grade="${CSS.escape(g.id)}"] [data-field="label"]`).focus();
    updateComputed();
  }

  if (btn.dataset.action === "remove-grade") {
    const row = btn.closest("[data-grade]");
    const g = state.grades.find((x) => x.id === row.dataset.grade);
    state.grades = state.grades.filter((x) => x !== g);
    if (g && g.saved) state.store.removeGrade(g.id).catch(() => {});
    row.remove();
    card.querySelector('[data-action="add-grade"]').focus();
    updateComputed();
  }

  if (btn.dataset.action === "remove-subject") {
    const s = state.subjects.find((x) => x.id === subjectId);
    const grades = state.grades.filter((g) => g.subjectId === subjectId);
    if (grades.length) {
      const ok = await confirmDialog({
        title: `„${s.name}“ löschen?`,
        text: `${grades.length === 1 ? "Die eine Note" : `Alle ${grades.length} Noten`} dieses Fachs ${grades.length === 1 ? "wird" : "werden"} mit gelöscht. Das lässt sich nicht rückgängig machen.`,
        confirm: "Fach löschen",
      });
      if (!ok) return;
    }
    state.subjects = state.subjects.filter((x) => x.id !== subjectId);
    state.grades = state.grades.filter((g) => g.subjectId !== subjectId);
    state.targets.delete(subjectId);
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
  const s = { id: state.store.newId(), name, schoolYear: state.view.schoolYear };
  const first = visibleSubjects().length === 0;
  state.subjects.push(s);
  state.store.addSubject(s).catch(() => {});
  if (first) renderSubjects();
  else { els.subjects.insertAdjacentHTML("beforeend", subjectCard(s)); updateComputed(); }
  els.addName.value = "";
  els.addName.focus();
});
els.addName.addEventListener("input", () => { els.addError.hidden = true; els.addName.removeAttribute("aria-invalid"); });

els.year.addEventListener("change", () => { state.view.schoolYear = els.year.value; saveView(); renderAll(); });
els.half.addEventListener("click", (e) => {
  const b = e.target.closest("[data-half]");
  if (!b) return;
  state.view.half = Number(b.dataset.half);
  saveView();
  renderAll();
});
els.system.addEventListener("click", (e) => {
  const b = e.target.closest("[data-system]");
  if (!b || b.dataset.system === state.view.system) return;
  // Wunsch-Durchschnitte gehören zum alten System und werden mit umgerechnet
  for (const t of state.targets.values()) {
    const r = parseGrade(t.target, state.view.system);
    t.target = r.ok ? formatInput(convert(r.value, state.view.system, b.dataset.system)) : "";
  }
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
  state.targets.clear();
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
