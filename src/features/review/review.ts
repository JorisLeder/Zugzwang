/**
 * Pure helpers of the game review (P0-10 UI): loading the main line of a game, deciding whether a stored analysis is
 * still current, player names, result and date labels, arrows and key-moment navigation.
 */
import { ANALYSIS_VERSION } from '@/analysis';
import type { AnalysedMove, GameAnalysis, MoveClassification } from '@/core/analysis';
import type { BotProfile } from '@/core/bots';
import type { Arrow, Color, Fen, MoveRecord, Uci } from '@/core/chess';
import type { Score } from '@/core/engine';
import { movesFromEvents, type Game, type GameMoveEvent } from '@/core/games';
import { ChessGame, ChessRulesError, parseUci } from '@/lib/chess';
import { STRINGS_DE } from './strings.de';

/**
 * Engine version that the analysis service writes for an engine id (`${engineId}+zz-analysis-${ANALYSIS_VERSION}`,
 * WP-02). A stored analysis with another version is re-run (BACKLOG WP-05).
 */
export function currentEngineVersion(engineId: string): string {
  return `${engineId}+zz-analysis-${ANALYSIS_VERSION}`;
}

/** Whether a stored analysis fits the game's moves and the current engine version. */
export function isAnalysisCurrent(analysis: GameAnalysis, engineId: string, moves: readonly Uci[]): boolean {
  if (analysis.engineVersion !== currentEngineVersion(engineId)) return false;
  if (analysis.moves.length !== moves.length) return false;
  return analysis.moves.every((m, i) => m.uci === moves[i]);
}

/** Main line of a game: bot games fold their event log, imported games read their PGN (BACKLOG WP-05). */
export type GameLine = { ok: true; startFen: Fen; moves: MoveRecord[] } | { ok: false; errorDe: string };

/** Replays the game's moves with the rules layer (never throws). */
export function loadGameLine(game: Game, events: readonly GameMoveEvent[]): GameLine {
  try {
    if (events.length > 0 || (game.source === 'bot' && !game.pgn.trim())) {
      const replay = ChessGame.fromMoves(game.startFen, movesFromEvents(events));
      return { ok: true, startFen: replay.startFen(), moves: replay.history() };
    }
    const fromPgn = ChessGame.fromPgn(game.pgn);
    return { ok: true, startFen: fromPgn.startFen(), moves: fromPgn.history() };
  } catch (e) {
    return { ok: false, errorDe: e instanceof ChessRulesError ? e.messageDe : STRINGS_DE.loadError };
  }
}

/** Display name and Elo of both sides. */
export interface PlayerInfo {
  name: string;
  elo?: string;
  /** The learner's side in a bot game. */
  isUser: boolean;
}

function headerName(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v && v !== '?' ? v : fallback;
}

/** Names of White and Black: "Du" and the bot in bot games, the PGN tags otherwise. */
export function playerInfo(game: Game, roster: readonly BotProfile[]): Record<Color, PlayerInfo> {
  const bot = game.botId ? roster.find((b) => b.id === game.botId) : undefined;
  const side = (c: Color): PlayerInfo => {
    const elo = game.headers[c === 'w' ? 'WhiteElo' : 'BlackElo']?.trim();
    if (game.source === 'bot' && game.userColor) {
      if (c === game.userColor) return { name: STRINGS_DE.you, isUser: true };
      return { name: bot?.name ?? headerName(game.headers[c === 'w' ? 'White' : 'Black'], STRINGS_DE.unknownPlayer), ...(elo ? { elo } : bot ? { elo: String(bot.elo) } : {}), isUser: false };
    }
    const name = headerName(game.headers[c === 'w' ? 'White' : 'Black'], c === 'w' ? STRINGS_DE.white : STRINGS_DE.black);
    return { name, ...(elo && elo !== '?' ? { elo } : {}), isUser: false };
  };
  return { w: side('w'), b: side('b') };
}

/** Hub/list title: "gegen Kalle (700)" for bot games, "Anna – Ben" for imports. */
export function gameTitle(game: Game, roster: readonly BotProfile[]): string {
  const players = playerInfo(game, roster);
  if (game.source === 'bot' && game.userColor) {
    const opp = players[game.userColor === 'w' ? 'b' : 'w'];
    return `${STRINGS_DE.vs} ${opp.name}${opp.elo ? ` (${opp.elo})` : ''}`;
  }
  return `${players.w.name} – ${players.b.name}`;
}

/** Result label: from the learner's view in bot games, else German score notation (1:0, 0:1, ½:½). */
export function resultLabel(game: Game): string {
  const r = game.result;
  if (r === '*') return STRINGS_DE.resultOpen;
  if (game.source === 'bot' && game.userColor) {
    if (r === '1/2-1/2') return STRINGS_DE.resultDraw;
    return (r === '1-0') === (game.userColor === 'w') ? STRINGS_DE.resultWin : STRINGS_DE.resultLoss;
  }
  return r === '1-0' ? '1:0' : r === '0-1' ? '0:1' : '½:½';
}

/** German date of a game: the PGN `Date` tag of imports when complete, else when it was finished/created. */
export function gameDateLabel(game: Game): string {
  const tag = game.source !== 'bot' ? game.headers.Date?.match(/^(\d{4})\.(\d{2})\.(\d{2})$/) : null;
  if (tag) return `${tag[3]}.${tag[2]}.${tag[1]}`;
  const iso = game.finishedAt ?? game.createdAt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

const BAD: ReadonlySet<MoveClassification> = new Set(['mistake', 'miss', 'blunder']);

/** Mistakes, misses and blunders get an explanation, "Nochmal versuchen" and the hidden better move (DESIGN §8.4). */
export function isBadMove(classification: MoveClassification): boolean {
  return BAD.has(classification);
}

/** Whether "Nochmal versuchen" is offered for a move. */
export function canRetry(m: AnalysedMove | undefined): m is AnalysedMove & { bestMove: Uci } {
  return !!m && isBadMove(m.classification) && !!m.bestMove && m.bestMove !== m.uci;
}

/**
 * Board arrow of the engine's best move in the position before move `m` (shown with move `m`). Hidden while the
 * better move of a mistake is not revealed yet, and when the played move was the best move.
 */
export function bestMoveArrows(m: AnalysedMove | undefined, revealed: boolean): Arrow[] {
  if (!m?.bestMove || m.bestMove === m.uci) return [];
  if (isBadMove(m.classification) && !revealed) return [];
  const mv = parseUci(m.bestMove);
  return mv ? [{ from: mv.from, to: mv.to, kind: 'best' }] : [];
}

/** Evaluation shown at a ply (White POV): before move 1 at ply 0, else after move `ply`. */
export function evalAtPly(analysis: GameAnalysis | null, ply: number): Score | null {
  if (!analysis) return null;
  if (ply === 0) return analysis.moves[0]?.evalBefore ?? null;
  return analysis.moves[ply - 1]?.evalAfter ?? null;
}

/** Next (`+1`) or previous (`−1`) key moment from `ply`; `null` if there is none. */
export function keyMomentFrom(keyMoments: readonly number[], ply: number, dir: 1 | -1): number | null {
  const sorted = [...keyMoments].sort((a, b) => a - b);
  if (dir === 1) return sorted.find((k) => k > ply) ?? null;
  return [...sorted].reverse().find((k) => k < ply) ?? null;
}

/** "14. Dc2" / "14... Sxd3+" – SAN already formatted for the user's notation. */
export function moveNumberText(m: Pick<MoveRecord, 'moveNumber' | 'color'>, san: string): string {
  return STRINGS_DE.moveHeading(m.moveNumber, m.color, san);
}

/** Classifications per ply for the move list. */
export function classificationsByPly(analysis: GameAnalysis | null): Partial<Record<number, MoveClassification>> {
  const out: Partial<Record<number, MoveClassification>> = {};
  for (const m of analysis?.moves ?? []) out[m.ply] = m.classification;
  return out;
}

/** The game's opening: the last book position reached. */
export function openingOf(analysis: GameAnalysis | null): { eco: string; name: string } | null {
  let found: { eco: string; name: string } | null = null;
  for (const m of analysis?.moves ?? []) if (m.opening) found = m.opening;
  return found;
}
