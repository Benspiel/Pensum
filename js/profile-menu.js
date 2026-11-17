/* Profilmenü – Nachbau von „Profile Dropdown“ aus Kokonut UI (MIT, https://kokonutui.com) in Vanilla-JS (Stile in css/pensum.css, Abschnitt „Profilmenü“).
 * Ein Knopf mit Avatar und Name öffnet ein Menü mit Kopf (Avatar, Name, E-Mail), Einträgen, der Darstellung (Hell, Dunkel, System)
 * und „Abmelden“, das man kurz gedrückt hält, damit es nicht aus Versehen passiert. Bedienung mit Pfeiltasten (Auf/Ab zwischen den Zeilen,
 * Links/Rechts in der Darstellung), Home/Ende, Escape schließt und gibt den Fokus zurück. Gäste bekommen dasselbe Menü mit Anmelden und Konto erstellen.
 *
 *   import { mountProfileMenu } from "/js/profile-menu.js";
 *   const menu = mountProfileMenu(el, {
 *     user: { name: "Ben Buchholz", email: "ben@example.de", initials: "BB" },   // oder null für Gäste
 *     links: [{ label: "Konto verwalten", href: "/konto/", icon: "user" }],
 *     onSignOut: () => …,                                                      // nach dem Gedrückthalten
 *   });
 *   menu.destroy();
 *
 * Der Darstellungs-Wechsel läuft über window.pensumTheme (js/theme.js). Die Zeilenlogik und das HTML sind rein und getestet. */

export const HOLD_MS = 700;   // so lange „Abmelden“ gehalten werden muss

const ICONS = {
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="m10 8 4 4-4 4M14 12H4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m16 8 4 4-4 4M20 12H9"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  chevrons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>',
};

export const THEMES = [["light", "Hell", "sun"], ["dark", "Dunkel", "moon"], ["system", "System", "system"]];

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Wohin springt der Fokus? rows: Zeilenname je Eintrag (die drei Darstellungs-Knöpfe teilen sich eine Zeile). current: Index oder -1.
 *  Auf/Ab wechseln die Zeile (bei der Darstellung landet man auf dem gewählten Knopf), Links/Rechts wandern innerhalb einer Zeile, Home/End springen an die Enden. */
export function nextIndex(rows, current, key, checked = -1) {
  const n = rows.length;
  if (!n) return -1;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  if (current < 0) return key === "ArrowUp" ? n - 1 : 0;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const same = rows.map((r, i) => (r === rows[current] ? i : -1)).filter((i) => i >= 0);
    if (same.length < 2) return current;
    return same[(same.indexOf(current) + (key === "ArrowRight" ? 1 : -1) + same.length) % same.length];
  }
  const order = [...new Set(rows)];
  const row = order[(order.indexOf(rows[current]) + (key === "ArrowDown" ? 1 : -1) + order.length) % order.length];
  const members = rows.map((r, i) => (r === row ? i : -1)).filter((i) => i >= 0);
  return members.includes(checked) ? checked : members[0];
}

/** HTML des Menüs. user null = Gast. themeChoice: "light" | "dark" | "system". links: [{ label, href, icon }] (nur für angemeldete Personen). */
export function menuHtml({ user = null, themeChoice = "system", links = [] } = {}) {
  const initials = user ? escapeHtml(user.initials || "?") : ICONS.user;
  const name = user ? escapeHtml(user.name || user.email || "Konto") : "";
  const item = (inner, attrs) => `<li role="none">${inner.replace("<a ", `<a role="menuitem" data-menu-item data-row="${attrs.row}" `).replace("<button ", `<button role="menuitem" data-menu-item data-row="${attrs.row}" `)}</li>`;
  const rows = user
    ? links.map((l, i) => item(`<a class="pm-item" href="${escapeHtml(l.href)}">${ICONS[l.icon] || ICONS.user}<span>${escapeHtml(l.label)}</span></a>`, { row: `link${i}` })).join("")
    : item(`<button class="pm-item" type="button" data-auth-action="login">${ICONS.login}<span>Anmelden</span></button>`, { row: "login" })
      + item(`<button class="pm-item" type="button" data-auth-action="register">${ICONS.plus}<span>Konto erstellen</span></button>`, { row: "register" });
  const theme = THEMES.map(([id, label, icon]) => `<button class="pm-radio" type="button" role="radio" data-menu-item data-row="theme" data-theme-choice="${id}" aria-checked="${id === themeChoice}" tabindex="-1">${ICONS[icon]}<span>${label}</span></button>`).join("");
  return `
    <button class="pm-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${user ? `Profilmenü von ${name}` : "Menü"}">
      <span class="avatar pm-avatar" aria-hidden="true">${initials}</span>
      ${user ? `<span class="pm-name">${name}</span>${ICONS.chevrons}` : ""}
    </button>
    <div class="pm-panel" role="menu" aria-label="Profilmenü" hidden>
      <div class="pm-head">
        <span class="avatar pm-avatar pm-avatar-lg" aria-hidden="true">${initials}</span>
        <span class="pm-who">${user ? `<b>${name}</b><small>${escapeHtml(user.email || "")}</small>` : "<b>Gast</b><small>Nicht angemeldet</small>"}</span>
      </div>
      <ul class="pm-list" role="none">${rows}</ul>
      <div class="pm-label" id="pmThemeLabel">Darstellung</div>
      <div class="pm-seg" role="radiogroup" aria-labelledby="pmThemeLabel">${theme}</div>
      ${user ? `<div class="pm-sep" role="separator"></div>
      <button class="pm-item pm-signout" type="button" role="menuitem" data-menu-item data-row="out" aria-label="Abmelden, zum Bestätigen gedrückt halten"><span class="pm-fill" aria-hidden="true"></span>${ICONS.out}<span>Abmelden</span><small>gedrückt halten</small></button>` : ""}
    </div>`;
}

/** Baut das Menü in el auf. Gibt { close, destroy } zurück. */
export function mountProfileMenu(el, { user = null, links = [], onSignOut } = {}) {
  const theme = () => (window.pensumTheme ? window.pensumTheme.choice() : "system");
  el.classList.add("pm");
  el.innerHTML = menuHtml({ user, links, themeChoice: theme() });
  const trigger = el.querySelector(".pm-trigger");
  const panel = el.querySelector(".pm-panel");
  const items = () => [...panel.querySelectorAll("[data-menu-item]")];
  const rowsOf = () => items().map((i) => i.dataset.row);
  const checkedIndex = () => items().findIndex((i) => i.getAttribute("aria-checked") === "true");
  let open = false, holdTimer = 0;

  const focusItem = (i) => { const list = items(); if (list[i]) { list.forEach((x) => { if (x.matches(".pm-radio")) x.tabIndex = -1; }); if (list[i].matches(".pm-radio")) list[i].tabIndex = 0; list[i].focus({ preventScroll: true }); } };

  function setOpen(next, via = "pointer") {
    if (next === open) return;
    open = next;
    panel.hidden = !next;
    trigger.setAttribute("aria-expanded", String(next));
    if (next && via === "keyboard") focusItem(0);
    if (!next) cancelHold();
  }

  function syncTheme() {
    const c = theme();
    panel.querySelectorAll(".pm-radio").forEach((r) => r.setAttribute("aria-checked", String(r.dataset.themeChoice === c)));
  }

  /* Abmelden gedrückt halten */
  function cancelHold() { clearTimeout(holdTimer); holdTimer = 0; const b = panel.querySelector(".pm-signout"); if (b) b.classList.remove("is-holding"); }
  const signOut = panel.querySelector(".pm-signout");
  if (signOut) {
    signOut.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      signOut.classList.add("is-holding");
      holdTimer = setTimeout(() => { cancelHold(); setOpen(false); if (onSignOut) onSignOut(); }, HOLD_MS);
    });
    for (const t of ["pointerup", "pointerleave", "pointercancel"]) signOut.addEventListener(t, cancelHold);
    // Mit der Tastatur (Enter oder Leertaste) gibt es kein Halten: Der Klick meldet dann detail 0 und meldet sofort ab.
    signOut.addEventListener("click", (e) => { if (e.detail === 0) { setOpen(false); if (onSignOut) onSignOut(); } });
    signOut.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  trigger.addEventListener("click", (e) => setOpen(!open, e.detail === 0 ? "keyboard" : "pointer"));
  panel.addEventListener("click", (e) => {
    const radio = e.target.closest(".pm-radio");
    if (radio) { if (window.pensumTheme) window.pensumTheme.set(radio.dataset.themeChoice); syncTheme(); return; }
    if (e.target.closest("a.pm-item, [data-auth-action]")) setOpen(false); // Link oder Anmelden: Menü zu (die Aktion selbst läuft in shell.js)
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.focus(); return; }
    if (e.key === "Tab" && open) { setOpen(false); return; }
    if (!open && e.target === trigger && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOpen(true, "keyboard"); return; }
    if (!open || !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = items();
    focusItem(nextIndex(rowsOf(), list.indexOf(document.activeElement), e.key, checkedIndex()));
  });

  const onOutside = (e) => { if (open && !el.contains(e.target)) setOpen(false); };
  document.addEventListener("pointerdown", onOutside);
  document.addEventListener("pensum-theme", syncTheme);

  return {
    close: () => setOpen(false),
    destroy() {
      cancelHold();
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("pensum-theme", syncTheme);
      el.innerHTML = "";
      el.classList.remove("pm");
    },
  };
}
