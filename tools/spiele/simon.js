/* Simon: Folge merken und nachspielen. Die Folge wächst nach jeder richtigen Runde um einen Ton. */
export const PADS = 4;
export const extend = (seq, rng = Math.random) => [...seq, Math.floor(rng() * PADS)];

/** Prüft die bisherige Eingabe: "wrong" | "partial" | "done". */
export function check(seq, input) {
  for (let i = 0; i < input.length; i++) if (input[i] !== seq[i]) return "wrong";
  return input.length === seq.length ? "done" : "partial";
}
