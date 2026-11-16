/* Karteikarten – Oberfläche. Logik: core.js · Speicher: store.js (localStorage dieses Geräts).
 * Ansichten: Stapelliste → Stapel (Karten verwalten, Level) → Lernrunde (Üben oder Test) → Ergebnis. */
import { esc, toast, confirmDialog, closeIcon } from "/js/shell.js";
import { MAX_DECKS, LEVELS, MODES, isLevelMode, levelCounts, dueCount, buildQueue, answerCard, resetLevels, isCorrect } from "./core.js";
import { load, save, newId } from "./store.js";

const app = document.getElementById("app");
const data = load();
let view = { name: "list" };
let warned = false;

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

const deckById = (id) => data.decks.find((d) => d.id === id);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function persist() {
  if (!save(data) && !warned) {
    warned = true;
    toast("Der Browser verweigert das Speichern. Deine Karten gehen beim Schließen verloren.", { error: true });
  }
}

/* ---------- Ansicht: Stapelliste ---------- */

const levelBar = (deck) => {
  const counts = levelCounts(deck);
  return `<div class="kk-levels" aria-hidden="true">${counts.map((n, i) => `<i data-l="${i + 1}" class="${n ? "on" : ""}"></i>`).join("")}</div>`;
};

function deckMeta(deck) {
  const mode = isLevelMode(deck) ? "Level" : "Alle hintereinander";
  return `${plural(deck.cards.length, "Karte", "Karten")} · ${mode}`;
}

function renderList() {
  const cards = data.decks.reduce((n, d) => n + d.cards.length, 0);
  const due = data.decks.reduce((n, d) => n + dueCount(d), 0);
  const full = data.decks.length >= MAX_DECKS;
  const banner = !data.decks.length
    ? "Leg deinen ersten Stapel an."
    : due ? `Lerne heute: ${plural(due, "Karte wartet", "Karten warten")} auf dich.` : cards ? "Alles gelernt. Stark!" : "Füge deinen Stapeln Karten hinzu.";

  app.innerHTML = `
    <section class="kk-hero" aria-labelledby="kkTitle">
      <div class="kk-hero-top">
        <h1 id="kkTitle">Karteikarten.</h1>
        <button class="btn btn-primary" type="button" data-act="new-deck" ${full ? "disabled" : ""}>+ Neuer Stapel</button>
      </div>
      <div class="kk-stats">
        <div class="kk-stat"><b>${data.decks.length}/${MAX_DECKS}</b><span>Stapel</span></div>
        <div class="kk-stat"><b>${cards}</b><span>Karten</span></div>
        <div class="kk-stat"><b>${due}</b><span>zu lernen</span></div>
      </div>
      <div class="kk-banner"><span class="dot" aria-hidden="true">${due || "✓"}</span><span>${banner}</span></div>
    </section>
    ${data.decks.length ? `<section class="kk-decks" aria-label="Deine Stapel">${data.decks.map(deckRow).join("")}</section>
      ${full ? '<p class="body-sm muted center">Du hast die maximal 5 Stapel angelegt. Lösche einen, um einen neuen zu erstellen.</p>' : ""}` : `
    <section class="kk-empty">
      <span class="squircle squircle-96" aria-hidden="true">${CARD_ICON}</span>
      <h2 class="h3">Noch keine Stapel.</h2>
      <p>Lege bis zu 5 Stapel an, füge Karten mit Vorder- und Rückseite hinzu und lerne sie mit Leveln oder der Reihe nach.</p>
      <button class="btn btn-primary btn-lg" type="button" data-act="new-deck">Ersten Stapel erstellen</button>
    </section>`}`;
}

const CARD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2.5"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/></svg>';

function deckRow(deck) {
  const due = dueCount(deck);
  const done = isLevelMode(deck) && deck.cards.length && !due;
  return `
    <article class="kk-deck">
      <button class="kk-deck-open" type="button" data-act="open-deck" data-id="${esc(deck.id)}">
        <span class="squircle" aria-hidden="true">${esc((deck.name[0] || "?").toUpperCase())}</span>
        <span class="kk-deck-body">
          <span class="kk-deck-name">${esc(deck.name)}</span>
          <span class="kk-deck-meta">${esc(deckMeta(deck))}</span>
          ${isLevelMode(deck) ? levelBar(deck) : ""}
        </span>
      </button>
      <button class="kk-go" type="button" data-act="quick-start" data-id="${esc(deck.id)}" ${deck.cards.length ? "" : "disabled"} aria-label="${esc(deck.name)} lernen, ${due} Karten">${done ? "✓" : due || ICON.arrow}</button>
    </article>`;
}

/* ---------- Ansicht: Stapel ---------- */

function renderDeck() {
  const deck = deckById(view.id);
  if (!deck) { view = { name: "list" }; return render(); }
  const level = isLevelMode(deck);
  const due = dueCount(deck);
  app.innerHTML = `
    <div class="kk-bar">
      <button class="icon-btn" type="button" data-act="back" aria-label="Zurück zu allen Stapeln">${ICON.back}</button>
      <h1>${esc(deck.name)}</h1>
      <button class="icon-btn" type="button" data-act="edit-deck" aria-label="Stapel bearbeiten">${ICON.edit}</button>
      <button class="icon-btn" type="button" data-act="delete-deck" aria-label="Stapel löschen">${ICON.trash}</button>
    </div>

    <section class="kk-hero" aria-label="Überblick">
      <p class="body-sm muted-tint">${esc(deckMeta(deck))}${level ? ` · ${plural(due, "Karte", "Karten")} zu lernen` : ""}</p>
      ${level ? boxes(deck) : ""}
      <div class="kk-start">
        <button class="btn btn-primary" type="button" data-act="start" data-type="practice" ${deck.cards.length ? "" : "disabled"}>Üben<small>Karte umdrehen, selbst bewerten</small></button>
        <button class="btn btn-outline" type="button" data-act="start" data-type="test" ${deck.cards.length ? "" : "disabled"}>Test<small>Antwort schriftlich eingeben</small></button>
      </div>
    </section>

    <form class="kk-add" id="addCard" novalidate>
      <label class="field"><span class="field-label">Vorderseite</span><textarea class="textarea" name="front" maxlength="1000" placeholder="Frage oder Begriff" required></textarea></label>
      <label class="field"><span class="field-label">Rückseite</span><textarea class="textarea" name="back" maxlength="1000" placeholder="Antwort" required></textarea></label>
      <button class="btn btn-primary" type="submit">Karte hinzufügen</button>
    </form>

    <section aria-label="Karten im Stapel">
      ${deck.cards.length ? `<div class="kk-cards">${deck.cards.map((c) => `
        <div class="kk-row">
          <div><small>Vorderseite</small>${esc(c.front)}</div>
          <div><small>Rückseite${level ? ` · Level ${c.level}` : ""}</small>${esc(c.back)}</div>
          <div class="kk-row-actions">
            <button class="icon-btn" type="button" data-act="edit-card" data-id="${esc(c.id)}" aria-label="Karte bearbeiten">${ICON.edit}</button>
            <button class="icon-btn" type="button" data-act="delete-card" data-id="${esc(c.id)}" aria-label="Karte löschen">${ICON.trash}</button>
          </div>
        </div>`).join("")}</div>` : '<p class="body-sm muted center">Noch keine Karten. Füge oben die erste hinzu.</p>'}
    </section>`;
}

function boxes(deck) {
  const counts = levelCounts(deck);
  return `<div class="kk-boxes" role="list" aria-label="Karten pro Level">${counts.map((n, i) => `
    <div class="kk-box ${i === LEVELS - 1 ? "is-done" : ""}" role="listitem"><b>${n}</b><span>${i === LEVELS - 1 ? "Gelernt" : `Level ${i + 1}`}</span></div>`).join("")}</div>`;
}

/* ---------- Lernrunde ---------- */

async function startStudy(deck, type, queueOverride) {
  if (!deck.cards.length) { toast("Füge dem Stapel zuerst Karten hinzu."); return; }
  let queue = queueOverride;
  if (!queue) {
    if (isLevelMode(deck) && !dueCount(deck)) {
      const again = await confirmDialog({ title: "Alles gelernt.", text: "Alle Karten sind in Level 5. Soll der Stapel von vorn beginnen (alle Karten zurück auf Level 1)?", confirm: "Von vorn beginnen" });
      if (!again) return;
      resetLevels(deck);
      persist();
    }
    queue = buildQueue(deck);
  }
  view = { name: "study", id: deck.id, type, queue, total: queue.length, right: 0, wrong: 0, wrongIds: [], flipped: false, feedback: null };
  render();
}

function renderStudy() {
  const deck = deckById(view.id);
  if (!deck) { view = { name: "list" }; return render(); }
  if (!view.queue.length) { view.name = "result"; return render(); }
  const card = deck.cards.find((c) => c.id === view.queue[0]);
  const pct = Math.round(((view.total - view.queue.length) / Math.max(1, view.total)) * 100);
  const level = isLevelMode(deck);
  const fb = view.feedback;
  const test = view.type === "test";

  const stage = test
    ? `<div class="kk-stage"><div class="kk-flip"><div class="kk-face front"><span class="tag">Vorderseite</span><span class="txt">${esc(card.front)}</span></div></div></div>`
    : `<div class="kk-stage"><button type="button" class="kk-flip ${view.flipped ? "is-flipped" : ""}" data-act="flip" aria-label="Karte umdrehen">
        <span class="kk-face front"><span class="tag">Vorderseite</span><span class="txt">${esc(card.front)}</span><span class="hint">Tippen zum Umdrehen</span></span>
        <span class="kk-face back"><span class="tag">Rückseite</span><span class="txt">${esc(card.back)}</span></span>
      </button></div>`;

  let controls;
  if (test) {
    controls = fb
      ? `<div class="kk-result-box ${fb.ok ? "ok" : "bad"}">${fb.ok ? "" : `<span class="sol">Richtig wäre: ${esc(card.back)}</span>`}</div>
         <div class="kk-actions">
           ${fb.ok ? "" : '<button class="btn btn-outline" type="button" data-act="override">Trotzdem richtig</button>'}
           <button class="btn btn-primary ${fb.ok ? "btn-wide" : ""}" type="button" data-act="next" id="focusMe">Weiter</button>
         </div>`
      : `<form class="kk-answer" id="answerForm" autocomplete="off">
           <label class="sr-only" for="answerInput">Deine Antwort</label>
           <input class="input" id="answerInput" name="answer" placeholder="Antwort eintippen" autocomplete="off" autocapitalize="off" spellcheck="false">
           <button class="btn btn-primary btn-wide" type="submit">Prüfen</button>
         </form>`;
  } else {
    controls = view.flipped
      ? `<div class="kk-actions"><button class="btn btn-outline" type="button" data-act="grade" data-ok="0" id="focusMe">Nicht gewusst</button><button class="btn btn-primary" type="button" data-act="grade" data-ok="1">Gewusst</button></div>`
      : '<button class="btn btn-primary btn-wide" type="button" data-act="flip">Umdrehen</button>';
  }

  app.innerHTML = `
    <div class="kk-session">
      <div class="kk-bar">
        <button class="icon-btn" type="button" data-act="quit" aria-label="Lernrunde beenden">${closeIcon}</button>
        <div class="kk-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Fortschritt"><i style="width:${pct}%"></i></div>
        <span class="badge badge-soft">${view.queue.length} übrig${level ? ` · Level ${card.level}` : ""}</span>
      </div>
      ${stage}
      ${controls}
    </div>`;

  const target = app.querySelector("#answerInput") || app.querySelector("#focusMe");
  if (target) target.focus({ preventScroll: true });
}

/** Wertet die aktuelle Karte aus und geht zur nächsten. */
function grade(ok) {
  const deck = deckById(view.id);
  const cardId = view.queue[0];
  const { queue } = answerCard(deck, view.queue, ok);
  if (ok) view.right++; else { view.wrong++; if (!view.wrongIds.includes(cardId)) view.wrongIds.push(cardId); }
  view.queue = queue;
  view.flipped = false;
  view.feedback = null;
  persist();
  render();
}

function renderResult() {
  const deck = deckById(view.id);
  if (!deck) { view = { name: "list" }; return render(); }
  const level = isLevelMode(deck);
  const answers = view.right + view.wrong;
  const retry = !level && view.wrongIds.length;
  app.innerHTML = `
    <div class="kk-bar">
      <button class="icon-btn" type="button" data-act="to-deck" aria-label="Zurück zum Stapel">${ICON.back}</button>
      <h1>${esc(deck.name)}</h1>
    </div>
    <section class="kk-summary">
      <div>
        <p class="big">${level ? "✓" : `${view.right}/${view.total}`}</p>
        <h2 class="h3">${level ? "Runde geschafft." : view.wrong ? "Fast geschafft." : "Alles richtig!"}</h2>
        <p class="body-sm muted-tint">${level ? `${plural(answers, "Antwort", "Antworten")}, davon ${view.right} richtig.` : `${view.right} von ${view.total} Karten gewusst.`}</p>
      </div>
      ${level ? boxes(deck) : ""}
      <div class="kk-actions">
        ${retry ? '<button class="btn btn-outline" type="button" data-act="retry-wrong">Falsche nochmal</button>' : ""}
        <button class="btn btn-outline ${retry ? "" : "btn-wide"}" type="button" data-act="again">Nochmal lernen</button>
        <button class="btn btn-primary btn-wide" type="button" data-act="to-deck">Zum Stapel</button>
      </div>
    </section>`;
}

/* ---------- Dialoge ---------- */

function openDialog(html, onSubmit) {
  const d = document.createElement("dialog");
  d.className = "modal";
  d.innerHTML = `<form class="modal-body" method="dialog" novalidate>${html}</form>`;
  document.body.append(d);
  const form = d.querySelector("form");
  const msg = d.querySelector(".form-message");
  const fail = (t) => { msg.textContent = t; msg.hidden = false; };
  d.querySelector("[data-close]").addEventListener("click", () => d.close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (onSubmit(new FormData(form), fail) !== false) d.close();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}

const dialogHead = (title) => `
  <div class="modal-head"><h2 class="h3">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Schließen">${closeIcon}</button></div>`;

function deckDialog(deck) {
  const creating = !deck;
  const mode = deck ? deck.mode : "level";
  const d = openDialog(`
    ${dialogHead(creating ? "Neuer Stapel." : "Stapel bearbeiten.")}
    <label class="field"><span class="field-label">Name</span><input class="input" name="name" maxlength="80" autocomplete="off" placeholder="z. B. Englisch Unit 3" value="${esc(deck ? deck.name : "")}" required></label>
    <label class="field"><span class="field-label">Abfrage</span>
      <select class="select" name="mode">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${k === mode ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
      <span class="field-hint" data-hint>${esc(MODES[mode].hint)}</span>
    </label>
    ${creating ? `
    <div class="kk-ai" aria-disabled="true">
      <div class="kk-ai-head">
        <label class="check"><input type="checkbox" disabled><span>Mit KI erstellen</span></label>
        <span class="badge badge-soft">Kommt bald</span>
      </div>
      <label class="field"><span class="field-label">Dein Thema</span><input class="input" disabled placeholder="z. B. Französische Revolution"></label>
      <span class="field-hint">Bald gibst du nur dein Thema ein und die KI erstellt die Karten für dich.</span>
    </div>` : ""}
    <p class="form-message" role="alert" hidden></p>
    <button class="btn btn-primary btn-wide" type="submit">${creating ? "Stapel erstellen" : "Speichern"}</button>`,
  (fd, fail) => {
    const name = String(fd.get("name") || "").trim();
    if (!name) { fail("Gib dem Stapel einen Namen."); return false; }
    const m = fd.get("mode") === "level" ? "level" : "all";
    if (creating) {
      if (data.decks.length >= MAX_DECKS) { fail("Du kannst höchstens 5 Stapel haben."); return false; }
      const nd = { id: newId(), name, mode: m, cards: [] };
      data.decks.push(nd);
      view = { name: "deck", id: nd.id };
    } else {
      deck.name = name;
      deck.mode = m;
    }
    persist();
    render();
  });
  const sel = d.querySelector("select");
  sel.addEventListener("change", () => { d.querySelector("[data-hint]").textContent = MODES[sel.value].hint; });
  d.querySelector('[name="name"]').focus();
}

function cardDialog(deck, card) {
  openDialog(`
    ${dialogHead("Karte bearbeiten.")}
    <label class="field"><span class="field-label">Vorderseite</span><textarea class="textarea" name="front" maxlength="1000" style="min-height:96px">${esc(card.front)}</textarea></label>
    <label class="field"><span class="field-label">Rückseite</span><textarea class="textarea" name="back" maxlength="1000" style="min-height:96px">${esc(card.back)}</textarea></label>
    <p class="form-message" role="alert" hidden></p>
    <button class="btn btn-primary btn-wide" type="submit">Speichern</button>`,
  (fd, fail) => {
    const front = String(fd.get("front") || "").trim();
    const back = String(fd.get("back") || "").trim();
    if (!front || !back) { fail("Vorder- und Rückseite dürfen nicht leer sein."); return false; }
    card.front = front;
    card.back = back;
    persist();
    render();
  });
}

function startDialog(deck) {
  const d = openDialog(`
    ${dialogHead(deck.name)}
    <p class="body-sm muted">Wie möchtest du lernen?</p>
    <div class="kk-start" style="grid-template-columns:1fr">
      <button class="btn btn-primary" type="button" data-type="practice">Üben<small>Karte umdrehen, selbst bewerten</small></button>
      <button class="btn btn-outline" type="button" data-type="test">Test<small>Antwort schriftlich eingeben</small></button>
    </div>`, () => true);
  d.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { d.close(); startStudy(deck, b.dataset.type); }));
}

/* ---------- Ereignisse ---------- */

function render() {
  ({ list: renderList, deck: renderDeck, study: renderStudy, result: renderResult })[view.name]();
}

app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const deck = deckById(view.id);

  switch (act) {
    case "new-deck": deckDialog(null); break;
    case "open-deck": view = { name: "deck", id: el.dataset.id }; render(); window.scrollTo(0, 0); break;
    case "quick-start": startDialog(deckById(el.dataset.id)); break;
    case "back": view = { name: "list" }; render(); break;
    case "to-deck": view = { name: "deck", id: view.id }; render(); break;
    case "edit-deck": deckDialog(deck); break;
    case "delete-deck":
      if (await confirmDialog({ title: "Stapel löschen?", text: `„${deck.name}“ mit ${plural(deck.cards.length, "Karte", "Karten")} wird endgültig gelöscht.`, confirm: "Löschen" })) {
        data.decks = data.decks.filter((d) => d.id !== deck.id);
        persist();
        view = { name: "list" };
        render();
        toast("Stapel gelöscht.");
      }
      break;
    case "start": startStudy(deck, el.dataset.type); break;
    case "edit-card": cardDialog(deck, deck.cards.find((c) => c.id === el.dataset.id)); break;
    case "delete-card":
      deck.cards = deck.cards.filter((c) => c.id !== el.dataset.id);
      persist();
      render();
      break;
    case "flip": view.flipped = true; renderStudy(); break;
    case "grade": grade(el.dataset.ok === "1"); break;
    case "override": view.feedback.ok = true; renderStudy(); break;
    case "next": grade(view.feedback.ok); break;
    case "quit":
      if (view.queue.length === view.total || await confirmDialog({ title: "Runde beenden?", text: "Dein Fortschritt (auch die Level) bleibt gespeichert.", confirm: "Beenden", cancel: "Weiterlernen" })) {
        view = { name: "deck", id: view.id };
        render();
      }
      break;
    case "again": startStudy(deck, view.type); break;
    case "retry-wrong": startStudy(deck, view.type, [...view.wrongIds]); break;
  }
});

app.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "addCard") {
    const deck = deckById(view.id);
    const fd = new FormData(e.target);
    const front = String(fd.get("front") || "").trim();
    const back = String(fd.get("back") || "").trim();
    if (!front || !back) { toast("Fülle Vorder- und Rückseite aus.", { error: true }); return; }
    deck.cards.push({ id: newId(), front, back, level: 1 });
    persist();
    renderDeck();
    app.querySelector('[name="front"]').focus({ preventScroll: true });
  } else if (e.target.id === "answerForm") {
    const deck = deckById(view.id);
    const card = deck.cards.find((c) => c.id === view.queue[0]);
    const given = new FormData(e.target).get("answer");
    view.feedback = { ok: isCorrect(given, card.back), given };
    renderStudy();
  }
});

render();
