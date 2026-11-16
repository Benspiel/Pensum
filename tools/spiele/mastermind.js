/* Mastermind: Rate den Farbcode (4 Stellen, 6 Farben, Wiederholungen erlaubt) in höchstens 10 Versuchen. */
export const LEN = 4, COLORS = 6, MAX_TRIES = 10;

export const randomSecret = (rng = Math.random) => Array.from({ length: LEN }, () => Math.floor(rng() * COLORS));

/** exact: richtige Farbe an richtiger Stelle, partial: richtige Farbe an falscher Stelle. */
export function score(secret, guess) {
  let exact = 0;
  const sRest = new Array(COLORS).fill(0), gRest = new Array(COLORS).fill(0);
  for (let i = 0; i < LEN; i++) {
    if (secret[i] === guess[i]) exact++; else { sRest[secret[i]]++; gRest[guess[i]]++; }
  }
  let partial = 0;
  for (let c = 0; c < COLORS; c++) partial += Math.min(sRest[c], gRest[c]);
  return { exact, partial };
}
