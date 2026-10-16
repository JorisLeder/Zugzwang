/**
 * Real Stockfish (Node) checks of the three bot models: legal moves, compute time ≤ 1 s per move (NFR, criterion 3),
 * and that the human model really varies its moves (not "perfect moves plus random blunders").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import type { EngineService } from '@/core/engine';
import { ChessGame } from '@/lib/chess';
import { createNodeEngineService } from '@/lib/uci/node';
import { botById, createSeededRandom, StockfishBotEngine } from './index';

const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'd7d6'];

let engine: EngineService;

beforeAll(async () => {
  engine = createNodeEngineService();
  await engine.init();
});

afterAll(() => engine.dispose());

describe('bot models on the real engine', () => {
  for (const id of ['pip', 'kalle', 'nina', 'henrike', 'professor-kraus', 'zora']) {
    it(`${id}: legal move within 1 s compute`, async () => {
      const sb = new StockfishBotEngine(engine, { e2e: true, random: createSeededRandom(1), useRepertoire: false });
      const m = await sb.chooseMove({ bot: botById(id)!, startFen: START_FEN, moves: MOVES });
      expect(ChessGame.fromMoves(START_FEN, MOVES).move(m.uci)).not.toBeNull();
      expect(m.computeMs).toBeLessThanOrEqual(1000);
    });
  }

  it('the human model plays different reasonable moves across games (not deterministic best moves)', async () => {
    const sb = new StockfishBotEngine(engine, { e2e: true, random: createSeededRandom(42), useRepertoire: false });
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const m = await sb.chooseMove({ bot: botById('nina')!, startFen: START_FEN, moves: MOVES });
      seen.add(m.uci);
    }
    expect(seen.size).toBeGreaterThan(1);
  }, 30_000);

  it('a weak bot claims a draw when it is worse, a strong side declines', async () => {
    const sb = new StockfishBotEngine(engine);
    // Black to move, a rook down → claims; White to move, a rook up → plays on.
    expect(await sb.shouldClaimDraw('4k3/8/8/8/8/8/8/R3K3 b - - 0 1', botById('pip')!)).toBe(true);
    expect(await sb.shouldClaimDraw('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', botById('pip')!)).toBe(false);
  });
});
