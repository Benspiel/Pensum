/* Startseite: Parallax-Scrolling und Einblenden beim Scrollen.
 *
 * Parallax: Elemente mit data-parallax="<Faktor>" verschieben sich beim Scrollen mit eigener Geschwindigkeit
 * (positiv = langsamer als die Seite, negativ = gegenläufig). Es werden nur transform-nahe Eigenschaften
 * (translate, opacity) verändert; data-origin="top" lässt ein Element beim Laden genau an seinem Platz stehen; gerechnet wird höchstens einmal pro Bild (requestAnimationFrame), nur für Elemente
 * in der Nähe des Bildschirms. Auf schmalen Geräten fällt die Bewegung schwächer aus.
 * Reveal: Elemente mit class="reveal" blenden einmal sanft ein, sobald sie sichtbar werden.
 * Bei „Bewegung reduzieren“ im System passiert nichts davon: alles steht still und ist sofort sichtbar. */

const reduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {} };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let items = [];
let ticking = false;
let started = false;

function measure() {
  for (const it of items) it.el.style.translate = "";
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    it.visible = r.width > 0 || r.height > 0;
    it.base = r.top + window.scrollY + r.height / 2; // Mitte des Elements im Dokument (ohne Verschiebung)
  }
  update();
}

function update() {
  ticking = false;
  if (reduce.matches) return;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const mid = y + vh / 2;
  const factor = window.innerWidth < 768 ? 0.5 : 1;
  for (const it of items) {
    if (!it.visible) continue;
    const dist = it.fromTop ? y : mid - it.base; // fromTop: steht oben an seinem Platz und bewegt sich erst beim Scrollen
    if (Math.abs(dist) > vh * 1.6) continue; // weit weg: keine Arbeit
    it.el.style.translate = `0 ${(dist * it.speed * factor).toFixed(1)}px`;
    if (it.fade) it.el.style.opacity = String(clamp(1 - y / (vh * 0.85), 0, 1).toFixed(3));
  }
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(update);
}

let resizeTimer = 0;
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 150); };

function stop() {
  for (const it of items) { it.el.style.translate = ""; if (it.fade) it.el.style.opacity = ""; }
}

export function initParallax() {
  if (started) return;
  started = true;
  items = [...document.querySelectorAll("[data-parallax]")].map((el) => ({
    el, speed: parseFloat(el.dataset.parallax) || 0, fade: el.hasAttribute("data-fade"), fromTop: el.dataset.origin === "top", base: 0, visible: true,
  }));
  if (!items.length) return;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  reduce.addEventListener("change", () => (reduce.matches ? stop() : measure()));
  if (!reduce.matches) measure();
}

/** Blendet Elemente mit class="reveal" ein, sobald sie sichtbar werden (Geschwister nacheinander). */
export function initReveal(root = document) {
  const els = [...root.querySelectorAll(".reveal")];
  if (!els.length || reduce.matches || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("js-reveal");
  const io = new IntersectionObserver((entries) => {
    const showing = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    showing.forEach((e, i) => {
      e.target.style.setProperty("--d", `${Math.min(i, 5) * 70}ms`);
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}
