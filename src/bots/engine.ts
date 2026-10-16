/**
 * `StockfishBotEngine` – the app's `BotEngine` (WP-04, D-16) on top of the `play` engine:
 * repertoire first (random among matching lines), then the model of the bot's strength
 * (`skill` < 800, `human` 800–2000, `elo` 2100–2500; `maia` → `human` until a Maia adapter exists).
 * Each move reports its compute time and a suggested think time (1–8 s by complexity, 0 in e2e runs).
 */
import type { BotEngine, BotMove, BotMoveRequest, BotProfile } from '@/core/bots';
import type { Fen } from '@/core/chess';
import type { EngineService } from '@/core/engine';
import { scoreWinPercent } from '@/analysis';
import { ChessGame } from '@/lib/chess';
import { chatForMove } from './chat';
import { chooseEloMove } from './models/elo';
import { chooseHumanMove } from './models/human';
import { chooseSkillMove } from './models/skill';
import { botModel, eloParams, humanParams, skillParams, type EloParams, type HumanParams, type SkillParams } from './params';
import type { RandomSource } from './random';
import { repertoireMove } from './repertoire';
import { thinkTimeMs } from './thinkTime';

/** Options of `StockfishBotEngine`. */
export interface BotEngineOptions {
  /** e2e runs: no artificial think time. */
  e2e?: boolean;
  /** Random source (default `Math.random`; seed it for reproducible tests and calibration). */
  random?: RandomSource;
  /** Clock for `computeMs` (default `performance.now`). */
  now?: () => number;
  /** Skip the opening repertoire (calibration measures the move models). */
  useRepertoire?: boolean;
  /** Parameter overrides per model (calibration experiments). */
  overrides?: {
    skill?: (elo: number) => Partial<SkillParams>;
    human?: (elo: number) => Partial<HumanParams>;
    elo?: (elo: number) => Partial<EloParams>;
  };
}

/** Evaluation search of `shouldClaimDraw`. */
export const CLAIM_SEARCH = { depth: 12, movetimeMs: 400 } as const;

function abortError(): DOMException {
  return new DOMException('Bot move aborted', 'AbortError');
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Bot move generator for the whole roster (see the file header). */
export class StockfishBotEngine implements BotEngine {
  private readonly random: RandomSource;
  private readonly now: () => number;

  constructor(
    private readonly engine: EngineService,
    private readonly opts: BotEngineOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? defaultNow;
  }

  async chooseMove(req: BotMoveRequest): Promise<BotMove> {
    const { bot, startFen, moves, signal } = req;
    if (signal?.aborted) throw abortError();
    const t0 = this.now();
    const game = ChessGame.fromMoves(startFen, moves);
    const status = game.status();
    if (status.isOver) throw new Error('The game is over – the bot has no move.');
    const fen = game.fen();
    const legal = game.legalMoves();
    const thinkBase = {
      legalMoves: legal.length,
      captures: legal.filter((m) => m.isCapture).length,
      inCheck: status.inCheck,
      elo: bot.elo,
    };

    const book = this.opts.useRepertoire === false ? null : repertoireMove(bot, startFen, moves, this.random);
    if (book) {
      return this.finish(bot, fen, book, 'book', t0, { ...thinkBase, spread: null, book: true });
    }

    const last = game.lastMove();
    const previous = last ? { to: last.to, ...(last.captured ? { captured: last.captured } : {}) } : null;
    const model = botModel(bot);
    if (model === 'skill') {
      const params = { ...skillParams(bot.elo), ...this.opts.overrides?.skill?.(bot.elo) };
      const r = await chooseSkillMove(this.engine, fen, params, this.random, signal);
      if (!r) throw new Error('The bot found no move.');
      return this.finish(bot, fen, r.uci, r.origin === 'rule' ? 'human-model' : 'engine', t0, { ...thinkBase, spread: null, book: false });
    }
    if (model === 'elo') {
      const params = { ...eloParams(bot.elo), ...this.opts.overrides?.elo?.(bot.elo) };
      const uci = await chooseEloMove(this.engine, fen, params, signal);
      if (!uci) throw new Error('The bot found no move.');
      return this.finish(bot, fen, uci, 'engine', t0, { ...thinkBase, spread: null, book: false });
    }
    const params = { ...humanParams(bot.elo, bot.style), ...this.opts.overrides?.human?.(bot.elo) };
    const r = await chooseHumanMove(this.engine, fen, params, this.random, previous, signal);
    if (!r) {
      const fallback = legal[0];
      if (!fallback) throw new Error('The bot found no move.');
      return this.finish(bot, fen, fallback.uci, 'engine', t0, { ...thinkBase, spread: null, book: false });
    }
    return this.finish(bot, fen, r.uci, 'human-model', t0, { ...thinkBase, spread: r.spread, book: false });
  }

  private finish(
    bot: BotProfile,
    fen: Fen,
    uci: string,
    source: BotMove['source'],
    t0: number,
    think: Parameters<typeof thinkTimeMs>[0],
  ): BotMove {
    const computeMs = Math.max(0, Math.round(this.now() - t0));
    const record = ChessGame.fromFen(fen).move(uci);
    if (!record) throw new Error(`The bot chose an illegal move: ${uci}`);
    const move: BotMove = {
      uci,
      source,
      thinkTimeMs: this.opts.e2e ? 0 : thinkTimeMs(think, this.random),
      computeMs,
    };
    const chat = chatForMove(bot, record, this.random);
    if (chat) move.chat = chat;
    return move;
  }

  /**
   * Whether the bot claims an available draw (D-04, RULES §5.2): only when its own evaluation is ≤ 0. The bot is the
   * side to move in `fen` (FIDE 9.2.1/9.3: the player having the move claims). The caller checks that a claim is
   * available (`ChessGame.status().claimableDraws` – a FEN alone has no repetition history).
   */
  async shouldClaimDraw(fen: Fen, _bot: BotProfile): Promise<boolean> {
    let turn: 'w' | 'b';
    try {
      turn = ChessGame.fromFen(fen).turn();
    } catch {
      return false;
    }
    const a = await this.engine.analyse(fen, { depth: CLAIM_SEARCH.depth, movetimeMs: CLAIM_SEARCH.movetimeMs });
    const best = a.lines[0];
    if (!best) return true;
    return scoreWinPercent(best.score, turn, turn) <= 50;
  }
}
