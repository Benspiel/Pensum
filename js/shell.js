/* Gemeinsame Hülle jeder Seite: schwebende Nav-Pill, Footer, Anmelde-Dialog, Toasts.
 * Wird von jeder Seite als Modul geladen. Der Login-Status kommt aus /js/auth.js,
 * deshalb zeigt die Nav-Pill in jedem Tool denselben Stand und reagiert sofort auf Änderungen. */
import { tools } from "/js/tools.js";
import * as auth from "/js/auth.js";
import { onAccessChange, isLocked } from "/js/access.js";
import "/js/whatsnew.js";
import { mountProfileMenu } from "/js/profile-menu.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICON = {
  google: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};
export const closeIcon = ICON.close;

/* ---------- Toast ---------- */

let toastEl, toastTimer;
export function toast(message, { error = false } = {}) {
  if (!toastEl) {
    const region = document.createElement("div");
    region.className = "toast-region";
    region.innerHTML = '<div class="toast" role="status" aria-live="polite"></div>';
    document.body.append(region);
    toastEl = region.firstElementChild;
  }
  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", error);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), error ? 6000 : 4000);
}

/* ---------- Bestätigungs-Dialog ---------- */

/** Fragt nach und liefert true (bestätigt) oder false. */
export function confirmDialog({ title, text, confirm = "OK", cancel = "Abbrechen" }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "modal";
    d.innerHTML = `
      <div class="modal-body">
        <h2 class="h4">${esc(title)}</h2>
        <p class="body-sm">${esc(text)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" data-ok>${esc(confirm)}</button>
          <button class="btn btn-outline" type="button" data-cancel>${esc(cancel)}</button>
        </div>
      </div>`;
    document.body.append(d);
    let result = false;
    d.querySelector("[data-ok]").addEventListener("click", () => { result = true; d.close(); });
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.addEventListener("close", () => { d.remove(); resolve(result); });
    d.showModal();
  });
}

/* ---------- Anmelde-Dialog ---------- */

const AUTH_COPY = {
  login: { title: "Anmelden.", submit: "Anmelden", reason: "Ein Konto für alle Tools. Angemeldet werden deine Daten gespeichert und zwischen deinen Geräten synchronisiert." },
  register: { title: "Konto erstellen.", submit: "Registrieren", reason: "Ein Konto gilt für die ganze Plattform. Du bleibst in allen Tools angemeldet." },
  code: { title: "Code eingeben.", submit: "Bestätigen", reason: "" },
  forgot: { title: "Passwort zurücksetzen.", submit: "Link senden", reason: "Gib deine E-Mail-Adresse ein. Du bekommst einen Link, über den du ein neues Passwort setzt." },
};

let authDialog, authMode = "login", pendingCode = null;

function buildAuthDialog() {
  const d = document.createElement("dialog");
  d.className = "modal";
  d.setAttribute("aria-labelledby", "authTitle");
  d.innerHTML = `
    <form class="modal-body" method="dialog">
      <div class="modal-head">
        <h2 class="h3" id="authTitle"></h2>
        <button type="button" class="icon-btn" data-close aria-label="Schließen">${ICON.close}</button>
      </div>
      <p class="body-sm muted" data-reason></p>
      <label class="field" data-only="register">
        <span class="field-label">Name</span>
        <input class="input" name="name" autocomplete="name" maxlength="80">
      </label>
      <label class="field" data-only="login register forgot">
        <span class="field-label">E-Mail</span>
        <input class="input" name="email" type="email" autocomplete="email" required>
      </label>
      <label class="field" data-only="login register">
        <span class="field-label">Passwort</span>
        <input class="input" name="password" type="password" minlength="8" required>
        <span class="field-hint" data-only="register">Mindestens 8 Zeichen.</span>
      </label>
      <label class="field" data-only="code">
        <span class="field-label">Bestätigungscode</span>
        <input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" maxlength="8" required>
        <span class="field-hint">6 Ziffern aus der E-Mail. Schau auch im Spam-Ordner nach.</span>
      </label>
      <label class="check" data-only="register">
        <input type="checkbox" name="terms" required>
        <span>Ich bin mindestens 16 Jahre alt und akzeptiere die <a href="/nutzungsbedingungen/" target="_blank" rel="noopener">Nutzungsbedingungen</a> und die <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a>.</span>
      </label>
      <p class="form-message" role="alert" hidden></p>
      <button class="btn btn-primary btn-wide" type="submit"></button>
      <div class="auth-or" data-google-or hidden><span>oder</span></div>
      <button class="btn btn-outline btn-wide btn-google" type="button" data-google hidden>${ICON.google}<span>Mit Google fortfahren</span></button>
      <p class="body-sm center muted" data-google-note hidden>Legst du mit Google ein neues Konto an, bestätigst du, dass du mindestens 16 Jahre alt bist und die <a href="/nutzungsbedingungen/" target="_blank" rel="noopener">Nutzungsbedingungen</a> und die <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a> akzeptierst.</p>
      <p class="body-sm center muted" data-only="code"><button type="button" class="text-link" data-resend>Code erneut senden</button> · <button type="button" class="text-link" data-switch="login">Zurück</button></p>
      <p class="body-sm center" data-only="login"><button type="button" class="text-link" data-switch="forgot">Passwort vergessen?</button></p>
      <p class="body-sm center muted" data-only="login">Noch kein Konto? <button type="button" class="text-link" data-switch="register">Registrieren</button></p>
      <p class="body-sm center muted" data-only="register forgot">Schon ein Konto? <button type="button" class="text-link" data-switch="login">Anmelden</button></p>
    </form>`;
  document.body.append(d);

  const form = d.querySelector("form");
  const msg = d.querySelector(".form-message");
  const submit = d.querySelector('[type="submit"]');
  const showMessage = (text, ok = false) => {
    msg.textContent = text;
    msg.classList.toggle("is-ok", ok);
    msg.hidden = !text;
  };
  d._showMessage = showMessage;

  d.querySelector("[data-close]").addEventListener("click", () => d.close());
  d.querySelectorAll("[data-switch]").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.switch)));
  d.querySelector("[data-google]").addEventListener("click", () => {
    const terms = d.querySelector('[name="terms"]');
    if (authMode === "register" && terms && !terms.checked) { showMessage("Bitte bestätige zuerst, dass du mindestens 16 bist und die Bedingungen akzeptierst."); return; }
    auth.loginWithGoogle();
  });
  d.querySelector("[data-resend]").addEventListener("click", async () => {
    if (!pendingCode) return;
    try {
      await auth.sendCode(pendingCode);
      showMessage("Ein neuer Code ist unterwegs.", true);
    } catch (err) { showMessage(auth.authMessage(err)); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    showMessage("");
    submit.disabled = true;
    try {
      if (authMode === "forgot") {
        await auth.requestPasswordReset(email);
        showMessage("Wenn es zu dieser Adresse ein Konto gibt, ist die Mail unterwegs. Schau auch im Spam-Ordner nach.", true);
        return;
      }
      if (authMode === "code") {
        await auth.confirmCode({ userId: pendingCode.userId, code: String(data.get("code") || "") });
        pendingCode = null;
        form.elements.code.value = "";
        d.close();
        toast("E-Mail bestätigt. Du bist in allen Tools angemeldet.");
        return;
      }
      const result = authMode === "register"
        ? await auth.register({ name: String(data.get("name") || "").trim(), email, password })
        : await auth.login({ email, password });
      form.elements.password.value = "";
      if (result && result.needsCode) {
        pendingCode = { userId: result.userId, email: result.email };
        setAuthMode("code", `Wir haben einen 6-stelligen Code an ${result.email} geschickt. Gib ihn ein, um deine E-Mail-Adresse zu bestätigen.`);
        if (result.mailFailed) showMessage("Dein Konto ist angelegt, aber die E-Mail mit dem Code konnte nicht gesendet werden. Prüfe die Adresse und tippe auf „Code erneut senden“. Klappt es weiter nicht, versuch es später noch einmal.");
        form.elements.code.focus();
        return;
      }
      d.close();
      toast("Angemeldet.");
    } catch (err) {
      showMessage(auth.authMessage(err));
    } finally {
      submit.disabled = false;
    }
  });
  return d;
}

function setAuthMode(mode, reason) {
  authMode = AUTH_COPY[mode] ? mode : "login";
  const copy = AUTH_COPY[authMode];
  const d = authDialog;
  d.querySelector("#authTitle").textContent = copy.title;
  d.querySelector("[data-reason]").textContent = reason || copy.reason;
  d.querySelector('[type="submit"]').textContent = copy.submit;
  d.querySelectorAll("[data-only]").forEach((el) => {
    const show = el.dataset.only.split(" ").includes(authMode);
    el.hidden = !show;
    el.querySelectorAll("input").forEach((i) => { i.disabled = !show; });
  });
  d.querySelector('[name="password"]').autocomplete = authMode === "register" ? "new-password" : "current-password";
  const showGoogle = auth.googleEnabled && (authMode === "login" || authMode === "register");
  d.querySelector("[data-google]").hidden = !showGoogle;
  d.querySelector("[data-google-or]").hidden = !showGoogle;
  d.querySelector("[data-google-note]").hidden = !showGoogle;
  d._showMessage("");
}

/** Öffnet den Anmelde-Dialog. mode: "login" | "register" | "forgot". */
export function openAuth(mode = "login", reason) {
  if (!authDialog) authDialog = buildAuthDialog();
  setAuthMode(mode, reason);
  if (!authDialog.open) authDialog.showModal();
  const first = authDialog.querySelector(authMode === "register" ? '[name="name"]' : '[name="email"]');
  first.focus();
}

export async function signOut() {
  await auth.logout();
  toast("Abgemeldet.");
}

// Klicks auf [data-auth-action] funktionieren überall auf der Seite (Nav, Footer, Tool-Hinweise).
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-auth-action]");
  if (!el) return;
  e.preventDefault();
  const action = el.dataset.authAction;
  if (action === "logout") signOut();
  else openAuth(action);
});

/* ---------- Nav-Pill ---------- */

class PensumNav extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="nav-wrap">
        <nav class="nav-pill" aria-label="Hauptnavigation">
          <a class="nav-logo" href="/" aria-label="Pensum – Startseite">
            <img class="nav-logo-full" src="/assets/logo.png" width="110" height="28" alt="Pensum">
            <img class="nav-logo-mark" src="/assets/icon.png" width="32" height="32" alt="Pensum">
          </a>
          <span class="nav-context" data-nav-context hidden></span>
          <div class="nav-auth" data-nav-auth aria-live="polite"><span class="nav-skeleton" aria-hidden="true"></span></div>
        </nav>
      </div>`;

    this._off = auth.onAuthChange((s) => this.renderAuth(s));
  }

  disconnectedCallback() {
    if (this._off) this._off();
    if (this._menu) this._menu.destroy();
  }

  /** Zeigt in der Nav, wo man gerade ist: optional ein Zurück-Link und ein Titel, z. B. { title: "Vier gewinnt", backHref: "/tools/spiele/", backLabel: "Spiele" }.
   *  setContext(null) räumt es wieder weg. Der Zurück-Link hat die Klasse nav-back (die Seite kann seinen Klick selbst übernehmen). */
  setContext(ctx) {
    const slot = this.querySelector("[data-nav-context]");
    const pill = this.querySelector(".nav-pill");
    if (!slot) return;
    if (!ctx || !ctx.title) { slot.hidden = true; slot.innerHTML = ""; pill.classList.remove("has-context"); return; }
    slot.innerHTML = `${ctx.backHref ? `<a class="nav-back" href="${esc(ctx.backHref)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg><span>${esc(ctx.backLabel || "Zurück")}</span></a>` : ""}<strong class="nav-context-title">${esc(ctx.title)}</strong>`;
    slot.hidden = false;
    pill.classList.add("has-context");
  }

  renderAuth({ status, user }) {
    const box = this.querySelector("[data-nav-auth]");
    if (status === "loading") return;
    if (this._menu) { this._menu.destroy(); this._menu = null; }
    // Rechts in der Nav sitzt das Profilmenü (js/profile-menu.js): Konto, Darstellung Hell/Dunkel/System und Abmelden. Gäste bekommen daneben „Anmelden“.
    box.innerHTML = `${user ? "" : '<button class="btn btn-primary btn-sm nav-login" type="button" data-auth-action="login">Anmelden</button>'}<div data-nav-menu></div>`;
    this._menu = mountProfileMenu(box.querySelector("[data-nav-menu]"), {
      user: user ? { name: user.name || user.email || "Konto", email: user.email || "", initials: auth.initials(user) } : null,
      links: [{ label: "Konto verwalten", href: "/konto/", icon: "user" }],
      onSignOut: () => signOut(),
    });
  }
}

/* ---------- Footer ---------- */

/** Tool-Links im Footer; gesperrte Tools stehen ausgegraut da, für Tester (Team „tester“) sind sie freigeschaltet. */
const footerTools = (tester) => tools.filter((t) => !t.team || !isLocked(t, tester)).map((t) => (isLocked(t, tester) ? `<span class="footer-soon" aria-disabled="true">${esc(t.name)} · ${t.off ? "aus" : "kommt bald"}</span>` : `<a href="${t.href}">${esc(t.name)}</a>`)).join("");

class PensumFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-top">
            <div>
              <img class="footer-logo" src="/assets/logo-light.png" width="221" height="56" alt="Pensum">
              <p class="footer-tagline">Alles fürs Pensum. Ein Konto für alle Tools, auf jedem Gerät.</p>
            </div>
            <div class="footer-cols">
              <div class="footer-col">
                <h2>Tools</h2>
                <div class="footer-tools" data-footer-tools>${footerTools(false)}</div>
              </div>
              <div class="footer-col">
                <h2>Konto</h2>
                <span data-footer-auth></span>
                <a href="/">Startseite</a>
                <button type="button" data-whatsnew>Was ist neu?</button>
              </div>
              <div class="footer-col">
                <h2>Rechtliches</h2>
                <a href="/impressum/">Impressum</a>
                <a href="/datenschutz/">Datenschutz</a>
                <a href="/cookies/">Cookies und Speicher</a>
                <a href="/nutzungsbedingungen/">Nutzungsbedingungen</a>
                <a href="/lizenzen/">Lizenzen</a>
              </div>
            </div>
          </div>
          <p class="footer-note">© ${new Date().getFullYear()} Pensum · Das Goodnotes-Tool ist inoffiziell und steht in keiner Verbindung zu Goodnotes Ltd. Lehrer Schmidt ist ein YouTube-Kanal und steht in keiner Verbindung zu Pensum.</p>
        </div>
      </footer>`;
    this._off = auth.onAuthChange(({ status, user }) => {
      if (status === "loading") return;
      this.querySelector("[data-footer-auth]").innerHTML = user
        ? '<a href="/konto/">Konto verwalten</a><button type="button" data-auth-action="logout">Abmelden</button>'
        : '<button type="button" data-auth-action="login">Anmelden</button><button type="button" data-auth-action="register">Konto erstellen</button><button type="button" data-auth-action="forgot">Passwort vergessen</button>';
    });
    this._offTester = onAccessChange((tester) => { const el = this.querySelector("[data-footer-tools]"); if (el) el.innerHTML = footerTools(tester); });
  }
  disconnectedCallback() { if (this._off) this._off(); if (this._offTester) this._offTester(); }
}

customElements.define("pensum-nav", PensumNav);
customElements.define("pensum-footer", PensumFooter);

// Rückmeldung, falls die Anmeldung über Google abgebrochen wurde
const params = new URLSearchParams(location.search);
auth.ready.then(() => { if (auth.takeOAuthError()) toast("Die Anmeldung über Google hat nicht geklappt.", { error: true }); });
if (params.get("anmeldung") === "fehlgeschlagen") {
  history.replaceState(null, "", location.pathname);
  toast("Die Anmeldung über Google hat nicht geklappt.", { error: true });
}

// Zählt, welches Tool geöffnet wurde (nur angemeldet, höchstens einmal je Tool und halbe Stunde, siehe js/track.js)
import("/js/track.js").then((m) => m.trackToolVisit()).catch(() => {});

/* Offline: Der Service Worker speichert die Startseite beim ersten Besuch auf dem Gerät (erzeugt von scripts/build-offline.mjs). Konto, KI und Appwrite sind nicht betroffen. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/offline-sw.js", { scope: "/" }).catch(() => {});
}
