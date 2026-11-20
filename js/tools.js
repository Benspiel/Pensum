/* Tool-Verzeichnis: die eine Stelle, an der ein neues Tool angemeldet wird.
 * Startseite, Navigation und Footer lesen diese Liste.
 *
 * Neues Tool hinzufügen:
 *   1. Ordner /tools/<id>/ mit index.html und eigenem Modul anlegen (Vorlage: /tools/notenrechner/).
 *   2. Hier einen Eintrag ergänzen.
 */

import { config } from "./config.js";

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Reihenfolge auf Startseite und im Footer. Tools, die hier fehlen, stehen am Ende (in der Reihenfolge ihrer Einträge unten). */
export const TOOL_ORDER = ["goodnotes", "mindmap", "kichat", "aufgaben", "abschreiben", "karteikarten", "planer", "videos", "spiele", "admin"];

const entries = [
  {
    id: "goodnotes",
    name: "Goodnotes-Tool",
    href: "/tools/goodnotes/",
    description: "Getippten Text in Handschrift verwandeln und als .goodnotes-Datei oder PDF exportieren. Läuft komplett im Browser.",
    icon: icon('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  },
  {
    id: "aufgaben",
    ai: true, // nutzt Gemini; aus, solange config.aiEnabled false ist
    name: "Aufgaben",
    href: "/tools/aufgaben/",
    description: "Arbeitsblatt hochladen, die KI füllt die Aufgaben aus, in normaler Schrift oder in Handschrift. 2 Durchläufe pro Tag, Ergebnis als PDF oder Bild.",
    icon: icon('<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="m9 15 2 2 4-4.5"/>'),
    badge: "Kommt bald",
    soon: true, // ausgegraut und nicht klickbar; zum Freischalten die Zeile entfernen
  },
  {
    id: "notenrechner",
    name: "Notenrechner",
    href: "/tools/notenrechner/",
    description: "Trag pro Fach deine Zeugnisnote ein und sieh sofort deinen Zeugnisdurchschnitt, in Noten oder Punkten.",
    icon: icon('<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'),
  },
  {
    id: "karteikarten",
    name: "Karteikarten",
    href: "/tools/karteikarten/",
    description: "Bis zu 5 Stapel mit Vorder- und Rückseite. Lerne mit 5 Leveln oder der Reihe nach, zum Umdrehen oder als schriftlicher Test.",
    icon: icon('<rect x="3" y="6" width="14" height="12" rx="2.5"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/>'),
  },
  {
    id: "planer",
    name: "Planer",
    href: "/tools/planer/",
    description: "Hausaufgaben mit Fälligkeit und Klausurtermine mit Countdown. Verknüpfe eine Klausur mit deinen Karteikarten und lerne direkt dafür.",
    icon: icon('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8.5 15l2 2 4-4"/>'),
  },
  {
    id: "abschreiben",
    ai: true, // nutzt Gemini; aus, solange config.aiEnabled false ist
    name: "Abschreiben",
    href: "/tools/abschreiben/",
    description: "Tafelbild fotografieren, die KI schreibt den Text ab. Du kopierst ihn oder machst daraus deine Handschrift für Goodnotes.",
    icon: icon('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1 1 0 0 1 10.1 4h3.8a1 1 0 0 1 .8.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><path d="M9 12.5h6M9 15h3.5"/>'),
    badge: "Neu",
  },
  {
    id: "mindmap",
    ai: true, // nutzt Gemini; aus, solange config.aiEnabled false ist
    name: "Mindmap-Generator",
    href: "/tools/mindmap/",
    description: "Die KI baut jeden Tag eine Mindmap zu deinem Thema. Du änderst sie mit KI (3-mal pro Tag) oder direkt im Editor.",
    icon: icon('<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="4.5" cy="18" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="19.5" cy="18" r="1.8"/><path d="M6 7l4.2 3.6M6 17l4.2-3.6M18 7l-4.2 3.6M18 17l-4.2-3.6"/>'),
  },
  {
    id: "spiele",
    name: "Spiele",
    href: "/tools/spiele/",
    description: "Vier gewinnt gegen den Computer und Open-Source-Klassiker wie Asteroids und Dino-Runner. Läuft im Browser.",
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
  {
    id: "kichat",
    ai: true, // nutzt Gemini; aus, solange config.aiEnabled false ist
    name: "KI-Chat",
    href: "/tools/kichat/",
    description: "Ganz normale Chats mit der Gemini-KI. Deine Chats werden in deinem Konto gespeichert und lassen sich jederzeit weiterführen.",
    icon: icon('<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h8M8 13h5"/>'),
    badge: "Ki-Tester",
    team: "kiTester", // nur für Mitglieder des Teams „ki-tester“ (config.kiTesterTeam), sonst ausgegraut
  },
  {
    id: "admin",
    name: "Team",
    href: "/tools/admin/",
    description: "Zahlen der ganzen Plattform: wie viele Nutzer es gibt, wie oft welches Tool geöffnet wurde und was angelegt wurde.",
    icon: icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    badge: "Admin",
    team: "admin", // nur für Mitglieder des Teams „admin“ (config.adminTeam), für alle anderen unsichtbar
  },
];

/** KI-Tools sind bei config.aiEnabled = false „off“: gesperrt für alle, auch für Tester und Teams. */
const withOff = (t) => (t.ai && !config.aiEnabled ? { ...t, off: true } : t);

const rank = (t) => { const i = TOOL_ORDER.indexOf(t.id); return i < 0 ? TOOL_ORDER.length : i; };
export const tools = entries.map(withOff).sort((a, b) => rank(a) - rank(b)); // Array.sort ist stabil: Unbekannte behalten ihre Reihenfolge

export const toolById = (id) => tools.find((t) => t.id === id);
