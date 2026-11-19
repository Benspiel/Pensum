/* Appwrite-Verbindung für die ganze Plattform.
 * Endpoint und Project-ID sind öffentlich und dürfen im Frontend stehen.
 * API-Keys mit Schreibrechten gehören NIE hierher (nur in die Umgebung der CLI, siehe README). */
export const config = {
  endpoint: "https://appwrite.buchholz.dev/v1",
  projectId: "6af569a7000d660f3559",
  projectName: "pensum",

  // Datenbank und Tabellen aus appwrite.config.json
  databaseId: "pensum",
  tables: {
    subjects: "subjects",
    grades: "grades",
    handwriting: "handwriting",
    mindmaps: "mindmaps",
    decks: "decks",
    cards: "cards",
    planner: "planner",
    chats: "chats",
    chatMessages: "chat_messages",
    toolVisits: "tool_visits",
  },

  // Appwrite-Funktion, die Konto und Daten serverseitig löscht (functions/delete-account)
  functions: { deleteAccount: "delete-account", mindmap: "6afad2e10029c7718dc2", lehrerSchmidt: "lehrer-schmidt", abschreiben: "abschreiben", aufgaben: "aufgaben", kiChat: "ki-chat", adminStats: "admin-stats" },

  // Appwrite-Team, dessen Mitglieder alle ausgegrauten Tools („soon“ in js/tools.js) nutzen dürfen (js/access.js)
  testerTeam: "tester",
  // Appwrite-Team „Ki-Tester“: darf den KI-Chat nutzen (Tool mit team: "kiTester" in js/tools.js, Function ki-chat prüft es auch)
  kiTesterTeam: "ki-tester",
  // Appwrite-Team „Admin“: sieht das Modul „Team“ mit den Zahlen der ganzen Plattform (Tool admin in js/tools.js, Function admin-stats prüft es auch)
  adminTeam: "admin",

  // Betreiberangaben für Impressum und Datenschutz. Hier einmal ausfüllen, dann erscheinen sie auf allen Rechtsseiten.
  // Leere Felder werden auf den Seiten als „[bitte ergänzen]“ markiert.
  legal: {
    name: "",          // Vor- und Nachname (bzw. Firma)
    street: "",        // Straße und Hausnummer
    city: "",          // PLZ und Ort
    country: "Deutschland",
    email: "",         // E-Mail für Anfragen (Datenschutz, Impressum)
    phone: "",         // optional, aber im Impressum empfohlen
    smtpProvider: "",  // Anbieter des E-Mail-Versands (z. B. „Brevo, Frankreich“)
    hoster: "",        // Anbieter und Land des Servers, auf dem Appwrite läuft (z. B. „Hetzner Online GmbH, Deutschland“)
    logDays: "",       // nach wie vielen Tagen Server-Logs gelöscht werden (Zahl)
    backupDays: "",    // nach wie vielen Tagen Sicherungskopien überschrieben werden (Zahl)
  },

  // Auf true setzen, sobald der Google-Provider in der Appwrite-Konsole eingerichtet ist (Auth → Settings → OAuth2).
  googleOAuth: true,
};
