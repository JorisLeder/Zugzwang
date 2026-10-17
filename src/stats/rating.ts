/**
 * Rating curves (PRD Fortschritt §5 "Ratingkurven"): the stored history of a rating pool (`RatingRepository.history`,
 * oldest first) turned into a chart series with a summary.
 */

/** One stored rating value (after a rated attempt or game). */
export interface RatingPoint {
  /** ISO timestamp. */
  at: string;
  rating: number;
}

/** A rating curve ready for a chart. */
export interface RatingSeries {
  /** Points oldest first, at most `maxPoints` (downsampled evenly, first and last point always kept). */
  points: RatingPoint[];
  /** Number of stored values (before downsampling). */
  count: number;
  /** Latest rating, `null` without history. */
  current: number | null;
  /** First rating of the history, `null` without history. */
  first: number | null;
  /** Change from the first to the latest value (0 without history). */
  delta: number;
  min: number | null;
  max: number | null;
  /** Highest value reached. */
  peak: RatingPoint | null;
}

/** Default maximum number of chart points. */
export const DEFAULT_MAX_POINTS = 120;

function isValid(p: RatingPoint): boolean {
  return Number.isFinite(p.rating) && typeof p.at === 'string' && p.at.length > 0;
}

/** Evenly picks `max` points (always the first and the last). */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (max < 2 || points.length <= max) return [...points];
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!);
  return out;
}

/** Builds the curve of one rating pool. Invalid points are ignored; unsorted input is sorted by time. */
export function ratingSeries(history: readonly RatingPoint[], opts: { maxPoints?: number } = {}): RatingSeries {
  const sorted = history.filter(isValid).sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.length === 0) return { points: [], count: 0, current: null, first: null, delta: 0, min: null, max: null, peak: null };
  const ratings = sorted.map((p) => p.rating);
  const first = sorted[0]!.rating;
  const current = sorted[sorted.length - 1]!.rating;
  let peak = sorted[0]!;
  for (const p of sorted) if (p.rating > peak.rating) peak = p;
  return {
    points: downsample(sorted, opts.maxPoints ?? DEFAULT_MAX_POINTS),
    count: sorted.length,
    current,
    first,
    delta: current - first,
    min: Math.min(...ratings),
    max: Math.max(...ratings),
    peak,
  };
}
