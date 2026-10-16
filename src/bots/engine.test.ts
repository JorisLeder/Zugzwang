import { describe, expect, it } from 'vitest';
import type { BotProfile } from '@/core/bots';
import { START_FEN } from '@/core/chess';
import { FakeEngineService } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { BOT_ROSTER, botById, createBotEngine, createBotEngineWithOptions, createSeededRandom, MaiaBotEngine, StockfishBotEngine } from './index';

const MIDDLEGAME = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']).uciMoves();
const bot = (id: string): BotProfile => botById(id)!;

describe('StockfishBotEngine – routing per strength (D-16)', () => {
  it('plays the repertoire first (source book, no engine call)', async () => {
    const engine = new FakeEngineService();
    const bots = createBotEngineWithOptions(engine, { e2e: true, random: createSeededRandom(1) });
    const move = await bots.chooseMove({ bot: bot('frieda'), startFen: START_FEN, moves: [] });
    expect(move.source).toBe('book');
    expect(move.uci).toBe('d2d4');
    expect(engine.calls).toHaveLength(0);
  });

  it('weak bots (< 800): Skill Level 0–3 search, or a rule-based gross error', async () => {
    const engine = new FakeEngineService();
    // random() = 0.99 → no gross error, Stockfish Skill Level move
    const sb = new StockfishBotEngine(engine, { e2e: true, random: () => 0.99, useRepertoire: false });
    const m = await sb.chooseMove({ bot: bot('pip'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(m.source).toBe('engine');
    expect(engine.calls[0]).toMatchObject({ method: 'bestMove' });
    expect((engine.calls[0]!.opts as { skillLevel: number }).skillLevel).toBe(0);
    // random() = 0 → gross error, no engine call
    const engine2 = new FakeEngineService();
    const sb2 = new StockfishBotEngine(engine2, { e2e: true, random: () => 0, useRepertoire: false });
    const e = await sb2.chooseMove({ bot: bot('pip'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(e.source).toBe('human-model');
    expect(engine2.calls).toHaveLength(0);
    expect(ChessGame.fromMoves(START_FEN, MIDDLEGAME).move(e.uci)).not.toBeNull();
  });

  it('human-model bots (800–2000): one MultiPV search with 8–12 candidates', async () => {
    const engine = new FakeEngineService();
    const sb = new StockfishBotEngine(engine, { e2e: true, random: () => 0.9, useRepertoire: false });
    const m = await sb.chooseMove({ bot: bot('ida'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(m.source).toBe('human-model');
    expect(engine.calls).toHaveLength(1);
    const opts = engine.calls[0]!.opts as { multiPv: number; depth: number };
    expect(engine.calls[0]!.method).toBe('analyse');
    expect(opts.multiPv).toBeGreaterThanOrEqual(8);
    expect(opts.multiPv).toBeLessThanOrEqual(12);
  });

  it('strong bots (2100–2500): UCI_LimitStrength with UCI_Elo', async () => {
    const engine = new FakeEngineService();
    const sb = new StockfishBotEngine(engine, { e2e: true, useRepertoire: false });
    await sb.chooseMove({ bot: bot('zora'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(engine.calls[0]).toMatchObject({ method: 'bestMove', opts: { limitStrengthElo: 2500 } });
  });

  it('maia bots fall back to the human model (stub, D-16)', async () => {
    const engine = new FakeEngineService();
    const bots = createBotEngineWithOptions(engine, { e2e: true, random: () => 0.9, useRepertoire: false });
    const m = await bots.chooseMove({ bot: { ...bot('nina'), engine: 'maia' }, startFen: START_FEN, moves: MIDDLEGAME });
    expect(m.source).toBe('human-model');
    expect(engine.calls[0]!.method).toBe('analyse');
    const maia = new MaiaBotEngine(new StockfishBotEngine(engine));
    expect(maia.isAvailable()).toBe(false);
    await expect(maia.load({ url: '/models/maia2.onnx' })).rejects.toThrow(/nicht verfügbar/);
  });

  it('think time: 0 in e2e runs, 1–8 s otherwise; compute time is measured', async () => {
    const engine = new FakeEngineService();
    const e2e = await createBotEngine(engine, { mode: 'local', cloudEvalEnabled: false, e2e: true }).chooseMove({ bot: bot('oskar'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(e2e.thinkTimeMs).toBe(0);
    const real = await createBotEngine(engine, { mode: 'local', cloudEvalEnabled: false, e2e: false }).chooseMove({ bot: bot('oskar'), startFen: START_FEN, moves: MIDDLEGAME });
    expect(real.thinkTimeMs).toBeGreaterThanOrEqual(1000);
    expect(real.thinkTimeMs).toBeLessThanOrEqual(8000);
    expect(real.computeMs).toBeGreaterThanOrEqual(0);
  });

  it('works from a custom start position and rejects finished games and aborted requests', async () => {
    const engine = new FakeEngineService();
    const bots = createBotEngineWithOptions(engine, { e2e: true, random: createSeededRandom(5) });
    const fen = '4k3/8/8/8/8/8/4P3/4K2R w K - 0 1';
    const m = await bots.chooseMove({ bot: bot('henrike'), startFen: fen, moves: [] });
    expect(ChessGame.fromFen(fen).move(m.uci)).not.toBeNull();
    const mated = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    await expect(bots.chooseMove({ bot: bot('henrike'), startFen: START_FEN, moves: mated })).rejects.toThrow(/over/);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(bots.chooseMove({ bot: bot('henrike'), startFen: START_FEN, moves: [], signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('adds a chat line to some checks and captures', async () => {
    // Position where the only sensible engine move is a capture: scripted line Bxf7+.
    const moves = ['e2e4', 'e7e5', 'f1c4', 'd7d6'];
    const fen = ChessGame.fromMoves(START_FEN, moves).fen();
    const engine = new FakeEngineService({ lines: { [fen]: [{ multipv: 1, depth: 10, score: { type: 'cp', value: 50 }, pv: ['c4f7'] }] } });
    const sb = new StockfishBotEngine(engine, { e2e: true, random: () => 0, useRepertoire: false });
    const m = await sb.chooseMove({ bot: bot('zora'), startFen: START_FEN, moves });
    expect(m.uci).toBe('c4f7');
    expect(bot('zora').chat.onCheck).toContain(m.chat);
  });
});

describe('shouldClaimDraw (D-04: only when the bot’s own evaluation is ≤ 0)', () => {
  const fenWhite = 'r1bqkbnr/pppppppp/2n5/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 2 2';
  const fenBlack = 'r1bqkbnr/pppppppp/2n5/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 2 2';

  it('claims when the bot (side to move) is worse or equal, plays on when better', async () => {
    const engine = new FakeEngineService({
      lines: {
        [fenWhite]: [{ multipv: 1, depth: 12, score: { type: 'cp', value: 40 }, pv: ['g1f3'] }],
        [fenBlack]: [{ multipv: 1, depth: 12, score: { type: 'cp', value: 40 }, pv: ['g8f6'] }],
      },
    });
    const sb = new StockfishBotEngine(engine);
    expect(await sb.shouldClaimDraw(fenWhite, bot('ida'))).toBe(false); // White to move, +0.4 for White
    expect(await sb.shouldClaimDraw(fenBlack, bot('ida'))).toBe(true); // Black to move, −0.4 for Black
    engine.setLines(fenWhite, [{ multipv: 1, depth: 12, score: { type: 'cp', value: 0 }, pv: ['g1f3'] }]);
    expect(await sb.shouldClaimDraw(fenWhite, bot('ida'))).toBe(true);
    expect(await sb.shouldClaimDraw('invalid', bot('ida'))).toBe(false);
  });
});

describe('roster sanity for the factory', () => {
  it('createBotEngine works for every bot of the roster with a fake engine', async () => {
    const engine = new FakeEngineService();
    const bots = createBotEngineWithOptions(engine, { e2e: true, random: createSeededRandom(11), useRepertoire: false });
    for (const b of BOT_ROSTER) {
      const m = await bots.chooseMove({ bot: b, startFen: START_FEN, moves: MIDDLEGAME });
      expect(ChessGame.fromMoves(START_FEN, MIDDLEGAME).move(m.uci), b.id).not.toBeNull();
    }
  });
});
