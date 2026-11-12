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
  },

  // Auf true setzen, sobald der Google-Provider in der Appwrite-Konsole eingerichtet ist (Auth → Settings → OAuth2).
  googleOAuth: false,
};
