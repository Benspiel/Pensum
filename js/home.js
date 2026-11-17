/* Startseite: Kacheln aus dem Tool-Verzeichnis. */
import { tools } from "/js/tools.js";
import { onAuthChange } from "/js/auth.js";
import { onTesterChange, isLocked } from "/js/access.js";
import { esc } from "/js/shell.js";
import { initParallax, initReveal } from "/js/parallax.js";

const grid = document.getElementById("toolGrid");

function render(tester) {
  grid.innerHTML =
  tools
    .map(
      (t) => isLocked(t, tester)
        ? `
    <div class="card tool-card tool-card-off reveal" aria-disabled="true">
      <div class="tool-card-head">
        <span class="squircle">${t.icon}</span>
        <span class="badge badge-soft">${esc(t.badge || "Kommt bald")}</span>
      </div>
      <h3 class="h4">${esc(t.name)}</h3>
      <p class="body-sm">${esc(t.description)}</p>
      <span class="tool-card-foot">Kommt bald</span>
    </div>`
        : `
    <a class="card tool-card reveal" href="${t.href}">
      <div class="tool-card-head">
        <span class="squircle">${t.icon}</span>
        ${t.soon ? `<span class="badge badge-accent">Tester</span>` : t.badge ? `<span class="badge badge-accent">${esc(t.badge)}</span>` : ""}
      </div>
      <h3 class="h4">${esc(t.name)}</h3>
      <p class="body-sm">${esc(t.description)}</p>
      <span class="tool-card-foot">Öffnen <span aria-hidden="true">↗</span></span>
    </a>`,
    )
    .join("") +
  `
    <div class="card tool-card tool-card-soft reveal">
      <div class="tool-card-head">
        <span class="squircle squircle-soft" style="background: var(--canvas)" aria-hidden="true">+</span>
      </div>
      <h3 class="h4">Bald mehr.</h3>
      <p class="body-sm">Jedes Tool ist ein eigenes Modul. Neue kommen dazu, deine Anmeldung gilt automatisch auch dort.</p>
    </div>`;
}

render(false);
initParallax();
initReveal(document);

// Tester (Team „tester“) bekommen die ausgegrauten Kacheln freigeschaltet
onTesterChange((tester) => {
  if (!tester) return;
  render(true);
  grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
});

// „Konto erstellen“ nur zeigen, solange niemand angemeldet ist
onAuthChange(({ status, user }) => {
  document.querySelectorAll("[data-guest-only]").forEach((el) => { el.hidden = status !== "ready" || !!user; });
});
