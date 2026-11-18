/* Promise Toast – KokonutUI „Promise Toast“ (MIT, https://kokonutui.com), die echte Komponente als React-Insel (ui/src/components/kokonutui/promise-toast.tsx).
 * Ein Toast begleitet eine Aufgabe: erst „arbeitet“ (Ring), dann „fertig“ (Haken) oder „fehlgeschlagen“ (mit „Nochmal“).
 * Mehrere Toasts liegen gestapelt und fächern sich auf, solange man mit der Maus oder der Tastatur darauf ist; zur Seite wischen oder Escape schließt.
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
 * Die Aufgabe ist eine Funktion (kein fertiges Promise), damit „Nochmal“ sie neu starten kann.
 * Gibt { dismiss } zurück. Die Insel (vendor/ui) lädt beim ersten Toast; lädt sie nicht, läuft die Aufgabe trotzdem und ein einfacher Hinweis meldet das Ergebnis. */
import { loadIslands } from "/js/islands.js";

/** Ohne die Insel: Aufgabe trotzdem ausführen und das Ergebnis als schlichte Meldung zeigen. */
async function plainFallback(task, options) {
  const text = (lines, value) => { const l = typeof lines === "function" ? lines(value) : lines; return Array.isArray(l) ? l.filter(Boolean).join(" – ") : String(l ?? ""); };
  const { toast } = await import("/js/shell.js");
  try {
    const value = await task(() => {});
    toast(text(options.success, value));
  } catch (e) {
    toast(text(options.error ?? "Das hat nicht geklappt", e), { error: true });
  }
}

export function promiseToast(task, options) {
  const handle = { id: null, gone: false, ui: null, dismiss() { this.gone = true; if (this.ui && this.id !== null) this.ui.dismissToast(this.id); } };
  loadIslands().then((ui) => {
    if (!ui) { plainFallback(task, options); return; }
    handle.ui = ui;
    handle.id = ui.showToast(task, options); // die Aufgabe startet in dieser Zeile; ein Abbruch darin (dismiss) kommt erst danach
    if (handle.gone) ui.dismissToast(handle.id);
  });
  return handle;
}
