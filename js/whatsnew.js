/* „Was ist neu“: kurzes Pop-up, das pro Browser einmal erscheint. Mit „Weiter“ blättert man durch die Neuerungen.
 * Gemerkt wird nur, welche Version man schon gesehen hat (localStorage). Über „Was ist neu?“ im Footer lässt es sich wieder öffnen.
 *
 * Neue Neuerungen: Einträge in SLIDES ergänzen und VERSION erhöhen, dann sehen es alle noch einmal. */
const VERSION = "2026-11-b";
const KEY = "pensum.whatsnew.seen";

const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const SLIDES = [
  {
    icon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>'),
    title: "Dunkler Modus.",
    text: "Tippe oben in der Leiste auf den Mond oder die Sonne und wechsle zwischen hell und dunkel. Pensum merkt sich deine Wahl.",
  },
  {
    icon: svg('<rect x="3" y="6" width="14" height="12" rx="2.5"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/>'),
    title: "Karteikarten.",
    text: "Bis zu 5 Stapel mit Vorder- und Rückseite. Lerne mit 5 Leveln oder der Reihe nach, zum Umdrehen oder als schriftlicher Test. Mit Konto auf allen Geräten.",
    href: "/tools/karteikarten/",
    cta: "Karteikarten öffnen",
  },
  {
    icon: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8.5 15l2 2 4-4"/>'),
    title: "Planer.",
    text: "Hausaufgaben mit Fälligkeit und Klausuren mit Countdown. Verknüpfe eine Klausur mit einem Karteikarten-Stapel und lerne direkt dafür.",
    href: "/tools/planer/",
    cta: "Planer öffnen",
  },
  {
    icon: svg('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1 1 0 0 1 10.1 4h3.8a1 1 0 0 1 .8.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><path d="M9 12.5h6M9 15h3.5"/>'),
    title: "Abschreiben.",
    text: "Fotografier das Tafelbild und die KI schreibt es ab. Du kopierst den Text oder wandelst ihn mit dem Goodnotes-Tool in deine Handschrift um.",
    href: "/tools/abschreiben/",
    cta: "Abschreiben öffnen",
  },
  {
    icon: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5V14h4v5.5h4.5V10"/>'),
    title: "Schneller unterwegs.",
    text: "Mit „Home“ oben in der Leiste kommst du aus jedem Tool zurück zur Startseite. Der Mindmap-Generator lädt außerdem deutlich schneller.",
  },
];

const stored = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
function remember() { try { localStorage.setItem(KEY, VERSION); return true; } catch (_) { return false; } }
const canStore = () => { try { localStorage.setItem("pensum.probe", "1"); localStorage.removeItem("pensum.probe"); return true; } catch (_) { return false; } };

let dialog = null;

export function openWhatsNew() {
  if (dialog) return;
  let i = 0;
  const d = document.createElement("dialog");
  d.className = "modal whatsnew";
  d.setAttribute("aria-labelledby", "wnTitle");
  d.innerHTML = `
    <div class="modal-body wn-body">
      <div class="modal-head">
        <span class="badge badge-accent">Neu bei Pensum</span>
        <button type="button" class="icon-btn" data-wn-close aria-label="Schließen">${closeIcon}</button>
      </div>
      <div class="wn-slide" id="wnSlide" aria-live="polite"></div>
      <div class="wn-dots" id="wnDots" aria-hidden="true">${SLIDES.map(() => "<i></i>").join("")}</div>
      <div class="wn-actions">
        <button class="btn btn-primary btn-wide" type="button" data-wn-next></button>
        <button class="btn btn-soft btn-wide" type="button" data-wn-skip>Überspringen</button>
      </div>
    </div>`;
  document.body.append(d);
  dialog = d;

  const slide = d.querySelector("#wnSlide");
  const dots = d.querySelectorAll("#wnDots i");
  const next = d.querySelector("[data-wn-next]");
  const skip = d.querySelector("[data-wn-skip]");

  function show(n) {
    i = n;
    const s = SLIDES[i];
    slide.classList.remove("in");
    void slide.offsetWidth; // Animation neu starten
    slide.innerHTML = `
      <span class="squircle squircle-96" aria-hidden="true">${s.icon}</span>
      <h2 class="h3" id="wnTitle">${s.title}</h2>
      <p class="body-sm">${s.text}</p>
      ${s.href ? `<a class="text-link" href="${s.href}">${s.cta}</a>` : ""}`;
    slide.classList.add("in");
    dots.forEach((dot, k) => dot.classList.toggle("on", k === i));
    const last = i === SLIDES.length - 1;
    next.textContent = last ? "Los geht’s" : "Weiter";
    skip.hidden = last;
  }

  let done = false;
  const cleanup = () => { if (done) return; done = true; remember(); d.remove(); dialog = null; };
  const finish = () => { d.close(); cleanup(); };
  next.addEventListener("click", () => (i < SLIDES.length - 1 ? show(i + 1) : finish()));
  skip.addEventListener("click", finish);
  d.querySelector("[data-wn-close]").addEventListener("click", finish);
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" && i < SLIDES.length - 1) show(i + 1);
    if (e.key === "ArrowLeft" && i > 0) show(i - 1);
  });
  d.addEventListener("close", cleanup); // auch bei Escape

  show(0);
  d.showModal();
  next.focus();
}

// Wieder öffnen über „Was ist neu?“ (Footer)
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-whatsnew]")) { e.preventDefault(); openWhatsNew(); }
});

// Einmal pro Browser automatisch, nicht auf Rechtsseiten und beim Passwort-Zurücksetzen
const QUIET = /^\/(impressum|datenschutz|cookies|nutzungsbedingungen|konto\/passwort)(\/|$)/;
if (stored() !== VERSION && canStore() && !QUIET.test(location.pathname)) {
  setTimeout(() => { if (!document.querySelector("dialog[open]")) openWhatsNew(); }, 900);
}
