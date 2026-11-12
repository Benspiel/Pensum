/* Füllt die Betreiberangaben aus js/config.js in die Rechtsseiten und bedient den „Lokale Daten löschen“-Knopf. */
import { config } from "/js/config.js";

const L = config.legal || {};

function fill(el, key) {
  const v = (L[key] || "").trim();
  if (v) { el.textContent = v; return; }
  el.textContent = "[bitte ergänzen]";
  el.classList.add("legal-missing");
}

document.querySelectorAll("[data-legal]").forEach((el) => {
  // Optionale Felder (Telefon) verschwinden samt Zeile, wenn leer
  if (el.dataset.legal === "phone" && !(L.phone || "").trim()) { el.textContent = "auf Anfrage per E-Mail"; return; }
  fill(el, el.dataset.legal);
});

document.querySelectorAll("[data-legal-mail]").forEach((a) => {
  const v = (L[a.dataset.legalMail] || "").trim();
  if (!v) { fill(a, a.dataset.legalMail); a.removeAttribute("href"); return; }
  a.textContent = v;
  a.href = "mailto:" + v;
});

const clear = document.getElementById("clearLocal");
if (clear) {
  clear.addEventListener("click", async () => {
    const { confirmDialog } = await import("/js/shell.js");
    const ok = await confirmDialog({
      title: "Lokale Daten löschen?",
      text: "Gast-Fächer, Noten, Einstellungen und das lokale Handschrift-Profil dieses Browsers werden entfernt. Das lässt sich nicht rückgängig machen.",
      confirm: "Löschen",
    });
    if (!ok) return;
    let n = 0;
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("pensum.")) { localStorage.removeItem(k); n++; }
    } catch (_) { /* privater Modus */ }
    const msg = document.getElementById("clearLocalMsg");
    msg.textContent = n ? `${n} gespeicherte ${n === 1 ? "Eintrag" : "Einträge"} gelöscht.` : "Es war nichts Lokales gespeichert.";
    msg.hidden = false;
  });
}
