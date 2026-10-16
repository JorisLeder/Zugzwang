/**
 * Game contracts (BACKLOG 2.6, PRD P0-07…P0-09, P0-15, P2-01/P2-02, D-29).
 */
import type { Color, Fen, GameEndReason, GameResult, San, Uci } from './chess';

/** Where a game comes from (P2-01: chess.com/lichess imports in V2). */
export type GameSource = 'bot' | 'pgn' | 'chesscom' | 'lichess';

/** Hilfe-Stufe: Wettkampf (rated, no help), Training (takebacks, hints, eval bar), Coach (Training + warnings). */
export type AssistanceLevel = 'competition' | 'training' | 'coach';

/** Time control. V1 games are always untimed (`none`, D-06). */
export type TimeControl = { kind: 'none' } | { kind: 'clock'; initialSec: number; incrementSec: number };

/** How a game was started: a new game from the start position, or from a FEN/lesson/puzzle/analysis position. */
export type GameOrigin = { type: 'new' } | { type: 'fen' | 'lesson' | 'puzzle' | 'analysis'; ref?: string };

/** A game (`games` table). Moves live in the append-only event log `GameMoveEvent`. */
export interface Game {
  /** Client UUID. */
  id: string;
  source: GameSource;
  /** External id (PGN hash, chess.com/lichess id) – unique per user and source; prevents duplicate imports. */
  externalId: string | null;
  /** Bot id for `source = 'bot'`. */
  botId: string | null;
  /** Colour of the user in bot games; `null` for imported games where it is unknown. */
  userColor: Color | null;
  /** Assistance level of bot games; `null` otherwise. */
  assistance: AssistanceLevel | null;
  timeControl: TimeControl;
  /** Start position (standard or custom FEN). Resume = replay all moves from here (RULES §0 row 14). */
  startFen: Fen;
  /** PGN of the game so far (kept up to date for finished games and imports). */
  pgn: string;
  /** PGN tag pairs (Event, White, Black, WhiteElo, BlackElo, …). Bot games store the bot's Elo in its colour's Elo tag. */
  headers: Record<string, string>;
  status: 'active' | 'finished' | 'aborted';
  result: GameResult;
  endReason: GameEndReason | null;
  origin: GameOrigin;
  /** Device currently playing this game (takeover dialog, P0-02). */
  activeDeviceId: string | null;
  activeHeartbeatAt: string | null;
  /** User's bot rating before/after (rated competition games only). */
  ratingBefore: number | null;
  ratingAfter: number | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/**
 * Append-only event log per game (D-29). Takebacks are events, never deletes. The current move list is obtained by
 * folding the events in `seq` order: `move` appends `uci`, `takeback` removes the last `plies` moves.
 */
export interface GameMoveEvent {
  /** Client UUID. */
  id: string;
  gameId: string;
  /** 1-based sequence number, unique per game. */
  seq: number;
  kind: 'move' | 'takeback';
  /** Ply count after applying the event (move: ply of the move; takeback: remaining plies). */
  ply: number;
  /** Move (kind `move`). */
  uci?: Uci;
  san?: San;
  fenAfter?: Fen;
  /** Number of plies removed (kind `takeback`). */
  plies?: number;
  createdAt: string;
}

/** `POST /games/import` request (P2-02). V1 supports `pgn`; `source`+`externalId` is V2 (501). */
export interface GameImportRequest {
  pgn?: string;
  source?: GameSource;
  externalId?: string;
}

/** `POST /games/import` response. `duplicate = true` when the game already existed (its id is returned). */
export type GameImportResponse = { ok: true; gameId: string; duplicate: boolean } | { ok: false; error: string; line?: number };

/** Folds a game's event log into the current UCI move list (events in any order; sorted by `seq`). */
export function movesFromEvents(events: readonly GameMoveEvent[]): Uci[] {
  const moves: Uci[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind === 'move' && e.uci) moves.push(e.uci);
    else if (e.kind === 'takeback') moves.splice(Math.max(0, moves.length - (e.plies ?? 0)));
  }
  return moves;
}
