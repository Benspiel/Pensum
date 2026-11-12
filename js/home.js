/* Startseite: Kacheln aus dem Tool-Verzeichnis. */
import { tools } from "/js/tools.js";
import { onAuthChange } from "/js/auth.js";
import { esc } from "/js/shell.js";

const grid = document.getElementById("toolGrid");

grid.innerHTML =
  tools
    .map(
      (t) => `
    <a class="card tool-card" href="${t.href}">
      <div class="tool-card-head">
        <span class="squircle">${t.icon}</span>
        ${t.badge ? `<span class="badge badge-accent">${esc(t.badge)}</span>` : ""}
      </div>
      <h3 class="h4">${esc(t.name)}</h3>
      <p class="body-sm">${esc(t.description)}</p>
      <span class="tool-card-foot">Öffnen <span aria-hidden="true">↗</span></span>
    </a>`,
    )
    .join("") +
  `
    <div class="card tool-card tool-card-soft">
      <div class="tool-card-head">
        <span class="squircle squircle-soft" style="background: var(--canvas)" aria-hidden="true">+</span>
      </div>
      <h3 class="h4">Bald mehr.</h3>
      <p class="body-sm">Jedes Tool ist ein eigenes Modul. Neue kommen dazu, deine Anmeldung gilt automatisch auch dort.</p>
    </div>`;

// „Konto erstellen“ nur zeigen, solange niemand angemeldet ist
onAuthChange(({ status, user }) => {
  document.querySelectorAll("[data-guest-only]").forEach((el) => { el.hidden = status !== "ready" || !!user; });
});
