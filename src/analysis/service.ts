/**
 * `AnalysisService` implementation (WP-02): game review pipeline, coach assessment and threat detection on top of
 * any `EngineService` (browser worker, Node engine, fakes). Runs in Node too – no browser APIs at module level.
 *
 * Game review (`analyseGame`, PRD "Analyse-Pipeline"):
 * 1. replay the moves with `@/lib/chess` (positions, legal-move counts, FIDE game end);
 * 2. book check against the Lichess opening data (D-07: book while every move so far reached a book position);
 * 3. one engine search per position (MultiPV 2), optionally Lichess cloud-eval first. The searches are
 *    **time-bounded**: the engine phase gets `gameTimeBudgetMs` (default 22 s) shared out over the positions, with
 *    the target depth (default 16, or the device budget) as the upper limit – a 40-move game stays ≤ 30 s and weak
 *    devices search less deep instead of taking longer (PRD Randfall 3). Positions that only precede book moves get a
 *    short search;
 * 4. win% / expected-points loss / accuracy / classification per move (D-07, D-08), game accuracy per side (Lichess),
 *    counts, eval graph, key moments (the ≤ 5 largest losses ≥ 0.10), phase per ply (Lichess Divider);
 * 5. engine-confirmed `facts` for every mistake, miss and blunder.
 * Progress is reported after every position; `signal` aborts (`AbortError`).
 *
 * Coach (D-41): `prepare(fen)` searches the position in the background (LRU cache by position, superseded by the
 * next `prepare`); `assessMove` reuses that result (a still running `prepare` of the same position is stopped and its
 * partial result used) and only searches the position after the move (shallow); `findThreats` analyses the null-move
 * position and resolves `null` when a following `assessMove` supersedes it.
 */
import type {
  AnalyseGameInput,
  AnalysedMove,
  AnalysisProgress,
  AnalysisService,
  GameAnalysis,
  MoveAssessment,
  MoveClassification,
  ThreatInfo,
} from '@/core/analysis';
import { MOVE_CLASSIFICATIONS } from '@/core/analysis';
import type { Color, Fen, GameStatus, MoveRecord, Uci } from '@/core/chess';
import type { EngineAnalysis, EngineLine, EngineService, Score } from '@/core/engine';
import type { ExplanationFacts } from '@/core/explain';
import { getEngineBudget, type CloudEvalProvider } from '@/engine';
import { ChessGame, nullMoveFen, positionKey, uciToSan } from '@/lib/chess';
import { gameAccuracy, moveAccuracy } from './accuracy';
import { classifyMove, isRecapture, sacrificeSee, CLASSIFICATION_THRESHOLDS } from './classify';
import { buildFacts } from './facts';
import { materialSwing } from './motifs';
import { loadOpeningBook, type OpeningBook, type OpeningInfo } from './openings';
import { gamePhases } from './phase';
import { expectedPointsLoss, scoreWinPercent } from './winPercent';

/** Bump when the pipeline changes – stored in `engineVersion`, a different value triggers re-analysis. */
export const ANALYSIS_VERSION = 1;

/** Depth/movetime of one kind of search. */
export interface SearchLimits {
  depth: number;
  movetimeMs: number;
}

/** Tuning of the analysis service (defaults in `DEFAULT_ANALYSIS_OPTIONS`). */
export interface AnalysisServiceOptions {
  /** Target depth of the game review (default: the engine's device budget, else 16). */
  depth?: number;
  /** Time budget of the engine phase of `analyseGame` in ms. */
  gameTimeBudgetMs: number;
  /** Bounds of the movetime per position in `analyseGame`. */
  minMovetimeMs: number;
  maxMovetimeMs: number;
  /** Search of positions that only precede book moves. */
  book: SearchLimits;
  /** MultiPV of the game review (PRD: two lines). */
  multiPv: number;
  /** Background search of `prepare`. */
  prepare: SearchLimits;
  /** Search of the position before the move when `assessMove` has no prepared result (cold). */
  assessBefore: SearchLimits;
  /** Search of the position after the move in `assessMove`. */
  assessAfter: SearchLimits;
  /** Search of the null-move position in `findThreats`. */
  threats: SearchLimits;
  /** LRU size of the prepared positions. */
  cacheSize: number;
  /** Optional Lichess cloud-eval provider (used by `analyseGame` only). */
  cloudEval: CloudEvalProvider | null;
  /** Opening book loader (tests can inject a small book). */
  loadBook: () => Promise<OpeningBook>;
  /** Clock in ms. */
  now: () => number;
}

/** Defaults: 22 s engine budget for a game review, coach searches sized for ≤ 500 ms / ≤ 1 s (D-41). */
export const DEFAULT_ANALYSIS_OPTIONS: AnalysisServiceOptions = {
  gameTimeBudgetMs: 22_000,
  minMovetimeMs: 80,
  maxMovetimeMs: 2_000,
  book: { depth: 10, movetimeMs: 60 },
  multiPv: 2,
  prepare: { depth: 16, movetimeMs: 800 },
  assessBefore: { depth: 14, movetimeMs: 450 },
  assessAfter: { depth: 12, movetimeMs: 300 },
  threats: { depth: 12, movetimeMs: 300 },
  cacheSize: 64,
  cloudEval: null,
  loadBook: loadOpeningBook,
  now: () => performance.now(),
};

/** Default target depth when the engine has no device budget (Node). */
export const DEFAULT_GAME_DEPTH = 16;

/** Evaluation of one position. */
interface PositionEval {
  /** White POV. */
  score: Score;
  lines: EngineLine[];
  bestMove: Uci | null;
}

interface PreparedEntry {
  key: string;
  controller: AbortController;
  promise: Promise<EngineAnalysis | null>;
  result?: EngineAnalysis;
  /** The engine is searching this position (an `onUpdate` arrived). */
  started: boolean;
  /** Stopped early by `assessMove` – the result may be shallow. */
  stopped: boolean;
}

function abortError(): DOMException {
  return new DOMException('The analysis was aborted.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

function turnOf(fen: Fen): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Evaluation of a position where the game is over (no search): checkmate = mate 0, any draw = 0.00. */
function terminalEval(status: GameStatus): PositionEval {
  if (status.reason === 'checkmate') return { score: { type: 'mate', value: 0 }, lines: [], bestMove: null };
  return { score: { type: 'cp', value: 0 }, lines: [], bestMove: null };
}

function fromAnalysis(a: EngineAnalysis): PositionEval {
  const first = a.lines[0];
  return { score: first?.score ?? { type: 'cp', value: 0 }, lines: a.lines, bestMove: a.bestMove ?? first?.pv[0] ?? null };
}

function emptyCounts(): Record<Color, Record<MoveClassification, number>> {
  const zero = () => Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<MoveClassification, number>;
  return { w: zero(), b: zero() };
}

function combineSignals(...signals: Array<AbortSignal | undefined>): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) controller.abort();
    const onAbort = () => controller.abort();
    s.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => s.removeEventListener('abort', onAbort));
  }
  return { signal: controller.signal, dispose: () => cleanups.forEach((c) => c()) };
}

/** Key moments: the ≤ 5 largest expected-points losses ≥ 0.10, in game order. */
export function keyMoments(moves: ReadonlyArray<Pick<AnalysedMove, 'ply' | 'expectedPointsLoss'>>): number[] {
  return moves
    .filter((m) => m.expectedPointsLoss >= 0.1)
    .sort((a, b) => b.expectedPointsLoss - a.expectedPointsLoss || a.ply - b.ply)
    .slice(0, 5)
    .map((m) => m.ply)
    .sort((a, b) => a - b);
}

/** Inputs for the per-move numbers shared by `analyseGame` and `assessMove`. */
interface MoveNumbersInput {
  fenBefore: Fen;
  rec: MoveRecord;
  before: PositionEval;
  after: PositionEval;
  legalMoveCount: number;
  previous?: { rec: MoveRecord; classification: MoveClassification; winPctBefore: number };
  inBook?: boolean;
}

function moveNumbers(i: MoveNumbersInput) {
  const mover = i.rec.color;
  const winPctBefore = scoreWinPercent(i.before.score, mover, mover);
  const winPctAfter = scoreWinPercent(i.after.score, mover, other(mover));
  const bestMove = i.before.bestMove ?? i.before.lines[0]?.pv[0] ?? null;
  const isBestMove = bestMove === i.rec.uci;
  const loss = isBestMove ? 0 : expectedPointsLoss(winPctBefore, winPctAfter);
  const second = i.before.lines.find((l) => l.multipv === 2);
  const secondBestGap = second ? (winPctBefore - scoreWinPercent(second.score, mover, mover)) / 100 : undefined;
  const onlyLegalMove = i.legalMoveCount === 1;
  const recapture = isRecapture(i.previous?.rec, i.rec);
  const t = CLASSIFICATION_THRESHOLDS;
  // SEE only where the other brilliant conditions already hold (it is the expensive part).
  const sacrifice =
    loss <= t.nearBest && winPctAfter >= t.brilliantAfterMin && winPctBefore < t.brilliantBeforeMax && !onlyLegalMove && !recapture
      ? sacrificeSee(i.fenBefore, i.rec.uci)
      : undefined;
  const classification = classifyMove({
    loss,
    isBestMove,
    inBook: i.inBook ?? false,
    winPctBefore,
    winPctAfter,
    ...(secondBestGap !== undefined ? { secondBestGap } : {}),
    onlyLegalMove,
    isRecapture: recapture,
    ...(sacrifice !== undefined ? { sacrificeSee: sacrifice } : {}),
    ...(i.previous
      ? {
          previousClassification: i.previous.classification,
          recoverable: (winPctBefore - (100 - i.previous.winPctBefore)) / 100,
        }
      : {}),
  });
  return { winPctBefore, winPctAfter, bestMove, loss, classification, accuracy: moveAccuracy(winPctBefore, winPctAfter) };
}

class EngineAnalysisService implements AnalysisService {
  private readonly cache = new Map<string, PreparedEntry>();
  private readonly threatControllers = new Set<AbortController>();

  constructor(
    private readonly engine: EngineService,
    private readonly opts: AnalysisServiceOptions,
  ) {}

  // ------------------------------------------------------------------------------------------------- prepare cache

  private touch(entry: PreparedEntry): void {
    this.cache.delete(entry.key);
    this.cache.set(entry.key, entry);
    while (this.cache.size > this.opts.cacheSize) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const e = this.cache.get(oldest);
      if (e && !e.result) e.controller.abort();
      this.cache.delete(oldest);
    }
  }

  /** Aborts running `prepare` searches of other positions (they are superseded). */
  private abortOtherPrepares(key: string | null): void {
    for (const e of [...this.cache.values()]) {
      if (e.key !== key && !e.result) {
        e.controller.abort();
        this.cache.delete(e.key);
      }
    }
  }

  private abortThreatSearches(): void {
    for (const c of this.threatControllers) c.abort();
    this.threatControllers.clear();
  }

  prepare(fen: Fen): void {
    let key: string;
    try {
      const game = ChessGame.fromFen(fen);
      if (game.status().isOver) return;
      key = positionKey(game.fen());
    } catch {
      return;
    }
    this.abortOtherPrepares(key);
    const existing = this.cache.get(key);
    if (existing && !(existing.result && existing.stopped)) {
      this.touch(existing);
      return;
    }
    const controller = new AbortController();
    const entry: PreparedEntry = { key, controller, promise: Promise.resolve(null), started: false, stopped: false };
    entry.promise = this.engine
      .analyse(fen, {
        multiPv: this.opts.multiPv,
        depth: this.opts.prepare.depth,
        movetimeMs: this.opts.prepare.movetimeMs,
        signal: controller.signal,
        onUpdate: () => {
          entry.started = true;
        },
      })
      .then((r) => {
        entry.result = r;
        return r;
      })
      .catch(() => {
        if (this.cache.get(key) === entry) this.cache.delete(key);
        return null;
      });
    this.touch(entry);
  }

  /** Analysis of the position before a move: prepared result, a stopped in-flight `prepare`, or a cold search. */
  private async positionBefore(fen: Fen, signal: AbortSignal | undefined): Promise<EngineAnalysis> {
    const key = positionKey(ChessGame.fromFen(fen).fen());
    this.abortOtherPrepares(key);
    const entry = this.cache.get(key);
    if (entry?.result && entry.result.lines.length > 0) {
      this.touch(entry);
      return entry.result;
    }
    if (entry && !entry.result) {
      if (entry.started) {
        entry.stopped = true;
        await this.engine.stop();
        const r = await entry.promise;
        if (r && r.lines.length > 0) return r;
      } else {
        entry.controller.abort();
        this.cache.delete(key);
      }
    }
    throwIfAborted(signal);
    const r = await this.engine.analyse(fen, {
      multiPv: this.opts.multiPv,
      depth: this.opts.assessBefore.depth,
      movetimeMs: this.opts.assessBefore.movetimeMs,
      signal,
    });
    const stored: PreparedEntry = { key, controller: new AbortController(), promise: Promise.resolve(r), result: r, started: true, stopped: false };
    this.touch(stored);
    return r;
  }

  // ----------------------------------------------------------------------------------------------------- assessMove

  async assessMove(fenBefore: Fen, move: Uci, callOpts: { signal?: AbortSignal } = {}): Promise<MoveAssessment> {
    const { signal } = callOpts;
    throwIfAborted(signal);
    const game = ChessGame.fromFen(fenBefore);
    const legalMoveCount = game.legalMoves().length;
    const rec = game.move(move);
    if (!rec) throw new Error(`Illegal move in assessMove: ${move}`);
    const statusAfter = game.status();
    this.abortThreatSearches();
    const beforeAnalysis = await this.positionBefore(fenBefore, signal);
    const before = fromAnalysis(beforeAnalysis);
    const after = statusAfter.isOver
      ? terminalEval(statusAfter)
      : fromAnalysis(
          await this.engine.analyse(rec.fenAfter, {
            depth: this.opts.assessAfter.depth,
            movetimeMs: this.opts.assessAfter.movetimeMs,
            signal,
          }),
        );
    const n = moveNumbers({ fenBefore: rec.fenBefore, rec, before, after, legalMoveCount });
    const kind: ExplanationFacts['kind'] = ['brilliant', 'great', 'best'].includes(n.classification) ? 'praise' : 'coach_warning';
    const bestLine = before.lines[0]?.pv ?? (n.bestMove ? [n.bestMove] : []);
    const refutation = after.lines[0]?.pv ?? [];
    return {
      expectedPointsLoss: n.loss,
      classification: n.classification,
      bestMove: n.bestMove,
      bestLine,
      playedLine: [move, ...refutation],
      evalBefore: before.score,
      evalAfter: after.score,
      facts: this.safeFacts(kind, {
        fenBefore: rec.fenBefore,
        playedMove: move,
        bestLine,
        bestScore: before.score,
        refutation,
        refutationScore: after.score,
        expectedPointsLoss: n.loss,
      }),
    };
  }

  private safeFacts(kind: ExplanationFacts['kind'], input: Parameters<typeof buildFacts>[1]): ExplanationFacts {
    try {
      return buildFacts(kind, input);
    } catch {
      return { kind, mover: turnOf(input.fenBefore), fenBefore: input.fenBefore, bestLine: [], refutation: [], motifs: [] };
    }
  }

  // ---------------------------------------------------------------------------------------------------- findThreats

  async findThreats(fen: Fen, callOpts: { signal?: AbortSignal } = {}): Promise<ThreatInfo | null> {
    throwIfAborted(callOpts.signal);
    const nullFen = nullMoveFen(fen);
    if (!nullFen) return null;
    try {
      if (ChessGame.fromFen(nullFen).status().isOver) return null;
    } catch {
      return null;
    }
    const own = new AbortController();
    this.threatControllers.add(own);
    const { signal, dispose } = combineSignals(callOpts.signal, own.signal);
    try {
      const a = await this.engine.analyse(nullFen, {
        depth: this.opts.threats.depth,
        movetimeMs: this.opts.threats.movetimeMs,
        signal,
      });
      const line = a.lines[0];
      if (!line || line.pv.length === 0) return null;
      const threatened = turnOf(fen);
      const threatener = other(threatened);
      const mateIn =
        line.score.type === 'mate' && line.score.value !== 0 && line.score.value > 0 === (threatener === 'w')
          ? Math.abs(line.score.value)
          : undefined;
      const materialGain = materialSwing(nullFen, line.pv, threatener);
      if (mateIn === undefined && materialGain < 2) return null;
      const san = uciToSan(nullFen, line.pv[0]!);
      if (!san) return null;
      const prepared = this.cache.get(positionKey(ChessGame.fromFen(fen).fen()))?.result;
      const defence = prepared?.lines[0];
      const info: ThreatInfo = {
        move: line.pv[0]!,
        san,
        line: line.pv,
        materialGain,
        facts: this.safeFacts('threat', {
          fenBefore: fen,
          ...(defence ? { bestLine: defence.pv, bestScore: defence.score } : {}),
          refutation: line.pv,
          refutationScore: line.score,
        }),
      };
      if (mateIn !== undefined) info.mateIn = mateIn;
      return info;
    } catch (e) {
      // Superseded by `assessMove` (the user moved): no threat to report any more.
      if (own.signal.aborted && !callOpts.signal?.aborted) return null;
      throw e;
    } finally {
      dispose();
      this.threatControllers.delete(own);
    }
  }

  // ---------------------------------------------------------------------------------------------------- analyseGame

  async analyseGame(
    input: AnalyseGameInput,
    callOpts: { onProgress?: (p: AnalysisProgress) => void; signal?: AbortSignal } = {},
  ): Promise<GameAnalysis> {
    const { signal, onProgress } = callOpts;
    throwIfAborted(signal);
    const opts = this.opts;

    // 1. Replay.
    const game = ChessGame.fromFen(input.startFen);
    const records: MoveRecord[] = [];
    const legalCounts: number[] = [];
    const statuses: GameStatus[] = [game.status()];
    input.moves.forEach((uci, i) => {
      legalCounts.push(game.legalMoves().length);
      const rec = game.move(uci);
      if (!rec) throw new Error(`Illegal move ${i + 1} in analysis input: ${uci}`);
      records.push(rec);
      statuses.push(game.status());
    });
    const positions: Fen[] = [game.startFen(), ...records.map((r) => r.fenAfter)];
    const plies = records.length;
    const total = plies + 1;

    // 2. Book.
    onProgress?.({ done: 0, total, phase: 'book' });
    let book: OpeningBook | null = null;
    try {
      book = await opts.loadBook();
    } catch {
      book = null; // without the book data every move is analysed normally
    }
    throwIfAborted(signal);
    const openings: Array<OpeningInfo | null> = records.map((r) => book?.get(r.fenAfter) ?? null);
    const inBook: boolean[] = [];
    let stillInBook = true;
    for (let i = 0; i < plies; i += 1) {
      stillInBook = stillInBook && openings[i] !== null;
      inBook.push(stillInBook);
    }

    // 3. Engine, one search per position.
    await this.engine.init();
    const depth = opts.depth ?? getEngineBudget(this.engine)?.depth ?? DEFAULT_GAME_DEPTH;
    const full = positions.map((_, j) => (j < plies ? !inBook[j] : !(plies > 0 && inBook[plies - 1])));
    const evals: PositionEval[] = [];
    const startedAt = opts.now();
    let useCloud = opts.cloudEval !== null;
    for (let j = 0; j < total; j += 1) {
      throwIfAborted(signal);
      const status = statuses[j]!;
      if (status.isOver) {
        evals.push(terminalEval(status));
      } else {
        let result: EngineAnalysis | null = null;
        if (useCloud && opts.cloudEval) {
          result = await opts.cloudEval.lookup(positions[j]!, { multiPv: opts.multiPv, minDepth: depth, ...(signal ? { signal } : {}) });
          // Cloud evaluations exist mostly for opening positions: stop asking after the first miss.
          if (!result) useCloud = false;
        }
        if (!result) {
          const limits = full[j] ? this.fullLimits(j, full, startedAt, depth) : opts.book;
          result = await this.engine.analyse(positions[j]!, {
            multiPv: opts.multiPv,
            depth: Math.min(depth, limits.depth),
            movetimeMs: limits.movetimeMs,
            ...(signal ? { signal } : {}),
          });
        }
        evals.push(fromAnalysis(result));
      }
      onProgress?.({ done: j + 1, total, phase: 'engine' });
    }

    // 4. Per-move numbers.
    const phases = gamePhases(positions);
    const moves: AnalysedMove[] = [];
    for (let i = 0; i < plies; i += 1) {
      const rec = records[i]!;
      const before = evals[i]!;
      const after = evals[i + 1]!;
      const prev = moves[i - 1];
      const n = moveNumbers({
        fenBefore: positions[i]!,
        rec,
        before,
        after,
        legalMoveCount: legalCounts[i]!,
        inBook: inBook[i]!,
        ...(prev ? { previous: { rec: records[i - 1]!, classification: prev.classification, winPctBefore: prev.winPctBefore } } : {}),
      });
      const bestLine = before.lines[0]?.pv ?? (n.bestMove ? [n.bestMove] : []);
      const analysed: AnalysedMove = {
        ply: rec.ply,
        color: rec.color,
        san: rec.san,
        uci: rec.uci,
        fenBefore: rec.fenBefore,
        fenAfter: rec.fenAfter,
        evalBefore: before.score,
        evalAfter: after.score,
        bestMove: n.bestMove,
        bestMoveSan: n.bestMove ? uciToSan(rec.fenBefore, n.bestMove) : null,
        bestLine,
        playedLine: [rec.uci, ...(after.lines[0]?.pv ?? [])],
        winPctBefore: n.winPctBefore,
        winPctAfter: n.winPctAfter,
        expectedPointsLoss: n.loss,
        accuracy: n.accuracy,
        classification: n.classification,
        phase: phases[i]!,
      };
      const opening = openings[i];
      if (opening) analysed.opening = { eco: opening.eco, name: opening.name };
      moves.push(analysed);
    }

    // 5. Facts for mistakes, misses and blunders.
    const explained = moves.filter((m) => m.classification === 'mistake' || m.classification === 'miss' || m.classification === 'blunder');
    onProgress?.({ done: 0, total: explained.length, phase: 'facts' });
    explained.forEach((m, k) => {
      const i = m.ply - 1;
      m.facts = this.safeFacts('mistake', {
        fenBefore: m.fenBefore,
        playedMove: m.uci,
        bestLine: m.bestLine,
        bestScore: evals[i]!.score,
        refutation: evals[i + 1]!.lines[0]?.pv ?? [],
        refutationScore: evals[i + 1]!.score,
        expectedPointsLoss: m.expectedPointsLoss,
      });
      onProgress?.({ done: k + 1, total: explained.length, phase: 'facts' });
    });

    // 6. Summary.
    const winPctWhite = evals.map((e, j) => scoreWinPercent(e.score, 'w', turnOf(positions[j]!)));
    const counts = emptyCounts();
    for (const m of moves) counts[m.color][m.classification] += 1;
    const startColor = turnOf(positions[0]!);
    const accuracy = gameAccuracy(winPctWhite, startColor) ?? {
      w: this.meanAccuracy(moves, 'w'),
      b: this.meanAccuracy(moves, 'b'),
    };
    return {
      gameId: input.gameId,
      engineId: this.engine.id,
      engineVersion: `${this.engine.id}+zz-analysis-${ANALYSIS_VERSION}`,
      depth,
      createdAt: new Date().toISOString(),
      accuracy,
      counts,
      moves,
      keyMoments: keyMoments(moves),
      evalGraph: winPctWhite.map((w, ply) => ({ ply, winPctWhite: w })),
    };
  }

  private meanAccuracy(moves: AnalysedMove[], color: Color): number {
    const own = moves.filter((m) => m.color === color);
    return own.length ? own.reduce((s, m) => s + m.accuracy, 0) / own.length : 100;
  }

  /** Limits of a full search: the remaining engine budget shared out over the remaining positions. */
  private fullLimits(j: number, full: boolean[], startedAt: number, depth: number): SearchLimits {
    const opts = this.opts;
    let remainingFull = 0;
    let remainingBook = 0;
    for (let k = j; k < full.length; k += 1) {
      if (full[k]) remainingFull += 1;
      else remainingBook += 1;
    }
    const left = opts.gameTimeBudgetMs - (opts.now() - startedAt) - remainingBook * opts.book.movetimeMs;
    const per = Math.floor(left / Math.max(1, remainingFull));
    return { depth, movetimeMs: Math.min(opts.maxMovetimeMs, Math.max(opts.minMovetimeMs, per)) };
  }
}

/**
 * Creates the analysis service with explicit options (bench, tests, WP-10 generator). Missing options use
 * `DEFAULT_ANALYSIS_OPTIONS`.
 */
export function createAnalysisServiceWithOptions(
  engine: EngineService,
  options: Partial<AnalysisServiceOptions> = {},
): AnalysisService {
  return new EngineAnalysisService(engine, { ...DEFAULT_ANALYSIS_OPTIONS, ...options });
}
