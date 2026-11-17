# Pensum

Schüler-Toolkit: mehrere Tools unter einem gemeinsamen Login. Statische Seite (HTML, CSS, ES-Module), kein Build-Schritt.

- **Notenrechner** (`/tools/notenrechner/`): eine Zeugnisnote pro Fach und Halbjahr, daraus der Zeugnisdurchschnitt; Noten 1–6 oder Punkte 0–15.
- **Goodnotes-Tool** (`/tools/goodnotes/`): Text zu Handschrift, Export als `.goodnotes` oder PDF. Logik aus [Inkly](https://github.com/Benspiel/Inkly), läuft komplett im Browser.

- **Mindmap-Generator** (`/tools/mindmap/`): Gemini erstellt pro Tag eine Mindmap (nur mit Konto), die sich 3-mal mit KI und beliebig oft von Hand im Editor ändern lässt. Der Schlüssel liegt serverseitig (siehe „Mindmap-Generator einrichten“).

- **Abschreiben** (`/tools/abschreiben/`): Tafelbild fotografieren (nur mit Konto), Gemini liest den Text heraus (5 Scans pro Tag). Der Text lässt sich kopieren oder mit „In Handschrift umwandeln“ ans Goodnotes-Tool übergeben (Schrift, eigene Handschrift, Export dort). Das Foto wird im Browser auf höchstens 1800 px verkleinert und nirgends gespeichert. Siehe „Abschreiben einrichten“.

- **Aufgaben** (`/tools/aufgaben/`): Arbeitsblatt als Foto, Bild oder PDF hochladen (nur mit Konto; bei mehrseitigen PDFs wählt man die Seite, jede Seite ist ein Durchlauf), Gemini bearbeitet die Aufgaben und liefert zu jeder Antwort das Schreibfeld auf dem Blatt (2 Durchläufe pro Tag). Der Browser schreibt die Antworten selbst auf das Blatt: in normaler Schrift, in einer Handschrift-Schriftart oder in der eigenen Handschrift aus dem Goodnotes-Tool. Antworten lassen sich ändern, entfernen und mit der Maus verschieben, Export als PDF oder PNG. Das Bild wird nirgends gespeichert. Siehe „Aufgaben einrichten“.

- **KI-Chat** (`/tools/kichat/`): Normale, gespeicherte Chats mit Gemini, nur für das Team `ki-tester`. Siehe „KI-Chat und Team Ki-Tester“.
- **Spiele** (`/tools/spiele/`): Vier gewinnt (KI, eigene Regeln in `connect4.js`, getestet) plus unveränderte Open-Source-Spiele in `vendor/games/` (Asteroids von dmcinnes, MIT; Dino-Runner aus Chromium in der Fassung von wayou, BSD-3). Sie laufen in einem iframe (`ui-embed.js`), die Lizenzen liegen jeweils als `LICENSE` daneben. Die Seite zeigt zuerst große Kacheln mit kleiner Vorschau (`spiele.js`: Spiele und Vorschau-SVGs); ein Tipp öffnet das Spiel über die ganze Seite ohne Knöpfe, oben bleibt nur die Nav mit „‹ Spiele“ und dem Namen des Spiels (`PensumNav.setContext` in `js/shell.js`). Die offene Seite steht als `#vier`, `#asteroids` oder `#dino` in der Adresse, das Zurück des Browsers geht zur Übersicht. Touch: Vier gewinnt per Tippen auf eine Spalte, Dino-Runner per Tippen (springen) und einem Knopf zum Ducken, Asteroids mit Bildschirm-Knöpfen (Links, Rechts, Schub, Feuer, das Feuer startet auch das Spiel). Die Knöpfe lösen von außen die Tasten des unveränderten Spiels aus und erscheinen nur auf Touch-Geräten (Klasse `has-touch`). Asteroids ist im Querformat am größten. Solange `soon` in `js/tools.js` gesetzt ist, sehen nur Mitglieder des Teams `tester` die Spiele.

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
tools/abschreiben/         core.js (Bildgröße, Übergabe), abschreiben.js (Oberfläche)
functions/abschreiben/     Appwrite-Function: Gemini mit Bild und Tageslimit (lib.js = Logik, index.js = Anbindung)
tools/aufgaben/            core.js (Felder in Pixel, Textumbruch, Schriftgröße), aufgaben.js (Oberfläche, Zeichnen, PDF/PNG)
functions/aufgaben/        Appwrite-Function: Gemini löst das Blatt und nennt die Schreibfelder, Tageslimit (lib.js = Logik, index.js = Anbindung)
tools/kichat/              core.js (Textformatierung), kichat.js (Oberfläche: Chatliste, Unterhaltung)
functions/ki-chat/         Appwrite-Function: Gemini-Chat mit Teamprüfung und Speicherung (lib.js = Logik, index.js = Anbindung)
tools/spiele/              Vier gewinnt (connect4.js, ui-vier.js), Einbettung der Open-Source-Spiele (ui-embed.js), spiele.js (Auswahl)
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

### Abschreiben einrichten

Die Function `abschreiben` (`functions/abschreiben/`) schickt das Foto an Gemini und zählt das Tageslimit (5 Scans pro Konto und Tag, Tageswechsel um Mitternacht deutscher Zeit; ein fehlgeschlagener oder leerer Scan wird zurückgegeben). Neue Tabelle: `abschreiben_usage` (nur Zähler, ohne Nutzerrechte). Es wird weder Bild noch Text gespeichert. Der Schlüssel kann derselbe sein wie bei der Mindmap, liegt aber als eigene Variable an dieser Function.

```bash
appwrite push table --all --force
appwrite push function --function-id abschreiben --force
appwrite functions create-variable --function-id abschreiben --key GEMINI_API_KEY --value "<dein Schlüssel aus Google AI Studio>" --secret true
# optional anderes Modell (Standard: gemini-3.5-flash-lite)
appwrite functions create-variable --function-id abschreiben --key GEMINI_MODEL --value "<modellname>"
```

Danach `appwrite push function` erneut ausführen, falls die Variable erst nach dem ersten Deploy gesetzt wurde. Vergibt Appwrite eine andere Function-ID als `abschreiben`, diese in `js/config.js` unter `functions.abschreiben` eintragen. Fehlt die Function, zeigt das Tool „Der Abschreiben-Dienst ist noch nicht eingerichtet“.

### Aufgaben einrichten

Die Function `aufgaben` (`functions/aufgaben/`) schickt das Foto des Arbeitsblatts an Gemini und gibt Antworten mit Schreibfeldern zurück (`box_2d` in Promille der Bildgröße, damit die Auflösung egal ist). Sie zählt das Tageslimit (2 Durchläufe pro Konto und Tag, Tageswechsel um Mitternacht deutscher Zeit; ein fehlgeschlagener oder leerer Durchlauf wird zurückgegeben). Neue Tabelle: `aufgaben_usage` (nur Zähler, ohne Nutzerrechte). Es wird weder Bild noch Text gespeichert. Das Limit steht in `functions/aufgaben/lib.js` (`LIMITS.runs`); die Obergrenze der Spalte `runs` in `appwrite.config.json` muss mindestens so hoch sein.

```bash
appwrite push table --all --force
appwrite push function --function-id aufgaben --force
appwrite functions create-variable --function-id aufgaben --key GEMINI_API_KEY --value "<dein Schlüssel aus Google AI Studio>" --secret true
# optional anderes Modell (Standard: gemini-3.5-flash-lite)
appwrite functions create-variable --function-id aufgaben --key GEMINI_MODEL --value "<modellname>"
```

Danach `appwrite push function` erneut ausführen, falls die Variable erst nach dem ersten Deploy gesetzt wurde. Vergibt Appwrite eine andere Function-ID als `aufgaben`, diese in `js/config.js` unter `functions.aufgaben` eintragen. Fehlt die Function, zeigt das Tool „Der Aufgaben-Dienst ist noch nicht eingerichtet“. Wie gut die Felder sitzen, hängt vom Modell ab: Ein stärkeres Modell über `GEMINI_MODEL` trifft die Schreibfelder genauer, kostet aber mehr pro Durchlauf.

### Tester-Zugang

Mitglieder des Appwrite-Teams `tester` (`testerTeam` in `js/config.js`) können alle ausgegrauten Tools (`soon: true` in `js/tools.js`) öffnen; ihre Kacheln und Footer-Links sind freigeschaltet (`js/access.js`). Das ist nur eine Oberflächen-Sperre: Die Tool-Seiten selbst sind per Adresse erreichbar, und die Functions prüfen das Team nicht.

```bash
appwrite teams create --team-id tester --name Tester
appwrite teams create-membership --team-id tester --user-id <Nutzer-ID> --roles tester
```

Die Nutzer-ID steht in der Appwrite-Konsole unter Auth → Users. Alternativ dort unter Auth → Teams → tester → Create membership.

### KI-Chat und Team „Ki-Tester“

Der **KI-Chat** (`/tools/kichat/`) ist ein normaler Chat mit Gemini. Chats und Nachrichten werden pro Konto gespeichert (Tabellen `chats` und `chat_messages`, Row Security, lesbar nur für den Besitzer). Die Seite füllt das ganze Fenster (ohne Kopftext und Footer): links bündig am Rand die Chatliste wie bei ChatGPT („Neuer Chat“ als erste Zeile, darunter nur die Titel), rechts die Unterhaltung mit der Eingabe unten; in schmalen Fenstern klappt die Liste über das Menü-Symbol auf. Im Eingabekasten wählt man die **Klasse (8 bis 12)**: Sie wird bei jeder Frage mitgeschickt und bestimmt, wie die KI antwortet (Klasse 8 einfach und mit Alltagsbeispielen, Klasse 12 auf Abitur-Niveau, die Texte stehen als `GRADES` in `functions/ki-chat/lib.js`). Die Wahl merkt sich der Browser. Eine Websuche gibt es nicht mehr. Oben links neben der Nav steht Symbol und Name des Tools (nur im breiten Fenster). Fährt man über einen Chat in der Liste, erscheint rechts „…“ (am Touch-Gerät immer): Das Menü bietet **Umbenennen** (die Zeile wird zum Eingabefeld, Enter oder Verlassen speichert, Escape bricht ab) und **Löschen**. Beides läuft über die Function (`rename` und `delete`, nur für eigene Chats). Unter jeder frischen Antwort steht eine einklappbare Zeile „3 Schritte · 1,4 s“ (Nachbau von Kokonut UI „AI Tool Calls“, MIT): Die Function misst ihre echten Schritte (Verlauf gelesen, Bild gelesen, Antwort geschrieben mit Klasse, Chat gespeichert) und schickt sie als `steps` mit der Antwort mit; `stepsHtml` in `tools/kichat/core.js` zeichnet sie. Gespeichert werden die Schritte nicht, nach dem Neuladen eines Chats fehlen sie. Man kann Chats fortsetzen und löschen. Das Tool hat in `js/tools.js` `team: "kiTester"`: Es ist nur für Mitglieder des Teams `ki-tester` (`kiTesterTeam` in `js/config.js`) sichtbar, für alle anderen weder Kachel noch Footer-Link. Das Team `tester` reicht dafür nicht.

Anders als beim Team `tester` ist das auch serverseitig gesichert: Die Function `ki-chat` (`functions/ki-chat/`, `lib.js` = Logik, `index.js` = Anbindung) prüft bei jedem Aufruf die Mitgliedschaft, fragt Gemini (Verlauf bis 30 Nachrichten) und schreibt Frage und Antwort erst nach erfolgreicher Antwort in die Datenbank. Nur sie schreibt in die Tabellen; die Oberfläche liest und löscht über die Function. Grenzen: 4000 Zeichen pro Nachricht, 100 Chats pro Konto (`LIMITS` in `lib.js`). Es gibt kein Tageslimit.

```bash
appwrite teams create --team-id ki-tester --name "Ki-Tester"
appwrite teams create-membership --team-id ki-tester --user-id <Nutzer-ID> --roles tester
appwrite push tables
appwrite push function --function-id ki-chat --force
appwrite functions create-variable --function-id ki-chat --key GEMINI_API_KEY --value "<dein Schlüssel aus Google AI Studio>" --secret true
```

Optional `GEMINI_MODEL` (Standard `gemini-3.5-flash-lite`). Die Function braucht die Rechte `rows.read`, `rows.write` und `users.read` (für die Teamprüfung, steht in `appwrite.config.json`). Danach `appwrite push function` erneut ausführen, falls die Variable erst nach dem ersten Deploy gesetzt wurde. Fehlt die Function, zeigt das Tool „Der KI-Chat-Dienst ist noch nicht eingerichtet“.

### Stack Panel und Loader

Zwei kleine Bausteine, nachgebaut nach Kokonut UI (MIT, https://kokonutui.com) in Vanilla-JS und CSS, weil die Originale React und Tailwind brauchen:

- **Stack Panel** (`js/stack-panel.js`, `css/stack-panel.css`): ein Panel mit Unterseiten wie die Einstellungen am Handy. Es steckt hinter der Konto-Seite (`/konto/`): Eine Zeile öffnet ihre Seite von rechts, die Beschriftung fliegt dabei in die Kopfzeile. Zurück mit dem Zurück-Knopf, Escape, dem Zurück des Browsers oder (Touch) einer Wischgeste. Die offene Seite steht als `#name` in der Adresse. Aufbau und Beispiel stehen im Kopf von `stack-panel.js`: Seiten sind `<div class="sp-page" data-sp-page="id" data-sp-title="Titel">`, Zeilen `<button data-sp-to="id">`. Die Seiten dürfen beliebigen Inhalt haben (hier die bestehenden Formulare). Bei „Bewegung reduzieren“ gibt es keine Animation.
- **Loader** (`js/loader.js`, `css/loader.css`): vier drehende Ringe mit Titel und Untertitel, `loaderHtml({ title, subtitle, size: "sm" | "md" | "lg" })`. Eingesetzt beim Laden des Kontos, der Geräte, der Datenzahlen und alter Chats im KI-Chat.

### Profilmenü in der Nav

Die Nav-Pill hat nur noch das Logo (führt zur Startseite) und rechts das **Profilmenü** (`js/profile-menu.js`, Stile im Abschnitt „Profilmenü“ in `css/pensum.css`), nachgebaut nach Kokonut UI „Profile Dropdown“ (MIT, https://kokonutui.com). Der Home-Knopf, der Hell/Dunkel-Schalter und der Abmelden-Knopf in der Nav sind weg. Das Menü zeigt Avatar, Name und E-Mail, „Konto verwalten“, die **Darstellung** (Hell, Dunkel, System; „System“ folgt dem Gerät, `pensumTheme.set("system")` in `js/theme.js`) und **Abmelden**, das man 0,7 Sekunden gedrückt hält (Tastatur: Enter oder Leertaste meldet sofort ab). Bedienung per Pfeiltasten, Home/Ende, Escape schließt. Gäste sehen daneben „Anmelden“ und im Menü „Konto erstellen“ und die Darstellung. Im schmalen Fenster steht das Menü mittig unter der Nav.

### Export-Menü, Promise Toast und Empty State

Drei weitere Bausteine, nachgebaut nach Kokonut UI (MIT, https://kokonutui.com) in Vanilla-JS und CSS (die Stile laden die Module bei Bedarf selbst nach):

- **Export-Menü** (`js/export-menu.js`, `js/export-core.js`, `css/export-menu.css`): Wer im Mindmap-Generator, im Goodnotes-Tool oder bei den Aufgaben auf „Exportieren“ drückt, bekommt ein Menü mit den Formaten des Tools (Zeilen im Stil des Stack Panels): Mindmap und Goodnotes-Tool bieten „Als Goodnotes“ und „Als PDF“, die Aufgaben „Als PDF“ und „Als Bild“. Ein Format ergänzen heißt eine Zeile in `openExportMenu({ options })` hinzufügen: `{ id, icon: "goodnotes" | "pdf" | "image", label, hint, loading, success, errorTitle, run }`. `run` speichert die Datei und gibt den Dateinamen (oder einen Hinweis) zurück, Fehler wirft es. Gibt `run` `CANCELLED` zurück (z. B. nach „Abbrechen“ in einer Rückfrage), verschwindet der Toast still.
- **Promise Toast** (`js/promise-toast.js`, `css/promise-toast.css`): `promiseToast(async (report) => …, { loading, waiting?, count?, success, error, undo? })` zeigt unten rechts einen Toast, der erst „arbeitet“, dann „fertig“ oder „fehlgeschlagen“ meldet (mit „Nochmal“, optional „Rückgängig“). Mehrere Toasts stapeln sich und fächern sich bei Maus oder Fokus auf. Das Export-Menü nutzt ihn für jeden Export. Der einfache `toast()` aus `js/shell.js` bleibt für kurze Meldungen.
- **Empty State** (`js/empty-state.js`, `css/empty-state.css`): `emptyStateHtml({ title, description, primary: { label, act }, secondary?, compact? })`: gestapelte Karten als Zeichnung, Text und Knöpfe (`act` wird zu `data-act`). Fährt man auf den Hauptknopf, hebt sich die Karte, die entstehen würde. Eingesetzt bei den Karteikarten: ohne Stapel („Noch keine Vokabelstapel“) und in einem Stapel ohne Karten („Erste Karte hinzufügen“).

### Rechtsseiten

`/impressum/`, `/datenschutz/`, `/cookies/`, `/nutzungsbedingungen/`. Die Betreiberangaben stehen einmal in `js/config.js` unter `legal`; leere Felder erscheinen als „[bitte ergänzen]“ gelb markiert. Es gibt kein Cookie-Banner, weil nur technisch notwendiger Speicher genutzt wird (siehe `/cookies/`). Kommt Tracking dazu, braucht es eine Einwilligung.

### Plattformen (sonst blockt CORS)

`localhost` ist eingetragen. Für jede weitere Domain:

```bash
appwrite project create-web-platform --platform-id "unique()" --name "Pensum Vercel" --hostname <deine-domain>
```

### Anmeldung

E-Mail und Passwort sind aktiv. Für „Passwort zurücksetzen“ muss auf dem Server SMTP eingerichtet sein. Google ist optional und im Code fertig („Mit Google fortfahren“ im Anmelde-Dialog, `loginWithGoogle()` in `js/auth.js`). So wird es eingeschaltet:

1. In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) eine OAuth-Client-ID (Typ „Webanwendung“) anlegen. Als „Autorisierte Weiterleitungs-URI“ die URI eintragen, die Appwrite unter Auth → Settings → Google anzeigt (Form: `https://appwrite.buchholz.dev/v1/account/sessions/oauth2/callback/google/6af569a7000d660f3559`).
2. In der Appwrite-Konsole unter Auth → Settings → OAuth2 Providers → Google aktivieren und Client-ID und Client-Secret eintragen.
3. In `js/config.js` `googleOAuth: true` setzen.

Wer sich erstmals mit Google anmeldet, bekommt automatisch ein Konto. Was bei einer E-Mail-Adresse passiert, die schon ein Passwort-Konto hat, sollte vor dem Einschalten einmal getestet werden.

## Vercel

Projekt importieren, Framework „Other“, kein Build-Befehl, Ausgabeverzeichnis `.`. Danach die Vercel-Domain als Web-Plattform in Appwrite eintragen (siehe oben). `vercel.json` setzt die Content-Security-Policy; wenn sich der Appwrite-Endpoint ändert, dort `connect-src` anpassen.

## Vendor-Dateien

`vendor/appwrite.js` ist das offizielle Web-SDK 28.3.0 als ein ES-Modul:

```bash
npm i appwrite@28.3.0 esbuild
npx esbuild node_modules/appwrite/dist/esm/sdk.js --bundle --format=esm --minify --outfile=vendor/appwrite.js
```

`vendor/pdfjs/` ist pdf.js 4.10.38 (Apache-2.0, `legacy`-Build, nur für PDF-Upload im Aufgaben-Tool; lädt erst, wenn ein PDF gewählt wird):

```bash
npm i pdfjs-dist@4.10.38
cp node_modules/pdfjs-dist/legacy/build/pdf.min.mjs node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs vendor/pdfjs/
```

Schriften kommen von Fontsource (SIL Open Font License), Lizenztexte liegen in `vendor/fonts/`.

## Erklärvideos (Lehrer Schmidt)

Das Modul `tools/videos/` ist noch ausgeblendet (`soon: true` in `js/tools.js`). Die Suche läuft über die Appwrite-Function `lehrer-schmidt` (`functions/lehrer-schmidt/`), die den Kanal per YouTube Data API durchsucht. Zum Freischalten:

1. API-Schlüssel (YouTube Data API v3) in Google Cloud anlegen und als geheime Variable setzen:
   `appwrite functions create-variable --function-id lehrer-schmidt --key YOUTUBE_API_KEY --value <schlüssel> --secret true`
2. Function deployen: `appwrite push function --function-id lehrer-schmidt`
3. In `js/tools.js` die Zeile `soon: true` beim Eintrag `videos` entfernen.

Optional: `CHANNEL_HANDLE` (Standard `LehrerSchmidt`) oder `CHANNEL_ID`. Eine Suche kostet 100 Kontingent-Einheiten (Standard 10 000 pro Tag), gleiche Suchen werden 6 Stunden zwischengespeichert. Der Player (youtube-nocookie.com) lädt erst nach dem Klick auf „Hier ansehen“; die CSP in `vercel.json` erlaubt dafür `frame-src`.

## KokonutUI-Komponenten (`ui/`)

Die Seite bleibt reines HTML/JS ohne Build-Schritt. Einzelne Komponenten aus der shadcn-Registry `@kokonutui` (React + Tailwind) liegen als „Inseln“ im Ordner `ui/` und werden nach `vendor/ui/` gebaut (diese Dateien sind eingecheckt, Vercel baut nichts).

- Aktuell genutzt: `smooth-tab` (gleitende Tab-Leiste im Planer und bei den Karteikarten-Stapeln) und `hold-button` (Stapel löschen durch Gedrückthalten).
- Laden: `js/islands.js` holt die Insel erst nach dem Seitenaufbau. Bis dahin (oder ohne) gelten die normalen HTML-Elemente.
- Neue Komponente: im Ordner `ui/` `npx shadcn@latest add @kokonutui/<name> -c .`, in `ui/src/islands.tsx` eine `mount…`-Funktion ergänzen, dann `npm run build` und `vendor/ui/` einchecken.
- Tailwind läuft ohne Preflight, die shadcn-Farben zeigen auf die Pensum-Variablen (`ui/src/styles.css`), Hell/Dunkel geht über `data-theme`.

