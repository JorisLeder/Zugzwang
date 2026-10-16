/** Random helpers of the bot models (seedable so tests and the calibration are reproducible). */

/** A source of floats in [0, 1). */
export type RandomSource = () => number;

/** Small deterministic PRNG (mulberry32). */
export function createSeededRandom(seed: number): RandomSource {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one item with probability proportional to its weight (non-positive weights never win unless all are). */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], random: RandomSource): T | undefined {
  if (items.length === 0) return undefined;
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(random() * items.length)];
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i]!;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Softmax weights `exp(score / temperature)` (numerically stable). */
export function softmaxWeights(scores: readonly number[], temperature: number): number[] {
  if (scores.length === 0) return [];
  const t = Math.max(temperature, 1e-6);
  const max = Math.max(...scores);
  return scores.map((s) => Math.exp((s - max) / t));
}

/** Picks a random element (uniform). */
export function pickOne<T>(items: readonly T[], random: RandomSource): T | undefined {
  return items.length ? items[Math.floor(random() * items.length)] : undefined;
}
