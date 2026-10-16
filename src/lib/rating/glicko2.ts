/**
 * Glicko-2 (Mark E. Glickman, "Example of the Glicko-2 system"; RULES.md §4.1, D-09). Frozen (WP-00).
 * One call = one rating period. The server (PL/pgSQL, WP-11) must implement the identical algorithm (D-28).
 */
import type { Glicko2Rating, GlickoResult } from '@/core/rating';
import { RATING_DEFAULTS } from '@/core/rating';

/** Glicko-2 scale factor (400 / ln 10). */
export const GLICKO2_SCALE = 173.7178;

/** Options of `updateGlicko2`. Defaults: τ 0.5, RD clamp [45, 350], ε 1e-6 (D-09). */
export interface Glicko2Options {
  tau?: number;
  minRd?: number;
  maxRd?: number;
  epsilon?: number;
}

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expectation = (mu: number, muJ: number, phiJ: number): number => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** Expected score (0–1) of a player against an opponent (Glicko-2 E function on the Glicko scale). */
export function expectedScore(player: Pick<Glicko2Rating, 'rating'>, opponent: { rating: number; rd: number }): number {
  return expectation(
    (player.rating - 1500) / GLICKO2_SCALE,
    (opponent.rating - 1500) / GLICKO2_SCALE,
    opponent.rd / GLICKO2_SCALE,
  );
}

/**
 * Updates a rating for one rating period with the given results (Glickman's steps 1–8, Illinois algorithm for σ′).
 * With no results only the RD grows (`√(φ² + σ²)`). The new RD is clamped to `[minRd, maxRd]`.
 */
export function updateGlicko2(r: Glicko2Rating, results: readonly GlickoResult[], opts: Glicko2Options = {}): Glicko2Rating {
  const tau = opts.tau ?? RATING_DEFAULTS.tau;
  const minRd = opts.minRd ?? RATING_DEFAULTS.minRd;
  const maxRd = opts.maxRd ?? RATING_DEFAULTS.maxRd;
  const epsilon = opts.epsilon ?? 1e-6;
  const clampRd = (rd: number) => Math.min(maxRd, Math.max(minRd, rd));

  const mu = (r.rating - 1500) / GLICKO2_SCALE;
  const phi = r.rd / GLICKO2_SCALE;
  const sigma = r.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: r.rating, rd: clampRd(phiStar * GLICKO2_SCALE), volatility: sigma };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const res of results) {
    const muJ = (res.opponentRating - 1500) / GLICKO2_SCALE;
    const phiJ = res.opponentRd / GLICKO2_SCALE;
    const gJ = g(phiJ);
    const e = expectation(mu, muJ, phiJ);
    vInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (res.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5: new volatility (Illinois algorithm).
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > epsilon && guard < 1000) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }
  const sigmaNew = Math.exp(A / 2);

  // Steps 6–8.
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  return {
    rating: GLICKO2_SCALE * muNew + 1500,
    rd: clampRd(GLICKO2_SCALE * phiNew),
    volatility: sigmaNew,
  };
}
