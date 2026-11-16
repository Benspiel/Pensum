/* Galgenmännchen: Wörter aus Schule und Alltag, Großbuchstaben. */
export const MAX_WRONG = 8;
export const WORDS = [
  "SCHULE", "MATHEMATIK", "BIOLOGIE", "CHEMIE", "PHYSIK", "GESCHICHTE", "ERDKUNDE", "ENGLISCH", "DEUTSCH", "LATEIN", "SPANISCH", "FRANZÖSISCH",
  "INFORMATIK", "ZEUGNIS", "KLASSENARBEIT", "HAUSAUFGABE", "PAUSENBROT", "LEHRERZIMMER", "SCHULRANZEN", "TASCHENRECHNER", "LINEAL", "RADIERGUMMI",
  "ANSPITZER", "WÖRTERBUCH", "SCHREIBTISCH", "KLASSENFAHRT", "SPORTUNTERRICHT", "ABITUR", "STUNDENPLAN", "LERNKARTEN", "REFERAT", "PRÄSENTATION",
  "PROJEKTWOCHE", "FERIEN", "ZEICHNUNG", "GITARRE", "KLAVIER", "FUSSBALL", "BASKETBALL", "SCHWIMMBAD", "BIBLIOTHEK", "COMPUTER", "TASTATUR",
  "BILDSCHIRM", "INTERNET", "FOTOSYNTHESE", "MOLEKÜL", "ELEKTRON", "GRAVITATION", "VULKAN", "KONTINENT", "GEWITTER", "JAHRHUNDERT", "REVOLUTION",
  "DEMOKRATIE", "GRUNDGESETZ", "PARLAMENT", "SCHMETTERLING", "ELEFANT", "KROKODIL", "NASHORN", "REGENBOGEN", "SONNENSCHEIN", "FRÜHLING", "WASSERFALL",
  "GEBIRGE", "BAUERNHOF", "WELTRAUM", "MIKROSKOP", "EXPERIMENT", "GLEICHUNG", "DREIECK", "PROZENT", "KOORDINATEN", "WAHRSCHEINLICHKEIT",
];

export const pick = (rng = Math.random, words = WORDS) => words[Math.floor(rng() * words.length)];
export const create = (word) => ({ word, guessed: [], wrong: 0 });
export const mask = (s) => [...s.word].map((ch) => (s.guessed.includes(ch) ? ch : "_"));
export const isWon = (s) => [...s.word].every((ch) => s.guessed.includes(ch));
export const isLost = (s) => s.wrong >= MAX_WRONG;

/** Ein Buchstabe wird geraten. Liefert true, wenn er im Wort vorkommt; schon geratene Buchstaben zählen nicht doppelt. */
export function guess(s, letter) {
  if (s.guessed.includes(letter) || isWon(s) || isLost(s)) return null;
  s.guessed.push(letter);
  if (s.word.includes(letter)) return true;
  s.wrong++;
  return false;
}
