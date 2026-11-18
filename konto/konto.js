/* Konto verwalten: Profil, Zugangsdaten, Sitzungen, Datenexport, Löschen. */
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { client, account, onAuthChange, refresh, logout, authMessage, initials, googleEnabled, loginWithGoogle } from "/js/auth.js";
import { tablesDB, databaseId, tableIds, listAllRows, Query } from "/js/db.js";
import { config } from "/js/config.js";
import { toast, confirmDialog, esc } from "/js/shell.js";
import { initStackPanel } from "/js/stack-panel.js";
import { loaderHtml } from "/js/loader.js";

const $ = (id) => document.getElementById(id);
let user = null;

// Bis die Anmeldung geprüft ist, zeigt die Seite den Loader statt einer leeren Fläche
$("accLoading").innerHTML = loaderHtml({ title: "Konto wird geladen …", subtitle: "Einen Moment bitte." });

function message(form, text, ok = false) {
  const el = form.querySelector(".form-message");
  el.textContent = text;
  el.classList.toggle("is-ok", ok);
  el.hidden = !text;
}

/** Führt fn aus, sperrt den Absende-Knopf und zeigt Fehler im Formular. */
async function run(form, fn, success) {
  const btn = form.querySelector('[type="submit"]');
  message(form, "");
  btn.disabled = true;
  try {
    await fn();
    if (success) message(form, success, true);
    return true;
  } catch (e) {
    message(form, e && e.code ? authMessage(e) : (e && e.message) || authMessage(e));
    return false;
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Profil ---------- */

function renderProfile() {
  const label = user.name || user.email;
  $("accAvatar").textContent = initials(user);
  $("accName").textContent = label;
  $("accEmail").textContent = user.email;
  $("accVerified").textContent = user.emailVerification ? "E-Mail bestätigt" : "E-Mail nicht bestätigt";
  $("valName").textContent = user.name || "Nicht festgelegt";
  $("valEmail").textContent = user.email;
  if (document.activeElement !== $("nameForm").elements.name) $("nameForm").elements.name.value = user.name || "";
}

/* ---------- Einstellungen: Stack Panel mit Unterseiten (js/stack-panel.js) ---------- */

initStackPanel($("accPanel"));

$("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const name = form.elements.name.value.trim();
  await run(form, async () => {
    await account.updateName({ name: name || "Pensum" });
    await refresh();
  }, "Name gespeichert.");
});

$("emailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const ok = await run(form, async () => {
    await account.updateEmail({ email: form.elements.email.value.trim(), password: form.elements.password.value });
    await refresh();
  }, "E-Mail-Adresse geändert. Beim nächsten Anmelden bestätigst du sie mit einem Code.");
  if (ok) form.elements.password.value = "";
});

$("passForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const ok = await run(form, () => account.updatePassword({ password: form.elements.password.value, oldPassword: form.elements.old.value }), "Passwort geändert.");
  if (ok) { form.elements.old.value = ""; form.elements.password.value = ""; }
});

/* ---------- Sitzungen ---------- */

/* ---------- Google verbinden ---------- */

let googleIdentity = null;

async function loadGoogle() {
  if (!googleEnabled) return;
  try {
    const { identities } = await account.listIdentities();
    googleIdentity = identities.find((i) => i.provider === "google") || null;
  } catch (e) {
    $("googleMsg").textContent = authMessage(e);
    $("googleMsg").hidden = false;
    return;
  }
  $("googleMsg").hidden = true;
  // Verbinden ist aus: Ohne Cookie auf der Appwrite-Domain legt Appwrite ein neues Konto an, statt das bestehende zu verknüpfen.
  // Die Zeile in den Einstellungen gibt es nur, wenn schon ein Google-Konto verbunden ist.
  $("googleRow").hidden = !googleIdentity;
  $("valGoogle").textContent = googleIdentity ? "Verbunden" : "";
  $("googleText").textContent = googleIdentity
    ? `Verbunden mit ${googleIdentity.providerEmail || "deinem Google-Konto"}. Du kannst dich damit ohne Passwort anmelden.`
    : "Verbinde dein Google-Konto, um dich künftig mit einem Tipp anzumelden.";
  $("googleLink").hidden = true;
  $("googleUnlink").hidden = !googleIdentity;
}

$("googleLink").addEventListener("click", () => loginWithGoogle());
$("googleUnlink").addEventListener("click", async () => {
  if (!googleIdentity) return;
  const ok = await confirmDialog({
    title: "Verbindung zu Google lösen?",
    text: "Danach kannst du dich nur noch mit E-Mail und Passwort anmelden. Hast du kein Passwort festgelegt, ändere es vorher unter „Passwort“.",
    confirm: "Verbindung lösen",
  });
  if (!ok) return;
  try { await account.deleteIdentity({ identityId: googleIdentity.$id }); toast("Verbindung zu Google gelöst."); } catch (e) { toast(authMessage(e), { error: true }); }
  loadGoogle();
});

const when = (iso) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
let sessions = [];

async function loadSessions() {
  const list = $("sessionList");
  list.innerHTML = `<li>${loaderHtml({ title: "Geräte werden geladen …", size: "sm" })}</li>`;
  try {
    sessions = (await account.listSessions()).sessions;
  } catch (e) {
    list.innerHTML = "";
    $("sessionMsg").textContent = authMessage(e);
    $("sessionMsg").hidden = false;
    return;
  }
  $("sessionMsg").hidden = true;
  $("valSessions").textContent = sessions.length === 1 ? "1 Gerät" : `${sessions.length} Geräte`;
  sessions.sort((a, b) => (b.current - a.current) || (new Date(b.$createdAt) - new Date(a.$createdAt)));
  list.innerHTML = sessions.map((s) => {
    const what = [s.clientName, s.osName].filter(Boolean).join(" auf ") || s.provider || "Unbekanntes Gerät";
    const where = [s.countryName, s.ip].filter(Boolean).join(" · ");
    return `<li class="plain-list-item">
      <span><strong>${esc(what)}</strong>${s.current ? " (dieses Gerät)" : ""}<small>Angemeldet ${esc(when(s.$createdAt))}${where ? " · " + esc(where) : ""}</small></span>
      ${s.current ? "" : `<button class="btn btn-outline btn-sm" type="button" data-end="${esc(s.$id)}">Beenden</button>`}
    </li>`;
  }).join("");
  $("endOthers").disabled = sessions.every((s) => s.current);
}

$("sessionList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-end]");
  if (!b) return;
  b.disabled = true;
  try { await account.deleteSession({ sessionId: b.dataset.end }); } catch (err) { toast(authMessage(err), { error: true }); }
  loadSessions();
});

$("endOthers").addEventListener("click", async () => {
  for (const s of sessions.filter((x) => !x.current)) {
    try { await account.deleteSession({ sessionId: s.$id }); } catch (_) { /* schon weg */ }
  }
  toast("Alle anderen Geräte sind abgemeldet.");
  loadSessions();
});

$("endAll").addEventListener("click", async () => {
  const ok = await confirmDialog({ title: "Überall abmelden?", text: "Alle Geräte, auch dieses, werden abgemeldet. Deine Daten bleiben erhalten.", confirm: "Überall abmelden" });
  if (!ok) return;
  try { await account.deleteSessions(); } catch (err) { toast(authMessage(err), { error: true }); return; }
  await logout();
  toast("Überall abgemeldet.");
});

/* ---------- Daten ---------- */

const ownRows = (tableId) => listAllRows(tableId, [Query.equal("userId", user.$id)]);
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("$") || k === "$id"));

async function loadCounts() {
  const msg = $("dataMsg");
  $("dataCount").innerHTML = loaderHtml({ title: "Daten werden gezählt …", size: "sm" });
  try {
    const [s, g, h, m, dk, ca, pl, ch, cm] = await Promise.all([ownRows(tableIds.subjects), ownRows(tableIds.grades), ownRows(tableIds.handwriting), ownRows(tableIds.mindmaps), ownRows(tableIds.decks), ownRows(tableIds.cards), ownRows(tableIds.planner), ownRows(tableIds.chats), ownRows(tableIds.chatMessages)]);
    const stat = (n, one, many) => `<span class="chip-stat"><strong>${n}</strong> ${n === 1 ? one : many}</span>`;
    $("dataCount").innerHTML = stat(s.length, "Fach", "Fächer") + stat(g.length, "Note", "Noten") + stat(m.length, "Mindmap", "Mindmaps") + stat(dk.length, "Kartenstapel", "Kartenstapel") + stat(ca.length, "Karteikarte", "Karteikarten") + stat(pl.length, "Planer-Eintrag", "Planer-Einträge") +
      `<span class="chip-stat">${h.length ? "Handschrift-Profil vorhanden" : "Kein Handschrift-Profil"}</span>`;
    msg.hidden = true;
    return { subjects: s, grades: g, handwriting: h, mindmaps: m, decks: dk, cards: ca, planner: pl, chats: ch, chatMessages: cm };
  } catch (e) {
    $("dataCount").innerHTML = "";
    msg.textContent = authMessage(e);
    msg.hidden = false;
    return null;
  }
}

$("exportBtn").addEventListener("click", async () => {
  const data = await loadCounts();
  if (!data) return;
  const out = {
    exportiertAm: new Date().toISOString(),
    konto: { email: user.email, name: user.name || "", registriertAm: user.registration },
    faecher: data.subjects.map(strip),
    noten: data.grades.map(strip),
    handschrift: data.handwriting.map(strip),
    mindmaps: data.mindmaps.map(strip),
    kartenstapel: data.decks.map(strip),
    karteikarten: data.cards.map(strip),
    planer: data.planner.map(strip),
    kiChats: data.chats.map(strip),
    kiChatNachrichten: data.chatMessages.map(strip),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `pensum-daten-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

async function deleteAllRows() {
  for (const tableId of [tableIds.grades, tableIds.subjects, tableIds.handwriting, tableIds.mindmaps, tableIds.cards, tableIds.decks, tableIds.planner]) {
    const rows = await ownRows(tableId);
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map((r) => tablesDB.deleteRow({ databaseId, tableId, rowId: r.$id })));
    }
  }
}

$("wipeBtn").addEventListener("click", async () => {
  const ok = await confirmDialog({ title: "Inhalte löschen?", text: "Alle Fächer, Noten, Mindmaps, Karteikarten, Planer-Einträge und dein Handschrift-Profil im Konto werden gelöscht. KI-Chats löschst du im KI-Chat selbst; sie verschwinden auch, wenn du das Konto löschst. Das Konto selbst bleibt. Das lässt sich nicht rückgängig machen.", confirm: "Inhalte löschen" });
  if (!ok) return;
  try {
    await deleteAllRows();
    toast("Alle Inhalte sind gelöscht.");
  } catch (e) {
    toast(authMessage(e), { error: true });
  }
  loadCounts();
});

/* ---------- Konto löschen ---------- */

const deleteForm = $("deleteForm");
const deleteBtn = deleteForm.querySelector('[type="submit"]');
deleteForm.elements.confirm.addEventListener("input", () => {
  deleteBtn.disabled = deleteForm.elements.confirm.value.trim().toUpperCase() !== "LÖSCHEN";
});

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (deleteBtn.disabled) return;
  const ok = await confirmDialog({ title: "Konto endgültig löschen?", text: "Dein Konto und alle Daten werden jetzt gelöscht. Das geht nicht rückgängig.", confirm: "Endgültig löschen" });
  if (!ok) return;
  const done = await run(deleteForm, async () => {
    const ex = await new Functions(client).createExecution({
      functionId: config.functions.deleteAccount,
      body: "{}",
      async: false,
      method: ExecutionMethod.POST,
    });
    if (ex.responseStatusCode !== 200) {
      let reason = "";
      try { reason = JSON.parse(ex.responseBody).error || ""; } catch (_) { /* kein JSON */ }
      throw new Error(reason || "Das Konto konnte nicht gelöscht werden. Versuch es später noch einmal.");
    }
  });
  if (!done) return;
  try { for (const k of Object.keys(localStorage)) if (k === "cookieFallback" || k.startsWith("pensum.")) localStorage.removeItem(k); } catch (_) { /* privater Modus */ }
  await logout();
  toast("Dein Konto und alle Daten sind gelöscht.");
  setTimeout(() => { location.href = "/"; }, 1800);
});

/* ---------- Start ---------- */

onAuthChange(({ status, user: u }) => {
  if (status !== "ready") return;
  const first = !user && !!u;
  user = u;
  $("accLoading").hidden = true;
  $("accGuest").hidden = !!u;
  $("accMain").hidden = !u;
  if (!u) return;
  renderProfile();
  if (first) { loadSessions(); loadGoogle(); loadCounts(); }
});
