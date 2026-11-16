/* Erklärvideos – Oberfläche. Die Suche läuft über die Appwrite-Function „lehrer-schmidt“ (functions/lehrer-schmidt):
 * Sie hält den YouTube-Schlüssel und sucht nur auf dem Kanal Lehrer Schmidt.
 * Datenschutz: Bis zum Klick auf „Hier ansehen“ wird nichts von YouTube geladen (keine Vorschaubilder, kein Player).
 * Danach läuft das Video über youtube-nocookie.com. */
import { onAuthChange, client, authMessage } from "/js/auth.js";
import { esc } from "/js/shell.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { toolById } from "/js/tools.js";

const $ = (id) => document.getElementById(id);
const els = {
  soon: $("soon"), gate: $("gate"), app: $("app"),
  form: $("searchForm"), topic: $("topic"), btn: $("searchBtn"), error: $("searchError"),
  result: $("result"), player: $("player"), title: $("nowTitle"), meta: $("nowMeta"),
  play: $("playBtn"), yt: $("ytLink"), more: $("more"), moreList: $("moreList"),
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>';

const state = { results: [], index: 0, busy: false };
const showError = (text) => { els.error.textContent = text || ""; els.error.hidden = !text; };

/** Aufruf der Function. Wirft Error mit einer Meldung, die man anzeigen darf. */
async function callFunction(payload) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.lehrerSchmidt,
      body: JSON.stringify(payload),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Die Videosuche antwortet gerade nicht. Versuch es später noch einmal.");
  return data;
}

function dayLabel(iso) {
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

/** Zeigt das gewählte Video: zuerst nur ein Platzhalter, der Player lädt erst nach dem Klick. */
function select(i) {
  const v = state.results[i];
  if (!v || !VIDEO_ID.test(v.id)) return;
  state.index = i;
  els.title.textContent = v.title;
  els.meta.textContent = [v.channel, dayLabel(v.published)].filter(Boolean).join(" · ");
  els.yt.href = `https://www.youtube.com/watch?v=${v.id}`;
  els.player.innerHTML = `
    <div class="vd-placeholder">
      <button class="play" type="button" data-play aria-label="Video abspielen">${PLAY}</button>
      <p>Video von ${esc(v.channel || "Lehrer Schmidt")}. Beim Abspielen verbindest du dich mit YouTube.</p>
    </div>`;
  renderMore();
}

function playNow() {
  const v = state.results[state.index];
  if (!v || !VIDEO_ID.test(v.id)) return;
  const frame = document.createElement("iframe");
  frame.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`;
  frame.title = v.title;
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  els.player.replaceChildren(frame);
  els.play.textContent = "Nochmal laden";
}

function renderMore() {
  const rest = state.results.map((v, i) => ({ v, i })).filter(({ i }) => i !== state.index);
  els.more.hidden = !rest.length;
  els.moreList.innerHTML = rest.map(({ v, i }) => `
    <li><button class="vd-pick" type="button" data-pick="${i}"><span>${esc(v.title)}<small>${esc(dayLabel(v.published))}</small></span><span aria-hidden="true">›</span></button></li>`).join("");
}

els.player.addEventListener("click", (e) => { if (e.target.closest("[data-play]")) playNow(); });
els.play.addEventListener("click", playNow);
els.moreList.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]");
  if (!b) return;
  select(Number(b.dataset.pick));
  els.player.scrollIntoView({ behavior: "smooth", block: "center" });
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.busy) return;
  const topic = els.topic.value.trim();
  if (topic.length < 2) { showError("Gib ein Thema ein, z. B. „Satz des Pythagoras“."); els.topic.focus(); return; }
  state.busy = true;
  showError("");
  els.btn.disabled = true;
  els.btn.textContent = "Suche läuft …";
  try {
    const r = await callFunction({ topic });
    state.results = r.results || [];
    if (!state.results.length) {
      els.result.hidden = true;
      showError(`Zu „${topic}“ gibt es kein Video von Lehrer Schmidt. Probier einen anderen Begriff.`);
    } else {
      els.result.hidden = false;
      select(0);
      els.play.textContent = "Hier ansehen";
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.busy = false;
    els.btn.disabled = false;
    els.btn.textContent = "Video finden";
  }
});

/* ---------- Start ---------- */

const soon = !!(toolById("videos") && toolById("videos").soon);
if (soon) {
  // Noch nicht freigeschaltet: nur der Hinweis „Kommt bald“
  els.soon.hidden = false;
  document.querySelector(".tool-head .body-lg").textContent = "Noch nicht freigeschaltet.";
} else {
  onAuthChange(({ status, user }) => {
    if (status !== "ready") return;
    els.gate.hidden = !!user;
    els.app.hidden = !user;
  });
}
