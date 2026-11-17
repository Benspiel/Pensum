/* Export-Menü: Wer in einem Tool „Exportieren“ drückt, bekommt dieses Menü (Zeilen im Stil des Stack Panels, js/stack-panel.js)
 * mit den Formaten, die das Tool kann: Goodnotes, PDF, Bild. Die Wahl läuft als Promise Toast (js/promise-toast.js):
 * „arbeitet“ → „gespeichert“, bei einem Fehler mit „Nochmal“.
 *
 *   import { openExportMenu } from "/js/export-menu.js";
 *   exportBtn.addEventListener("click", () => openExportMenu({
 *     options: [
 *       { id: "pdf", icon: "pdf", label: "Als PDF", hint: "Zum Drucken und Teilen", loading: "PDF wird erstellt …", success: "PDF gespeichert",
 *         run: async () => { …; return "datei.pdf"; } },   // der Rückgabewert steht als zweite Zeile im Toast
 *       { id: "gn", icon: "goodnotes", label: "Als Goodnotes", hint: ".goodnotes-Datei", run: async () => … },
 *     ],
 *   }));
 *
 * Wirft run einen Fehler, steht dessen Meldung im Toast. Soll ein Abbruch still bleiben (z. B. „Abbrechen“ im Rückfrage-Dialog),
 * gibt run `CANCELLED` zurück: Dann verschwindet der Toast wieder, ohne etwas zu melden. */
import { promiseToast } from "/js/promise-toast.js";
import { CANCELLED, exportToastOptions } from "/js/export-core.js";

export const EXPORT_ICONS = {
  goodnotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
};
const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export { CANCELLED };

/** Führt eine Exportzeile als Promise Toast aus. */
export function runExport(option) {
  const toast = promiseToast(async (report) => {
    const value = await option.run(report);
    if (value === CANCELLED) toast.dismiss(); // run läuft erst nach dem Aufruf, toast ist dann gesetzt
    return value;
  }, exportToastOptions(option));
  return toast;
}

function ensureStyles() {
  for (const href of ["/css/stack-panel.css", "/css/export-menu.css"]) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
  }
}

/** Öffnet das Export-Menü. Liefert ein Promise, das beim Schließen endet (mit der gewählten Zeile oder null). */
export function openExportMenu({ title = "Exportieren", options = [], footer = "" } = {}) {
  ensureStyles();
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "modal em";
    d.setAttribute("aria-labelledby", "emTitle");
    d.innerHTML = `
      <div class="sp em-panel">
        <header class="sp-head">
          <span aria-hidden="true"></span>
          <div class="sp-title-wrap"><span class="sp-title" id="emTitle">${escapeHtml(title)}</span></div>
          <button class="icon-btn em-close" type="button" aria-label="Schließen">${CLOSE}</button>
        </header>
        <div class="sp-body"><div class="sp-page">
          <ul class="sp-list">${options.map((o, i) => `
            <li><button class="sp-row em-row" type="button" data-i="${i}"${o.disabled ? " disabled" : ""}>
              <span class="em-icon">${EXPORT_ICONS[o.icon] || EXPORT_ICONS.pdf}</span>
              <span class="em-text"><b>${escapeHtml(o.label)}</b>${o.hint ? `<small>${escapeHtml(o.hint)}</small>` : ""}</span>
            </button></li>`).join("")}
          </ul>
          ${footer ? `<p class="sp-footer">${escapeHtml(footer)}</p>` : ""}
        </div></div>
      </div>`;
    document.body.append(d);

    let picked = null;
    const rows = [...d.querySelectorAll(".em-row")];
    d.addEventListener("click", (e) => {
      if (e.target === d) { d.close(); return; }                       // Klick auf den Hintergrund
      if (e.target.closest(".em-close")) { d.close(); return; }
      const row = e.target.closest(".em-row");
      if (row) { picked = options[Number(row.dataset.i)]; d.close(); }
    });
    d.addEventListener("keydown", (e) => {                             // Pfeiltasten springen zwischen den Zeilen
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement);
      rows[(at + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length].focus();
    });
    d.addEventListener("close", () => {
      d.remove();
      if (picked) runExport(picked);                                   // erst nach dem Schließen, damit der Toast nicht unter dem Dialog liegt
      resolve(picked);
    });
    d.showModal();
    (rows.find((r) => !r.disabled) || d.querySelector(".em-close")).focus();
  });
}
