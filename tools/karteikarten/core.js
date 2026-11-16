/* Karteikarten – reine Logik (ohne Oberfläche, deshalb testbar).
 *
 * Stapel: { id, name, mode: "all" | "level", cards: [Karte] }
 * Karte:  { id, front, back, level: 1–5 }
 *
 * Abfrage-Arten:
 *   all   – alle Karten nacheinander, es gibt keine Level
 *   level – 5 Level: richtig = ein Level höher, falsch = ein Level tiefer und die Karte kommt nochmal dran.
 *           Karten in Level 5 gelten als gelernt und werden nicht mehr abgefragt.
 */
export const MAX_DECKS = 5;
export const LEVELS = 5;
export const MODES = {
  all: { label: "Alle hintereinander", hint: "Es gibt keine Level. Alle Karten kommen nacheinander dran." },
  level: { label: "Level (5 Stufen)", hint: "Richtig: die Karte steigt ein Level auf. Falsch: sie fällt ein Level zurück und wird nochmal abgefragt." },
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Vergleichsform: Groß-/Kleinschreibung, doppelte Leerzeichen und Satzzeichen am Rand sind egal. */
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?"'„“”‚‘’()]+|[\s.,;:!?"'„“”‚‘’()]+$/g, "");
}

/** Schriftliche Abfrage: richtig, wenn die Eingabe der ganzen Rückseite oder einer Alternative entspricht (getrennt mit / oder ;). */
export function isCorrect(input, answer) {
  const given = normalize(input);
  if (!given) return false;
  if (given === normalize(answer)) return true;
  return String(answer ?? "").split(/[\/;]/).map(normalize).filter(Boolean).includes(given);
}

export const isLevelMode = (deck) => deck.mode === "level";

/** Anzahl Karten pro Level (Index 0 = Level 1). */
export function levelCounts(deck) {
  const counts = Array(LEVELS).fill(0);
  for (const c of deck.cards) counts[clamp(c.level || 1, 1, LEVELS) - 1]++;
  return counts;
}

/** Karten, die beim Lernen drankommen. */
export function dueCount(deck) {
  return isLevelMode(deck) ? deck.cards.filter((c) => (c.level || 1) < LEVELS).length : deck.cards.length;
}

/** Reihenfolge einer Lernrunde (Karten-IDs). Im Level-Modus kommen niedrige Level zuerst. */
export function buildQueue(deck, rng = Math.random) {
  const cards = isLevelMode(deck) ? deck.cards.filter((c) => (c.level || 1) < LEVELS) : deck.cards;
  const mixed = shuffle(cards, rng);
  if (isLevelMode(deck)) mixed.sort((a, b) => (a.level || 1) - (b.level || 1));
  return mixed.map((c) => c.id);
}

/**
 * Wertet die vorderste Karte der Runde aus. Verändert Karte (Level) und Warteschlange.
 * Level-Modus: richtig → +1 Level, Karte ist durch; falsch → −1 Level, Karte kommt ans Ende und wird nochmal gefragt.
 * Alle-Modus: jede Karte genau einmal.
 */
export function answerCard(deck, queue, correct) {
  const id = queue[0];
  const card = deck.cards.find((c) => c.id === id);
  const rest = queue.slice(1);
  if (!card) return { queue: rest, card: null };
  if (isLevelMode(deck)) {
    card.level = clamp((card.level || 1) + (correct ? 1 : -1), 1, LEVELS);
    return { queue: correct ? rest : [...rest, id], card };
  }
  return { queue: rest, card };
}

/** Alle Karten zurück auf Level 1. */
export function resetLevels(deck) {
  for (const c of deck.cards) c.level = 1;
}
