/**
 * Order of quiz options at render time. The content lists the correct answer first (authoring convention), so the UI
 * shuffles: deterministic for one seed (re-renders keep the order), different for another seed (retry, new run).
 */

/** 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `items` in a seeded random order (Fisher–Yates); the input is not changed. */
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const next = rng(hash(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Quiz options in display order for a seed (e.g. `${stepId}:${runSeed}`). */
export function quizOptionOrder<T extends { id: string }>(options: readonly T[], stepId: string, seed: string): T[] {
  return shuffleSeeded(options, `${stepId}:${seed}`);
}
