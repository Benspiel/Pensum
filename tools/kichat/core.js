/* KI-Chat – reine Logik für die Oberfläche (ohne DOM, damit sie sich testen lässt). */

export const MAX_TEXT = 4000; // wie LIMITS.textMax in functions/ki-chat/lib.js

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Zeichen im Fließtext: `code` und **fett** (der Text ist schon maskiert). */
function inline(escaped) {
  return escaped
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    // Links nur mit https (der Text ist schon maskiert, Anführungszeichen können nicht ausbrechen)
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** Lösungsfenster: Die KI legt die fertige Lösung einer Aufgabe in einen ```lösung-Block. Daraus wird ein Fenster mit „Kopieren“ und „In Goodnotes-Tool einfügen“. */
function solutionHtml(body) {
  const ico = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  return `<section class="kc-solution" aria-label="Lösung"><header class="kc-solution-head"><span class="kc-solution-title">${ico('<path d="m5 12 5 5 9-10"/>')}Lösung</span>`
    + `<span class="kc-solution-actions">`
    + `<button class="kc-solution-btn" type="button" data-solution="copy">${ico('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>')}<span>Kopieren</span></button>`
    + `<button class="kc-solution-btn is-primary" type="button" data-solution="goodnotes">${ico('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>')}<span>In Goodnotes-Tool einfügen</span></button>`
    + `</span></header><pre class="kc-solution-body">${escapeHtml(body)}</pre></section>`;
}

/** Wandelt eine Nachricht in sicheres HTML: Absätze, Listen, Codeblöcke, `code` und **fett**. Alles andere wird maskiert. */
export function formatMessage(text) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  const out = [];
  const parts = src.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) { // Codeblock: erste Zeile ist nur die Sprache
      const body = part.replace(/^[^\n]*\n/, "").replace(/\n+$/, "");
      if (/^\s*l(ö|oe)sung\s*\n/i.test(part)) { out.push(solutionHtml(body)); return; }
      out.push(`<pre><code>${escapeHtml(body)}</code></pre>`);
      return;
    }
    let list = null; // "ul" oder "ol"
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map((l) => inline(escapeHtml(l))).join("<br>")}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of part.split("\n")) {
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (bullet || numbered) {
        flushPara();
        const kind = bullet ? "ul" : "ol";
        if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${inline(escapeHtml((bullet || numbered)[1]))}</li>`);
      } else if (!line.trim()) {
        flushPara();
        closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara();
    closeList();
  });
  return out.join("");
}

/** Kurze Zeitangabe für die Chatliste: „heute“, „gestern“ oder Datum. */
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff <= 0) return "Heute";
  if (diff === 1) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

/** Nachrichten aus der Datenbank in die Reihenfolge der Unterhaltung bringen (älteste zuerst). */
export function sortMessages(rows) {
  return [...rows].sort((a, b) => (a.$createdAt < b.$createdAt ? -1 : a.$createdAt > b.$createdAt ? 1 : a.role === b.role ? 0 : a.role === "user" ? -1 : 1));
}

/* ---------- Eingabe, Anhang, Ladeanzeige ---------- */

/** Wörter, die beim Warten wechseln (wie bei „AI Text Loading“). */
export const LOADING_TEXTS = ["Denke nach …", "Überlege …", "Formuliere …", "Gleich fertig …"];

/** Klassen, aus denen man wählen kann (dieselben wie GRADES in functions/ki-chat/lib.js). Die Klasse bestimmt, wie die KI antwortet. */
export const GRADES = [8, 9, 10, 11, 12];
export const DEFAULT_GRADE = 8;

export const MAX_TITLE = 60; // wie LIMITS.titleMax in functions/ki-chat/lib.js

/** Name eines Chats aus dem Eingabefeld: Leerräume zusammenfassen, höchstens MAX_TITLE Zeichen. Leer ergibt "". */
export function cleanTitle(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE).trim();
}

/** Klasse aus einem gespeicherten oder gewählten Wert (8 bis 12) oder null. */
export function cleanGrade(value) {
  const n = Number(value);
  return GRADES.includes(n) ? n : null;
}

/** Ein Wort als Buchstaben-Spans, die nacheinander aufleuchten (Welle). Der Text wird maskiert. */
export function waveHtml(text, step = 0.07) {
  return Array.from(String(text ?? "")).map((ch, i) => `<span class="kc-wave-ch" style="animation-delay:${(i * step).toFixed(2)}s">${ch === " " ? "&nbsp;" : escapeHtml(ch)}</span>`).join("");
}

/** Dateigröße für Menschen: „420 KB“, „1,3 MB“. */
export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/* ---------- Schritte einer Antwort (Nachbau von „AI Tool Calls“ aus Kokonut UI, MIT, https://kokonutui.com) ----------
 * Die Function misst die echten Schritte ihrer Arbeit (Verlauf lesen, Bild lesen, Antwort schreiben, speichern) und schickt sie mit der Antwort mit.
 * Unter der Antwort zeigt eine einklappbare Zeile „3 Schritte · 2,4 s“ mit kleinen Symbolen; aufgeklappt steht jeder Schritt mit Ergebnis und Dauer da. */

const stepSvg = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
export const STEP_ICONS = {
  history: stepSvg('<path d="M12 7v5l3 2"/><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8"/>'),
  image: stepSvg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>'),
  answer: stepSvg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  save: stepSvg('<path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5Z"/><path d="M8 5v5h7V5M8 20v-6h8v6"/>'),
};
const KNOWN_STEPS = Object.keys(STEP_ICONS);

/** Dauer für Menschen: 0,4 s, 2,4 s. */
export function formatMs(ms) {
  return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1).replace(".", ",")} s`;
}

/** Nur Schritte mit Namen, den wir kennen und zeichnen können (alles andere aus der Antwort wird ignoriert). */
export function cleanSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .filter((s) => s && KNOWN_STEPS.includes(s.id) && typeof s.label === "string")
    .map((s) => ({ id: s.id, label: s.label.slice(0, 60), detail: typeof s.detail === "string" ? s.detail.slice(0, 80) : "", ms: Number.isFinite(s.ms) ? s.ms : null }));
}

/** „3 Schritte · 2,4 s“ (die Dauer nur, wenn jeder zählbare Schritt eine hat). */
export function stepsSummary(steps) {
  const list = cleanSteps(steps);
  if (!list.length) return "";
  const timed = list.filter((s) => s.ms !== null);
  const total = timed.reduce((sum, s) => sum + s.ms, 0);
  return `${list.length} ${list.length === 1 ? "Schritt" : "Schritte"}${timed.length ? ` · ${formatMs(total)}` : ""}`;
}

/** Einklappbare Schrittliste. id verbindet Knopf und Liste (aria-controls), open = aufgeklappt. Leer, wenn es keine Schritte gibt. */
export function stepsHtml(steps, { id = "s", open = false } = {}) {
  const list = cleanSteps(steps);
  if (!list.length) return "";
  const safe = escapeHtml(id);
  return `<div class="kc-tools${open ? " is-open" : ""}">`
    + `<button class="kc-tools-head" type="button" aria-expanded="${open}" aria-controls="tools-${safe}">`
    + `<span class="kc-tools-stack" aria-hidden="true">${list.map((s) => `<i class="kc-tool-ico kc-t-${s.id}">${STEP_ICONS[s.id]}</i>`).join("")}</span>`
    + `<span class="kc-tools-sum">${escapeHtml(stepsSummary(list))}</span>`
    + `<svg class="kc-tools-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`
    + `<ol class="kc-tools-list" id="tools-${safe}"${open ? "" : " hidden"}>${list.map((s) => `<li class="kc-tool">`
      + `<i class="kc-tool-ico kc-t-${s.id}" aria-hidden="true">${STEP_ICONS[s.id]}</i>`
      + `<span class="kc-tool-text"><b>${escapeHtml(s.label)}</b>${s.detail ? `<small>${escapeHtml(s.detail)}</small>` : ""}</span>`
      + `${s.ms !== null ? `<span class="kc-tool-time">${formatMs(s.ms)}</span>` : ""}</li>`).join("")}</ol></div>`;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PDF_MAX_BYTES = 2.5 * 1024 * 1024; // so groß darf ein PDF sein, damit es mit Base64 noch durch die Function passt (IMAGE in functions/ki-chat/lib.js)
export const isPdfFile = (f) => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));

/** Darf diese Datei als Anhang gewählt werden? Gibt null oder einen Hinweistext zurück. */
export function checkAttachment(file) {
  if (!file) return "Keine Datei gewählt.";
  if (isPdfFile(file)) return file.size > PDF_MAX_BYTES ? "Das PDF ist zu groß (höchstens 2,5 MB). Schick einzelne Seiten als Bild oder ein kleineres PDF." : null;
  if (!IMAGE_TYPES.includes(file.type)) return "Anhängen kannst du Bilder (JPEG, PNG, WebP) oder ein PDF.";
  if (file.size > 25 * 1024 * 1024) return "Das Bild ist zu groß (höchstens 25 MB).";
  return null;
}
