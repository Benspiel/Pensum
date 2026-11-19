/* Team (Admin) – Oberfläche. Zeigt die Zahlen der Function „admin-stats“ als festes Bento-Raster.
 * Wer hier hineinkommt, bestimmt allein der Server (Team „admin“); die Prüfung im Browser blendet nur die Seite ein oder aus. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { Teams, Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { tools } from "/js/tools.js";
import { loaderHtml } from "/js/loader.js";
import { bentoHtml, peopleHtml, clock } from "./core.js";

const $ = (id) => document.getElementById(id);
const els = { gate: $("gate"), denied: $("denied"), app: $("app"), grid: $("grid"), stand: $("stand"), reload: $("reload"), error: $("error") };

let startedFor = null;
let loading = false;

async function call(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({ functionId: config.functions.adminStats, body: JSON.stringify(payload), async: false, method: ExecutionMethod.POST });
  } catch (e) {
    if (e && e.code === 404) throw new Error(`Der Zahlen-Dienst ist noch nicht eingerichtet (Function-ID „${config.functions.adminStats}“).`);
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Die Zahlen konnten nicht geladen werden.");
  return data;
}

const toolList = () => tools.map((t) => ({ id: t.id, name: t.name, icon: t.icon }));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
let people = null;
let filter = "";

/** Das Modul "Wer nutzt was" lädt nach dem Raster nach (es liest alle Aufrufe und braucht länger). */
function renderPeople() {
  const old = els.grid.querySelector('[data-widget="people"]');
  const html = peopleHtml(people, toolList(), filter, today());
  if (old) old.outerHTML = html; else els.grid.insertAdjacentHTML("beforeend", html);
}

async function loadPeople() {
  els.grid.insertAdjacentHTML("beforeend", `<section class="ad-w ad-span-6 ad-people-wait" data-widget="people-wait">${loaderHtml({ title: "Nutzerliste wird geladen …", size: "sm" })}</section>`);
  try {
    people = (await call({ action: "people" })).people;
    renderPeople();
  } catch (e) {
    els.error.textContent = e.message;
    els.error.hidden = false;
  } finally {
    const wait = els.grid.querySelector('[data-widget="people-wait"]');
    if (wait) wait.remove();
  }
}

els.grid.addEventListener("change", (e) => {
  if (e.target && e.target.id === "peopleFilter") {
    filter = e.target.value;
    if (people) renderPeople();
    const sel = els.grid.querySelector("#peopleFilter");
    if (sel) sel.focus();
  }
});

async function load() {
  if (loading) return;
  loading = true;
  els.reload.disabled = true;
  els.error.hidden = true;
  if (!els.grid.children.length) els.grid.innerHTML = `<div class="ad-loading">${loaderHtml({ title: "Zahlen werden geladen …", size: "md" })}</div>`;
  try {
    const { stats } = await call({});
    els.grid.innerHTML = bentoHtml(stats, toolList());
    els.stand.textContent = "Stand " + clock(stats.generatedAt) + " Uhr";
    await loadPeople();
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
