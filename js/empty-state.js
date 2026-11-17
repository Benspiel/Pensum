/* Empty State – Nachbau von „Empty State“ aus Kokonut UI (MIT, https://kokonutui.com) in Vanilla-HTML und CSS (css/empty-state.css).
 * Eine leere Liste bekommt eine kleine Zeichnung (gestapelte Karten), Titel, Erklärung und bis zu zwei Knöpfe.
 * Fährt man auf den Hauptknopf, hebt sich die Karte, die gleich entstehen würde.
 *
 *   import { emptyStateHtml } from "/js/empty-state.js";
 *   el.innerHTML = emptyStateHtml({
 *     title: "Noch keine Stapel.",
 *     description: "Lege deinen ersten Vokabelstapel an.",
 *     primary: { label: "Ersten Stapel erstellen", act: "new-deck" },   // act wird zu data-act am Knopf
 *     secondary: { label: "Hilfe", act: "help" },                      // optional
 *     compact: false,                                                   // true: kleinere Fläche, z. B. in einem Stapel ohne Karten
 *   });
 *
 * Die Seite braucht <link rel="stylesheet" href="/css/empty-state.css">. Reine Funktion ohne Browser-Abhängigkeit, daher testbar. */

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function button(spec, cls) {
  if (!spec || !spec.label) return "";
  const act = spec.act ? ` data-act="${escapeHtml(spec.act)}"` : "";
  const extra = spec.attrs ? Object.entries(spec.attrs).map(([k, v]) => ` ${escapeHtml(k)}="${escapeHtml(v)}"`).join("") : "";
  return `<button class="${cls}" type="button"${act}${extra}>${cls.includes("es-primary") ? PLUS : ""}${escapeHtml(spec.label)}</button>`;
}

/** HTML eines leeren Zustands. Titel, Text und Beschriftungen werden maskiert. */
export function emptyStateHtml({ title = "Noch nichts da", description = "", primary = null, secondary = null, compact = false } = {}) {
  return `<section class="es${compact ? " es-compact" : ""}" aria-label="${escapeHtml(title)}">`
    + `<div class="es-art" aria-hidden="true"><i class="es-card es-card-3"></i><i class="es-card es-card-2"></i><i class="es-card es-card-1"><b></b><b></b></i><i class="es-card es-card-new">${PLUS}</i></div>`
    + `<h2 class="es-title">${escapeHtml(title)}</h2>`
    + (description ? `<p class="es-text">${escapeHtml(description)}</p>` : "")
    + (primary || secondary ? `<div class="es-actions">${button(primary, "es-btn es-primary")}${button(secondary, "es-btn es-secondary")}</div>` : "")
    + `</section>`;
}
