/* Tester-Zugang: Wer im Appwrite-Team „tester“ ist (config.testerTeam), darf alle ausgegrauten Tools („soon“) nutzen.
 * Das Team gehört nur der Oberfläche: Die Kacheln und Footer-Links werden freigeschaltet. Gesperrt wird sonst nichts.
 * Team anlegen und Nutzer aufnehmen:
 *   appwrite teams create --team-id tester --name Tester
 *   appwrite teams create-membership --team-id tester --user-id <Nutzer-ID> --roles tester */
import { Teams } from "/vendor/appwrite.js";
import { client, onAuthChange } from "/js/auth.js";
import { config } from "/js/config.js";

let tester = false;
let checkedFor = null;
const listeners = new Set();

const emit = () => { for (const fn of [...listeners]) { try { fn(tester); } catch (e) { console.error(e); } } };

async function check(user) {
  if (!user) { checkedFor = null; if (tester) { tester = false; emit(); } return; }
  if (checkedFor === user.$id) return;
  checkedFor = user.$id;
  let now = false;
  try {
    const r = await new Teams(client).list();
    now = (r.teams || []).some((t) => t.$id === config.testerTeam);
  } catch (_) { /* ohne Antwort bleibt alles gesperrt */ }
  if (checkedFor !== user.$id) return; // zwischenzeitlich anderer Nutzer
  if (now !== tester) { tester = now; emit(); }
}

onAuthChange(({ status, user }) => { if (status === "ready") check(user); });

export const isTester = () => tester;

/** Ruft fn sofort und bei jeder Änderung mit true/false auf. */
export function onTesterChange(fn) {
  listeners.add(fn);
  fn(tester);
  return () => listeners.delete(fn);
}

/** Ist das Tool für den aktuellen Nutzer gesperrt? Nur „soon“-Tools sind gesperrt, Tester dürfen sie nutzen. */
export const isLocked = (tool, testerNow = tester) => !!tool.soon && !testerNow;
