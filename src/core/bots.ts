/**
 * Bot contracts (BACKLOG 2.6, PRD "Bots: Technik je Stärke", D-16, D-17).
 */
import type { Fen, San, Uci } from './chess';

/** Playing style of a bot (shown as a chip, influences the human error model). */
export type BotStyle = 'random' | 'cautious' | 'aggressive' | 'solid' | 'gambit' | 'tactical' | 'positional' | 'endgame';

/** A bot opponent (static data, `bots` table). Names/avatars are original (no chess.com assets). */
export interface BotProfile {
  /** Stable id (kebab-case). */
  id: string;
  /** Display name. */
  name: string;
  /** Playing strength (Elo-like); also the opponent rating for the bot rating (RD 50, D-09). */
  elo: number;
  /** Public path of the avatar, e.g. `/avatars/bots/pip.svg`. */
  avatar: string;
  style: BotStyle;
  /** German style label ("Angriffslustig"). */
  styleLabelDe: string;
  /** One or two German sentences about the bot. */
  descriptionDe: string;
  /** Move generator (D-16); `maia` falls back to `stockfish-human` until a Maia adapter exists. */
  engine: 'stockfish-skill' | 'stockfish-human' | 'stockfish-elo' | 'maia';
  /** Opening lines (English SAN from the start position) the bot plays first, per colour. */
  repertoire: { white: San[][]; black: San[][] };
  /** German chat lines. */
  chat: {
    greeting: string[];
    onCapture: string[];
    onCheck: string[];
    onWin: string[];
    onLoss: string[];
    onDraw: string[];
  };
}

/** Request for a bot move. */
export interface BotMoveRequest {
  bot: BotProfile;
  /** Start position of the game. */
  startFen: Fen;
  /** Full move history from `startFen` in UCI (needed for repertoire and repetition awareness). */
  moves: Uci[];
  signal?: AbortSignal;
}

/** A bot's chosen move. */
export interface BotMove {
  uci: Uci;
  /** Where the move came from. */
  source: 'book' | 'engine' | 'human-model';
  /** Suggested artificial delay before showing the move (1–8 s; 0 in e2e). */
  thinkTimeMs: number;
  /** Time actually spent computing. */
  computeMs: number;
  /** Optional chat line to show with the move. */
  chat?: string;
}

/** Move generator for all bots (WP-04). */
export interface BotEngine {
  chooseMove(req: BotMoveRequest): Promise<BotMove>;
  /** Whether the bot claims an available draw (threefold/50-move): only when its own evaluation is ≤ 0 (D-04). */
  shouldClaimDraw(fen: Fen, bot: BotProfile): Promise<boolean>;
}
