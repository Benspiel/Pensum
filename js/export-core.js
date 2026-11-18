/* Export-Menü – reine Logik (ohne Browser-Abhängigkeit, daher testbar). Das Menü selbst steht in export-menu.js. */
/** Fehlertext für die zweite Zeile. */
export const errorText = (e) => (e && e.message ? String(e.message) : typeof e === "string" ? e : "");

/** Rückgabewert von run: Der Nutzer hat abgebrochen, der Toast verschwindet still. */
export const CANCELLED = Symbol("cancelled");

/** Optionen für promiseToast aus einer Menüzeile. Der Rückgabewert von run steht als zweite Zeile im Toast. */
export function exportToastOptions(option) {
  return {
    loading: option.loading || `${option.label} wird erstellt …`,
    success: (value) => [option.success || "Export fertig", value == null ? "" : String(value)],
    error: (e) => [option.errorTitle || "Export fehlgeschlagen", errorText(e)],
  };
}
