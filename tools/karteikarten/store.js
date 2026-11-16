/* Karteikarten – Speicher.
 *
 * Zwei getrennte Speicher mit derselben Schnittstelle:
 *   Gast   → localStorage dieses Browsers (nichts verlässt das Gerät)
 *   Konto  → Appwrite-Tabellen „decks“ und „cards“ (nur für den eigenen Benutzer lesbar)
 *
 * Die Oberfläche arbeitet mit einem einzigen Datenobjekt { decks: [{ id, name, mode, cards: [{ id, front, back, level }] }] }
 * und ruft nach jeder Änderung save(data) auf. Der Konto-Speicher vergleicht mit dem zuletzt gespeicherten Stand
 * und schreibt nur, was sich geändert hat (anlegen, ändern, löschen).
 *
 * Gast- und Konto-Daten werden nie vermischt: Gast-Daten landen nur auf ausdrücklichen Wunsch im Konto.
 */
import { tablesDB, databaseId, tableIds, ownerPermissions, listAllRows, ID, Query } from "/js/db.js";
import { MAX_DECKS, LEVELS } from "./core.js";

const GUEST_KEY = "pensum.karteikarten.v1";
const text = (v, n) => String(v ?? "").slice(0, n);

const cleanCard = (c) => ({
  id: text(c.id, 36) || newId(),
  front: text(c.front, 1000),
  back: text(c.back, 1000),
  level: Math.min(LEVELS, Math.max(1, Math.round(Number(c.level)) || 1)),
});
const cleanDeck = (d) => ({
  id: text(d.id, 36) || newId(),
  name: text(d.name, 80) || "Stapel",
  mode: d.mode === "level" ? "level" : "all",
  cards: (Array.isArray(d.cards) ? d.cards : []).slice(0, 2000).map(cleanCard),
});

export function clean(data) {
  const decks = Array.isArray(data && data.decks) ? data.decks.slice(0, MAX_DECKS) : [];
  return { decks: decks.map(cleanDeck) };
}

export const newId = () => ID.unique();

/* ---------- Gast: localStorage ---------- */

export function createGuestStore() {
  const read = () => {
    try { return clean(JSON.parse(localStorage.getItem(GUEST_KEY) || "null")); } catch (_) { return { decks: [] }; }
  };
  return {
    kind: "guest",
    async load() { return read(); },
    peek: read,
    /** Gibt false zurück, wenn der Browser das Speichern verweigert. */
    save(data) {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
    },
    async flush() {},
    clear() { try { localStorage.removeItem(GUEST_KEY); } catch (_) { /* egal */ } },
  };
}

/* ---------- Konto: Appwrite ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transient = (e) => !e || !e.code || e.code >= 500 || e.code === 429;

/** Höchstens 3 Schreibzugriffe gleichzeitig, bei Serverfehlern bis zu zweimal mit Pause wiederholen. */
let active = 0;
const waiting = [];
async function limited(op, { okOn409 = false, okOn404 = false } = {}) {
  while (active >= 3) await new Promise((r) => waiting.push(r));
  active++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await op();
      } catch (e) {
        if (okOn409 && e && e.code === 409) return; // der erste Versuch war doch angekommen
        if (okOn404 && e && e.code === 404) return; // ist schon weg
        if (attempt >= 2 || !transient(e)) throw e;
        await sleep(1500 * (attempt + 1));
      }
    }
  } finally {
    active--;
    const next = waiting.shift();
    if (next) next();
  }
}

/**
 * @param {{ $id: string }} user
 * @param {(status: "saving" | "saved" | "error", error?: unknown) => void} onStatus
 */
export function createCloudStore(user, onStatus = () => {}) {
  const userId = user.$id;
  const permissions = ownerPermissions(userId);
  // Zuletzt gespeicherter Stand: id → Zeilen-Inhalt (zum Vergleichen)
  const syncedDecks = new Map();
  const syncedCards = new Map();
  let latest = null;     // jüngster Stand der Oberfläche
  let timer = null;
  let running = null;    // laufende Synchronisation
  let again = false;
  let retry = null;

  const deckRow = (d) => ({ name: d.name, mode: d.mode });
  const cardRow = (c, deckId) => ({ deckId, front: c.front, back: c.back, level: c.level });
  const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

  async function sync() {
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        const snap = latest;
        if (!snap) break;
        onStatus("saving");
        try {
          await push(snap);
          if (!again && !timer) onStatus("saved");
        } catch (e) {
          onStatus("error", e);
          clearTimeout(retry);
          retry = setTimeout(() => sync(), 8000); // später nochmal versuchen
          break;
        }
      } while (again);
    })().finally(() => { running = null; });
    return running;
  }

  /** Schreibt die Unterschiede zwischen snap und dem zuletzt gespeicherten Stand. */
  async function push(snap) {
    const wantDecks = new Map(snap.decks.map((d) => [d.id, d]));
    const wantCards = new Map();
    for (const d of snap.decks) for (const c of d.cards) wantCards.set(c.id, { card: c, deckId: d.id });
    const ops = [];

    // 1) Stapel anlegen/ändern (vor den Karten)
    const deckOps = [];
    for (const d of snap.decks) {
      const row = deckRow(d);
      const old = syncedDecks.get(d.id);
      if (!old) deckOps.push(limited(() => tablesDB.createRow({ databaseId, tableId: tableIds.decks, rowId: d.id, data: { userId, ...row }, permissions }), { okOn409: true }).then(() => syncedDecks.set(d.id, row)));
      else if (!same(row, old)) deckOps.push(limited(() => tablesDB.updateRow({ databaseId, tableId: tableIds.decks, rowId: d.id, data: row })).then(() => syncedDecks.set(d.id, row)));
    }
    await Promise.all(deckOps);

    // 2) Karten anlegen/ändern
    for (const [id, { card, deckId }] of wantCards) {
      const row = cardRow(card, deckId);
      const old = syncedCards.get(id);
      if (!old) ops.push(limited(() => tablesDB.createRow({ databaseId, tableId: tableIds.cards, rowId: id, data: { userId, ...row }, permissions }), { okOn409: true }).then(() => syncedCards.set(id, row)));
      else if (!same(row, old)) ops.push(limited(() => tablesDB.updateRow({ databaseId, tableId: tableIds.cards, rowId: id, data: row })).then(() => syncedCards.set(id, row)));
    }
    // 3) Gelöschte Karten und Stapel entfernen
    for (const id of [...syncedCards.keys()]) {
      if (!wantCards.has(id)) ops.push(limited(() => tablesDB.deleteRow({ databaseId, tableId: tableIds.cards, rowId: id }), { okOn404: true }).then(() => syncedCards.delete(id)));
    }
    await Promise.all(ops);
    const gone = [];
    for (const id of [...syncedDecks.keys()]) {
      if (!wantDecks.has(id)) gone.push(limited(() => tablesDB.deleteRow({ databaseId, tableId: tableIds.decks, rowId: id }), { okOn404: true }).then(() => syncedDecks.delete(id)));
    }
    await Promise.all(gone);
  }

  return {
    kind: "cloud",
    userId,

    async load() {
      const mine = [Query.equal("userId", userId), Query.orderAsc("$createdAt")];
      const [decks, cards] = await Promise.all([listAllRows(tableIds.decks, mine), listAllRows(tableIds.cards, mine)]);
      syncedDecks.clear();
      syncedCards.clear();
      const byDeck = new Map(decks.map((r) => [r.$id, []]));
      for (const r of cards) {
        syncedCards.set(r.$id, { deckId: r.deckId, front: r.front, back: r.back, level: r.level });
        if (byDeck.has(r.deckId)) byDeck.get(r.deckId).push({ id: r.$id, front: r.front, back: r.back, level: r.level });
      }
      for (const r of decks) syncedDecks.set(r.$id, { name: r.name, mode: r.mode });
      latest = null;
      return clean({ decks: decks.map((r) => ({ id: r.$id, name: r.name, mode: r.mode, cards: byDeck.get(r.$id) })) });
    },

    /** Änderungen sammeln und nach kurzer Pause in einem Rutsch speichern. */
    save(data) {
      latest = structuredClone(data);
      clearTimeout(timer);
      onStatus("saving");
      timer = setTimeout(() => { timer = null; sync(); }, 600);
      return true;
    },

    /** Alles Ausstehende sofort speichern (vor dem Abmelden und beim Verlassen der Seite). */
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      clearTimeout(retry);
      if (latest) await sync();
      else if (running) await running;
    },
  };
}
