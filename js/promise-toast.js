/* Promise Toast – Nachbau von „Promise Toast“ aus Kokonut UI (MIT, https://kokonutui.com) in Vanilla-JS (css/promise-toast.css).
 * Ein Toast begleitet eine Aufgabe: erst „arbeitet“ (Ring), dann „fertig“ (Haken) oder „fehlgeschlagen“ (mit „Nochmal“).
 * Mehrere Toasts liegen gestapelt und fächern sich auf, solange man mit der Maus oder der Tastatur darauf ist.
 *
 *   import { promiseToast } from "/js/promise-toast.js";
 *   promiseToast(async (report) => { …Arbeit…; return "datei.pdf"; }, {
 *     loading: "PDF wird erstellt …",                  // Titel während der Arbeit
 *     waiting: "Das dauert einen Moment",              // optional: zweite Zeile währenddessen
 *     count: { total: 24, unit: "Seiten", verb: "Erstelle" },   // optional: „Erstelle 12 von 24 Seiten“, report(12) meldet den Stand
 *     success: (name) => ["PDF gespeichert", name],    // Text oder [Titel, Zeile] oder Funktion des Ergebnisses
 *     error: (e) => ["Das PDF ging nicht", e.message], // dasselbe für den Fehler
 *     undo: { run: async () => {…}, loading: "Mache rückgängig …", success: "Rückgängig gemacht" }, // optional: „Rückgängig“-Knopf
 *   });
 *
 * Die Aufgabe ist eine Funktion (kein fertiges Promise), damit „Nochmal“ sie neu starten kann. Die Stile lädt das Modul selbst nach. */

export const STAY_MS = 5000;   // so lange bleibt ein fertiger Toast stehen
export const VISIBLE = 3;      // gestapelt sichtbar
const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>',
  loading: '<span class="pt-spin" aria-hidden="true"></span>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

/** Text oder [Titel, Zeile] als [Titel, Zeile]. */
export function splitLines(lines) {
  return Array.isArray(lines) ? [String(lines[0] ?? ""), String(lines[1] ?? "")] : [String(lines ?? ""), ""];
}

/** Löst Text, [Titel, Zeile] oder Funktion (value) => … auf. */
export function linesFor(lines, value) {
  return splitLines(typeof lines === "function" ? lines(value) : lines);
}

/** „Erstelle 12 von 24 Seiten“ für gezählte Arbeit. */
export function countLabel(count, done = 0) {
  const d = Math.max(0, Math.min(count.total, Math.round(done)));
  return `${count.verb} ${d} von ${count.total} ${count.unit}`;
}

/** Fortschritt 0 bis 1. */
export const progressOf = (count, done = 0) => (count && count.total > 0 ? Math.max(0, Math.min(1, done / count.total)) : 0);

/** Fehlertext für die zweite Zeile. */
export const errorText = (e) => (e && e.message ? String(e.message) : typeof e === "string" ? e : "");

/* ---------- Anzeige (nur im Browser) ---------- */

let list = null;
let nextId = 1;
const toasts = [];      // neueste zuletzt
let paused = false;

function ensureStyles() {
  if (document.querySelector('link[data-promise-toast]')) return;
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/css/promise-toast.css" });
  link.dataset.promiseToast = "";
  document.head.append(link);
}

function ensureList() {
  if (list && document.body.contains(list)) return list;
  ensureStyles();
  list = document.createElement("ol");
  list.className = "pt-stack";
  list.setAttribute("aria-label", "Meldungen");
  list.setAttribute("aria-live", "polite");
  list.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") pause(true); });
  list.addEventListener("pointerleave", () => pause(false));
  list.addEventListener("focusin", () => pause(true));
  list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget)) pause(false); });
  document.body.append(list);
  document.addEventListener("visibilitychange", () => pause(document.hidden || list.matches(":hover")));
  return list;
}

function pause(on) {
  paused = on;
  list.classList.toggle("is-open", on);
  for (const t of toasts) {
    if (on) { clearTimeout(t.timer); if (t.deadline) t.remaining = Math.max(500, t.deadline - Date.now()); }
    else if (t.status === "success" && t.el.isConnected) arm(t, t.remaining ?? STAY_MS);
  }
}

function arm(t, ms) {
  clearTimeout(t.timer);
  if (paused || t.status !== "success") return;
  t.deadline = Date.now() + ms;
  t.timer = setTimeout(() => dismiss(t), ms);
}

function layout() {
  toasts.slice().reverse().forEach((t, i) => { t.el.style.setProperty("--i", String(i)); t.el.classList.toggle("is-back", i >= VISIBLE); });
}

function dismiss(t) {
  clearTimeout(t.timer);
  const at = toasts.indexOf(t);
  if (at < 0) return;
  toasts.splice(at, 1);
  t.el.classList.add("is-leaving");
  layout();
  setTimeout(() => t.el.remove(), 220);
}

function render(t) {
  const el = t.el;
  el.dataset.status = t.status;
  el.querySelector(".pt-icon").innerHTML = ICONS[t.status];
  el.querySelector(".pt-title").textContent = t.title;
  el.querySelector(".pt-body").textContent = t.body;
  el.querySelector(".pt-body").hidden = !t.body;
  const act = el.querySelector(".pt-action");
  const canRetry = t.status === "error";
  const canUndo = t.status === "success" && !!t.options.undo && !t.undone;
  act.hidden = !(canRetry || canUndo);
  act.textContent = canRetry ? "Nochmal" : "Rückgängig";
  act.dataset.act = canRetry ? "retry" : "undo";
  el.style.setProperty("--p", String(t.options.count && t.status === "loading" ? progressOf(t.options.count, t.done) : 0));
  el.classList.toggle("has-count", !!t.options.count && t.status === "loading");
}

function settle(t) {
  Promise.resolve()
    .then(() => t.task((done) => { t.done = done; if (t.options.count) { t.body = countLabel(t.options.count, done); render(t); } }))
    .then(
      (value) => { [t.title, t.body] = linesFor(t.options.success, value); t.status = "success"; t.done = undefined; render(t); arm(t, STAY_MS); },
      (error) => { [t.title, t.body] = linesFor(t.options.error ?? ["Das hat nicht geklappt", errorText(error)], error); t.status = "error"; t.done = undefined; render(t); },
    );
}

/** Zeigt einen Toast zur Aufgabe. Gibt { id, dismiss } zurück. */
export function promiseToast(task, options) {
  const root = ensureList();
  const el = document.createElement("li");
  el.className = "pt";
  el.innerHTML = `<span class="pt-icon"></span><span class="pt-text"><b class="pt-title"></b><span class="pt-body"></span></span>`
    + `<button class="pt-action" type="button" hidden></button>`
    + `<button class="pt-close" type="button" aria-label="Meldung schließen">${ICONS.close}</button><i class="pt-edge" aria-hidden="true"></i>`;
  const t = {
    id: nextId++, el, status: "loading", task, options,
    title: options.loading, body: options.count ? countLabel(options.count, 0) : options.waiting || "", done: undefined, undone: false, timer: 0,
  };
  el.querySelector(".pt-close").addEventListener("click", () => dismiss(t));
  el.querySelector(".pt-action").addEventListener("click", (e) => {
    if (e.currentTarget.dataset.act === "retry") {
      t.status = "loading"; t.title = "Neuer Versuch …"; t.body = options.count ? countLabel(options.count, 0) : options.waiting || ""; render(t); settle(t);
    } else if (options.undo) {
      t.undone = true; t.status = "loading"; clearTimeout(t.timer);
      [t.title, t.body] = splitLines(options.undo.loading ?? "Mache rückgängig …"); render(t);
      Promise.resolve().then(options.undo.run).then(
        () => { [t.title, t.body] = splitLines(options.undo.success ?? "Rückgängig gemacht"); t.status = "success"; render(t); arm(t, STAY_MS); },
        (error) => { [t.title, t.body] = linesFor(options.error ?? ["Das hat nicht geklappt", errorText(error)], error); t.status = "error"; render(t); },
      );
    }
  });
  render(t);
  toasts.push(t);
  root.append(el);
  layout();
  settle(t);
  return { id: t.id, dismiss: () => dismiss(t) };
}
