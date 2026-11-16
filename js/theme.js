/* Hell/Dunkel-Modus. Klassisches Skript im <head>, damit die Seite ohne Aufblitzen im richtigen Modus startet.
 * Gespeichert wird nur die Wahl „hell“ oder „dunkel“ (localStorage). Ohne Wahl gilt die Einstellung des Geräts. */
(function () {
  var KEY = "pensum.theme";
  var root = document.documentElement;
  function stored() { try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch (e) { return null; } }
  function system() { return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  function apply(t) {
    root.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#121212" : "#ffffff");
  }
  apply(stored() || system());
  window.pensumTheme = {
    get: function () { return root.getAttribute("data-theme") || "light"; },
    set: function (t) {
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t);
      document.dispatchEvent(new CustomEvent("pensum-theme", { detail: t }));
    },
    toggle: function () { this.set(this.get() === "dark" ? "light" : "dark"); },
  };
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { if (!stored()) apply(system()); });
  }
})();
