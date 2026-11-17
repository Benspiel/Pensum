/* Aufgaben – Ladeanzeige beim Bearbeiten des Arbeitsblatts.
 * Nachbau von „AI Loading“ (Kokonut UI, MIT): eine Schrittliste mit Symbol, Dauer, Protokollzeilen und Wellen-Schrift.
 * Die KI-Anfrage ist ein einziger Aufruf, deshalb laufen die Schritte nach Zeit weiter und der letzte wartet auf die Antwort:
 * Das ist eine Schätzung des Ablaufs, keine echte Fortschrittsmeldung. */

export const SHEET_STEPS = [
  { label: "Blatt vorbereiten", detail: ["Bild verkleinern", "Seite an die KI senden"] },
  { label: "Blatt lesen", detail: ["Aufgaben erkennen", "Lücken, Linien und Kästchen suchen", "Tabellen und Zellen zählen"] },
  { label: "Aufgaben lösen", detail: ["Fragen verstehen", "Rechenwege prüfen", "Antworten kurz formulieren"] },
  { label: "Schreibfelder festlegen", detail: ["Platz für jede Antwort markieren", "Überlappungen vermeiden"] },
  { label: "Blatt fertigstellen", detail: ["Antworten prüfen", "Warte auf die KI …"] },
];

const VISIBLE = 3;
const LINE_H = 24;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDur = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const fmtStep = (ms) => (ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const wave = (text) => Array.from(text).map((ch, i) => `<span class="ld-ch" style="animation-delay:${(i * 0.05).toFixed(2)}s">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");

const ICON = {
  pending: '<span class="ld-dot"></span>',
  running: '<svg class="ld-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.25" class="ld-ring" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" class="ld-arc" stroke-width="1.5" stroke-linecap="round"/></svg>',
  done: '<svg class="ld-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>',
  error: '<svg class="ld-x" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
};

/**
 * @param {HTMLElement} root  leerer Container (bekommt die Klasse "ld")
 * @param {{label: string, detail?: string[]}[]} steps
 * @param {{ tick?: number }} [opts]  tick = Millisekunden je Protokollzeile
 */
export function createLoading(root, steps = SHEET_STEPS, { tick = 1100 } = {}) {
  root.classList.add("ld");
  root.innerHTML =
    `<button class="ld-head" type="button" aria-expanded="true"><output class="ld-title"></output><span class="ld-time"></span>` +
    `<svg class="ld-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>` +
    `<ol class="ld-list"></ol>`;
  const head = root.querySelector(".ld-head"), title = root.querySelector(".ld-title"), timeEl = root.querySelector(".ld-time"), list = root.querySelector(".ld-list");

  const rows = steps.map((s, i) => {
    const li = document.createElement("li");
    li.className = "ld-step";
    li.innerHTML =
      `<span class="ld-rail"></span><span class="ld-ico"></span>` +
      `<div class="ld-body"><div class="ld-line"><p class="ld-label"><span class="sr-only">${esc(s.label)}</span><span aria-hidden="true" class="ld-wave">${wave(s.label)}</span></p><span class="ld-dur"></span></div>` +
      `<div class="ld-log" aria-hidden="true"><div class="ld-log-in"></div></div></div>`;
    if (i === steps.length - 1) li.querySelector(".ld-rail").remove();
    list.append(li);
    return { li, ico: li.querySelector(".ld-ico"), dur: li.querySelector(".ld-dur"), log: li.querySelector(".ld-log"), logIn: li.querySelector(".ld-log-in"), status: "", lines: 0 };
  });

  let mode = "idle", pos = { step: 0, line: 0 }, t0 = 0, stepT0 = [], stepMs = [], timer = 0, clock = 0, hideTimer = 0;

  const paint = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    rows.forEach((r, i) => {
      let st = "pending";
      if (mode === "done") st = "done";
      else if (mode === "error") st = i < pos.step ? "done" : i === pos.step ? "error" : "pending";
      else if (mode === "run") st = i < pos.step ? "done" : i === pos.step ? "running" : "pending";
      if (st !== r.status) {
        r.status = st;
        r.li.dataset.status = st;
        r.ico.innerHTML = ICON[st];
      }
      if (st === "done" || st === "error") r.dur.textContent = stepMs[i] != null ? fmtStep(stepMs[i]) : "";
      else r.dur.textContent = "";
      // Protokoll: nur beim laufenden Schritt, die letzten Zeilen
      const want = st === "running" ? pos.line : 0;
      if (want !== r.lines) {
        r.lines = want;
        const d = steps[i].detail || [];
        r.logIn.innerHTML = d.slice(0, want).map((l, k) => `<div class="ld-row"><span class="ld-n">${k + 1}</span><span class="ld-t">${esc(l)}</span></div>`).join("");
        r.log.style.height = LINE_H * Math.min(want, VISIBLE) + "px";
        r.log.classList.toggle("is-fade", want > VISIBLE - 1);
        r.logIn.style.transform = `translateY(${-Math.max(0, want - VISIBLE) * LINE_H}px)`;
      }
    });
    const running = rows.find((r) => r.status === "running"), failed = rows.find((r) => r.status === "error");
    title.textContent = mode === "error" ? `Abgebrochen bei: ${steps[pos.step].label}` : mode === "done" ? `Fertig nach ${fmtDur(sec)}` : running ? steps[pos.step].label : "Wird vorbereitet";
    timeEl.textContent = mode === "run" ? fmtDur(sec) : mode === "done" ? `· ${steps.length} Schritte` : "";
    root.dataset.mode = mode;
    return failed;
  };

  const markStepEnd = (i) => { if (stepMs[i] == null) stepMs[i] = Date.now() - stepT0[i]; };
  const advance = () => {
    const d = steps[pos.step].detail || [];
    if (pos.line < d.length) pos.line++;
    else if (pos.step < steps.length - 1) { markStepEnd(pos.step); pos.step++; pos.line = 0; stepT0[pos.step] = Date.now(); }
    paint();
  };
  const stop = () => { clearInterval(timer); clearInterval(clock); timer = clock = 0; };
  const setOpen = (open) => { root.classList.toggle("is-collapsed", !open); head.setAttribute("aria-expanded", String(open)); };
  head.addEventListener("click", () => setOpen(root.classList.contains("is-collapsed")));

  return {
    /** Anzeige einblenden und die Schritte laufen lassen. */
    start() {
      stop(); clearTimeout(hideTimer);
      mode = "run"; pos = { step: 0, line: 0 }; t0 = Date.now(); stepT0 = [t0]; stepMs = [];
      rows.forEach((r) => { r.status = ""; r.lines = -1; });
      setOpen(true);
      root.hidden = false;
      paint();
      timer = setInterval(advance, tick);
      clock = setInterval(paint, 500);
    },
    /** Antwort ist da: alle Schritte fertig, Liste klappt zu, nach kurzer Zeit verschwindet die Anzeige. */
    finish({ hideAfter = 2600 } = {}) {
      if (mode !== "run") return;
      stop();
      for (let i = pos.step; i < steps.length; i++) { stepT0[i] = stepT0[i] || Date.now(); markStepEnd(i); }
      mode = "done"; paint();
      setTimeout(() => setOpen(false), 700);
      hideTimer = setTimeout(() => { root.hidden = true; }, hideAfter);
    },
    /** Fehler: der laufende Schritt wird rot, die Anzeige bleibt kurz stehen. */
    fail({ hideAfter = 5000 } = {}) {
      if (mode !== "run") return;
      stop(); markStepEnd(pos.step);
      mode = "error"; paint();
      hideTimer = setTimeout(() => { root.hidden = true; }, hideAfter);
    },
    hide() { stop(); clearTimeout(hideTimer); mode = "idle"; root.hidden = true; },
  };
}
