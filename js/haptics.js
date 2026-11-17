/* Haptik-Feedback für alle Geräte.
 * Android und die meisten Browser: navigator.vibrate.
 * iPhone/iPad (Safari kennt vibrate nicht): ein unsichtbarer Schalter („checkbox switch“, iOS 18+) wird per Label angetippt,
 * das löst den System-Tick aus. Das klappt nur direkt in einer Geste (Tippen/Klick); sonst passiert still nichts.
 * Geräte ohne Haptik und Nutzer mit „Bewegung reduzieren“ bekommen nichts, und es wirft nie einen Fehler. */

/* Muster in Millisekunden (Android) bzw. Anzahl Ticks mit Abstand (iOS) – kurz und leise, damit es zu den Elementen passt */
export const PATTERNS = {
  tap: [10],              // Knopf, Chat auswählen, Menü öffnen
  select: [6],            // Auswahl wechseln (Klasse), Schritte auf-/zuklappen
  open: [12],             // Chatliste auf
  close: [8],             // Chatliste zu
  send: [14],             // Nachricht abschicken
  success: [10, 50, 16],  // Antwort da, Umbenennen gespeichert
  warn: [20, 40, 20],     // Löschen bestätigen
  error: [30, 50, 30, 50, 30], // Fehler
};

let sw = null;

function iosSwitch() {
  if (sw) return sw;
  try {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.append(input);
    (document.body || document.documentElement).append(label);
    sw = label;
  } catch (_) { sw = null; }
  return sw;
}

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };

export const canHaptic = () => {
  try { return typeof navigator.vibrate === "function" || /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } catch (_) { return false; }
};

/** haptic("tap") oder haptic([10, 40, 10]) */
export function haptic(kind = "tap") {
  try {
    if (reduced()) return;
    const pattern = Array.isArray(kind) ? kind : PATTERNS[kind] || PATTERNS.tap;
    if (typeof navigator.vibrate === "function") { navigator.vibrate(pattern); return; }
    const el = iosSwitch();
    if (!el) return;
    // Auf iOS: jedes „Vibrationsstück“ (gerade Stelle im Muster) ein Tick
    pattern.forEach((ms, i) => {
      if (i % 2) return;
      if (i === 0) el.click();
      else setTimeout(() => { try { el.click(); } catch (_) { /* egal */ } }, pattern.slice(0, i).reduce((a, b) => a + b, 0));
    });
  } catch (_) { /* Haptik ist nur Zugabe */ }
}
