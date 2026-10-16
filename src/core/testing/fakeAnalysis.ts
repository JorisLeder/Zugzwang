/**
 * `FakeAnalysisService` – deterministic `AnalysisService` double. By default every move is the engine's best move
 * (cp 0, classification `best`); individual moves, assessments and threats can be scripted.
 */
import { ChessGame, positionKey, uciLineToSan, uciToSan } from '@/lib/chess';
import type {
  AnalyseGameInput,
  AnalysedMove,
  AnalysisProgress,
  AnalysisService,
  GameAnalysis,
  MoveAssessment,
  MoveClassification,
  ThreatInfo,
} from '../analysis';
import { MOVE_CLASSIFICATIONS } from '../analysis';
import type { Color, Fen, Uci } from '../chess';
import type { Score } from '../engine';
import type { ExplanationFacts } from '../explain';
import { FIXTURE_GAME } from './fixtures';

/** Key for scripted moves: `${positionKey(fenBefore)}|${uci}`. */
export function moveKey(fenBefore: Fen, uci: Uci): string {
  return `${positionKey(fenBefore)}|${uci}`;
}

/** Options of `FakeAnalysisService`. */
export interface FakeAnalysisOptions {
  engineId?: string;
  engineVersion?: string;
  /** Overrides for analysed moves, keyed by `moveKey(fenBefore, uci)`. */
  moves?: Record<string, Partial<AnalysedMove>>;
  /** Assessments for `assessMove`, keyed by `moveKey(fenBefore, uci)`. */
  assessments?: Record<string, Partial<MoveAssessment>>;
  /** Threats for `findThreats`, keyed by position key. */
  threats?: Record<string, ThreatInfo | null>;
  /** Delay per analysed move in ms (to test progress UI). */
  delayPerMoveMs?: number;
}

/** Lichess win percentage (White POV input cp) – fake only; the real formula lives in WP-02. */
function winPctWhite(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

const BAD: MoveClassification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

function emptyCounts(): Record<Color, Record<MoveClassification, number>> {
  const zero = () => Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<MoveClassification, number>;
  return { w: zero(), b: zero() };
}

/** Script that marks the known blunder of `FIXTURE_GAME` (14.Qc2??, best 14.Rxf2). */
export const FIXTURE_GAME_ANALYSIS_SCRIPT: Record<string, Partial<AnalysedMove>> = {
  [moveKey(FIXTURE_GAME.blunder.fenBefore, FIXTURE_GAME.blunder.uci)]: {
    classification: 'blunder',
    evalBefore: FIXTURE_GAME.blunder.evalBefore,
    evalAfter: FIXTURE_GAME.blunder.evalAfter,
    bestMove: FIXTURE_GAME.blunder.bestMove,
    bestMoveSan: FIXTURE_GAME.blunder.bestMoveSan,
    bestLine: [FIXTURE_GAME.blunder.bestMove],
    expectedPointsLoss: FIXTURE_GAME.blunder.expectedPointsLoss,
    accuracy: 8,
  },
};

/** Deterministic fake of the analysis pipeline. */
export class FakeAnalysisService implements AnalysisService {
  /** Positions passed to `prepare`. */
  readonly prepared: Fen[] = [];
  private readonly opts: FakeAnalysisOptions;

  constructor(opts: FakeAnalysisOptions = {}) {
    this.opts = opts;
  }

  prepare(fen: Fen): void {
    this.prepared.push(fen);
  }

  async analyseGame(
    input: AnalyseGameInput,
    callOpts: { onProgress?: (p: AnalysisProgress) => void; signal?: AbortSignal } = {},
  ): Promise<GameAnalysis> {
    const game = ChessGame.fromFen(input.startFen);
    const moves: AnalysedMove[] = [];
    const total = input.moves.length;
    const counts = emptyCounts();
    const evalGraph: GameAnalysis['evalGraph'] = [{ ply: 0, winPctWhite: 50 }];
    callOpts.onProgress?.({ done: 0, total, phase: 'engine' });
    for (const uci of input.moves) {
      if (callOpts.signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
      if (this.opts.delayPerMoveMs) await new Promise((r) => setTimeout(r, this.opts.delayPerMoveMs));
      const rec = game.move(uci);
      if (!rec) throw new Error(`Illegal move in analysis input: ${uci}`);
      const override = this.opts.moves?.[moveKey(rec.fenBefore, uci)] ?? {};
      const evalBefore: Score = override.evalBefore ?? { type: 'cp', value: 0 };
      const evalAfter: Score = override.evalAfter ?? evalBefore;
      const moverWin = (s: Score) => (rec.color === 'w' ? winPctWhite(s) : 100 - winPctWhite(s));
      const bestMove = override.bestMove ?? uci;
      const analysed: AnalysedMove = {
        ply: rec.ply,
        color: rec.color,
        san: rec.san,
        uci,
        fenBefore: rec.fenBefore,
        fenAfter: rec.fenAfter,
        evalBefore,
        evalAfter,
        bestMove,
        bestMoveSan: override.bestMoveSan ?? uciToSan(rec.fenBefore, bestMove),
        bestLine: override.bestLine ?? [bestMove],
        playedLine: override.playedLine ?? [uci],
        winPctBefore: moverWin(evalBefore),
        winPctAfter: moverWin(evalAfter),
        expectedPointsLoss: override.expectedPointsLoss ?? 0,
        accuracy: override.accuracy ?? 100,
        classification: override.classification ?? 'best',
        phase: override.phase ?? (rec.ply <= 20 ? 'opening' : rec.ply <= 60 ? 'middlegame' : 'endgame'),
      };
      if (BAD.includes(analysed.classification) && analysed.classification !== 'inaccuracy') {
        analysed.facts = override.facts ?? {
          kind: 'mistake',
          mover: rec.color,
          fenBefore: rec.fenBefore,
          playedMove: { uci, san: rec.san },
          ...(analysed.bestMoveSan ? { bestMove: { uci: bestMove, san: analysed.bestMoveSan } } : {}),
          bestLine: uciLineToSan(rec.fenBefore, analysed.bestLine),
          refutation: [],
          expectedPointsLoss: analysed.expectedPointsLoss,
          motifs: [],
        };
      }
      if (override.explanation) analysed.explanation = override.explanation;
      moves.push(analysed);
      counts[rec.color][analysed.classification] += 1;
      evalGraph.push({ ply: rec.ply, winPctWhite: winPctWhite(evalAfter) });
      callOpts.onProgress?.({ done: moves.length, total, phase: 'engine' });
    }
    const acc = (c: Color) => {
      const own = moves.filter((m) => m.color === c);
      return own.length ? own.reduce((s, m) => s + m.accuracy, 0) / own.length : 100;
    };
    const keyMoments = [...moves]
      .filter((m) => m.expectedPointsLoss >= 0.1 || BAD.slice(1).includes(m.classification))
      .sort((a, b) => b.expectedPointsLoss - a.expectedPointsLoss)
      .slice(0, 5)
      .map((m) => m.ply)
      .sort((a, b) => a - b);
    return {
      gameId: input.gameId,
      engineId: this.opts.engineId ?? 'fake-engine',
      engineVersion: this.opts.engineVersion ?? 'fake-1',
      depth: 10,
      createdAt: new Date().toISOString(),
      accuracy: { w: acc('w'), b: acc('b') },
      counts,
      moves,
      keyMoments,
      evalGraph,
    };
  }

  async assessMove(fenBefore: Fen, move: Uci, callOpts: { signal?: AbortSignal } = {}): Promise<MoveAssessment> {
    if (callOpts.signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
    const override = this.opts.assessments?.[moveKey(fenBefore, move)] ?? {};
    const san = uciToSan(fenBefore, move);
    if (!san) throw new Error(`Illegal move: ${move}`);
    const bestMove = override.bestMove ?? move;
    const bestSan = bestMove ? uciToSan(fenBefore, bestMove) : null;
    const facts: ExplanationFacts = override.facts ?? {
      kind: 'coach_warning',
      mover: fenBefore.split(' ')[1] === 'b' ? 'b' : 'w',
      fenBefore,
      playedMove: { uci: move, san },
      ...(bestMove && bestSan ? { bestMove: { uci: bestMove, san: bestSan } } : {}),
      bestLine: bestSan ? [bestSan] : [],
      refutation: [],
      expectedPointsLoss: override.expectedPointsLoss ?? 0,
      motifs: [],
    };
    return {
      expectedPointsLoss: override.expectedPointsLoss ?? 0,
      classification: override.classification ?? 'best',
      bestMove,
      bestLine: override.bestLine ?? (bestMove ? [bestMove] : []),
      playedLine: override.playedLine ?? [move],
      evalBefore: override.evalBefore ?? { type: 'cp', value: 0 },
      evalAfter: override.evalAfter ?? { type: 'cp', value: 0 },
      facts,
    };
  }

  async findThreats(fen: Fen, callOpts: { signal?: AbortSignal } = {}): Promise<ThreatInfo | null> {
    if (callOpts.signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
    return this.opts.threats?.[positionKey(fen)] ?? null;
  }
}
