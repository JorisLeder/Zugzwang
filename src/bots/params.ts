/**
 * Elo-dependent parameters of the bot models (D-16). Tuned with `npm run bots:calibrate`
 * (`docs/team/bot-calibration.md`); change them only together with a new calibration run.
 */
import type { BotProfile } from '@/core/bots';

/** Which move generator a bot uses (D-16; `maia` falls back to the human model until a Maia adapter exists). */
export type BotModel = 'skill' | 'human' | 'elo';

/** Model of a bot. */
export function botModel(bot: Pick<BotProfile, 'engine'>): BotModel {
  switch (bot.engine) {
    case 'stockfish-skill':
      return 'skill';
    case 'stockfish-elo':
      return 'elo';
    default:
      return 'human';
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Parameters of the weak bots (< 800): Stockfish Skill Level 0–3 plus rule-based gross errors. */
export interface SkillParams {
  /** UCI `Skill Level` 0–3. */
  skillLevel: number;
  /** Search depth of the Skill-Level search. */
  depth: number;
  /** Search time cap in ms. */
  movetimeMs: number;
  /** Probability that a move is a rule-based gross error (overlooked attack, missed capture, hung piece). */
  grossErrorRate: number;
  /** Softmax temperature over `plausibility()` when choosing the erroneous move (higher = more varied). */
  plausibilityTemperature: number;
}

/** Skill parameters by Elo (100 → very weak … 790 → weak). Gross errors fall geometrically from 65 % to 18 %. */
export function skillParams(elo: number): SkillParams {
  const t = clamp((elo - 100) / 600, 0, 1);
  return {
    skillLevel: clamp(Math.round(lerp(0, 3, t)), 0, 3),
    depth: clamp(Math.round(lerp(1, 6, t)), 1, 6),
    movetimeMs: 300,
    grossErrorRate: Number((0.65 * Math.pow(0.18 / 0.65, t)).toFixed(3)),
    plausibilityTemperature: Number(lerp(1.6, 1.0, t).toFixed(3)),
  };
}

/** Parameters of the human error model (800–2000). */
export interface HumanParams {
  /** Depth of the main MultiPV search. */
  depth: number;
  /** Number of candidate moves (8–12). */
  multiPv: number;
  /** Search time cap of the main search in ms (keeps the answer ≤ 1 s on slow devices). */
  movetimeMs: number;
  /** Softmax temperature over expected-points loss (EP units, 0–1). Lower = closer to the best move. */
  temperature: number;
  /** Probability that the bot judges the position "blind" to the opponent's replies (shallow search only). */
  blindness: number;
  /** Depth of the shallow ("blind") search. */
  shallowDepth: number;
  /** Bonus for natural moves, in units of `temperature` (recapture, check, capture, development, castling). */
  natural: { recapture: number; check: number; capture: number; development: number; castle: number };
}

/** Human-model parameters by Elo (800 … 2000). */
export function humanParams(elo: number, style?: BotProfile['style']): HumanParams {
  const t = clamp((elo - 800) / 1200, 0, 1);
  const aggressive = style === 'aggressive' || style === 'tactical' || style === 'gambit';
  const quiet = style === 'solid' || style === 'positional' || style === 'cautious';
  return {
    depth: clamp(Math.round(lerp(7, 12, t)), 3, 14),
    multiPv: clamp(Math.round(lerp(12, 8, t)), 8, 12),
    movetimeMs: 700,
    temperature: Number((0.06 * Math.pow(0.016 / 0.06, t)).toFixed(4)),
    blindness: Number(lerp(0.2, 0.03, t).toFixed(3)),
    shallowDepth: clamp(Math.round(lerp(2, 5, t)), 1, 6),
    natural: {
      recapture: 1.2,
      check: aggressive ? 0.8 : 0.4,
      capture: aggressive ? 0.5 : 0.3,
      development: quiet ? 0.6 : 0.4,
      castle: quiet ? 0.8 : 0.5,
    },
  };
}

/** Parameters of the strong bots (2100–2500): Stockfish UCI_LimitStrength + UCI_Elo. */
export interface EloParams {
  /** `UCI_Elo` (clamped to the engine's range by the engine service). */
  uciElo: number;
  movetimeMs: number;
  /** Depth cap. */
  depth: number;
}

/**
 * Offset from the bot's (human-scale) Elo to Stockfish's `UCI_Elo`. Stockfish's limiter is anchored to engine
 * rating lists at longer time controls; with ≤ 1 s per move it plays clearly below its nominal value, so the strong
 * bots ask for more (measured by the calibration: the 2200 bot must lose less than the 2000 bot).
 */
export const UCI_ELO_OFFSET = 400;

/** Elo-bot parameters. */
export function eloParams(elo: number): EloParams {
  return { uciElo: Math.round(elo + UCI_ELO_OFFSET), movetimeMs: 800, depth: 20 };
}
