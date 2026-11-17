/* Stack Panel – Nachbau von „Stack Panel“ aus Kokonut UI (MIT, https://kokonutui.com) in Vanilla-JS (css/stack-panel.css).
 * Ein Panel, das in Unterseiten springt wie die Einstellungen am Handy: Eine Zeile öffnet ihre Seite von rechts, ihre Beschriftung
 * fliegt dabei nach oben und wird zum Titel. Zurück geht es mit dem Zurück-Knopf, Escape, dem Zurück des Browsers oder (am Handy)
 * mit einer Wischgeste nach rechts. Die Höhe des Panels passt sich der Seite an. Bewegung reduziert: ohne Animation.
 *
 * Aufbau (die Seiten dürfen beliebigen Inhalt haben, z. B. Formulare):
 *   <div class="sp" id="panel">
 *     <header class="sp-head">
 *       <button class="sp-back" type="button">Zurück</button>
 *       <div class="sp-title-wrap"></div>
 *     </header>
 *     <div class="sp-body">
 *       <div class="sp-page" data-sp-page="root" data-sp-title="Einstellungen"> … <button data-sp-to="name">Name</button> … </div>
 *       <div class="sp-page" data-sp-page="name" data-sp-title="Name" hidden> … </div>
 *     </div>
 *   </div>
 *   initStackPanel(document.getElementById("panel"));
 *
 * Es gibt die Startseite „root“ und darunter Seiten, die man von dort öffnet (eine Ebene tief). Die offene Seite steht als #id in der Adresse. */

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const DURATION = 380;
const PARALLAX = 0.3;        // die Seite darunter wandert nur ein Drittel so weit wie die obere
const POP_DISTANCE = 0.35;   // ab diesem Anteil der Breite loslassen, und die Seite geht zurück
const POP_VELOCITY = 0.5;    // oder schneller als so viele Pixel pro Millisekunde wischen

/** Startwerte (Pixel) für Schieben der oberen und der unteren Seite. dir: 1 = öffnen, -1 = zurück; startX = Versatz der oberen Seite beim Loslassen. */
export function offsets(dir, width, startX = 0) {
  return dir === 1
    ? { top: [width, 0], under: [0, -PARALLAX * width] }
    : { top: [startX, width], under: [-PARALLAX * (width - startX), 0] };
}

/** Soll die Seite nach dem Wischen zurückgehen? dx = Weg, vx = Geschwindigkeit in Pixel pro Millisekunde. */
export function shouldPop(dx, width, vx = 0) {
  return dx > width * POP_DISTANCE || vx > POP_VELOCITY;
}

const noMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isField = (el) => !!el.closest("input, textarea, select, [contenteditable]");

export function initStackPanel(panel, { onPage } = {}) {
  const body = panel.querySelector(".sp-body");
  const back = panel.querySelector(".sp-back");
  const titleWrap = panel.querySelector(".sp-title-wrap");
  const pages = new Map([...body.querySelectorAll("[data-sp-page]")].map((p) => [p.dataset.spPage, p]));
  const ROOT = "root";
  let current = ROOT;
  let running = [];       // laufende Animationen
  let opener = null;      // die Zeile, die die Seite geöffnet hat (Fokus kehrt dorthin zurück)
  let drag = null;

  for (const [id, p] of pages) {
    p.tabIndex = -1;
    p.classList.add("sp-page");
    p.hidden = id !== ROOT;
    p.inert = id !== ROOT;
  }

  const titleOf = (id) => (pages.get(id) && pages.get(id).dataset.spTitle) || "";

  /* ---------- Titel ---------- */

  function setTitle(id, dir, origin) {
    const old = titleWrap.querySelector(".sp-title:not(.is-leaving)");
    const el = document.createElement("span");
    el.className = "sp-title";
    el.textContent = titleOf(id);
    titleWrap.append(el);
    const move = !noMotion();
    if (old) {
      old.classList.add("is-leaving");
      old.setAttribute("aria-hidden", "true");
      if (move) old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${dir * -40}px)` }], { duration: 180, easing: EASE, fill: "forwards" }).finished.then(() => old.remove(), () => old.remove());
      else old.remove();
    }
    if (!move) return;
    if (origin && dir === 1) { // Beschriftung der Zeile fliegt in die Kopfzeile
      const box = titleWrap.getBoundingClientRect();
      const own = el.getBoundingClientRect();
      const scale = origin.fontSize / (parseFloat(getComputedStyle(el).fontSize) || 15);
      const dx = origin.left - (own.left - box.left);
      const dy = origin.top + origin.height / 2 - (own.top - box.top + own.height / 2);
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1 }, { transform: "none", opacity: 1 }], { duration: DURATION, easing: EASE });
    } else {
      el.animate([{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 280, easing: EASE });
    }
  }

  function updateBack() {
    back.hidden = false;
    back.classList.toggle("is-hidden", current === ROOT);
    back.inert = current === ROOT;
  }

  /* ---------- Übergang ---------- */

  function stop() {
    for (const a of running) { try { a.cancel(); } catch (_) { /* schon fertig */ } }
    running = [];
    body.style.height = "";
    body.classList.remove("is-moving");
    for (const [id, p] of pages) {
      p.classList.remove("is-layer");
      p.style.transform = "";
      p.style.zIndex = "";
      if (id !== current) { p.hidden = true; p.inert = true; }
    }
  }

  function layers(from, to) {
    body.style.height = from.offsetHeight + "px";
    body.classList.add("is-moving");
    to.hidden = false;
    to.inert = false;
    from.classList.add("is-layer");
    to.classList.add("is-layer");
  }

  function go(id, dir, { origin = null, startX = 0 } = {}) {
    if (!pages.has(id) || id === current) return;
    stop();
    const from = pages.get(current);
    const to = pages.get(id);
    current = id;
    updateBack();
    setTitle(id, dir, origin);
    if (onPage) onPage(id);
    const finish = () => {
      stop();
      if (dir === 1) to.focus({ preventScroll: true });
      else if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    if (noMotion()) { from.hidden = true; from.inert = true; to.hidden = false; to.inert = false; finish(); return; }

    const w = body.clientWidth;
    const fromH = from.offsetHeight;
    layers(from, to);
    const toH = to.offsetHeight;
    const top = dir === 1 ? to : from;
    const under = dir === 1 ? from : to;
    const o = offsets(dir, w, startX);
    top.style.zIndex = "2";
    under.style.zIndex = "1";
    const opt = { duration: DURATION, easing: EASE, fill: "both" };
    running = [
      top.animate([{ transform: `translateX(${o.top[0]}px)` }, { transform: `translateX(${o.top[1]}px)` }], opt),
      under.animate([{ transform: `translateX(${o.under[0]}px)` }, { transform: `translateX(${o.under[1]}px)` }], opt),
      body.animate([{ height: fromH + "px" }, { height: toH + "px" }], { ...opt, duration: DURATION - 40 }),
    ];
    Promise.all(running.map((a) => a.finished)).then(finish, () => { /* abgebrochen: die nächste Bewegung räumt auf */ });
  }

  /* ---------- Öffnen und Zurück (über die Adresse, damit auch der Browser-Zurück-Knopf geht) ---------- */

  function open(id, row) {
    if (!pages.has(id) || id === ROOT || id === current) return;
    opener = row || null;
    const label = row && row.querySelector(".sp-label");
    let origin = null;
    if (label) {
      const box = titleWrap.getBoundingClientRect();
      const r = label.getBoundingClientRect();
      // Lage der Beschriftung relativ zur Kopfzeile; setTitle fliegt von dort an den Titelplatz
      origin = { left: r.left - box.left, top: r.top - box.top, height: r.height, fontSize: parseFloat(getComputedStyle(label).fontSize) || 15 };
    }
    try { history.pushState({ sp: id }, "", "#" + id); } catch (_) { /* eingebettet */ }
    go(id, 1, { origin });
  }

  let closing = false; // „Zurück“ ist unterwegs: ein zweiter Klick oder Escape darf den Browser nicht noch einen Schritt zurückschicken
  function close(startX = 0) {
    if (current === ROOT || closing) return;
    if (history.state && history.state.sp) { closing = true; pendingStartX = startX; history.back(); return; }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) { /* eingebettet */ }
    go(ROOT, -1, { startX });
  }

  let pendingStartX = 0;
  addEventListener("popstate", () => {
    const id = location.hash.slice(1);
    const target = pages.has(id) && id !== ROOT ? id : ROOT;
    const startX = pendingStartX;
    pendingStartX = 0;
    closing = false;
    if (target === current) return;
    go(target, target === ROOT ? -1 : 1, { startX });
  });

  panel.addEventListener("click", (e) => {
    const row = e.target.closest("[data-sp-to]");
    if (row && panel.contains(row)) { e.preventDefault(); open(row.dataset.spTo, row); }
  });
  back.addEventListener("click", () => close());
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing || current === ROOT || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    close();
  });

  /* ---------- Wischen (Touch und Stift): die Seite folgt dem Finger ---------- */

  function snapBack(dx, w) {
    const under = pages.get(ROOT);
    const top = pages.get(current);
    top.style.transform = "";
    under.style.transform = "";
    const opt = { duration: 240, easing: EASE, fill: "both" };
    running = [
      top.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], opt),
      under.animate([{ transform: `translateX(${-PARALLAX * (w - dx)}px)` }, { transform: `translateX(${-PARALLAX * w}px)` }], opt),
    ];
    Promise.all(running.map((a) => a.finished)).then(() => { running = []; under.hidden = true; under.inert = true; stop(); }, () => {});
  }

  body.addEventListener("pointerdown", (e) => {
    if (current === ROOT || e.pointerType === "mouse" || !e.isPrimary || isField(e.target)) return;
    stop();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, dx: 0, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
  });
  body.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // senkrechtes Scrollen
      if (dx > 10 && dx > Math.abs(dy) * 1.5) {
        drag.active = true;
        body.setPointerCapture(e.pointerId);
        layers(pages.get(current), pages.get(ROOT));
        pages.get(current).style.zIndex = "2";
        pages.get(ROOT).style.zIndex = "1";
      } else return;
    }
    const w = body.clientWidth;
    drag.dx = Math.max(0, dx);
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.vx = 0.8 * drag.vx + 0.2 * ((e.clientX - drag.lastX) / dt);
    drag.lastX = e.clientX; drag.lastT = e.timeStamp;
    pages.get(current).style.transform = `translateX(${drag.dx}px)`;
    pages.get(ROOT).style.transform = `translateX(${-PARALLAX * (w - drag.dx)}px)`;
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    const w = body.clientWidth;
    if (e.type !== "pointercancel" && shouldPop(d.dx, w, d.vx)) {
      close(d.dx); // die Seiten bleiben, wie der Finger sie liegen ließ, bis go() von dort aus weiter animiert
    } else {
      snapBack(d.dx, w);
    }
  };
  body.addEventListener("pointerup", release);
  body.addEventListener("pointercancel", release);

  /* ---------- Start: Seite aus der Adresse ---------- */

  updateBack();
  setTitleInitial();
  function setTitleInitial() {
    const el = document.createElement("span");
    el.className = "sp-title";
    el.textContent = titleOf(ROOT);
    titleWrap.append(el);
  }
  const start = location.hash.slice(1);
  if (pages.has(start) && start !== ROOT) {
    try { history.replaceState(null, "", "#" + start); } catch (_) { /* eingebettet */ }
    const to = pages.get(start);
    pages.get(ROOT).hidden = true; pages.get(ROOT).inert = true;
    to.hidden = false; to.inert = false;
    current = start;
    titleWrap.querySelector(".sp-title").textContent = titleOf(start);
    updateBack();
    if (onPage) onPage(start);
  }

  return { open: (id) => open(id), close: () => close(), current: () => current };
}
