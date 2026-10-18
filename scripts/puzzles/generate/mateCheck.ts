/**
 * Mate check of the generator: a stricter test of forced-mate lines than the MultiPV-2 checks of the game workers.
 *
 * At depth 18 with MultiPV 2 Stockfish often reports an equally fast alternative mate only with a warm hash (the
 * validator, whose engine keeps its hash between puzzles, found such alternatives in 4 of the first 1130 generated
 * puzzles). With MultiPV 4 every searched alternative gets its own full search, which proves those mates reliably.
 * So every generated puzzle with a forced mate in ≥ 2 is checked at each solver ply that is not itself checkmate:
 * the solution move must be among the top lines, be the fastest mate and no other move may mate as fast. The hash is
 * cleared before every search (deterministic); verdicts are cached per line in `.cache/puzzles-generate/mate-check/`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Color, Fen, Uci } from '@/core/chess';
import type { EngineService } from '@/core/engine';
import { replayLine, solverMateIn } from '../lib/puzzleChecks';
import { createGeneratorEngine } from './engine';
import type { GameResult, RawPuzzle } from './selfplay';

/** Search settings of the mate check (part of the cache key). */
export const MATE_CHECK = { version: 'mate-check-1', depth: 18, multiPv: 4 } as const;

/** Rejection reason counted in the run statistics. */
export const MATE_CHECK_REJECT = 'mate_alternative';

/** Verdict for one line: `null` = passed, otherwise the reason. */
export type MateVerdict = string | null;

/** Whether a raw puzzle needs the mate check (forced mate in 2 or more). */
export function needsMateCheck(p: Pick<RawPuzzle, 'mateIn'>): boolean {
  return p.mateIn !== null && p.mateIn >= 2;
}

/** Checks the solver plies of a mate line (see the file header). */
export async function checkMateLine(engine: EngineService, fen: Fen, moves: readonly Uci[]): Promise<MateVerdict> {
  const { records, illegalAt } = replayLine(fen, moves);
  if (illegalAt !== null) return 'illegal line';
  const solver: Color = records[0]!.color === 'w' ? 'b' : 'w';
  for (let ply = 1; ply < records.length; ply += 2) {
    const rec = records[ply]!;
    if (rec.isCheckmate) continue; // any mating move is accepted at runtime
    const { lines } = await engine.analyse(rec.fenBefore, { depth: MATE_CHECK.depth, multiPv: MATE_CHECK.multiPv });
    const mates = lines.map((l) => ({ move: l.pv[0], mateIn: solverMateIn(l, solver) })).filter((m): m is { move: Uci; mateIn: number } => m.mateIn !== null && m.move !== undefined);
    if (mates.length === 0) return `ply ${ply}: no forced mate`;
    const fastest = Math.min(...mates.map((m) => m.mateIn));
    const own = mates.find((m) => m.move === rec.uci);
    if (!own || own.mateIn !== fastest) return `ply ${ply}: ${mates.find((m) => m.mateIn === fastest)!.move} mates faster (in ${fastest})`;
    const other = mates.find((m) => m.move !== rec.uci && m.mateIn === fastest);
    if (other) return `ply ${ply}: ${other.move} also mates in ${fastest}`;
  }
  return null;
}

/** Cache key of a line. */
export function mateCheckKey(fen: Fen, moves: readonly Uci[]): string {
  return createHash('sha256').update(JSON.stringify({ v: MATE_CHECK, fen, moves })).digest('hex').slice(0, 24);
}

/** Mate checker of a run: filters the mate lines of game results (call `refine` in game order; one engine). */
export function createMateChecker(cacheDir: string | null) {
  const engine = createGeneratorEngine('perSearch');
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const verdict = async (p: RawPuzzle): Promise<MateVerdict> => {
    const file = cacheDir ? join(cacheDir, `${mateCheckKey(p.fen, p.moves)}.json`) : null;
    if (file && existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { verdict: MateVerdict }).verdict;
    const v = await checkMateLine(engine.service, p.fen, p.moves);
    if (file) writeFileSync(file, JSON.stringify({ verdict: v }));
    return v;
  };
  return {
    /** The result without the mate lines that fail the check (counted as `mate_alternative`). */
    async refine(result: GameResult): Promise<GameResult> {
      const puzzles: RawPuzzle[] = [];
      let rejected = 0;
      for (const p of result.puzzles) {
        if (needsMateCheck(p) && (await verdict(p)) !== null) rejected++;
        else puzzles.push(p);
      }
      if (rejected === 0) return result;
      const stats = { ...result.stats, rejected: { ...result.stats.rejected, [MATE_CHECK_REJECT]: (result.stats.rejected[MATE_CHECK_REJECT] ?? 0) + rejected } };
      return { ...result, puzzles, stats };
    },
    dispose() {
      engine.dispose();
    },
  };
}
