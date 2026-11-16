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
    description: "Trag pro Fach deine Zeugnisnote ein und sieh sofort deinen Zeugnisdurchschnitt, in Noten oder Punkten.",
    icon: icon('<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'),
    badge: "Neu",
  },
  {
    id: "karteikarten",
    name: "Karteikarten",
    href: "/tools/karteikarten/",
    description: "Bis zu 5 Stapel mit Vorder- und Rückseite. Lerne mit 5 Leveln oder der Reihe nach, zum Umdrehen oder als schriftlicher Test.",
    icon: icon('<rect x="3" y="6" width="14" height="12" rx="2.5"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/>'),
    badge: "Neu",
  },
  {
    id: "goodnotes",
    name: "Goodnotes-Tool",
    href: "/tools/goodnotes/",
    description: "Getippten Text in Handschrift verwandeln und als .goodnotes-Datei oder PDF exportieren. Läuft komplett im Browser.",
    icon: icon('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  },
  {
    id: "mindmap",
    name: "Mindmap-Generator",
    href: "/tools/mindmap/",
    description: "Die KI baut jeden Tag eine Mindmap zu deinem Thema. Du änderst sie mit KI (3-mal pro Tag) oder direkt im Editor.",
    icon: icon('<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="4.5" cy="18" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="19.5" cy="18" r="1.8"/><path d="M6 7l4.2 3.6M6 17l4.2-3.6M18 7l-4.2 3.6M18 17l-4.2-3.6"/>'),
    badge: "Neu",
  },
  {
    id: "spiele",
    name: "Spiele",
    href: "/tools/spiele/",
    description: "17 Spiele für die Pause: 2048, Snake, Tetris, Sudoku, Memory, Vier gewinnt, Breakout und mehr. Läuft im Browser, Bestwerte bleiben auf deinem Gerät.",
    icon: icon('<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M8 10.5v4M6 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18" cy="14" r="1"/>'),
    badge: "Kommt bald",
    soon: true, // ausgegraut und nicht klickbar; zum Freischalten die Zeile entfernen
  },
  {
    id: "videos",
    name: "Erklärvideos",
    href: "/tools/videos/",
    description: "Gib dein Thema ein und Pensum findet ein passendes Video von Lehrer Schmidt, das du direkt hier ansehen kannst.",
    icon: icon('<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10.5 9.5 4 2.5-4 2.5v-5Z"/>'),
    badge: "Kommt bald",
    soon: true, // ausgegraut und nicht klickbar; zum Freischalten die Zeile entfernen
  },
];

export const toolById = (id) => tools.find((t) => t.id === id);
