/* Team (Admin) – reine Hilfen: Zahlen formatieren und das Bento-Raster als HTML bauen (ohne Browser, damit es sich testen lässt).
 * Das Raster ist dem „Widget Grid“ von Kokonut UI nachempfunden (MIT, https://kokonutui.com), aber fest: Die Module lassen sich weder verschieben noch in der Größe ändern. */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 1234 → "1.234"; fehlende Zahl (null) → "–". */
export const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString("de-DE") : "–");

/** Anteil von part an whole in Prozent (0 bis 100, ganzzahlig); ohne Basis 0. */
export const pct = (part, whole) => (Number.isFinite(part) && Number.isFinite(whole) && whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

/** Wochentag-Kürzel eines Datums JJJJ-MM-TT ("2026-11-19" → "Do"). */
export function weekday(day) {
  const d = new Date(String(day) + "T12:00:00Z");
  return Number.isNaN(d.getTime()) ? "" : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()];
}

/** Höhen der Balken in Prozent des höchsten Werts (kleinster sichtbarer Balken 4 %, bei 0 Besuchen 0 %). */
export function barHeights(values) {
  const max = Math.max(0, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  return values.map((v) => (!Number.isFinite(v) || v <= 0 || max <= 0 ? 0 : Math.max(4, Math.round((v / max) * 100))));
}

/** Uhrzeit der Antwort als „14:05“. */
export const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); };

const ico = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  users: ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.9.6 3 2.3 3 5.2"/>'),
  pulse: ico('<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>'),
  chart: ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  rank: ico('<path d="M8 21V11M16 21V7M12 21v-6M4 21h16"/>'),
  plus: ico('<path d="M12 5v14M5 12h14"/>'),
  shield: ico('<path d="M12 3 5 6v5c0 4.5 2.9 8.2 7 10 4.1-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'),
  box: ico('<path d="M3 8 12 4l9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/>'),
};

/** Ein Modul des Rasters. span = Breite in Spalten (von 6), rows = Höhe in Zeilen. Kein Griff, keine Größenänderung. */
const widget = ({ id, title, icon, span, rows = 1, body, note }) =>
  `<section class="ad-w ad-span-${span} ad-rows-${rows}" data-widget="${esc(id)}" aria-labelledby="ad-t-${esc(id)}">`
  + `<header class="ad-w-head"><span class="ad-w-ico">${ICONS[icon] || ""}</span><h2 class="ad-w-title" id="ad-t-${esc(id)}">${esc(title)}</h2>${note ? `<span class="ad-w-note">${esc(note)}</span>` : ""}</header>`
  + `<div class="ad-w-body">${body}</div></section>`;

const bigNumber = (n, label) => `<div class="ad-big"><b>${fmt(n)}</b><span>${esc(label)}</span></div>`;

/** "heute", "gestern", "vor 3 Tagen" für ein Datum JJJJ-MM-TT, bezogen auf today (JJJJ-MM-TT). */
export function dayAgo(day, today) {
  const a = Date.parse(String(day) + "T12:00:00Z"), b = Date.parse(String(today) + "T12:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return "";
  const n = Math.round((b - a) / 86400000);
  return n <= 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`;
}

/** Wer nutzt was: Liste der Personen mit ihren Aufrufen je Tool. filter = Tool-ID oder "" (alle). Personen kommen aus der Function (people.list). */
export function peopleHtml(people, tools = [], filter = "", today = "") {
  const toolOf = (id) => tools.find((x) => x.id === id) || { name: id };
  const used = tools.filter((t) => people.list.some((p) => p.tools[t.id]));
  const rows = people.list
    .filter((p) => !filter || p.tools[filter])
    .sort((a, b) => (filter ? (b.tools[filter] || 0) - (a.tools[filter] || 0) : 0) || b.total - a.total)
    .slice(0, 200);
  const select = `<label class="ad-filter"><span class="sr-only">Tool wählen</span><select class="select ad-select" id="peopleFilter" aria-label="Tool wählen"><option value="">Alle Tools</option>`
    + used.map((t) => `<option value="${esc(t.id)}"${t.id === filter ? " selected" : ""}>${esc(t.name)}</option>`).join("") + `</select></label>`;
  const list = rows.length
    ? `<ul class="ad-people">` + rows.map((p) => {
      const label = p.name || p.email || "Ohne Namen";
      const chips = Object.entries(p.tools).sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `<span class="ad-chip${id === filter ? " is-on" : ""}">${esc(toolOf(id).name)} <b>${fmt(n)}</b></span>`).join("");
      return `<li><span class="ad-av" aria-hidden="true">${esc(Array.from(label)[0] || "?").toUpperCase()}</span>`
        + `<span class="ad-who"><span class="ad-who-name">${esc(label)}</span>${p.name && p.email ? `<span class="ad-who-mail">${esc(p.email)}</span>` : ""}</span>`
        + `<span class="ad-chips">${chips}</span><span class="ad-when">${esc(dayAgo(p.lastDay, today))}</span></li>`;
    }).join("") + `</ul>`
    : `<p class="body-sm muted-tint">Noch keine Aufrufe in diesem Zeitraum.</p>`;
  const body = `<div class="ad-people-top">${select}<span class="ad-hint">${fmt(rows.length)} von ${fmt(people.list.length)} Nutzern${people.truncated ? " (Liste gekürzt)" : ""}</span></div>${list}`;
  return widget({ id: "people", title: "Wer nutzt was", icon: "users", span: 6, note: `${people.days} Tage`, body });
}

/** Das ganze Raster aus der Antwort der Function (stats) und dem Tool-Verzeichnis (tools: { id, name, icon }). */
export function bentoHtml(stats, tools = []) {
  const u = stats.users, v = stats.visits, t = stats.teams, c = stats.content;
  const toolOf = (id) => tools.find((x) => x.id === id) || { name: id, icon: "" };

  const heights = barHeights(v.series.map((d) => d.count));
  const chart = `<div class="ad-bars" role="img" aria-label="Besuche der letzten 7 Tage">`
    + v.series.map((d, i) => `<div class="ad-bar${i === v.series.length - 1 ? " is-today" : ""}"><span class="ad-bar-n">${fmt(d.count)}</span><i style="--h:${heights[i]}%"></i><span class="ad-bar-d">${esc(weekday(d.day))}</span></div>`).join("")
    + `</div>`;

  const top = Math.max(0, ...v.byTool.map((r) => r.last7 || 0));
  const ranking = `<ol class="ad-rank">` + v.byTool.map((r, i) => {
    const tool = toolOf(r.tool);
    return `<li><span class="ad-rank-pos">${i + 1}</span><span class="ad-rank-ico">${tool.icon || ""}</span>`
      + `<span class="ad-rank-main"><span class="ad-rank-line"><span class="ad-rank-name">${esc(tool.name)}</span><span class="ad-rank-val">${fmt(r.last7)} <small>/ ${fmt(r.total)} gesamt</small></span></span>`
      + `<span class="ad-meter"><i style="--w:${top > 0 ? pct(r.last7 || 0, top) : 0}%"></i></span></span></li>`;
  }).join("") + `</ol>`;

  const verified = pct(u.verified, u.total);
  const list = (rows) => `<dl class="ad-list">` + rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${fmt(val)}</dd></div>`).join("") + `</dl>`;

  return [
    widget({ id: "users", title: "Nutzer", icon: "users", span: 3, body: bigNumber(u.total, "Konten insgesamt")
      + `<div class="ad-split"><div class="ad-meter ad-meter-lg"><i style="--w:${verified}%"></i></div><p>${fmt(u.verified)} mit bestätigter E-Mail (${verified} %)</p></div>` }),
    widget({ id: "visits", title: "Tool-Aufrufe", icon: "chart", span: 3, note: "7 Tage",
      body: `<div class="ad-row">${bigNumber(v.last7, "in 7 Tagen")}${bigNumber(v.today, "heute")}${bigNumber(v.total, "gesamt")}</div>${chart}` }),
    widget({ id: "ranking", title: "Beliebteste Tools", icon: "rank", span: 4, rows: 2, note: "Aufrufe in 7 Tagen", body: ranking }),
    widget({ id: "active", title: "Aktiv", icon: "pulse", span: 2, body: bigNumber(u.active7, "Nutzer in 7 Tagen") + `<p class="ad-hint">${pct(u.active7, u.total)} % aller Konten</p>` }),
    widget({ id: "new", title: "Neu", icon: "plus", span: 2, body: bigNumber(u.new7, "Konten in 7 Tagen") + `<p class="ad-hint">${fmt(u.total)} insgesamt</p>` }),
    widget({ id: "teams", title: "Teams", icon: "shield", span: 3, body: list([["Admin", t.admin], ["Ki-Tester", t.kiTester], ["Tester", t.tester]]) }),
    widget({ id: "content", title: "Angelegt", icon: "box", span: 3,
      body: list([["Karteikarten-Stapel", c.decks], ["Karteikarten", c.cards], ["Mindmaps", c.mindmaps], ["KI-Chats", c.chats], ["Chat-Nachrichten", c.messages], ["Planer-Einträge", c.planner], ["Noten", c.grades]]) }),
  ].join("");
}
