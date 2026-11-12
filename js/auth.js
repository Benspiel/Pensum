/* Zentrale Anmeldung für alle Tools.
 *
 * Es gibt genau eine Appwrite-Session pro Browser. Jede Seite importiert dieses Modul,
 * stellt die Session beim Start wieder her (account.get()) und bekommt Änderungen über
 * onAuthChange() – auch aus anderen Tabs (BroadcastChannel). So ist man nach einmaligem
 * Anmelden in jedem Tool angemeldet.
 */
import { Client, Account, ID, OAuthProvider } from "/vendor/appwrite.js";
import { config } from "/js/config.js";

export const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
export const account = new Account(client);

/** @type {{ status: "loading" | "ready", user: object | null }} */
let state = { status: "loading", user: null };
const listeners = new Set();
const channel = "BroadcastChannel" in globalThis ? new BroadcastChannel("pensum-auth") : null;

function notify() {
  for (const fn of [...listeners]) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

function setUser(user, { broadcast = false } = {}) {
  const changed = state.status !== "ready" || (state.user && state.user.$id) !== (user && user.$id)
    || (state.user && state.user.name) !== (user && user.name);
  state = { status: "ready", user };
  if (changed) notify();
  if (broadcast && channel) channel.postMessage({ type: "changed" });
}

/** Aktueller Stand: { status, user }. */
export const getAuth = () => state;

/** Meldet jede Änderung des Login-Status; ruft fn sofort mit dem aktuellen Stand auf. */
export function onAuthChange(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** Session vom Server lesen (beim Seitenstart und wenn ein anderer Tab sich an- oder abmeldet). */
export async function refresh() {
  try {
    setUser(await account.get());
  } catch (_) {
    setUser(null);
  }
  return state.user;
}

/** Wird aufgelöst, sobald die Session beim Seitenstart wiederhergestellt (oder keine vorhanden) ist. */
export const ready = refresh();

if (channel) channel.onmessage = () => refresh();

// Nach längerer Pause prüfen, ob die Session noch gilt (z. B. auf einem anderen Gerät abgemeldet).
let lastCheck = Date.now();
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    refresh();
  });
}

export async function login({ email, password }) {
  await account.createEmailPasswordSession({ email, password });
  setUser(await account.get(), { broadcast: true });
  return state.user;
}

export async function register({ name, email, password }) {
  try {
    await account.create({ userId: ID.unique(), email, password, name: name || undefined });
  } catch (e) {
    // 409: Konto gibt es schon. 5xx: Der Server kann das Konto angelegt und erst danach einen Fehler
    // gemeldet haben. In beiden Fällen zählt, ob die Anmeldung mit genau diesen Daten klappt.
    const retry = e && (e.code === 409 || e.code >= 500);
    if (!retry) throw e;
    try { return await login({ email, password }); } catch (_) { throw e; }
  }
  return login({ email, password });
}

/** Tools können hier anmelden, was vor dem Abmelden noch gespeichert werden muss. */
const logoutHooks = new Set();
export function onBeforeLogout(fn) {
  logoutHooks.add(fn);
  return () => logoutHooks.delete(fn);
}

export async function logout() {
  await Promise.allSettled([...logoutHooks].map((fn) => fn()));
  try { await account.deleteSession({ sessionId: "current" }); } catch (_) { /* Session war schon weg */ }
  setUser(null, { broadcast: true });
}

/** Schickt eine Mail mit Link auf /konto/passwort/ (dort wird das neue Passwort gesetzt). */
export async function requestPasswordReset(email) {
  await account.createRecovery({ email, url: new URL("/konto/passwort/", location.origin).href });
}

export async function confirmPasswordReset({ userId, secret, password }) {
  await account.updateRecovery({ userId, secret, password });
}

export const googleEnabled = !!config.googleOAuth;

/** Leitet zu Google weiter; danach landet man wieder auf der aktuellen Seite und ist überall angemeldet. */
export function loginWithGoogle() {
  const back = new URL(location.href);
  const failure = new URL("/", location.origin);
  failure.searchParams.set("anmeldung", "fehlgeschlagen");
  account.createOAuth2Session({ provider: OAuthProvider.Google, success: back.href, failure: failure.href });
}

/** Einstellungen im Konto (Appwrite Preferences) – für Tool-Einstellungen, die überall gelten sollen. */
export function getPrefs() {
  return (state.user && state.user.prefs) || {};
}

export async function savePrefs(patch) {
  if (!state.user) return;
  const prefs = { ...getPrefs(), ...patch };
  state.user.prefs = prefs;
  try { await account.updatePrefs({ prefs }); } catch (e) { console.warn("Einstellungen nicht gespeichert", e); }
}

/** Verständliche Fehlermeldung für Appwrite-Fehler. */
export function authMessage(e) {
  const code = e && e.code, type = (e && e.type) || "";
  if (type === "user_already_exists" || code === 409) return "Zu dieser E-Mail gibt es schon ein Konto. Melde dich stattdessen an.";
  if (type === "user_invalid_credentials" || type === "user_blocked") return "E-Mail oder Passwort ist falsch.";
  if (type === "user_invalid_token") return "Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.";
  if (type === "general_rate_limit_exceeded" || code === 429) return "Zu viele Versuche. Warte kurz und probier es noch einmal.";
  if (type === "user_password_recently_used") return "Dieses Passwort hast du schon einmal benutzt. Wähle ein anderes.";
  if (/password/i.test((e && e.message) || "") && code === 400) return "Das Passwort braucht mindestens 8 Zeichen und darf nicht zu einfach sein.";
  if (/email/i.test((e && e.message) || "") && code === 400) return "Gib eine gültige E-Mail-Adresse ein.";
  if (code === 401) return "E-Mail oder Passwort ist falsch.";
  if (code >= 500) return "Der Server hat einen Fehler gemeldet. Das liegt nicht an deinen Eingaben. Versuch es später noch einmal.";
  if (!code) return "Keine Verbindung zum Server. Bist du online?";
  return (e && e.message) || "Das hat nicht geklappt. Probier es noch einmal.";
}

/** Initialen für den Avatar in der Nav-Pill. */
export function initials(user) {
  const base = ((user && (user.name || user.email)) || "?").trim();
  const parts = base.split(/[\s._@-]+/).filter(Boolean);
  const chars = parts.length > 1 && user.name ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return chars.toUpperCase();
}
