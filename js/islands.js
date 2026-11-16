/* Lädt die React-Inseln (KokonutUI, gebaut aus ui/) erst bei Bedarf, ohne den Seitenstart zu bremsen.
 * Bis sie da sind (oder falls sie nicht laden), zeigt die Seite ihre normalen HTML-Elemente.
 *   const ui = await loadIslands();   // null, wenn es nicht geklappt hat
 *   ui.mountTabs(element, { items, value, label, onChange });
 *   ui.mountHold(element, { label, completeLabel, onComplete });   */
let loading = null;

export function loadIslands() {
  if (!loading) {
    loading = (async () => {
      if (!document.querySelector('link[data-islands]')) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "/vendor/ui/islands.css";
        css.dataset.islands = "";
        document.head.append(css);
      }
      return import("/vendor/ui/islands.js");
    })().catch((e) => { console.warn("Komponenten konnten nicht geladen werden", e); loading = null; return null; });
  }
  return loading;
}

/** Wartet, bis der Browser Luft hat, und lädt dann die Inseln (damit der erste Aufbau der Seite nicht gebremst wird). */
export function loadIslandsSoon() {
  return new Promise((resolve) => {
    const go = () => resolve(loadIslands());
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  });
}
