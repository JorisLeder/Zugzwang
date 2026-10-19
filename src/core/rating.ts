/**
 * Rating contracts (BACKLOG 2.6, PRD P0-04, D-09, D-28). Algorithm: `@/lib/rating/glicko2`.
 */

/** Rating pools. V1 uses `puzzle` and `bot`; the Rush/Survival kinds are P1 preparation. */
export type RatingKind = 'puzzle' | 'bot' | 'rush_3' | 'rush_5' | 'survival';

/** All rating kinds. */
export const RATING_KINDS: readonly RatingKind[] = ['puzzle', 'bot', 'rush_3', 'rush_5', 'survival'];

/** Glicko-2 state on the Glicko scale (rating ~1500, RD, volatility σ). */
export interface Glicko2Rating {
  rating: number;
  rd: number;
  volatility: number;
}

/** One game in a rating period. */
export interface GlickoResult {
  opponentRating: number;
  opponentRd: number;
  /** 1 = win, 0.5 = draw, 0 = loss. A puzzle solved = 1, failed/hint/solution = 0. */
  score: 0 | 0.5 | 1;
}

/** Stored rating of one kind (`ratings` table). */
export interface RatingRecord extends Glicko2Rating {
  kind: RatingKind;
  /** Number of rated attempts/games. */
  gamesCount: number;
  updatedAt: string;
  /** Client value not yet confirmed by the server (cloud mode shows it as "vorläufig"). Always false in local mode. */
  provisional: boolean;
}

/**
 * Glicko-2 parameters (D-09): initial RD 350, volatility 0.06, τ 0.5, RD clamped to [45, 350]; default puzzle RD 80
 * when a puzzle has none; bot opponents use RD 50. `rating` is the generic Glicko default for an unrated pool – the
 * app normally initialises ratings from the self-assessment (D-10) instead.
 */
export const RATING_DEFAULTS = {
  rating: 1500,
  rd: 350,
  volatility: 0.06,
  tau: 0.5,
  minRd: 45,
  maxRd: 350,
  puzzleRd: 80,
  botRd: 50,
} as const;

/** Lowest stored puzzle/bot rating (client and server floor; keeps beginners from sinking to absurd values). */
export const MIN_PUZZLE_RATING = 100;
