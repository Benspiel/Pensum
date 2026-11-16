/* Spiele – reine Helfer ohne Oberfläche (auch in Tests nutzbar). */

/** Zufallsfunktion mit Startwert (für Tests und reproduzierbare Rätsel). */
export const seeded = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Mischt eine Liste (Fisher–Yates) und gibt eine neue zurück. */
export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Sekunden als m:ss. */
export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
