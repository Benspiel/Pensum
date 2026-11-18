/* Team-Zugang: Appwrite-Teams schalten Teile der Oberfläche frei.
 *  - „tester“ (config.testerTeam): darf alle ausgegrauten Tools („soon“) nutzen.
 *  - „ki-tester“ (config.kiTesterTeam): darf Tools mit team: "kiTester" nutzen (der KI-Chat). Der KI-Chat prüft das Team zusätzlich serverseitig.
 * Das Team „tester“ gehört nur der Oberfläche: Die Kacheln und Footer-Links werden freigeschaltet. Gesperrt wird sonst nichts.
 * Teams anlegen und Nutzer aufnehmen:
 *   appwrite teams create --team-id tester --name Tester
 *   appwrite teams create --team-id ki-tester --name Ki-Tester
 *   appwrite teams create-membership --team-id ki-tester --user-id <Nutzer-ID> --roles tester */
import { Teams } from "/vendor/appwrite.js";
import { client, onAuthChange } from "/js/auth.js";
import { config } from "/js/config.js";
import { isLocked as isLockedFor } from "/js/lock.js";

const NONE = Object.freeze({ tester: false, kiTester: false });
let access = NONE;
let checkedFor = null;
const listeners = new Set();

const emit = () => { for (const fn of [...listeners]) { try { fn(access); } catch (e) { console.error(e); } } };

/* Zuletzt bekannte Teams je Nutzer: Ohne Netz bleiben freigeschaltete Tools (z. B. Spiele) offen. */
const LAST_ACCESS = "pensum.lastAccess";
const lastAccess = (id) => { try { const a = JSON.parse(localStorage.getItem(LAST_ACCESS) || "null"); return a && a.id === id ? { tester: !!a.tester, kiTester: !!a.kiTester } : null; } catch (_) { return null; } };
const rememberAccess = (id, a) => { try { localStorage.setItem(LAST_ACCESS, JSON.stringify({ id, tester: a.tester, kiTester: a.kiTester })); } catch (_) { /* egal */ } };

async function check(user) {
  if (!user) { checkedFor = null; if (access !== NONE) { access = NONE; emit(); } return; }
  if (checkedFor === user.$id) return;
  checkedFor = user.$id;
  let now = NONE;
  try {
    const r = await new Teams(client).list();
    const ids = new Set((r.teams || []).map((t) => t.$id));
    now = { tester: ids.has(config.testerTeam), kiTester: ids.has(config.kiTesterTeam) };
    rememberAccess(user.$id, now);
  } catch (e) {
    // Hat der Server geantwortet (z. B. abgelaufene Session), bleibt alles gesperrt. Keine Antwort (offline): zuletzt bekannte Teams.
    const answered = e && typeof e.code === "number" && e.code > 0;
    if (!answered) now = lastAccess(user.$id) || NONE;
  }
  if (checkedFor !== user.$id) return; // zwischenzeitlich anderer Nutzer
  if (now.tester !== access.tester || now.kiTester !== access.kiTester) { access = now.tester || now.kiTester ? now : NONE; emit(); }
}

onAuthChange(({ status, user }) => { if (status === "ready") check(user); });

export const isTester = () => access.tester;
export const isKiTester = () => access.kiTester;
export const getAccess = () => access;

/** Ruft fn sofort und bei jeder Änderung mit { tester, kiTester } auf. */
export function onAccessChange(fn) {
  listeners.add(fn);
  fn(access);
  return () => listeners.delete(fn);
}

/** Wie onAccessChange, aber nur mit true/false für das Team „tester“. */
export function onTesterChange(fn) {
  return onAccessChange((a) => fn(a.tester));
}

/** Ist das Tool für den aktuellen Nutzer gesperrt? (Logik in lock.js) */
export const isLocked = (tool, accessNow = access) => isLockedFor(tool, accessNow);
