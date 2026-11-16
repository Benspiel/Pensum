/* Karteikarten – Speicher: localStorage dieses Geräts (nichts verlässt den Browser). */
import { MAX_DECKS, LEVELS } from "./core.js";

const KEY = "pensum.karteikarten.v1";
const text = (v, n) => String(v ?? "").slice(0, n);

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function clean(data) {
  const decks = Array.isArray(data && data.decks) ? data.decks.slice(0, MAX_DECKS) : [];
  return {
    decks: decks.map((d) => ({
      id: text(d.id, 80) || newId(),
      name: text(d.name, 80) || "Stapel",
      mode: d.mode === "level" ? "level" : "all",
      cards: (Array.isArray(d.cards) ? d.cards : []).slice(0, 2000).map((c) => ({
        id: text(c.id, 80) || newId(),
        front: text(c.front, 1000),
        back: text(c.back, 1000),
        level: Math.min(LEVELS, Math.max(1, Number(c.level) || 1)),
      })),
    })),
  };
}

export function load() {
  try { return clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (_) { return { decks: [] }; }
}

/** Gibt false zurück, wenn der Browser das Speichern verweigert. */
export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
}
