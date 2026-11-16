/* Planer – Speicher. Gast: localStorage dieses Browsers · Konto: Appwrite-Tabelle „planner“ (nur für den Besitzer lesbar).
 * Die Oberfläche arbeitet mit einer Liste { items: [...] } und ruft nach jeder Änderung save(data) auf.
 * Der Konto-Speicher vergleicht mit dem zuletzt gespeicherten Stand und schreibt nur die Unterschiede.
 * Gast- und Konto-Daten werden nie vermischt: Gast-Daten kommen nur auf ausdrücklichen Wunsch ins Konto. */
import { tablesDB, databaseId, tableIds, ownerPermissions, listAllRows, ID, Query } from "/js/db.js";
import { MAX_ITEMS, parseDay } from "./core.js";

const GUEST_KEY = "pensum.planer.v1";
const text = (v, n) => String(v ?? "").slice(0, n);

export const newId = () => ID.unique();

const cleanItem = (i) => ({
  id: text(i.id, 36) || newId(),
  kind: i.kind === "exam" ? "exam" : "task",
  title: text(i.title, 120).trim() || "Ohne Titel",
  subject: text(i.subject, 60).trim(),
  date: parseDay(i.date) == null ? "" : String(i.date),
  note: text(i.note, 500),
  done: i.kind === "exam" ? false : !!i.done,
  deckId: text(i.deckId, 36),
});

export function clean(data) {
  const items = Array.isArray(data && data.items) ? data.items.slice(0, MAX_ITEMS) : [];
  return { items: items.map(cleanItem) };
}

/* ---------- Gast ---------- */

export function createGuestStore() {
  const read = () => {
    try { return clean(JSON.parse(localStorage.getItem(GUEST_KEY) || "null")); } catch (_) { return { items: [] }; }
  };
  return {
    kind: "guest",
    async load() { return read(); },
    peek: read,
    save(data) { try { localStorage.setItem(GUEST_KEY, JSON.stringify(data)); return true; } catch (_) { return false; } },
    async flush() {},
    clear() { try { localStorage.removeItem(GUEST_KEY); } catch (_) { /* egal */ } },
  };
}

/* ---------- Konto ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transient = (e) => !e || !e.code || e.code >= 500 || e.code === 429;

let active = 0;
const waiting = [];
async function limited(op, { okOn409 = false, okOn404 = false } = {}) {
  while (active >= 3) await new Promise((r) => waiting.push(r));
  active++;
  try {
    for (let attempt = 0; ; attempt++) {
      try { return await op(); } catch (e) {
        if (okOn409 && e && e.code === 409) return;
        if (okOn404 && e && e.code === 404) return;
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

/** Zeile in der Tabelle: leere Texte werden als null gespeichert. */
const toRow = (i) => ({ kind: i.kind, title: i.title, subject: i.subject || null, date: i.date || null, note: i.note || null, deckId: i.deckId || null, done: !!i.done });
const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

export function createCloudStore(user, onStatus = () => {}) {
  const userId = user.$id;
  const permissions = ownerPermissions(userId);
  const synced = new Map();   // id → zuletzt gespeicherte Zeile
  let latest = null, timer = null, running = null, again = false, retry = null;

  async function push(snap) {
    const want = new Map(snap.items.map((i) => [i.id, i]));
    const ops = [];
    for (const i of snap.items) {
      const row = toRow(i), old = synced.get(i.id);
      if (!old) ops.push(limited(() => tablesDB.createRow({ databaseId, tableId: tableIds.planner, rowId: i.id, data: { userId, ...row }, permissions }), { okOn409: true }).then(() => synced.set(i.id, row)));
      else if (!same(row, old)) ops.push(limited(() => tablesDB.updateRow({ databaseId, tableId: tableIds.planner, rowId: i.id, data: row })).then(() => synced.set(i.id, row)));
    }
    for (const id of [...synced.keys()]) {
      if (!want.has(id)) ops.push(limited(() => tablesDB.deleteRow({ databaseId, tableId: tableIds.planner, rowId: id }), { okOn404: true }).then(() => synced.delete(id)));
    }
    await Promise.all(ops);
  }

  async function sync() {
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        if (!latest) break;
        onStatus("saving");
        try {
          await push(latest);
          if (!again && !timer) onStatus("saved");
        } catch (e) {
          onStatus("error", e);
          clearTimeout(retry);
          retry = setTimeout(() => sync(), 8000);
          break;
        }
      } while (again);
    })().finally(() => { running = null; });
    return running;
  }

  return {
    kind: "cloud",
    userId,
    async load() {
      const rows = await listAllRows(tableIds.planner, [Query.equal("userId", userId), Query.orderAsc("$createdAt")]);
      synced.clear();
      const items = rows.map((r) => {
        const item = { id: r.$id, kind: r.kind, title: r.title, subject: r.subject || "", date: r.date || "", note: r.note || "", deckId: r.deckId || "", done: !!r.done };
        synced.set(r.$id, toRow(cleanItem(item)));
        return item;
      });
      latest = null;
      return clean({ items });
    },
    save(data) {
      latest = structuredClone(data);
      clearTimeout(timer);
      onStatus("saving");
      timer = setTimeout(() => { timer = null; sync(); }, 600);
      return true;
    },
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      clearTimeout(retry);
      if (latest) await sync(); else if (running) await running;
    },
  };
}
