import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// store.js importiert /js/db.js (Browser-Pfad). Für den Test wird das gegen eine Attrappe getauscht, die Tabellen im Speicher hält.
const tables = { decks: new Map(), cards: new Map() };
globalThis.__tables = tables;
globalThis.__calls = [];
const mock = `
const t = globalThis.__tables;
export const tableIds = { decks: "decks", cards: "cards" };
export const databaseId = "pensum";
export const ID = { unique: () => Math.random().toString(36).slice(2, 12) };
export const Query = { equal: () => 0, orderAsc: () => 0 };
export const ownerPermissions = (id) => ["user:" + id];
export const listAllRows = async (table) => [...t[table].values()];
export const tablesDB = {
  async createRow({ tableId, rowId, data }) { globalThis.__calls.push("create " + tableId); t[tableId].set(rowId, { $id: rowId, ...data }); },
  async updateRow({ tableId, rowId, data }) { globalThis.__calls.push("update " + tableId); Object.assign(t[tableId].get(rowId), data); },
  async deleteRow({ tableId, rowId }) { globalThis.__calls.push("delete " + tableId); t[tableId].delete(rowId); },
};`;
const core = pathToFileURL(new URL("../tools/karteikarten/core.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
const src = readFileSync(new URL("../tools/karteikarten/store.js", import.meta.url), "utf8")
  .replace('"/js/db.js"', JSON.stringify("data:text/javascript," + encodeURIComponent(mock)))
  .replace('"./core.js"', JSON.stringify(core));
const { createCloudStore } = await import("data:text/javascript," + encodeURIComponent(src));

const data = () => ({ decks: [{ id: "d1", name: "Englisch", mode: "level", cards: [{ id: "c1", front: "Hund", back: "dog", level: 1 }, { id: "c2", front: "Katze", back: "cat", level: 2 }] }] });

test("Konto-Speicher: anlegen, ändern, löschen, laden", async () => {
  const statuses = [];
  const store = createCloudStore({ $id: "u1" }, (s) => statuses.push(s));
  assert.deepEqual(await store.load(), { decks: [] });

  const d = data();
  store.save(d);
  await store.flush();
  assert.equal(tables.decks.size, 1);
  assert.equal(tables.cards.size, 2);
  assert.equal(tables.cards.get("c1").userId, "u1");
  assert.equal(statuses.at(-1), "saved");

  // nur geänderte Karte wird geschrieben
  __calls.length = 0;
  d.decks[0].cards[0].level = 2;
  store.save(d);
  await store.flush();
  assert.deepEqual(__calls, ["update cards"]);
  assert.equal(tables.cards.get("c1").level, 2);

  // Karte löschen, Karte hinzufügen
  d.decks[0].cards = d.decks[0].cards.filter((c) => c.id !== "c2");
  d.decks[0].cards.push({ id: "c3", front: "Haus", back: "house", level: 1 });
  store.save(d);
  await store.flush();
  assert.deepEqual([...tables.cards.keys()].sort(), ["c1", "c3"]);

  // neu laden (anderes Gerät) liefert denselben Stand
  const other = createCloudStore({ $id: "u1" });
  const loaded = await other.load();
  assert.equal(loaded.decks[0].name, "Englisch");
  assert.deepEqual(loaded.decks[0].cards.map((c) => c.id).sort(), ["c1", "c3"]);

  // Stapel löschen entfernt auch seine Karten
  store.save({ decks: [] });
  await store.flush();
  assert.equal(tables.decks.size, 0);
  assert.equal(tables.cards.size, 0);
});
