/**
 * Weakness profile (PRD Fortschritt §5 "Schwächenprofil"): weak puzzle themes, weak game phases and the motifs behind
 * the user's mistakes, combined into one object for the dashboard and the statistics page.
 */
import type { GamePhase } from '@/core/analysis';
import type { MotifId } from '@/core/explain';
import type { ThemeStat } from '@/core/profile';
import type { PuzzleThemeId } from '@/core/puzzles';
import { mistakeMotifs, phaseAccuracy, type AnalysedGame, type MotifCount, type PhaseAccuracy } from './games';
import { weakThemes, type ThemeSuccess } from './themes';

/** A phase needs this many analysed user moves before it can count as weak. */
export const WEAK_PHASE_MIN_MOVES = 10;

/** A phase below this mean accuracy (0–100) is weak. */
export const WEAK_PHASE_MAX_ACCURACY = 70;

/**
 * Puzzle theme that trains a motif detected in game analyses (`null` when no trainable theme fits – e.g. a missed
 * win or a stalemate trap).
 */
export const MOTIF_THEME: Record<MotifId, PuzzleThemeId | null> = {
  hanging_piece: 'hangingPiece',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discovered_attack: 'discoveredAttack',
  double_check: 'doubleCheck',
  mate_threat: 'mateIn2',
  mate: 'mateIn1',
  back_rank: 'backRankMate',
  material_loss: 'hangingPiece',
  missed_win: null,
  trapped_piece: 'trappedPiece',
  promotion: 'promotion',
  stalemate_trap: null,
};

/** Weak phase with its accuracy. */
export interface WeakPhase extends PhaseAccuracy {
  phase: GamePhase;
  accuracy: number;
}

/** The weakness profile. */
export interface WeaknessProfile {
  /** Weak puzzle themes, weakest first. */
  themes: ThemeSuccess[];
  /** Weak phases, weakest first. */
  phases: WeakPhase[];
  /** Motifs behind the user's mistakes in analysed games, most frequent first. */
  motifs: MotifCount[];
  /** Nothing to report yet (no weak theme, phase or motif). */
  empty: boolean;
}

/** Input of `weaknessProfile`. */
export interface WeaknessInput {
  themeStats: readonly ThemeStat[];
  games: readonly AnalysedGame[];
}

/** Weak phases: enough moves and a mean accuracy below the threshold, weakest first. */
export function weakPhases(games: readonly AnalysedGame[]): WeakPhase[] {
  return phaseAccuracy(games)
    .filter((p): p is WeakPhase => p.accuracy !== null && p.moves >= WEAK_PHASE_MIN_MOVES && p.accuracy < WEAK_PHASE_MAX_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy);
}

/** Builds the weakness profile. */
export function weaknessProfile(input: WeaknessInput): WeaknessProfile {
  const themes = weakThemes(input.themeStats);
  const phases = weakPhases(input.games);
  const motifs = mistakeMotifs(input.games);
  return { themes, phases, motifs, empty: themes.length === 0 && phases.length === 0 && motifs.length === 0 };
}
