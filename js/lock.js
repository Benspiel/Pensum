/* Sperrlogik der Tools (rein, ohne Browser-Abhängigkeiten, damit sie sich testen lässt). */
const NONE = Object.freeze({ tester: false, kiTester: false, admin: false });

/** Ist das Tool für diesen Zugang gesperrt?
 *  Tools mit „team“ sind nur für dieses Team offen. Sonst sind nur „soon“-Tools gesperrt, Tester dürfen sie nutzen.
 *  Statt des Zugangs darf auch true/false (= Team „tester“) übergeben werden. */
export function isLocked(tool, access = NONE) {
  if (tool.off) return true; // ausgeschaltet (KI-Schalter): für niemanden offen
  const a = typeof access === "boolean" ? { tester: access, kiTester: false, admin: false } : access || NONE;
  if (tool.team) return !a[tool.team];
  return !!tool.soon && !a.tester;
}
