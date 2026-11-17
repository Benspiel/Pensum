/* Spiele – Open-Source-Spiele, unverändert aus vendor/games/ in einem Rahmen (iframe) eingebettet.
 * Die Lizenzen liegen jeweils als LICENSE neben dem Spiel. */
import { host } from "./common.js";

/** Bettet vendor/games/<dir>/index.html ein. width/height: Originalgröße, die bei schmaler Anzeige herunterskaliert wird (nur wenn fixed). */
function makeEmbed(dir, { title, width, height, fixed = false }) {
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
    host.controls("");
    let ro = null;
    const fit = () => {
      if (fixed) {
        const k = Math.min(1, wrap.clientWidth / width);
        frame.style.cssText = `width:${width}px;height:${height}px;transform:scale(${k});transform-origin:0 0`;
        wrap.style.height = Math.round(height * k) + "px";
      } else {
        frame.style.cssText = `width:100%;height:${height}px`;
        wrap.style.height = height + "px";
      }
    };
    fit();
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(wrap); }
    const focus = () => { try { frame.focus(); frame.contentWindow.focus(); } catch (_) { /* gleiche Herkunft, sollte gehen */ } };
    frame.addEventListener("load", focus);
    return {
      canPause: false,
      restart() { frame.src = frame.src; },
      key() { return false; }, // Tasten gehen direkt ans Spiel im Rahmen
      destroy() { if (ro) ro.disconnect(); wrap.remove(); },
    };
  };
}

export const makeAsteroids = makeEmbed("asteroids", { title: "Asteroids", width: 780, height: 540, fixed: true });
export const makeDino = makeEmbed("trex", { title: "Dino-Runner", height: 260 });
