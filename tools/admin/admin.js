/* Team (Admin) – Oberfläche. Zeigt die Zahlen der Function „admin-stats“ als festes Bento-Raster.
 * Wer hier hineinkommt, bestimmt allein der Server (Team „admin“); die Prüfung im Browser blendet nur die Seite ein oder aus. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { Teams, Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { tools } from "/js/tools.js";
import { loaderHtml } from "/js/loader.js";
import { bentoHtml, clock } from "./core.js";

const $ = (id) => document.getElementById(id);
const els = { gate: $("gate"), denied: $("denied"), app: $("app"), grid: $("grid"), stand: $("stand"), reload: $("reload"), error: $("error") };

let startedFor = null;
let loading = false;

async function fetchStats() {
  let ex;
  try {
    ex = await new Functions(client).createExecution({ functionId: config.functions.adminStats, body: "{}", async: false, method: ExecutionMethod.POST });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der Zahlen-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.adminStats}“).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Die Zahlen konnten nicht geladen werden.");
  return data.stats;
}

async function load() {
  if (loading) return;
  loading = true;
  els.reload.disabled = true;
  els.error.hidden = true;
  if (!els.grid.children.length) els.grid.innerHTML = `<div class="ad-loading">${loaderHtml({ title: "Zahlen werden geladen …", size: "md" })}</div>`;
  try {
    const stats = await fetchStats();
    const list = tools.map((t) => ({ id: t.id, name: t.name, icon: t.icon }));
    els.grid.innerHTML = bentoHtml(stats, list);
    els.stand.textContent = "Stand " + clock(stats.generatedAt) + " Uhr";
  } catch (e) {
    if (els.grid.querySelector(".ad-loading")) els.grid.innerHTML = "";
    els.error.textContent = e.message;
    els.error.hidden = false;
  } finally {
    loading = false;
    els.reload.disabled = false;
  }
}

async function start(user) {
  startedFor = user.$id;
  let member = false;
  try {
    const r = await new Teams(client).list();
    member = (r.teams || []).some((t) => t.$id === config.adminTeam);
  } catch (_) { /* ohne Antwort bleibt die Seite zu */ }
  if (startedFor !== user.$id) return;
  els.denied.hidden = member;
  els.app.hidden = !member;
  if (member) load();
}

els.reload.addEventListener("click", load);

onAuthChange(({ status, user }) => {
  if (status !== "ready") return;
  els.gate.hidden = !!user;
  if (!user) { startedFor = null; els.denied.hidden = true; els.app.hidden = true; els.grid.innerHTML = ""; return; }
  if (startedFor !== user.$id) start(user);
});
