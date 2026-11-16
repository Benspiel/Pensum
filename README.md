# Pensum

Schüler-Toolkit: mehrere Tools unter einem gemeinsamen Login. Statische Seite (HTML, CSS, ES-Module), kein Build-Schritt.

- **Notenrechner** (`/tools/notenrechner/`): eine Zeugnisnote pro Fach und Halbjahr, daraus der Zeugnisdurchschnitt; Noten 1–6 oder Punkte 0–15.
- **Goodnotes-Tool** (`/tools/goodnotes/`): Text zu Handschrift, Export als `.goodnotes` oder PDF. Logik aus [Inkly](https://github.com/Benspiel/Inkly), läuft komplett im Browser.

- **Mindmap-Generator** (`/tools/mindmap/`): Gemini erstellt pro Tag eine Mindmap (nur mit Konto), die sich 3-mal mit KI und beliebig oft von Hand im Editor ändern lässt. Der Schlüssel liegt serverseitig (siehe „Mindmap-Generator einrichten“).

- **Spiele** (`/tools/spiele/`): 17 Spiele in vier Gruppen. Klassiker: 2048, Snake, Tetris, Minesweeper. Denken und Rätseln: Sudoku, Memory, Vier gewinnt (KI), Tic-Tac-Toe (KI), Schiebepuzzle, Lights Out, Mastermind. Wörter und Zahlen: Galgenmännchen, Kopfrechnen-Blitz. Geschick: Breakout, Pong (KI), Hüpfer, Simon. Alles ist selbst nach bekannten, freien Spielregeln geschrieben (kein fremder Code, keine fremden Bilder oder Töne). Die Regeln liegen ohne Oberfläche je Spiel in `tools/spiele/*.js` (getestet), die Oberflächen in `ui-klassiker.js`, `ui-denken.js`, `ui-geschick.js`, die Auswahl in `spiele.js`. Bestwerte stehen nur im `localStorage` (`pensum.spiele.best.v1`).

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
js/parallax.js             Parallax-Scrolling und Einblenden der Startseite (respektiert „Bewegung reduzieren“)
tools/notenrechner/        core.js (Rechnen), store.js (Gast/Konto), notenrechner.js (Oberfläche)
tools/mindmap/             tree.js (Baum, Layout), hand.js (eigene Handschrift), mindmap.js (Editor)
functions/mindmap/         Appwrite-Function: Gemini-Aufruf und Tageslimits (lib.js = Logik, index.js = Anbindung)
tools/spiele/              17 Spiele: Regeln je Spiel (g2048.js, sudoku.js, connect4.js, …), ui-*.js (Oberflächen), spiele.js (Auswahl)
tools/goodnotes/           ink-engine.js (Inkly-Logik), goodnotes.js (Oberfläche), templates.js
konto/passwort/            Zielseite für „Passwort zurücksetzen“
vendor/                    Appwrite-SDK, JSZip, jsPDF, Schriften (alles lokal)
appwrite.config.json       Datenbank-Schema für `appwrite push`
```

**Design:** Alle Seiten nutzen dieselben Bausteine aus `css/pensum.css` (Abschnitt „Gemeinsame Bausteine“): `hero-card`, `tabs`/`segmented`, `panel`, `group`/`group-row`, `chips-row`, `form-stack`. Die Bewegung (Einblenden, Hover, Fokus) ist dort ebenfalls einheitlich definiert.

**Neues Tool:** Ordner `tools/<id>/` mit `index.html` und Modul anlegen, in `js/tools.js` eintragen. Login gibt es über `import { onAuthChange } from "/js/auth.js"`.

## Appwrite

Selbst gehostet unter `https://appwrite.buchholz.dev/v1`, Projekt `pensum` (`6af569a7000d660f3559`). Beides steht in `js/config.js` und ist öffentlich. API-Keys gehören nie ins Repo.

### Einrichten mit der CLI

```bash
npm i -g appwrite-cli
appwrite login --endpoint https://appwrite.buchholz.dev/v1
appwrite push table --all --force
```

`appwrite.config.json` (früher `appwrite.json`) beschreibt die Datenbank `pensum` mit den Tabellen `subjects`, `grades`, `handwriting`, `decks` und `cards` (Karteikarten) sowie `planner` (Hausaufgaben und Klausuren). Jede Tabelle hat Row Security und als Tabellenrecht nur `create("users")`. Zeilen bekommen beim Anlegen Lese-, Änder- und Löschrechte nur für `user:<id>` (`js/db.js`).

### Konto löschen (Appwrite-Function)

`functions/delete-account/` löscht Konto und alle Daten serverseitig; der Knopf unter `/konto/` ruft sie auf. Sie läuft ohne Abhängigkeiten (der Server hat nur `node-16.0`) und nutzt den pro Aufruf erzeugten Schlüssel, im Repo steht kein API-Key.

```bash
appwrite push function --function-id delete-account --force
```

Schlägt der Build mit „Download failed with status 500“ fehl, liegt es am Server: `docker logs appwrite-worker-builds` ansehen.

### Mindmap-Generator einrichten

Die Function `mindmap` (`functions/mindmap/`) ruft Gemini auf und zählt die Tageslimits (1 Mindmap, 3 KI-Änderungen pro Konto und Tag, Tageswechsel um Mitternacht deutscher Zeit). Der Gemini-Schlüssel steht nur dort als geheime Umgebungsvariable, nie im Repo oder Browser. Neue Tabellen: `mindmaps` (Mindmaps, nur für den Besitzer lesbar) und `mindmap_usage` (Zähler, ohne Nutzerrechte: nur die Function liest und schreibt sie).

```bash
appwrite push table --all --force
appwrite push function --function-id mindmap --force
appwrite functions create-variable --function-id mindmap --key GEMINI_API_KEY --value "<dein Schlüssel aus Google AI Studio>" --secret true
# optional anderes Modell (Standard: gemini-3.5-flash-lite)
appwrite functions create-variable --function-id mindmap --key GEMINI_MODEL --value "<modellname>"
```

Danach `appwrite push function` erneut ausführen, falls die Variable erst nach dem ersten Deploy gesetzt wurde. Läuft die Function nicht, zeigt das Tool „Der Mindmap-Dienst ist noch nicht eingerichtet“ und alte Mindmaps bleiben bearbeitbar. Da die Function jede Anfrage bezahlt, begrenzen die Limits die Kosten pro Konto; im Google-Konto lohnt sich zusätzlich eine Budgetgrenze für den Schlüssel.

### Rechtsseiten

`/impressum/`, `/datenschutz/`, `/cookies/`, `/nutzungsbedingungen/`. Die Betreiberangaben stehen einmal in `js/config.js` unter `legal`; leere Felder erscheinen als „[bitte ergänzen]“ gelb markiert. Es gibt kein Cookie-Banner, weil nur technisch notwendiger Speicher genutzt wird (siehe `/cookies/`). Kommt Tracking dazu, braucht es eine Einwilligung.

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

## Erklärvideos (Lehrer Schmidt)

Das Modul `tools/videos/` ist noch ausgeblendet (`soon: true` in `js/tools.js`). Die Suche läuft über die Appwrite-Function `lehrer-schmidt` (`functions/lehrer-schmidt/`), die den Kanal per YouTube Data API durchsucht. Zum Freischalten:

1. API-Schlüssel (YouTube Data API v3) in Google Cloud anlegen und als geheime Variable setzen:
   `appwrite functions create-variable --function-id lehrer-schmidt --key YOUTUBE_API_KEY --value <schlüssel> --secret true`
2. Function deployen: `appwrite push function --function-id lehrer-schmidt`
3. In `js/tools.js` die Zeile `soon: true` beim Eintrag `videos` entfernen.

Optional: `CHANNEL_HANDLE` (Standard `LehrerSchmidt`) oder `CHANNEL_ID`. Eine Suche kostet 100 Kontingent-Einheiten (Standard 10 000 pro Tag), gleiche Suchen werden 6 Stunden zwischengespeichert. Der Player (youtube-nocookie.com) lädt erst nach dem Klick auf „Hier ansehen“; die CSP in `vercel.json` erlaubt dafür `frame-src`.
