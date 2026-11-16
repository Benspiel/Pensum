/* Memory: Paare finden. Jede Karte hat ein Zeichen (symbol) und eine Farbe (tone). */
import { shuffle } from "./util.js";
export const SYMBOLS = ["★", "♥", "♦", "♣", "♠", "●", "■", "▲", "☀", "☂", "✈", "✿", "♪", "☘", "✂", "⚑", "☎", "✉"];
export const SIZES = { klein: { cols: 4, rows: 3, label: "4 × 3" }, mittel: { cols: 4, rows: 4, label: "4 × 4" }, gross: { cols: 6, rows: 5, label: "6 × 5" } };

/** Mischt Paare; es gibt pairs verschiedene Zeichen, jedes genau zweimal. */
export function deck(pairs, rng = Math.random) {
  const cards = [];
  for (let i = 0; i < pairs; i++) cards.push({ id: i, symbol: SYMBOLS[i % SYMBOLS.length], tone: i % 6 }, { id: i, symbol: SYMBOLS[i % SYMBOLS.length], tone: i % 6 });
  return shuffle(cards, rng).map((c, index) => ({ ...c, index, open: false, matched: false }));
}
export const isDone = (cards) => cards.every((c) => c.matched);
