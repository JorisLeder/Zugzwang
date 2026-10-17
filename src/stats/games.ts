/**
 * Statistics from stored game analyses (PRD Fortschritt §5): accuracy per game phase and the most frequent mistake
 * types (classification counts and the engine-confirmed motifs behind mistakes, misses and blunders).
 *
 * Only the user's moves count: in bot games the user's colour is known (`game.userColor`); for imported games it is
 * unknown, so both sides count (as in the analysis hub).
 */
import type { GameAnalysis, GamePhase, MoveClassification } from '@/core/analysis';
import type { Color } from '@/core/chess';
import type { MotifId } from '@/core/explain';
import type { Game } from '@/core/games';

/** An analysis with its game (the game decides whose moves count). `game` may be missing for orphaned analyses. */
export interface AnalysedGame {
  analysis: GameAnalysis;
  game: Pick<Game, 'source' | 'userColor'> | null;
}

/** Phases in game order. */
export const GAME_PHASES: readonly GamePhase[] = ['opening', 'middlegame', 'endgame'];

/** Classifications that count as mistakes (the ones the analysis stores engine facts for). */
export const MISTAKE_CLASSES: readonly MoveClassification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

/** Classifications whose facts name the motif behind the mistake. */
const MOTIF_CLASSES: ReadonlySet<MoveClassification> = new Set(['mistake', 'miss', 'blunder']);

/** Colours whose moves belong to the user. */
export function userColors(game: AnalysedGame['game']): Color[] {
  if (game && game.source === 'bot' && game.userColor) return [game.userColor];
  return ['w', 'b'];
}

/** Accuracy of one phase. */
export interface PhaseAccuracy {
  phase: GamePhase;
  /** User moves analysed in this phase. */
  moves: number;
  /** Mean move accuracy 0–100, `null` without moves. */
  accuracy: number | null;
  /** Games with at least one user move in this phase. */
  games: number;
}

/** Mean move accuracy of the user per phase (opening, middlegame, endgame – always all three, in order). */
export function phaseAccuracy(games: readonly AnalysedGame[]): PhaseAccuracy[] {
  const acc = new Map<GamePhase, { sum: number; moves: number; games: number }>(GAME_PHASES.map((p) => [p, { sum: 0, moves: 0, games: 0 }]));
  for (const { analysis, game } of games) {
    const colors = userColors(game);
    const seen = new Set<GamePhase>();
    for (const m of analysis.moves) {
      if (!colors.includes(m.color) || !Number.isFinite(m.accuracy)) continue;
      const bucket = acc.get(m.phase);
      if (!bucket) continue;
      bucket.sum += Math.max(0, Math.min(100, m.accuracy));
      bucket.moves += 1;
      seen.add(m.phase);
    }
    for (const p of seen) acc.get(p)!.games += 1;
  }
  return GAME_PHASES.map((phase) => {
    const b = acc.get(phase)!;
    return { phase, moves: b.moves, accuracy: b.moves > 0 ? b.sum / b.moves : null, games: b.games };
  });
}

/** Count of one mistake classification. */
export interface ClassificationCount {
  classification: MoveClassification;
  count: number;
}

/** User moves per mistake classification (Ungenauigkeit, Fehler, Verpasst, Patzer – in that order). */
export function mistakeCounts(games: readonly AnalysedGame[]): ClassificationCount[] {
  const counts = new Map<MoveClassification, number>(MISTAKE_CLASSES.map((c) => [c, 0]));
  for (const { analysis, game } of games) {
    const colors = userColors(game);
    for (const m of analysis.moves) {
      if (colors.includes(m.color) && counts.has(m.classification)) counts.set(m.classification, counts.get(m.classification)! + 1);
    }
  }
  return MISTAKE_CLASSES.map((classification) => ({ classification, count: counts.get(classification)! }));
}

/** How often a motif was behind a mistake. */
export interface MotifCount {
  motif: MotifId;
  /** Mistakes, misses and blunders with this motif in their facts. */
  count: number;
  /** Most recent analysis (ISO) where the motif occurred – breaks ties (more recent first). */
  lastAt: string;
}

/**
 * Most frequent motifs behind the user's mistakes, misses and blunders (each motif counted once per move), most
 * frequent first; ties: the more recent one first, then by id.
 */
export function mistakeMotifs(games: readonly AnalysedGame[]): MotifCount[] {
  const counts = new Map<MotifId, MotifCount>();
  for (const { analysis, game } of games) {
    const colors = userColors(game);
    for (const m of analysis.moves) {
      if (!colors.includes(m.color) || !MOTIF_CLASSES.has(m.classification) || !m.facts) continue;
      for (const motif of new Set(m.facts.motifs.map((x) => x.id))) {
        const c = counts.get(motif) ?? { motif, count: 0, lastAt: '' };
        c.count += 1;
        if (analysis.createdAt > c.lastAt) c.lastAt = analysis.createdAt;
        counts.set(motif, c);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.motif.localeCompare(b.motif));
}

/** Pairs analyses with their games by id (games missing from the list give `game: null`). */
export function pairAnalyses(analyses: readonly GameAnalysis[], games: readonly Game[]): AnalysedGame[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  return analyses.map((analysis) => ({ analysis, game: byId.get(analysis.gameId) ?? null }));
}
