/**
 * Engine contracts (BACKLOG 2.6). All scores are from **White's point of view** (D-08); the single conversion point
 * from UCI side-to-move scores is `@/lib/uci`.
 */
import type { Fen, Uci } from './chess';

/**
 * Engine evaluation, White's point of view.
 * - `cp`: centipawns, positive = White is better.
 * - `mate`: moves to mate, `> 0` White mates in n, `< 0` Black mates in n. `0` = the side to move in the analysed
 *   position is already checkmated (the sign cannot carry the winner; look at the FEN's side to move).
 */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number };

/** One principal variation reported by the engine. */
export interface EngineLine {
  /** 1-based MultiPV index (1 = best line). */
  multipv: number;
  /** Search depth of this line. */
  depth: number;
  /** Selective depth, if reported. */
  seldepth?: number;
  /** Evaluation, White POV. */
  score: Score;
  /** Set when the engine reported a lower/upper bound instead of an exact score (aspiration window). */
  bound?: 'lower' | 'upper';
  /** Principal variation in UCI, starting with the move to play. */
  pv: Uci[];
  /** Nodes searched. */
  nodes?: number;
  /** Nodes per second. */
  nps?: number;
  /** Search time in milliseconds. */
  timeMs?: number;
}

/** Options for `EngineService.analyse`. Omitted limits fall back to the service's default budget. */
export interface AnalyseOptions {
  /** Maximum depth. */
  depth?: number;
  /** Number of principal variations (UCI MultiPV), default 1. Restored after the call. */
  multiPv?: number;
  /** Maximum search time in ms (combined with depth: whichever comes first). */
  movetimeMs?: number;
  /** Abort: sends `stop` and rejects with an `AbortError`. */
  signal?: AbortSignal;
  /** Called with the current lines (sorted by multipv) whenever the engine reports progress. */
  onUpdate?: (lines: EngineLine[]) => void;
}

/** Options for `EngineService.bestMove` (bots). Strength options are restored after the call. */
export interface BestMoveOptions {
  depth?: number;
  movetimeMs?: number;
  /** UCI `Skill Level` 0–20. */
  skillLevel?: number;
  /** Sets `UCI_LimitStrength true` + `UCI_Elo`. */
  limitStrengthElo?: number;
  /** MultiPV candidates to report in `lines`. */
  multiPv?: number;
  signal?: AbortSignal;
}

/** Result of `EngineService.analyse`. */
export interface EngineAnalysis {
  /** Analysed position. */
  fen: Fen;
  /** Final lines sorted by multipv (1 first). Empty when the position has no legal move. */
  lines: EngineLine[];
  /** Depth reached by the best line. */
  depth: number;
  /** Best move, `null` when the side to move has no legal move (`bestmove (none)`). */
  bestMove: Uci | null;
  /** `local` Stockfish or `cloud` (Lichess cloud-eval, optional accelerator). */
  source: 'local' | 'cloud';
  /** Engine identifier, e.g. `stockfish-19-lite-single`. */
  engineId: string;
}

/** Engine lifecycle state for "Engine wird geladen …" UI. `progress` is 0–1 while loading. */
export type EngineStatus = { state: 'idle' | 'loading' | 'ready' | 'busy' | 'error'; progress?: number; error?: string };

/**
 * A UCI engine (browser worker or Node). Calls are serialised (one search at a time, queued in call order);
 * options set for a call (MultiPV, Skill Level, UCI_LimitStrength/UCI_Elo) are restored afterwards.
 */
export interface EngineService {
  /** Stable engine id (also stored as `engineId` in analyses). */
  readonly id: string;
  /** Loads the engine and performs the UCI handshake. Idempotent; other calls call it implicitly. */
  init(): Promise<void>;
  /** Current status. */
  status(): EngineStatus;
  /** Subscribes to status changes; returns an unsubscribe function. */
  onStatus(cb: (s: EngineStatus) => void): () => void;
  /** Analyses a position. */
  analyse(fen: Fen, opts?: AnalyseOptions): Promise<EngineAnalysis>;
  /** Searches the best move (bots, hints). */
  bestMove(fen: Fen, opts?: BestMoveOptions): Promise<{ move: Uci | null; lines: EngineLine[] }>;
  /** Stops the running search (it resolves with what it has); resolves when the engine is idle. */
  stop(): Promise<void>;
  /** Terminates the engine; pending calls reject. */
  dispose(): void;
}

/** Raw line-based connection to a UCI engine (Web Worker, Node module, test double). */
export interface UciTransport {
  /** Sends one UCI command (without newline). */
  send(cmd: string): void;
  /** Subscribes to output lines; returns an unsubscribe function. */
  onLine(cb: (line: string) => void): () => void;
  /** Kills the engine. */
  terminate(): void;
}
