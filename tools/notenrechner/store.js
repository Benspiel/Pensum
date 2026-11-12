/* Notenrechner – Speicher.
 *
 * Zwei getrennte Speicher mit derselben Schnittstelle:
 *   Gast   → localStorage dieses Browsers (nichts verlässt das Gerät)
 *   Konto  → Appwrite-Tabellen „subjects“ und „grades“ (nur für den eigenen Benutzer lesbar)
 *
 * Die beiden werden nie vermischt: Konto-Daten landen nicht im localStorage, Gast-Daten nur
 * auf ausdrücklichen Wunsch (importGuestData) im Konto.
 *
 * Fach:  { id, name, schoolYear }
 * Note:  { id, subjectId, label, value, system: "note" | "punkte", weight, half: 1 | 2 }
 */
import { tablesDB, databaseId, tableIds, ownerPermissions, listAllRows, ID, Query } from "/js/db.js";

const GUEST_KEY = "pensum.notenrechner.guest.v1";

const cleanSubject = (s) => ({ id: s.id, name: String(s.name || "").slice(0, 120), schoolYear: s.schoolYear });
const cleanGrade = (g) => ({
  id: g.id,
  subjectId: g.subjectId,
  label: String(g.label || "").slice(0, 120),
  value: g.value,
  system: g.system === "punkte" ? "punkte" : "note",
  weight: g.weight,
  half: g.half === 2 ? 2 : 1,
});

/* ---------- Gast: localStorage ---------- */

export function createGuestStore() {
  const read = () => {
    try {
      const data = JSON.parse(localStorage.getItem(GUEST_KEY) || "null");
      if (data && Array.isArray(data.subjects) && Array.isArray(data.grades)) return data;
    } catch (_) { /* kaputte oder gesperrte Daten: leer starten */ }
    return { subjects: [], grades: [] };
  };
  let data = read();
  const write = () => {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(data)); return true; } catch (_) { return false; }
  };
  const patch = (list, id, changes) => { const item = list.find((x) => x.id === id); if (item) Object.assign(item, changes); };

  return {
    kind: "guest",
    newId: () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    async load() { data = read(); return structuredClone(data); },
    peek() { return read(); },
    async addSubject(s) { data.subjects.push(cleanSubject(s)); write(); },
    async updateSubject(id, changes) { patch(data.subjects, id, changes); write(); },
    async removeSubject(id) {
      data.subjects = data.subjects.filter((s) => s.id !== id);
      data.grades = data.grades.filter((g) => g.subjectId !== id);
      write();
    },
    async addGrade(g) { data.grades.push(cleanGrade(g)); write(); },
    async updateGrade(id, changes) { patch(data.grades, id, changes); write(); },
    async removeGrade(id) { data.grades = data.grades.filter((g) => g.id !== id); write(); },
    async flush() {},
    clear() { data = { subjects: [], grades: [] }; try { localStorage.removeItem(GUEST_KEY); } catch (_) {} },
  };
}

/* ---------- Konto: Appwrite ---------- */

/**
 * @param {{ $id: string }} user
 * @param {(status: "saving" | "saved" | "error", error?: unknown) => void} onStatus
 */
export function createCloudStore(user, onStatus = () => {}) {
  const userId = user.$id;
  const permissions = ownerPermissions(userId);
  const chains = new Map();   // Zeilen-ID → letzte laufende Operation (hält die Reihenfolge je Zeile ein)
  const pending = new Map();  // Zeilen-ID → { tableId, data, timer } (gesammelte Änderungen)
  let busy = 0, failed = false;

  const settle = (error) => {
    busy--;
    if (error) { failed = true; onStatus("error", error); }
    else if (busy === 0 && pending.size === 0) { if (!failed) onStatus("saved"); }
  };

  // Operation für eine Zeile hinten an deren Kette hängen
  function enqueue(rowId, op) {
    busy++;
    failed = false;
    onStatus("saving");
    const run = (chains.get(rowId) || Promise.resolve()).then(op);
    const tail = run.then(() => settle(), (e) => settle(e));
    chains.set(rowId, tail);
    tail.then(() => { if (chains.get(rowId) === tail) chains.delete(rowId); });
    return run;
  }

  // Änderungen beim Tippen sammeln und nach kurzer Pause in einem Rutsch speichern
  function schedule(tableId, rowId, data) {
    const entry = pending.get(rowId) || { tableId, data: {}, timer: null };
    Object.assign(entry.data, data);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => flushRow(rowId), 600);
    pending.set(rowId, entry);
    onStatus("saving");
  }

  function flushRow(rowId) {
    const entry = pending.get(rowId);
    if (!entry) return Promise.resolve();
    clearTimeout(entry.timer);
    pending.delete(rowId);
    return enqueue(rowId, () => tablesDB.updateRow({ databaseId, tableId: entry.tableId, rowId, data: entry.data })).catch(() => {});
  }

  const dropPending = (rowId) => {
    const entry = pending.get(rowId);
    if (entry) { clearTimeout(entry.timer); pending.delete(rowId); }
  };

  const create = (tableId, rowId, data) =>
    enqueue(rowId, () => tablesDB.createRow({ databaseId, tableId, rowId, data: { userId, ...data }, permissions }));

  const remove = (tableId, rowId) => {
    dropPending(rowId);
    return enqueue(rowId, () => tablesDB.deleteRow({ databaseId, tableId, rowId }).catch((e) => { if (!e || e.code !== 404) throw e; }));
  };

  const rowData = ({ id, ...rest }) => rest;

  return {
    kind: "cloud",
    userId,
    newId: () => ID.unique(),
    isIdle: () => busy === 0 && pending.size === 0,

    async load() {
      const mine = [Query.equal("userId", userId), Query.orderAsc("$createdAt")];
      const [subjects, grades] = await Promise.all([listAllRows(tableIds.subjects, mine), listAllRows(tableIds.grades, mine)]);
      return {
        subjects: subjects.map((r) => ({ id: r.$id, name: r.name, schoolYear: r.schoolYear })),
        grades: grades.map((r) => ({ id: r.$id, subjectId: r.subjectId, label: r.label || "", value: r.value, system: r.system, weight: r.weight, half: r.half })),
      };
    },

    addSubject: (s) => create(tableIds.subjects, s.id, rowData(cleanSubject(s))),
    async updateSubject(id, changes) { schedule(tableIds.subjects, id, changes); },
    async removeSubject(id, gradeIds = []) {
      await Promise.allSettled(gradeIds.map((gid) => remove(tableIds.grades, gid)));
      return remove(tableIds.subjects, id);
    },
    addGrade: (g) => create(tableIds.grades, g.id, rowData(cleanGrade(g))),
    async updateGrade(id, changes) { schedule(tableIds.grades, id, changes); },
    removeGrade: (id) => remove(tableIds.grades, id),

    /** Alles Ausstehende sofort speichern (vor dem Abmelden und beim Verlassen der Seite). */
    async flush() {
      await Promise.allSettled([...pending.keys()].map(flushRow));
      await Promise.allSettled([...chains.values()]);
    },
  };
}

/** Gast-Daten ins Konto übernehmen (neue IDs, Zuordnung Fach → Noten bleibt erhalten). */
export async function importGuestData(cloud, data) {
  const idMap = new Map();
  for (const s of data.subjects) {
    const id = cloud.newId();
    idMap.set(s.id, id);
    await cloud.addSubject({ ...s, id });
  }
  const grades = data.grades.filter((g) => idMap.has(g.subjectId) && Number.isFinite(g.value) && Number.isFinite(g.weight));
  for (let i = 0; i < grades.length; i += 5) {
    await Promise.all(grades.slice(i, i + 5).map((g) => cloud.addGrade({ ...g, id: cloud.newId(), subjectId: idMap.get(g.subjectId) })));
  }
  return { subjects: idMap.size, grades: grades.length };
}
