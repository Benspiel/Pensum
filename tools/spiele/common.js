/* Spiele – gemeinsame Bausteine: Bestwerte (nur localStorage), Oberfläche des Spielfelds, Eingabe-Hilfen. */
import { toast, esc } from "/js/shell.js";
export { toast, esc };

export const $ = (id) => document.getElementById(id);
export const BEST_KEY = "pensum.spiele.best.v1";
export const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------- Bestwerte ---------- */

export const best = {
  read() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {}; } catch (_) { return {}; } },
  get(key) { const v = this.read()[key]; return typeof v === "number" ? v : null; },
  /** Speichert nur Verbesserungen. lower: kleinere Werte sind besser (Zeit). Liefert true bei neuem Bestwert. */
  set(key, value, lower = false) {
    const all = this.read(), old = all[key];
    if (typeof old === "number" && (lower ? value >= old : value <= old)) return false;
    all[key] = value;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (_) { /* privater Modus: dann eben nicht */ }
    return true;
  },
};

/* ---------- Gemeinsame Oberfläche ---------- */

export const host = {
  stage: $("stage"),
  chips(list) {
    $("chips").innerHTML = list.map(([label, value]) => `<span class="chip-stat">${esc(label)} <strong>${esc(value)}</strong></span>`).join("");
  },
  overlay(title, text, action = "Nochmal") {
    $("overlayTitle").textContent = title; $("overlayText").textContent = text; $("overlayBtn").textContent = action;
    $("overlay").hidden = false;
    $("overlayBtn").focus({ preventScroll: true });
  },
  clearOverlay() { $("overlay").hidden = true; },
  controls(html, { touchOnly = true } = {}) {
    const c = $("controls");
    c.innerHTML = html;
    c.classList.toggle("touch-only", touchOnly);
    return c;
  },
};

/** Wischgesten: ruft cb("left" | "right" | "up" | "down") auf. */
export function onSwipe(el, cb, min = 24) {
  let start = null;
  const down = (e) => { start = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", () => { start = null; });
  return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", up); };
}

/** Leinwand scharf zeichnen: passt die Pixelgröße an die Anzeigegröße an. */
export function sizeCanvas(canvas, cols, rows) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.width = w; canvas.height = Math.round((w * rows) / cols);
  return canvas.width / cols; // Pixel je Feld
}
export const roundRect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
export const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down" };

export { seeded, shuffle, clock } from "./util.js";

/** Auswahlleiste (Segmented) für Stufen u. Ä. items: [[id, Text], …]. Liefert das Element. */
export function segmented(items, current, onPick, label) {
  const el = document.createElement("div");
  el.className = "segmented";
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", label);
  el.innerHTML = items.map(([id, text]) => `<button type="button" data-id="${esc(id)}" aria-pressed="${id === current}">${esc(text)}</button>`).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    el.querySelectorAll("button").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    onPick(b.dataset.id);
  });
  return el;
}

/** Leiste über dem Spielfeld mit Auswahl und Knöpfen. */
export function bar(...children) {
  const el = document.createElement("div");
  el.className = "sp-bar";
  el.append(...children);
  return el;
}

/** Fügt ein Spiel-Element in die Bühne ein und räumt beim Entfernen auf. */
export function mountIn(host_, el) { host_.stage.append(el); return el; }
