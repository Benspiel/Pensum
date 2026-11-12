/* Gemeinsame Hülle jeder Seite: schwebende Nav-Pill, Footer, Anmelde-Dialog, Toasts.
 * Wird von jeder Seite als Modul geladen. Der Login-Status kommt aus /js/auth.js,
 * deshalb zeigt die Nav-Pill in jedem Tool denselben Stand und reagiert sofort auf Änderungen. */
import { tools } from "/js/tools.js";
import * as auth from "/js/auth.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>',
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
      <p class="form-message" role="alert" hidden></p>
      <button class="btn btn-primary btn-wide" type="submit"></button>
      <button class="btn btn-outline btn-wide" type="button" data-google hidden>Mit Google fortfahren</button>
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
  d.querySelector("[data-google]").addEventListener("click", () => auth.loginWithGoogle());
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
  d.querySelector("[data-google]").hidden = !(auth.googleEnabled && (authMode === "login" || authMode === "register"));
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
    const here = location.pathname.replace(/index\.html$/, "");
    const links = tools
      .map((t) => `<a class="nav-link" href="${t.href}"${here.startsWith(t.href) ? ' aria-current="page"' : ""}>${esc(t.name)}</a>`)
      .join("");
    this.innerHTML = `
      <div class="nav-wrap">
        <nav class="nav-pill" aria-label="Hauptnavigation">
          <a class="nav-logo" href="/" aria-label="Pensum – Startseite">
            <img class="nav-logo-full" src="/assets/logo.png" width="110" height="28" alt="Pensum">
            <img class="nav-logo-mark" src="/assets/icon.png" width="32" height="32" alt="Pensum">
          </a>
          <div class="nav-links">${links}</div>
          <div class="nav-auth" data-nav-auth aria-live="polite"><span class="nav-skeleton" aria-hidden="true"></span></div>
          <button class="icon-btn nav-menu-btn" type="button" aria-expanded="false" aria-controls="navMenu" aria-label="Menü öffnen">${ICON.menu}</button>
        </nav>
        <div class="nav-menu" id="navMenu" hidden>${links}</div>
      </div>`;

    const btn = this.querySelector(".nav-menu-btn");
    const menu = this.querySelector(".nav-menu");
    const setOpen = (open) => {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      btn.innerHTML = open ? ICON.close : ICON.menu;
    };
    btn.addEventListener("click", () => setOpen(menu.hidden));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener("click", (e) => { if (!menu.hidden && !this.contains(e.target)) setOpen(false); });

    this._off = auth.onAuthChange((s) => this.renderAuth(s));
  }

  disconnectedCallback() { if (this._off) this._off(); }

  renderAuth({ status, user }) {
    const box = this.querySelector("[data-nav-auth]");
    if (status === "loading") return;
    if (!user) {
      box.innerHTML = '<button class="btn btn-primary btn-sm" type="button" data-auth-action="login">Anmelden</button>';
      return;
    }
    const label = user.name || user.email || "Konto";
    box.innerHTML = `
      <span class="nav-user" title="${esc(user.email || label)}">
        <span class="avatar" aria-hidden="true">${esc(auth.initials(user))}</span>
        <span class="nav-user-name">${esc(label)}</span>
        <span class="sr-only">Angemeldet als ${esc(label)}</span>
      </span>
      <button class="btn btn-outline btn-sm" type="button" data-auth-action="logout">Abmelden</button>`;
  }
}

/* ---------- Footer ---------- */

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
                ${tools.map((t) => `<a href="${t.href}">${esc(t.name)}</a>`).join("")}
              </div>
              <div class="footer-col">
                <h2>Konto</h2>
                <span data-footer-auth></span>
                <a href="/">Startseite</a>
              </div>
            </div>
          </div>
          <p class="footer-note">© ${new Date().getFullYear()} Pensum · Das Goodnotes-Tool ist inoffiziell und steht in keiner Verbindung zu Goodnotes Ltd.</p>
        </div>
      </footer>`;
    this._off = auth.onAuthChange(({ status, user }) => {
      if (status === "loading") return;
      this.querySelector("[data-footer-auth]").innerHTML = user
        ? '<button type="button" data-auth-action="logout">Abmelden</button>'
        : '<button type="button" data-auth-action="login">Anmelden</button><button type="button" data-auth-action="register">Konto erstellen</button><button type="button" data-auth-action="forgot">Passwort vergessen</button>';
    });
  }
  disconnectedCallback() { if (this._off) this._off(); }
}

customElements.define("pensum-nav", PensumNav);
customElements.define("pensum-footer", PensumFooter);

// Rückmeldung, falls die Anmeldung über Google abgebrochen wurde
const params = new URLSearchParams(location.search);
if (params.get("anmeldung") === "fehlgeschlagen") {
  history.replaceState(null, "", location.pathname);
  toast("Die Anmeldung über Google hat nicht geklappt.", { error: true });
}
