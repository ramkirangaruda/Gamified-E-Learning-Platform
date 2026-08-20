// Small seedable-friendly random helpers shared by every Math Lab question generator.
// Every function takes `rng` last with a `Math.random` default, so tests can inject a
// deterministic source (e.g. a fixed sequence) without the generators themselves knowing
// or caring that they're being tested.

/** Integer in [min, max], inclusive both ends. */
export function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher-Yates, does not mutate the input. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `k` distinct indices in [0, n), order not significant. */
export function sampleDistinctIndices(n: number, k: number, rng: () => number = Math.random): number[] {
  const pool = Array.from({ length: n }, (_, i) => i);
  return shuffle(pool, rng).slice(0, k);
}
