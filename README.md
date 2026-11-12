# Pensum

Schüler-Toolkit: mehrere Tools unter einem gemeinsamen Login. Statische Seite (HTML, CSS, ES-Module), kein Build-Schritt.

- **Notenrechner** (`/tools/notenrechner/`): gewichtete Durchschnitte, Noten 1–6 und 0–15 Punkte, Zielnote.
- **Goodnotes-Tool** (`/tools/goodnotes/`): Text zu Handschrift, Export als `.goodnotes` oder PDF. Logik aus [Inkly](https://github.com/Benspiel/Inkly), läuft komplett im Browser.

Ohne Konto bleiben Daten im `localStorage`. Mit Konto liegen sie in Appwrite und sind auf allen Geräten gleich.

## Lokal starten

```bash
npm run dev
```

Öffnet <http://localhost:5173>. Der Server (`scripts/serve.mjs`) hat keine Abhängigkeiten und setzt dieselben Header wie `vercel.json`.

```bash
npm test
```

Rechnet die Beispielrechnungen des Notenrechners durch (`tests/notenrechner.test.mjs`).

## Aufbau

```
index.html                 Startseite mit Tool-Kacheln
css/pensum.css             Designsystem nach DESIGN.md (Inter statt Saans)
js/config.js               Appwrite-Endpoint, Project-ID, Tabellen
js/auth.js                 zentrale Anmeldung (eine Session für alle Tools)
js/db.js                   Datenbank-Zugriff, Rechte pro Zeile
js/shell.js                Nav-Pill, Footer, Login-Dialog, Toasts
js/tools.js                Tool-Verzeichnis
tools/notenrechner/        core.js (Rechnen), store.js (Gast/Konto), notenrechner.js (Oberfläche)
tools/goodnotes/           ink-engine.js (Inkly-Logik), goodnotes.js (Oberfläche), templates.js
konto/passwort/            Zielseite für „Passwort zurücksetzen“
vendor/                    Appwrite-SDK, JSZip, jsPDF, Schriften (alles lokal)
appwrite.config.json       Datenbank-Schema für `appwrite push`
```

**Neues Tool:** Ordner `tools/<id>/` mit `index.html` und Modul anlegen, in `js/tools.js` eintragen. Login gibt es über `import { onAuthChange } from "/js/auth.js"`.

## Appwrite

Selbst gehostet unter `https://appwrite.buchholz.dev/v1`, Projekt `pensum` (`6af4d2f90031e22384bc`). Beides steht in `js/config.js` und ist öffentlich. API-Keys gehören nie ins Repo.

### Einrichten mit der CLI

```bash
npm i -g appwrite-cli
appwrite login --endpoint https://appwrite.buchholz.dev/v1
appwrite push table --all --force
```

`appwrite.config.json` (früher `appwrite.json`) beschreibt die Datenbank `pensum` mit den Tabellen `subjects`, `grades` und `handwriting`. Jede Tabelle hat Row Security und als Tabellenrecht nur `create("users")`. Zeilen bekommen beim Anlegen Lese-, Änder- und Löschrechte nur für `user:<id>` (`js/db.js`).

### Plattformen (sonst blockt CORS)

`localhost` ist eingetragen. Für jede weitere Domain:

```bash
appwrite project create-web-platform --platform-id "unique()" --name "Pensum Vercel" --hostname <deine-domain>
```

### Anmeldung

E-Mail und Passwort sind aktiv. Für „Passwort zurücksetzen“ muss auf dem Server SMTP eingerichtet sein. Google ist optional: Provider in der Konsole einrichten, dann `googleOAuth: true` in `js/config.js`.

## Vercel

Projekt importieren, Framework „Other“, kein Build-Befehl, Ausgabeverzeichnis `.`. Danach die Vercel-Domain als Web-Plattform in Appwrite eintragen (siehe oben). `vercel.json` setzt die Content-Security-Policy; wenn sich der Appwrite-Endpoint ändert, dort `connect-src` anpassen.

## Vendor-Dateien

`vendor/appwrite.js` ist das offizielle Web-SDK 28.3.0 als ein ES-Modul:

```bash
npm i appwrite@28.3.0 esbuild
npx esbuild node_modules/appwrite/dist/esm/sdk.js --bundle --format=esm --minify --outfile=vendor/appwrite.js
```

Schriften kommen von Fontsource (SIL Open Font License), Lizenztexte liegen in `vendor/fonts/`.
