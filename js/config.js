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

  // Appwrite-Funktion, die Konto und Daten serverseitig löscht (functions/delete-account)
  functions: { deleteAccount: "delete-account" },

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
  },

  // Auf true setzen, sobald der Google-Provider in der Appwrite-Konsole eingerichtet ist (Auth → Settings → OAuth2).
  googleOAuth: false,
};
