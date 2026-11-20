/* Schalter für die KI-Tools (Mindmap, Aufgaben, Abschreiben, KI-Chat).
 * Die Seite lädt statt ihres Moduls dieses Skript; das eigentliche Modul steht in data-ai-module.
 * Ist config.aiEnabled aus, wird es gar nicht erst geladen: Die Seite zeigt nur einen Hinweis und ruft keine Function auf.
 * Wieder einschalten: README, Abschnitt „KI-Schalter“. */
import { config } from "/js/config.js";

const tag = document.querySelector("script[data-ai-module]");
const module = tag && tag.dataset.aiModule;

if (config.aiEnabled && module) {
  await import(module);
} else {
  const main = document.getElementById("inhalt");
  if (main) {
    main.innerHTML = `
      <header class="tool-head">
        <h1 class="h2">Gerade ausgeschaltet.</h1>
        <p class="body-lg">Dieses Tool nutzt eine KI und ist zurzeit abgeschaltet. Dabei werden keine Daten übertragen. Alle anderen Tools laufen wie gewohnt.</p>
      </header>
      <p><a class="btn btn-primary" href="/">Zur Startseite</a></p>`;
  }
}
