/* Loader – Nachbau von „Loader“ aus Kokonut UI (MIT, https://kokonutui.com) in Vanilla-HTML und CSS (css/loader.css).
 * Vier Ringe in currentColor drehen sich gegeneinander, darunter Titel und Untertitel.
 *
 *   import { loaderHtml } from "/js/loader.js";
 *   el.innerHTML = loaderHtml({ title: "Konto wird geladen …", subtitle: "Einen Moment bitte.", size: "md" });
 *
 * Die Seite braucht <link rel="stylesheet" href="/css/loader.css">. Reine Funktion ohne Browser-Abhängigkeit, daher testbar. */

const SIZES = ["sm", "md", "lg"];
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** HTML eines Loaders. size: "sm" | "md" | "lg". Leerer subtitle zeigt nur den Titel. Titel und Untertitel werden maskiert. */
export function loaderHtml({ title = "Wird geladen …", subtitle = "", size = "md" } = {}) {
  const s = SIZES.includes(size) ? size : "md";
  return `<div class="loader loader-${s}" role="status">`
    + `<div class="loader-rings" aria-hidden="true"><i class="loader-ring loader-outer"></i><i class="loader-ring loader-primary"></i><i class="loader-ring loader-counter"></i><i class="loader-ring loader-accent"></i></div>`
    + `<output class="loader-text"><span class="loader-title">${escapeHtml(title)}</span>${subtitle ? `<span class="loader-sub">${escapeHtml(subtitle)}</span>` : ""}</output>`
    + `</div>`;
}
