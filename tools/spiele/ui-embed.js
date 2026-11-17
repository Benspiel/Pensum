/* Spiele – Open-Source-Spiele, unverändert aus vendor/games/ in einem Rahmen (iframe) eingebettet.
 * Die Lizenzen liegen jeweils als LICENSE neben dem Spiel. Das Spiel wird auf die ganze Spielfläche skaliert (nichts wird abgeschnitten),
 * und auf Touch-Geräten kommen Bildschirm-Knöpfe dazu, die die Tasten des Spiels auslösen (Wir ändern den Spielcode nicht, nur von außen). */
import { host, fitScale, haptic } from "./common.js";

const svg = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICON = { left: svg('<path d="m14 6-6 6 6 6"/>'), right: svg('<path d="m10 6 6 6-6 6"/>'), up: svg('<path d="m6 14 6-6 6 6"/>'), down: svg('<path d="m6 10 6 6 6-6"/>'), fire: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>') };

/** Knopf, der gedrückt gehalten wird (Finger bleibt liegen, auch wenn er etwas wegrutscht). */
function holdButton(label, icon, onDown, onUp, cls = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `pad-hold ${cls}`.trim();
  b.setAttribute("aria-label", label);
  b.innerHTML = `${icon}<span>${label}</span>`;
  let down = false;
  const release = () => { if (down) { down = false; b.classList.remove("is-down"); onUp(); } };
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); down = true; haptic(); b.classList.add("is-down"); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ältere Browser */ } onDown(); });
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", release);
  b.addEventListener("lostpointercapture", release);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  return b;
}

/** Ein Tastendruck in das Spiel im Rahmen (die Spiele lesen event.keyCode). */
function sendKey(frame, type, keyCode) {
  try {
    const win = frame.contentWindow;
    const e = new win.KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "keyCode", { get: () => keyCode });
    Object.defineProperty(e, "which", { get: () => keyCode });
    (win.document).dispatchEvent(e);
  } catch (_) { /* Spiel noch nicht geladen */ }
}

/** Bettet vendor/games/<dir>/index.html ein. width/height: Originalgröße, auf die Spielfläche skaliert. max: größte Vergrößerung. controls(frame): baut Touch-Knöpfe. */
function makeEmbed(dir, { title, width, height, max = 3, controls }) {
  return function () {
    const wrap = document.createElement("div");
    wrap.className = "sp-embed";
    const frame = document.createElement("iframe");
    frame.title = title;
    frame.src = `/vendor/games/${dir}/index.html`;
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("allow", "autoplay");
    wrap.append(frame);
    host.stage.append(wrap);
    host.chips([]);
    const pad = host.controlsEl();
    pad.innerHTML = "";
    pad.className = "sp-controls touch-only";
    if (controls) pad.append(...controls(frame));

    let ro = null;
    const fit = () => {
      const k = fitScale(width, height, host.stage.clientWidth, host.stage.clientHeight, max);
      frame.style.cssText = `width:${width}px;height:${height}px;transform:scale(${k});transform-origin:0 0`;
      wrap.style.width = Math.round(width * k) + "px";
      wrap.style.height = Math.round(height * k) + "px";
    };
    fit();
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host.stage); }
    const focus = () => { try { frame.focus(); frame.contentWindow.focus(); } catch (_) { /* gleiche Herkunft, sollte gehen */ } };
    frame.addEventListener("load", () => {
      focus();
      if (dir === "trex") {
        try { frame.contentDocument.addEventListener("touchstart", () => haptic(), { passive: true }); } catch (_) {}
      }
    });
    return {
      canPause: false,
      restart() { frame.src = frame.src; },
      key() { return false; }, // Tasten gehen direkt ans Spiel im Rahmen
      destroy() { if (ro) ro.disconnect(); wrap.remove(); pad.innerHTML = ""; },
    };
  };
}

/** Asteroids liest den Zustand der Tasten aus KEY_STATUS: Die Knöpfe setzen ihn direkt. Leertaste startet das Spiel und schießt. */
function asteroidsControls(frame) {
  const set = (name, on) => { try { frame.contentWindow.KEY_STATUS[name] = on; } catch (_) { /* Spiel noch nicht geladen */ } };
  const hold = (label, icon, key, cls) => holdButton(label, icon, () => set(key, true), () => set(key, false), cls);
  const left = document.createElement("div");
  left.className = "pad-group";
  left.append(hold("Links", ICON.left, "left"), hold("Rechts", ICON.right, "right"));
  const right = document.createElement("div");
  right.className = "pad-group";
  right.append(hold("Schub", ICON.up, "up"), hold("Feuer", ICON.fire, "space", "is-fire"));
  return [left, right];
}

/** Dino-Runner: Tippen aufs Spiel springt schon selbst. Zum Ducken gibt es einen Knopf, der die Pfeil-runter-Taste schickt. */
function dinoControls(frame) {
  const group = document.createElement("div");
  group.className = "pad-group";
  group.append(holdButton("Ducken", ICON.down, () => sendKey(frame, "keydown", 40), () => sendKey(frame, "keyup", 40)));
  const jump = document.createElement("div");
  jump.className = "pad-group";
  jump.append(holdButton("Springen", ICON.up, () => sendKey(frame, "keydown", 32), () => sendKey(frame, "keyup", 32)));
  return [jump, group];
}

export const makeAsteroids = makeEmbed("asteroids", { title: "Asteroids", width: 780, height: 540, controls: asteroidsControls });
export const makeDino = makeEmbed("trex", { title: "Dino-Runner", width: 600, height: 170, controls: dinoControls });
