/* Push-Erinnerungen – reine Hilfen (ohne Netzwerk), damit sie sich testen lassen. */
"use strict";

/** Aktuelle Stunde (0–23) in Europe/Berlin. */
function berlinHour(now) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).formatToParts(now || new Date());
  const hour = Number((parts.find((p) => p.type === "hour") || {}).value);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

const TOPICS = {
  cards: { flag: "cards", hourKey: "cardsHour", title: "Zeit zum Lernen", body: "Deine Karteikarten warten auf dich." },
  mindmap: { flag: "mindmap", hourKey: "mindmapHour", title: "Neue Mindmap", body: "Du kannst heute wieder eine Mindmap erstellen.", ai: true },
};

/** Gültige Appwrite-ID (Push-Ziel): a–z, A–Z, 0–9, Punkt, Bindestrich, Unterstrich; nicht mit Sonderzeichen beginnend; höchstens 36 Zeichen. */
const isTargetId = (id) => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);

/** Je Thema eine Nachricht mit allen Push-Zielen, deren gewählte Stunde der aktuellen entspricht. rows = Zeilen aus push_devices.
 *  Themen mit ai: true (KI-Tools) werden nur mit options.ai = true verschickt; die Function setzt das über die Variable AI_ENABLED. */
function groupsFor(rows, hour, options = {}) {
  const groups = [];
  for (const t of Object.values(TOPICS)) {
    if (t.ai && !options.ai) continue;
    const targets = [];
    for (const row of rows || []) {
      if (row[t.flag] === true && Number(row[t.hourKey]) === hour && isTargetId(row.targetId) && !targets.includes(row.targetId)) targets.push(row.targetId);
    }
    if (targets.length) groups.push({ topic: t.flag, title: t.title, body: t.body, targets });
  }
  return groups;
}

/** In Pakete zu je size. */
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

module.exports = { berlinHour, groupsFor, chunk, isTargetId, TOPICS };
