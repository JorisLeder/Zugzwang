/**
 * Pure game logic of the play feature (P0-07…P0-09): new bot games and their PGN headers, takeback plies, the
 * two-device rule, German end-of-game texts (DSB terms, RULES §3) and small helpers for the player bars.
 * Rules themselves come from `@/lib/chess` (`ChessGame.status()`, D-04) – nothing here decides legality.
 */
import type { BotProfile } from '@/core/bots';
import type { Color, DrawClaim, Fen, GameEndReason, GameResult, MoveRecord, PieceSymbol } from '@/core/chess';
import type { AssistanceLevel, Game, GameOrigin } from '@/core/games';
import { pieceNameDe, PIECE_VALUES } from '@/lib/chess';
import { STRINGS_DE } from './strings.de';

/** Colour choice in the setup (DESIGN §3.6: Weiß · Zufall · Schwarz). */
export type ColorChoice = 'w' | 'b' | 'random';

/** Who claimed a draw (for the end text of the running session). */
export type Claimant = 'user' | 'bot';

/** Heartbeat interval of the active device (P0-02, BACKLOG WP-04). */
export const HEARTBEAT_MS = 10_000;
/** A heartbeat younger than this means another device is playing the game. */
export const ACTIVE_DEVICE_MAX_AGE_MS = 30_000;

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** The user's colour for a choice (`random` = 50/50). */
export function resolveColor(choice: ColorChoice, random: () => number = Math.random): Color {
  if (choice === 'random') return random() < 0.5 ? 'w' : 'b';
  return choice;
}

/** PGN date `YYYY.MM.DD` (local calendar day). */
export function pgnDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * PGN headers of a bot game (CONVENTIONS §15, D-49): `Event`, `Site`, `Date`, `White`, `Black` (bot name / "Du") and
 * the bot's Elo as `WhiteElo` or `BlackElo` on the bot's side – `progress.finishGame` rates against it.
 */
export function gameHeaders(bot: Pick<BotProfile, 'name' | 'elo'>, userColor: Color, date: Date): Record<string, string> {
  const botColor = other(userColor);
  return {
    Event: `Zugzwang: Partie gegen ${bot.name}`,
    Site: 'Zugzwang',
    Date: pgnDate(date),
    Round: '-',
    White: userColor === 'w' ? STRINGS_DE.you : bot.name,
    Black: userColor === 'b' ? STRINGS_DE.you : bot.name,
    [botColor === 'w' ? 'WhiteElo' : 'BlackElo']: String(bot.elo),
    Result: '*',
  };
}

/** Input of `newBotGame`. */
export interface NewBotGameInput {
  bot: BotProfile;
  userColor: Color;
  assistance: AssistanceLevel;
  startFen: Fen;
  origin: GameOrigin;
  deviceId: string;
  now: Date;
}

/** The `Game` row for `progress.createGame` (source `bot`, untimed – D-06, active on this device). */
export function newBotGame(input: NewBotGameInput): Omit<Game, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    source: 'bot',
    externalId: null,
    botId: input.bot.id,
    userColor: input.userColor,
    assistance: input.assistance,
    timeControl: { kind: 'none' },
    startFen: input.startFen,
    pgn: '',
    headers: gameHeaders(input.bot, input.userColor, input.now),
    status: 'active',
    result: '*',
    endReason: null,
    origin: input.origin,
    activeDeviceId: input.deviceId,
    activeHeartbeatAt: input.now.toISOString(),
    ratingBefore: null,
    ratingAfter: null,
    finishedAt: null,
  };
}

/**
 * Plies to take back so that the user is to move again before their last own move (Training/Coach): the bot's reply
 * (if any) plus the user's own move. `0` when the user has not moved yet.
 */
export function takebackPlies(history: readonly Pick<MoveRecord, 'color'>[], userColor: Color): number {
  for (let i = history.length - 1, n = 1; i >= 0; i--, n++) {
    if (history[i]!.color === userColor) return n;
  }
  return 0;
}

/** Whether another device played this game recently (heartbeat younger than 30 s, P0-02). */
export function isAnotherDeviceActive(
  game: Pick<Game, 'activeDeviceId' | 'activeHeartbeatAt' | 'status'>,
  deviceId: string,
  now: Date,
  maxAgeMs: number = ACTIVE_DEVICE_MAX_AGE_MS,
): boolean {
  if (game.status !== 'active' || !game.activeDeviceId || game.activeDeviceId === deviceId || !game.activeHeartbeatAt) return false;
  const age = now.getTime() - Date.parse(game.activeHeartbeatAt);
  return Number.isFinite(age) && age < maxAgeMs;
}

/** Outcome from the user's point of view. */
export function userOutcome(result: GameResult, userColor: Color): 'win' | 'loss' | 'draw' | null {
  if (result === '*') return null;
  if (result === '1/2-1/2') return 'draw';
  return (result === '1-0') === (userColor === 'w') ? 'win' : 'loss';
}

/** German end-of-game text (DESIGN §9.2, RULES §3, findings R-03/R-04). */
export function endMessageDe(reason: GameEndReason, result: GameResult, userColor: Color, botName: string, claimant?: Claimant): string {
  const e = STRINGS_DE.end;
  switch (reason) {
    case 'checkmate':
      return userOutcome(result, userColor) === 'win' ? e.checkmateWin : e.checkmateLoss(botName);
    case 'stalemate':
      return e.stalemate;
    case 'insufficient_material':
      return e.insufficient;
    case 'fivefold_repetition':
      return e.fivefold;
    case 'seventyfive_moves':
      return e.seventyFive;
    case 'threefold_repetition_claim':
      return claimant === 'bot' ? e.threefoldBot(botName) : claimant === 'user' ? e.threefoldUser : 'Remis durch dreimalige Stellungswiederholung.';
    case 'fifty_moves_claim':
      return claimant === 'bot' ? e.fiftyBot(botName) : claimant === 'user' ? e.fiftyUser : 'Remis nach der 50-Züge-Regel.';
    case 'resignation':
      return result === '1/2-1/2' ? e.resignedDraw(botName) : e.resigned;
    case 'timeout':
    case 'timeout_vs_insufficient_material':
      return e.timeout;
    default:
      return e.aborted;
  }
}

/** Claim text for the user (on their turn, or right after their move – RULES §5.2). */
export function claimMessageDe(kinds: readonly DrawClaim[], withOwnMove: boolean): string {
  const threefold = kinds.includes('threefold_repetition');
  if (withOwnMove) return threefold ? STRINGS_DE.claimWithMoveThreefold : STRINGS_DE.claimWithMoveFifty;
  return threefold ? STRINGS_DE.claimThreefold : STRINGS_DE.claimFifty;
}

/** Pieces captured by each side (from the move records), ordered queen → pawn. */
export function capturedBy(history: readonly Pick<MoveRecord, 'color' | 'captured'>[]): Record<Color, PieceSymbol[]> {
  const out: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const m of history) if (m.captured) out[m.color].push(m.captured);
  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  for (const c of ['w', 'b'] as const) out[c].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return out;
}

/** Material lead of `color` in pawns from the captures (0 when behind or equal). */
export function materialLead(captured: Record<Color, PieceSymbol[]>, color: Color): number {
  const sum = (ps: PieceSymbol[]) => ps.reduce((s, p) => s + PIECE_VALUES[p], 0);
  return Math.max(0, sum(captured[color]) - sum(captured[other(color)]));
}

/** "deinen Springer" / "deine Dame" (accusative, for hints: "Schau dir deinen Springer auf f3 an."). */
export function yourPieceAccusativeDe(piece: PieceSymbol): string {
  return piece === 'q' ? `deine ${pieceNameDe(piece)}` : `deinen ${pieceNameDe(piece)}`;
}

/** The assistance level of the most recent bot game (DESIGN §3.6: preselect the last used level), else `coach`. */
export function lastUsedLevel(games: readonly Pick<Game, 'source' | 'assistance' | 'createdAt'>[]): AssistanceLevel {
  const latest = [...games]
    .filter((g) => g.source === 'bot' && g.assistance)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest?.assistance ?? 'coach';
}

/** Normalises user FEN input: trims, collapses spaces and adds missing move counters (4-field FENs). */
export function normalizeFenInput(input: string): string {
  const fields = input.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 4) return [...fields, '0', '1'].join(' ');
  if (fields.length === 5) return [...fields, '1'].join(' ');
  return fields.join(' ');
}
