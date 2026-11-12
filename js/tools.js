/* Tool-Verzeichnis: die eine Stelle, an der ein neues Tool angemeldet wird.
 * Startseite, Navigation und Footer lesen diese Liste.
 *
 * Neues Tool hinzufügen:
 *   1. Ordner /tools/<id>/ mit index.html und eigenem Modul anlegen (Vorlage: /tools/notenrechner/).
 *   2. Hier einen Eintrag ergänzen.
 */

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const tools = [
  {
    id: "notenrechner",
    name: "Notenrechner",
    href: "/tools/notenrechner/",
    description: "Gewichteter Durchschnitt pro Fach und insgesamt, in Noten oder Punkten. Mit Zielnote-Rechner.",
    icon: icon('<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'),
    badge: "Neu",
  },
  {
    id: "goodnotes",
    name: "Goodnotes-Tool",
    href: "/tools/goodnotes/",
    description: "Getippten Text in Handschrift verwandeln und als .goodnotes-Datei oder PDF exportieren. Läuft komplett im Browser.",
    icon: icon('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  },
];

export const toolById = (id) => tools.find((t) => t.id === id);
