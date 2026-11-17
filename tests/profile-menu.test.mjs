/* Tests für das Profilmenü: Fokus-Reihenfolge und HTML. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { nextIndex, menuHtml, THEMES, HOLD_MS } from "../js/profile-menu.js";

// Zeilen wie im Menü: ein Link, drei Darstellungs-Knöpfe (eine Zeile), Abmelden
const ROWS = ["link0", "theme", "theme", "theme", "out"];

test("nextIndex: Auf/Ab wechselt die Zeile, bei der Darstellung landet man auf dem gewählten Knopf", () => {
  assert.equal(nextIndex(ROWS, 0, "ArrowDown", 2), 2, "von Link auf die gewählte Darstellung (Dunkel)");
  assert.equal(nextIndex(ROWS, 0, "ArrowDown", -1), 1, "ohne Wahl der erste Knopf");
  assert.equal(nextIndex(ROWS, 2, "ArrowDown", 2), 4, "weiter zu Abmelden");
  assert.equal(nextIndex(ROWS, 4, "ArrowDown", 2), 0, "am Ende wieder oben");
  assert.equal(nextIndex(ROWS, 0, "ArrowUp", 2), 4, "oben nach unten");
  assert.equal(nextIndex(ROWS, 4, "ArrowUp", 3), 3, "zurück auf die gewählte Darstellung");
});

test("nextIndex: Links/Rechts nur innerhalb der Darstellung, Home und Ende, nichts markiert", () => {
  assert.equal(nextIndex(ROWS, 1, "ArrowRight"), 2);
  assert.equal(nextIndex(ROWS, 3, "ArrowRight"), 1, "umlaufend");
  assert.equal(nextIndex(ROWS, 1, "ArrowLeft"), 3);
  assert.equal(nextIndex(ROWS, 0, "ArrowRight"), 0, "Einzelzeile bleibt");
  assert.equal(nextIndex(ROWS, 2, "Home"), 0);
  assert.equal(nextIndex(ROWS, 2, "End"), 4);
  assert.equal(nextIndex(ROWS, -1, "ArrowDown"), 0, "ohne Fokus: erster Eintrag");
  assert.equal(nextIndex(ROWS, -1, "ArrowUp"), 4, "ohne Fokus: letzter Eintrag");
  assert.equal(nextIndex([], 0, "ArrowDown"), -1);
});

test("menuHtml: angemeldet mit Konto, Darstellung und Abmelden; Namen maskiert", () => {
  const html = menuHtml({ user: { name: "Ben <b>", email: "b@x.de", initials: "BB" }, themeChoice: "dark", links: [{ label: "Konto verwalten", href: "/konto/", icon: "user" }] });
  assert.match(html, /Ben &lt;b&gt;/);
  assert.ok(!html.includes("Ben <b>"));
  assert.match(html, /href="\/konto\/"/);
  assert.match(html, /data-theme-choice="dark" aria-checked="true"/);
  assert.match(html, /data-theme-choice="light" aria-checked="false"/);
  assert.equal((html.match(/role="radio"/g) || []).length, THEMES.length);
  assert.match(html, /pm-signout/);
  assert.match(html, /aria-haspopup="menu"/);
});

test("menuHtml: Gäste sehen Anmelden und Konto erstellen, kein Abmelden", () => {
  const html = menuHtml({ user: null, themeChoice: "system" });
  assert.match(html, /data-auth-action="login"/);
  assert.match(html, /data-auth-action="register"/);
  assert.ok(!html.includes("pm-signout"));
  assert.match(html, /Gast/);
  assert.match(html, /data-theme-choice="system" aria-checked="true"/);
  assert.ok(HOLD_MS >= 400 && HOLD_MS <= 1500, "Halten fühlt sich weder zu kurz noch zu lang an");
});
